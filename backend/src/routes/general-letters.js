'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, managementOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { generateAndUploadPDF } = require('../services/pdf.service');
const { returnLetterForCorrection, resubmitLetter, getReturnHistory } = require('../services/letterApproval.service');
const { sanitizeRichText } = require('../utils/richTextSanitizer');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('discipline'));

// Admin (role: admin | super_admin) OR management (type: management) may issue letters.
// This is checked on every route except approve, which is management-only.
function adminOrManagement(req, res, next) {
  const role = req.user?.role;
  const type = req.user?.type;
  if (role !== 'admin' && role !== 'super_admin' && type !== 'management') {
    return res.status(403).json({ error: 'Admin or management access required' });
  }
  next();
}

const VALID_CLASSIFICATIONS = ['parent_communication', 'external_official', 'internal_administrative', 'other'];
const VALID_RECIPIENT_TYPES  = ['student', 'teacher', 'parent', 'external'];
const VALID_ISSUED_AS = ['own_office', 'on_behalf_of_head'];

// issued_as === 'on_behalf_of_head' puts the Head's actual name and
// signature on the letter (see pdf.service.js's buildLetterHTML), so it
// needs the Head's actual sign-off before going out, same as any other
// letter that invokes an authority beyond the issuing admin's own.
function computeRequiresApproval(classification, is_sensitive, issued_as) {
  return classification === 'external_official' || is_sensitive === true || issued_as === 'on_behalf_of_head';
}

// Only recipient_type === 'teacher' has an in-app surface to be notified on
// (see GET /mine below) — student/parent/external recipients have no portal
// account this fires into.
async function notifyTeacherIfIssued(letter) {
  if (letter.recipient_type !== 'teacher' || !letter.internal_recipient_id) return;
  await pool.query(
    `INSERT INTO notifications (school_id, user_id, user_type, message, link)
     VALUES ($1, $2, 'teacher', $3, $4)`,
    [
      letter.school_id, letter.internal_recipient_id,
      letter.requires_acceptance ? `New letter requiring your response: ${letter.subject}` : `New letter: ${letter.subject}`,
      `/teacher/letters/${letter.id}`,
    ]
  );
}

async function generateRefNumber(schoolId) {
  const { rows } = await pool.query(
    `UPDATE schools SET letter_ref_counter = letter_ref_counter + 1
     WHERE id = $1
     RETURNING letter_ref_counter, letter_ref_prefix, headmaster_signature_url`,
    [schoolId]
  );
  const { letter_ref_counter, letter_ref_prefix, headmaster_signature_url } = rows[0];
  const year = new Date().getFullYear();
  const seq  = String(letter_ref_counter).padStart(4, '0');
  const ref  = letter_ref_prefix ? `${letter_ref_prefix}/GL/${year}/${seq}` : `GL/${year}/${seq}`;
  return { ref_number: ref, signature_url: headmaster_signature_url || null };
}

async function resolveIssuedBy(req) {
  // Management JWT payload: { id, schoolId, role, type } — name is not in the token.
  // Both admin and management users are rows in teachers; look up by id for both.
  const id = req.user?.id ?? null;
  if (!id) return { issued_by_id: null, issued_by_name: '' };
  const { rows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [id]);
  return { issued_by_id: id, issued_by_name: rows[0]?.name ?? '' };
}

// GET /api/general-letters/school — just the letterhead/signature/contact
// fields the print preview and PDF layer need. /api/admin/settings has the
// full settings record but is gated role:admin only (no management
// bypass), which would break this for the principal-portal mount of this
// same module — so this module fetches its own narrow, adminOrManagement-
// gated copy instead of depending on that endpoint.
// Must be defined BEFORE /:id routes to avoid Express matching 'school' as an id.
router.get('/school', adminOrManagement, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, address, phone, email, motto, letterhead_url, headmaster_signature_url, headmaster_name
       FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// ─── EXTERNAL CONTACTS ────────────────────────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid Express matching 'contacts' as an id.

// GET /api/general-letters/contacts
router.get('/contacts', adminOrManagement, async (req, res, next) => {
  try {
    const { q } = req.query;
    const params = [req.schoolId];
    let extra = '';
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      extra = ` AND (name ILIKE $${params.length} OR organization ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, organization, address, created_at
       FROM external_contacts
       WHERE school_id = $1${extra}
       ORDER BY name ASC
       LIMIT 60`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/general-letters/contacts
router.post('/contacts', adminOrManagement, async (req, res, next) => {
  try {
    const { name, organization, address } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { issued_by_id } = await resolveIssuedBy(req);
    const { rows } = await pool.query(
      `INSERT INTO external_contacts (school_id, name, organization, address, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.schoolId, name.trim(), organization?.trim() || null, address?.trim() || null, issued_by_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ─── GENERAL LETTERS ──────────────────────────────────────────────────────────

// GET /api/general-letters
router.get('/', adminOrManagement, async (req, res, next) => {
  try {
    const { status, classification } = req.query;
    const params = [req.schoolId];
    const clauses = [];
    // Exclude in-progress AI drafts (status='draft') from the default listing.
    // A draft letter has no body yet; it becomes visible once finalized.
    if (status) {
      params.push(status);
      clauses.push(`gl.status = $${params.length}`);
    } else {
      clauses.push(`gl.status != 'draft'`);
    }
    if (classification) { params.push(classification); clauses.push(`gl.classification = $${params.length}`); }
    const where = clauses.length ? ' AND ' + clauses.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT gl.id, gl.ref_number, gl.classification, gl.recipient_type,
              gl.ext_recipient_name, gl.ext_recipient_title, gl.ext_recipient_org,
              gl.internal_recipient_id, gl.internal_recipient_table,
              gl.subject, gl.is_sensitive, gl.issued_date::text, gl.status,
              gl.requires_approval, gl.approved_by_name, gl.approved_at,
              gl.issued_by_name, gl.issued_as, gl.created_at,
              gl.requires_acceptance, gl.accepted_at, gl.declined_at, gl.decline_reason
       FROM general_letters gl
       WHERE gl.school_id = $1${where}
       ORDER BY gl.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/general-letters
// Pass status:'draft' (with empty body) to pre-create a shell record for the AI drafting flow.
// The draft is invisible in the list and must be finalized via PATCH /:id/finalize.
router.post('/', adminOrManagement, async (req, res, next) => {
  try {
    const {
      classification, recipient_type,
      internal_recipient_id, internal_recipient_table,
      ext_recipient_name, ext_recipient_title, ext_recipient_org, ext_recipient_address,
      issued_by_title, through_office, cc,
      subject, body, is_sensitive, issued_date, academic_year_id,
      issued_as, requires_acceptance,
      status: requestedStatus,
    } = req.body;

    const savingAsDraft = requestedStatus === 'draft';
    const issuedAs = VALID_ISSUED_AS.includes(issued_as) ? issued_as : 'on_behalf_of_head';
    const requiresAcceptance = requires_acceptance === true || requires_acceptance === 'true';

    if (!VALID_CLASSIFICATIONS.includes(classification))
      return res.status(400).json({ error: 'Invalid classification' });
    if (!VALID_RECIPIENT_TYPES.includes(recipient_type))
      return res.status(400).json({ error: 'Invalid recipient_type' });
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!savingAsDraft && !body?.trim()) return res.status(400).json({ error: 'body is required' });

    if (recipient_type === 'external' || recipient_type === 'parent') {
      // A named person is not always available -- e.g. "THE PTA CHAIRMAN" with
      // no individual named -- but the addressee block needs at least one of
      // a personal name or a title/office to not be blank.
      if (!ext_recipient_name?.trim() && !ext_recipient_title?.trim())
        return res.status(400).json({ error: 'Provide a recipient name or a title/office for external/parent recipients' });
    } else {
      // student or teacher — verify FK in this school
      if (!internal_recipient_id || !internal_recipient_table)
        return res.status(400).json({ error: 'internal_recipient_id and internal_recipient_table are required' });
      if (!['students', 'teachers'].includes(internal_recipient_table))
        return res.status(400).json({ error: 'internal_recipient_table must be students or teachers' });
      const tbl = internal_recipient_table === 'students' ? 'students' : 'teachers';
      const { rows: recRows } = await pool.query(
        `SELECT id FROM ${tbl} WHERE id = $1 AND school_id = $2`,
        [internal_recipient_id, req.schoolId]
      );
      if (!recRows.length) return res.status(404).json({ error: 'Recipient not found in this school' });
    }

    const { issued_by_id, issued_by_name } = await resolveIssuedBy(req);
    const sensitive = is_sensitive === true || is_sensitive === 'true';
    const requires_approval = computeRequiresApproval(classification, sensitive, issuedAs);

    // Drafts skip ref_number generation — no counter is incremented until finalize.
    let ref_number = null, signature_url = null;
    if (!savingAsDraft) {
      const result = await generateRefNumber(req.schoolId);
      ref_number    = result.ref_number;
      signature_url = result.signature_url;
    }
    const computed_status = savingAsDraft ? 'draft' : (requires_approval ? 'pending_approval' : 'issued');

    const { rows } = await pool.query(
      `INSERT INTO general_letters (
         school_id, issued_by_id, issued_by_name, issued_by_signature_url, issued_by_title,
         classification, recipient_type,
         internal_recipient_id, internal_recipient_table,
         ext_recipient_name, ext_recipient_title, ext_recipient_org, ext_recipient_address,
         through_office, cc,
         subject, body, is_sensitive, issued_date, academic_year_id,
         ref_number, status, requires_approval, issued_as, requires_acceptance
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
       ) RETURNING *, issued_date::text`,
      [
        req.schoolId, issued_by_id, issued_by_name, signature_url, issued_by_title?.trim() || null,
        classification, recipient_type,
        internal_recipient_id || null, internal_recipient_table || null,
        ext_recipient_name?.trim() || null, ext_recipient_title?.trim() || null,
        ext_recipient_org?.trim() || null, ext_recipient_address?.trim() || null,
        through_office?.trim() || null, cc?.trim() || null,
        subject.trim(), sanitizeRichText(body?.trim() || ''), sensitive,
        issued_date || null, academic_year_id || null,
        ref_number, computed_status, requires_approval, issuedAs, requiresAcceptance,
      ]
    );
    if (computed_status === 'issued') await notifyTeacherIfIssued(rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/finalize — finalizes an AI-drafted letter
// Generates ref_number, sets body, transitions draft → issued/pending_approval.
// Must be defined before /:id to avoid Express matching 'finalize' as an id.
router.patch('/:id/finalize', adminOrManagement, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const { rows: existing } = await pool.query(
      `SELECT * FROM general_letters WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Letter not found' });
    const draft = existing[0];
    if (draft.status !== 'draft') {
      return res.status(400).json({ error: 'Letter is not a draft — use /approve to change status' });
    }

    // Generate ref_number now that the letter is being issued
    const { ref_number, signature_url } = await generateRefNumber(req.schoolId);
    const requires_approval = computeRequiresApproval(draft.classification, draft.is_sensitive, draft.issued_as);
    const new_status = requires_approval ? 'pending_approval' : 'issued';

    const { rows } = await pool.query(
      `UPDATE general_letters
       SET body = $1, ref_number = $2,
           issued_by_signature_url = COALESCE(issued_by_signature_url, $3),
           status = $4, requires_approval = $5, updated_at = now()
       WHERE id = $6 AND school_id = $7
       RETURNING *, issued_date::text`,
      [sanitizeRichText(body.trim()), ref_number, signature_url, new_status, requires_approval, req.params.id, req.schoolId]
    );
    if (new_status === 'issued') await notifyTeacherIfIssued(rows[0]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/general-letters/:id/pdf — generate (or re-generate) PDF
// Watermarked if status is pending_approval; final clean PDF otherwise.
// Must be registered before GET /:id to prevent Express matching 'pdf' as an id.
router.post('/:id/pdf', adminOrManagement, async (req, res, next) => {
  try {
    const { rows: lRows } = await pool.query(
      `SELECT gl.*, gl.issued_date::text,
              CASE WHEN gl.internal_recipient_table = 'students' THEN s.name
                   WHEN gl.internal_recipient_table = 'teachers' THEN t.name
                   ELSE NULL END AS internal_recipient_name,
              s.student_code,
              s.class_name,
              t.department
       FROM general_letters gl
       LEFT JOIN students s
         ON gl.internal_recipient_table = 'students' AND gl.internal_recipient_id = s.id
       LEFT JOIN teachers t
         ON gl.internal_recipient_table = 'teachers' AND gl.internal_recipient_id = t.id
       WHERE gl.id = $1 AND gl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!lRows.length) return res.status(404).json({ error: 'Letter not found' });
    const raw = lRows[0];

    const { rows: sRows } = await pool.query(
      `SELECT name, address, phone, email, motto, letterhead_url, headmaster_signature_url, headmaster_name
       FROM schools WHERE id = $1`, [req.schoolId]
    );
    const school = sRows[0];

    const isExternal = raw.recipient_type === 'external' || raw.recipient_type === 'parent';
    const recipientType = isExternal                               ? 'external'
      : raw.internal_recipient_table === 'students'               ? 'student'
      :                                                              'teacher';

    // Shape the letter object to match what buildLetterHTML expects
    const letter = {
      ...raw,
      student_name: raw.internal_recipient_table === 'students' ? raw.internal_recipient_name : undefined,
      teacher_name: raw.internal_recipient_table === 'teachers' ? raw.internal_recipient_name : undefined,
    };

    const pdfUrl = await generateAndUploadPDF({
      letter,
      school,
      recipientType,
      letterKind: 'general',
      watermark:  raw.status === 'pending_approval',
      pathPrefix: `general-letters/${req.schoolId}`,
    });

    await pool.query(
      `UPDATE general_letters SET pdf_url = $1, updated_at = now() WHERE id = $2`,
      [pdfUrl, raw.id]
    );

    res.json({ pdf_url: pdfUrl });
  } catch (err) { next(err); }
});

// GET /api/general-letters/mine — teacher-facing letter list, scoped to
// letters actually addressed to them. No adminOrManagement — any
// authenticated teacher may call this. Must be defined before /:id.
router.get('/mine', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { rows } = await pool.query(
      `SELECT id, ref_number, subject, issued_date::text, issued_by_name, issued_by_title,
              classification, requires_acceptance, accepted_at, declined_at, decline_reason,
              pdf_url, created_at
       FROM general_letters
       WHERE school_id = $1 AND recipient_type = 'teacher' AND internal_recipient_id = $2 AND status = 'issued'
       ORDER BY created_at DESC`,
      [req.schoolId, req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/general-letters/:id/accept — teacher-only, own letter only.
router.post('/:id/accept', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { rows } = await pool.query(
      `UPDATE general_letters
       SET accepted_at = now(), updated_at = now()
       WHERE id = $1 AND school_id = $2 AND recipient_type = 'teacher' AND internal_recipient_id = $3
         AND status = 'issued' AND requires_acceptance = true AND accepted_at IS NULL AND declined_at IS NULL
       RETURNING id, accepted_at`,
      [req.params.id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or already responded to' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/general-letters/:id/decline — teacher-only, own letter only, requires a reason.
router.post('/:id/decline', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to decline' });
    const { rows } = await pool.query(
      `UPDATE general_letters
       SET declined_at = now(), decline_reason = $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 AND recipient_type = 'teacher' AND internal_recipient_id = $4
         AND status = 'issued' AND requires_acceptance = true AND accepted_at IS NULL AND declined_at IS NULL
       RETURNING id, declined_at, decline_reason`,
      [reason.trim(), req.params.id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or already responded to' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/general-letters/:id — admin/management see any letter in their
// school; a teacher may see one only if they're the actual recipient of it
// (checked against internal_recipient_id, not inferred from role — mirrors
// memos.js's GET /:id ownership check).
router.get('/:id', async (req, res, next) => {
  try {
    const role = req.user?.role;
    const isStaff = role === 'admin' || role === 'super_admin' || req.user?.type === 'management';
    if (!isStaff && role !== 'teacher') {
      return res.status(403).json({ error: 'Admin or management access required' });
    }
    const { rows } = await pool.query(
      `SELECT gl.*, gl.issued_date::text,
              CASE WHEN gl.internal_recipient_table = 'students' THEN s.name
                   WHEN gl.internal_recipient_table = 'teachers' THEN t.name
                   ELSE NULL END AS internal_recipient_name,
              s.student_code,
              s.class_name,
              t.department
       FROM general_letters gl
       LEFT JOIN students s
         ON gl.internal_recipient_table = 'students' AND gl.internal_recipient_id = s.id
       LEFT JOIN teachers t
         ON gl.internal_recipient_table = 'teachers' AND gl.internal_recipient_id = t.id
       WHERE gl.id = $1 AND gl.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    const letter = rows[0];
    if (!isStaff && !(letter.recipient_type === 'teacher' && letter.internal_recipient_id === req.user.id)) {
      return res.status(404).json({ error: 'Letter not found' });
    }
    letter.return_history = isStaff ? await getReturnHistory({
      documentType: 'general_letter',
      letterId: letter.id,
      schoolId: req.schoolId,
    }) : [];
    res.json(letter);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/approve  — management only
router.patch('/:id/approve', managementOnly, async (req, res, next) => {
  try {
    const { rows: nameRows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [req.user?.id]);
    const approver_name = nameRows[0]?.name ?? 'Management';
    const { rows } = await pool.query(
      `UPDATE general_letters
       SET status = 'issued', approved_by_name = $1, approved_at = now(), updated_at = now()
       WHERE id = $2 AND school_id = $3 AND status = 'pending_approval'
       RETURNING *, issued_date::text`,
      [approver_name, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or not pending approval' });
    await notifyTeacherIfIssued(rows[0]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/return — management only. Requires a
// reason; moves the letter to 'returned' and revives its draft session (if
// any) so the issuer has somewhere live to continue drafting.
router.patch('/:id/return', managementOnly, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to return a letter for correction' });

    const { rows: nameRows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [req.user?.id]);
    const returned_by_name = nameRows[0]?.name ?? 'Management';

    const letter = await returnLetterForCorrection({
      table: 'general_letters',
      documentType: 'general_letter',
      letterId: req.params.id,
      schoolId: req.schoolId,
      reason: reason.trim(),
      returnedById: req.user.id,
      returnedByName: returned_by_name,
    });
    if (!letter) return res.status(404).json({ error: 'Letter not found or not pending approval' });
    res.json(letter);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/resubmit — issuer (admin or management).
// Edits the letter (including, optionally, the recipient/organisation — a
// return for correction may be about who the letter is going to, not just
// its wording) and moves it back to pending_approval.
router.patch('/:id/resubmit', adminOrManagement, async (req, res, next) => {
  try {
    const {
      subject, body, recipient_type,
      internal_recipient_id, internal_recipient_table,
      ext_recipient_name, ext_recipient_title, ext_recipient_org, ext_recipient_address,
    } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const extraFields = {};
    if (recipient_type !== undefined) {
      if (!VALID_RECIPIENT_TYPES.includes(recipient_type))
        return res.status(400).json({ error: 'Invalid recipient_type' });

      const isExternal = recipient_type === 'external' || recipient_type === 'parent';
      if (isExternal) {
        if (!ext_recipient_name?.trim() && !ext_recipient_title?.trim())
          return res.status(400).json({ error: 'Provide a recipient name or a title/office for external/parent recipients' });
      } else {
        if (!internal_recipient_id || !internal_recipient_table)
          return res.status(400).json({ error: 'internal_recipient_id and internal_recipient_table are required' });
        if (!['students', 'teachers'].includes(internal_recipient_table))
          return res.status(400).json({ error: 'internal_recipient_table must be students or teachers' });
        const { rows: recRows } = await pool.query(
          `SELECT id FROM ${internal_recipient_table} WHERE id = $1 AND school_id = $2`,
          [internal_recipient_id, req.schoolId]
        );
        if (!recRows.length) return res.status(404).json({ error: 'Recipient not found in this school' });
      }

      extraFields.recipient_type           = recipient_type;
      extraFields.internal_recipient_id    = isExternal ? null : internal_recipient_id;
      extraFields.internal_recipient_table = isExternal ? null : internal_recipient_table;
      extraFields.ext_recipient_name       = isExternal ? (ext_recipient_name?.trim() || null) : null;
      extraFields.ext_recipient_title      = isExternal ? (ext_recipient_title?.trim() || null) : null;
      extraFields.ext_recipient_org        = isExternal ? (ext_recipient_org?.trim() || null) : null;
      extraFields.ext_recipient_address    = isExternal ? (ext_recipient_address?.trim() || null) : null;
    }

    const letter = await resubmitLetter({
      table: 'general_letters',
      letterId: req.params.id,
      schoolId: req.schoolId,
      subject: subject?.trim(),
      body: body.trim(),
      extraFields,
    });
    if (!letter) return res.status(404).json({ error: 'Letter not found or not in returned status' });
    res.json(letter);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id — correct a letter issued wrongly (wrong
// recipient, wrong wording, wrong classification, etc). Only on an issued
// or still-pending-approval letter — a draft is edited via /finalize, a
// returned letter via /resubmit (its own reason-tracked flow), and a
// voided letter is terminal. Re-running computeRequiresApproval means an
// edit that newly triggers approval (e.g. switching to "on behalf of the
// Head") moves an already-issued letter back to pending_approval rather
// than silently keeping it issued under the old, already-approved basis.
// The stale pdf_url is cleared — it no longer matches the letter's content.
router.patch('/:id', adminOrManagement, async (req, res, next) => {
  try {
    const {
      classification, recipient_type,
      internal_recipient_id, internal_recipient_table,
      ext_recipient_name, ext_recipient_title, ext_recipient_org, ext_recipient_address,
      issued_by_title, through_office, cc,
      subject, body, is_sensitive, issued_date,
      issued_as, requires_acceptance,
    } = req.body;

    const { rows: existing } = await pool.query(
      `SELECT * FROM general_letters WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Letter not found' });
    const current = existing[0];
    if (!['issued', 'pending_approval'].includes(current.status)) {
      return res.status(400).json({ error: `Cannot edit a letter with status "${current.status}". Use resubmit for a returned letter.` });
    }

    if (!VALID_CLASSIFICATIONS.includes(classification))
      return res.status(400).json({ error: 'Invalid classification' });
    if (!VALID_RECIPIENT_TYPES.includes(recipient_type))
      return res.status(400).json({ error: 'Invalid recipient_type' });
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const isExternal = recipient_type === 'external' || recipient_type === 'parent';
    if (isExternal) {
      if (!ext_recipient_name?.trim() && !ext_recipient_title?.trim())
        return res.status(400).json({ error: 'Provide a recipient name or a title/office for external/parent recipients' });
    } else {
      if (!internal_recipient_id || !internal_recipient_table)
        return res.status(400).json({ error: 'internal_recipient_id and internal_recipient_table are required' });
      if (!['students', 'teachers'].includes(internal_recipient_table))
        return res.status(400).json({ error: 'internal_recipient_table must be students or teachers' });
      const { rows: recRows } = await pool.query(
        `SELECT id FROM ${internal_recipient_table} WHERE id = $1 AND school_id = $2`,
        [internal_recipient_id, req.schoolId]
      );
      if (!recRows.length) return res.status(404).json({ error: 'Recipient not found in this school' });
    }

    const { issued_by_name: edited_by_name } = await resolveIssuedBy(req);
    const sensitive = is_sensitive === true || is_sensitive === 'true';
    const issuedAs = VALID_ISSUED_AS.includes(issued_as) ? issued_as : current.issued_as;
    const requiresAcceptance = requires_acceptance === true || requires_acceptance === 'true';
    const requires_approval = computeRequiresApproval(classification, sensitive, issuedAs);
    const new_status = (current.status === 'issued' && requires_approval) ? 'pending_approval' : current.status;

    const { rows } = await pool.query(
      `UPDATE general_letters SET
         classification = $1, recipient_type = $2,
         internal_recipient_id = $3, internal_recipient_table = $4,
         ext_recipient_name = $5, ext_recipient_title = $6, ext_recipient_org = $7, ext_recipient_address = $8,
         issued_by_title = $9, through_office = $10, cc = $11,
         subject = $12, body = $13, is_sensitive = $14, issued_date = $15,
         issued_as = $16, requires_acceptance = $17, requires_approval = $18, status = $19,
         pdf_url = NULL, last_edited_by_name = $20, last_edited_at = now(), updated_at = now()
       WHERE id = $21 AND school_id = $22
       RETURNING *, issued_date::text`,
      [
        classification, recipient_type,
        isExternal ? null : internal_recipient_id, isExternal ? null : internal_recipient_table,
        isExternal ? (ext_recipient_name?.trim() || null) : null, isExternal ? (ext_recipient_title?.trim() || null) : null,
        isExternal ? (ext_recipient_org?.trim() || null) : null, isExternal ? (ext_recipient_address?.trim() || null) : null,
        issued_by_title?.trim() || null, through_office?.trim() || null, cc?.trim() || null,
        subject.trim(), sanitizeRichText(body.trim()), sensitive, issued_date || null,
        issuedAs, requiresAcceptance, requires_approval, new_status,
        edited_by_name, req.params.id, req.schoolId,
      ]
    );
    // Re-notify if the letter is (still, or newly) issued — covers the "wrong
    // recipient" correction case, where the right teacher was never told.
    if (new_status === 'issued') await notifyTeacherIfIssued(rows[0]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/void — a letter issued wrongly. Not a hard
// delete: kept for audit (who issued it, who voided it, why), just excluded
// from GET /mine (already scoped to status = 'issued') and shown with a
// clear Voided badge everywhere else, same transparency-over-silent-removal
// approach as the rest of this module.
router.patch('/:id/void', adminOrManagement, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required to void a letter' });

    const { issued_by_name: voided_by_name } = await resolveIssuedBy(req);
    const { rows } = await pool.query(
      `UPDATE general_letters
       SET status = 'voided', voided_at = now(), voided_by_name = $1, void_reason = $2, updated_at = now()
       WHERE id = $3 AND school_id = $4 AND status IN ('issued','pending_approval','returned')
       RETURNING *, issued_date::text`,
      [voided_by_name, reason.trim(), req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or cannot be voided from its current status' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
