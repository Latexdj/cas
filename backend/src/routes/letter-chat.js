'use strict';
const router    = require('express').Router();
const pool      = require('../config/db');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// These categories are too sensitive for AI narrative drafting.
// For student letters: both the offense_category AND letter_type are checked.
const SENSITIVE_OFFENSE_CATS  = new Set([
  'exam_malpractice', 'substance_use', 'fighting_assault',
  'bullying_harassment', 'indecent_behavior', 'other',
]);
const SENSITIVE_LETTER_TYPES = new Set(['suspension', 'dismissal']);

function isBlocked(documentType, metadata) {
  if (documentType !== 'student_letter') return false;
  if (SENSITIVE_OFFENSE_CATS.has(metadata?.offense_category))  return true;
  if (SENSITIVE_LETTER_TYPES.has(metadata?.letter_type))        return true;
  return false;
}

function buildSystemPrompt(schoolName, documentType, metadata) {
  if (documentType === 'student_letter') {
    return `You are assisting an admin at ${schoolName} in drafting a formal disciplinary letter to a student.

Context:
- Student: ${metadata.student_name ?? ''}${metadata.class_name ? ` (${metadata.class_name})` : ''}
- Letter type: ${metadata.letter_type ?? ''}
- Offense category: ${metadata.offense_category ?? ''}${metadata.offense_other ? ` — ${metadata.offense_other}` : ''}
- Subject line: "${metadata.subject ?? ''}"

Your role:
- Help draft the BODY of the letter only — the paragraphs between "Dear [Name]," and "Yours faithfully,"
- Do NOT include the date, ref number, recipient address block, salutation, or signature block (the system handles those)
- Ask for the specific incident facts before producing a full draft
- Present a complete draft when you have enough information; revise based on feedback
- Keep the tone firm, professional, and fair; use formal English appropriate for an official school document
- Write in third-person institutional voice ("The school notes that…", "You are directed to…")`;
  }

  // teacher_query
  return `You are assisting an admin at ${schoolName} in drafting a formal query letter to a teacher.

Context:
- Teacher: ${metadata.teacher_name ?? ''}${metadata.department ? ` (${metadata.department})` : ''}
- Category: ${metadata.category ?? ''}${metadata.category_other ? ` — ${metadata.category_other}` : ''}
- Subject line: "${metadata.subject ?? ''}"

Your role:
- Help draft the BODY of the query letter — the paragraphs between "Dear [Name]," and "Yours faithfully,"
- Do NOT include the date, ref number, recipient address, salutation, or signature block
- Ask for the specific incident facts and concerns before drafting
- Present a complete draft when you have enough information; revise based on feedback
- Keep the tone formal and fair; use professional language appropriate for an official school query`;
}

function openingMessage(documentType, metadata) {
  if (documentType === 'student_letter') {
    return `I'm ready to help you draft the body of this ${metadata.letter_type ?? ''} letter for ${metadata.student_name ?? 'the student'}.\n\nTo write this well, please tell me:\n1. What happened — the specific incident or behaviour\n2. When it occurred (date or period)\n3. Any prior warnings or relevant history\n4. What outcome or action you want the letter to communicate\n\nOnce I have these details I will draft the body text for your review.`;
  }
  return `I'm ready to help you draft the body of this query letter for ${metadata.teacher_name ?? 'the teacher'}.\n\nPlease tell me:\n1. What happened — the specific concern or incident\n2. When it occurred\n3. Any relevant context or prior discussions\n4. What response you expect from the teacher and by when\n\nWith those details I can draft a clear, formal query body for your review.`;
}

// POST /api/letter-chat/start
// Body: { document_type: 'teacher_query'|'student_letter', metadata: { ... } }
// Returns: { session_id, opening_message }
router.post('/start', adminOnly, async (req, res, next) => {
  try {
    const { document_type, metadata } = req.body;

    if (!['teacher_query', 'student_letter'].includes(document_type)) {
      return res.status(400).json({ error: 'document_type must be teacher_query or student_letter' });
    }
    if (!metadata?.subject?.trim()) {
      return res.status(400).json({ error: 'metadata.subject is required' });
    }

    if (isBlocked(document_type, metadata)) {
      return res.status(422).json({
        error: 'AI drafting is not available for this offense category or letter type. Please compose the letter body manually.',
        blocked: true,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO letter_draft_sessions (school_id, created_by, document_type, metadata, messages)
       VALUES ($1, $2, $3, $4, '[]')
       RETURNING id`,
      [req.schoolId, req.user.id, document_type, JSON.stringify(metadata)]
    );

    res.status(201).json({
      session_id:      rows[0].id,
      opening_message: openingMessage(document_type, metadata),
    });
  } catch (err) { next(err); }
});

// POST /api/letter-chat/:session_id/message
// Body: { content }
// Returns: { role: 'assistant', content }
router.post('/:session_id/message', adminOnly, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

    const { rows: sRows } = await pool.query(
      `SELECT * FROM letter_draft_sessions
       WHERE id = $1 AND school_id = $2 AND created_by = $3`,
      [req.params.session_id, req.schoolId, req.user.id]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Session not found' });

    const session = sRows[0];
    if (session.finalized_at) return res.status(400).json({ error: 'Session already finalized' });
    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Session expired — please start a new draft session' });
    }

    const { rows: schRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
    const schoolName = schRows[0]?.name ?? 'the school';

    const systemPrompt = buildSystemPrompt(schoolName, session.document_type, session.metadata);

    // Append user message and call Claude
    const updatedMessages = [...(session.messages ?? []), { role: 'user', content: content.trim() }];

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   updatedMessages,
    });

    const aiContent = response.content[0]?.text ?? '';
    const finalMessages = [...updatedMessages, { role: 'assistant', content: aiContent }];

    await pool.query(
      `UPDATE letter_draft_sessions SET messages = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(finalMessages), session.id]
    );

    res.json({ role: 'assistant', content: aiContent });
  } catch (err) { next(err); }
});

// PATCH /api/letter-chat/:session_id/finalize
// Marks the session as finalized (no more messages can be added).
// Returns: { messages }
router.patch('/:session_id/finalize', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE letter_draft_sessions
       SET finalized_at = now(), updated_at = now()
       WHERE id = $1 AND school_id = $2 AND created_by = $3 AND finalized_at IS NULL
       RETURNING messages`,
      [req.params.session_id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or already finalized' });
    res.json({ messages: rows[0].messages });
  } catch (err) { next(err); }
});

// GET /api/letter-chat/:session_id — read session (used by principal transcript view)
router.get('/:session_id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, document_type, metadata, messages, finalized_at, created_at
       FROM letter_draft_sessions
       WHERE id = $1 AND school_id = $2`,
      [req.params.session_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
