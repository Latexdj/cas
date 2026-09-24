'use strict';
const pool = require('../config/db');
const { isBlocked } = require('../utils/letterSensitivity');

const SESSION_EXTENSION = '48 hours';

// Seeds a revived chat session with the letter's current text so the issuer
// isn't starting from a blank slate after a stale session had to be replaced.
function seedMessagesFromDraft(currentBody) {
  const body = (currentBody || '').trim();
  if (!body) return [];
  return [
    { role: 'user', content: `Continuing work on this letter after it was returned for correction. Here is the current draft body:\n\n${body}` },
    { role: 'assistant', content: body },
  ];
}

// Refreshes or reseeds the draft session tied to a letter at the moment it's
// returned, so the issuer has a usable session waiting for them rather than
// discovering it silently died while the letter sat in pending_approval.
// Never revives a session for a document/metadata combination that AI
// drafting was never allowed to touch (isBlocked) — a return does not reopen
// that door.
async function reviveSessionOnReturn({ letter, letterBody }) {
  if (!letter.draft_session_id) return;

  const { rows } = await pool.query(
    `SELECT * FROM letter_draft_sessions WHERE id = $1`,
    [letter.draft_session_id]
  );
  if (!rows.length) return;
  const session = rows[0];

  if (isBlocked(session.document_type, session.metadata)) return;

  const alive = !session.finalized_at && new Date(session.expires_at) > new Date();

  if (alive) {
    await pool.query(
      `UPDATE letter_draft_sessions
       SET expires_at = now() + INTERVAL '${SESSION_EXTENSION}',
           metadata = metadata || jsonb_build_object('return_reason', $1::text),
           updated_at = now()
       WHERE id = $2`,
      [letter._returnReason, session.id]
    );
    return;
  }

  // Original session has expired — start a fresh one seeded with the
  // existing draft and the return reason, rather than reusing a dead one.
  const newMetadata = { ...session.metadata, return_reason: letter._returnReason };
  const seededMessages = seedMessagesFromDraft(letterBody);
  const { rows: newSessionRows } = await pool.query(
    `INSERT INTO letter_draft_sessions (school_id, created_by, document_type, metadata, messages)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [letter.school_id, session.created_by, session.document_type, JSON.stringify(newMetadata), JSON.stringify(seededMessages)]
  );
  await pool.query(
    `UPDATE ${letter._table} SET draft_session_id = $1 WHERE id = $2`,
    [newSessionRows[0].id, letter.id]
  );
}

// Moves a pending_approval letter to 'returned', records the reason in the
// shared history table, and revives its draft session if one exists.
// `table` must be a fixed literal ('student_disciplinary_letters' or
// 'general_letters') — never derived from request input.
async function returnLetterForCorrection({ table, documentType, letterId, schoolId, reason, returnedById, returnedByName }) {
  const { rows } = await pool.query(
    `UPDATE ${table}
     SET status = 'returned', updated_at = now()
     WHERE id = $1 AND school_id = $2 AND status = 'pending_approval'
     RETURNING *`,
    [letterId, schoolId]
  );
  if (!rows.length) return null;
  const letter = rows[0];

  await pool.query(
    `INSERT INTO letter_returns (school_id, document_type, letter_id, reason, returned_by, returned_by_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [schoolId, documentType, letterId, reason, returnedById, returnedByName]
  );

  await reviveSessionOnReturn({
    letter: { ...letter, _returnReason: reason, _table: table },
    letterBody: letter.body,
  });

  return letter;
}

// Moves a 'returned' letter back to pending_approval, applying the issuer's
// edits. `table` must be a fixed literal, as above.
async function resubmitLetter({ table, letterId, schoolId, subject, body }) {
  const { rows } = await pool.query(
    `UPDATE ${table}
     SET status = 'pending_approval',
         subject = COALESCE($1, subject),
         body = COALESCE($2, body),
         updated_at = now()
     WHERE id = $3 AND school_id = $4 AND status = 'returned'
     RETURNING *`,
    [subject || null, body || null, letterId, schoolId]
  );
  return rows[0] || null;
}

// Full return-reason history for a letter, latest first — supports showing
// prior reasons when a letter has been returned more than once.
async function getReturnHistory({ documentType, letterId, schoolId }) {
  const { rows } = await pool.query(
    `SELECT id, reason, returned_by_name, returned_at
     FROM letter_returns
     WHERE document_type = $1 AND letter_id = $2 AND school_id = $3
     ORDER BY returned_at DESC`,
    [documentType, letterId, schoolId]
  );
  return rows;
}

module.exports = { returnLetterForCorrection, resubmitLetter, getReturnHistory };
