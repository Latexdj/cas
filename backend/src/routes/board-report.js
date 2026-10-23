'use strict';
const router    = require('express').Router();
const pool      = require('../config/db');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { computeBoardReportFacts } = require('../services/boardReport.service');
const { generateBoardReportPDFBuffer } = require('../services/pdf.service');
const { buildSystemPrompt, stripMarkdown, stripConversationalFraming, extractText } = require('./letter-chat');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('board_reports'));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Per-school concurrency cap — board reports fan out across most of the
// schema in one request (academics, attendance, discipline, exeat, clinic,
// finance, enrollment) plus a long Claude call; same acquireSlot/releaseSlot
// idiom as ai-remarks.js, just a lower ceiling since this is a deliberate,
// infrequent admin action rather than a per-student draft button.
const inFlight = new Map();
const MAX_CONCURRENT = 2;
function acquireSlot(schoolId) {
  const n = inFlight.get(schoolId) ?? 0;
  if (n >= MAX_CONCURRENT) return false;
  inFlight.set(schoolId, n + 1);
  return true;
}
function releaseSlot(schoolId) {
  const n = inFlight.get(schoolId) ?? 1;
  if (n <= 1) inFlight.delete(schoolId);
  else inFlight.set(schoolId, n - 1);
}

// POST /api/board-report/generate
// Body: { academic_year_id, semester? }
// Computes the facts object server-side, makes one Claude call for the full
// first draft, and creates the letter_draft_sessions row directly — there's
// nothing to clarify first (unlike teacher_query/student_letter/etc.), every
// fact the model needs is already known.
router.post('/generate', async (req, res, next) => {
  const { academic_year_id, semester } = req.body;
  if (!academic_year_id) {
    return res.status(400).json({ error: 'academic_year_id is required' });
  }
  if (semester != null && ![1, 2, '1', '2'].includes(semester)) {
    return res.status(400).json({ error: 'semester must be 1, 2, or omitted for the full year' });
  }

  if (!acquireSlot(req.schoolId)) {
    return res.status(429).json({ error: 'A board report is already generating for this school. Please wait for it to finish.' });
  }

  try {
    const facts = await computeBoardReportFacts(req.schoolId, academic_year_id, semester || null);
    if (!facts) return res.status(404).json({ error: 'Academic year not found' });

    const { rows: schRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
    const schoolName = schRows[0]?.name ?? 'the school';

    const metadata = {
      period_label: facts.period.period_label,
      facts,
      academic_year_id,
      semester: semester || null,
    };

    const systemPrompt = buildSystemPrompt(schoolName, 'board_report', metadata);
    const messages = [{ role: 'user', content: 'Write the full board report now.' }];

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-5-5',
      max_tokens: 4000,
      system:     systemPrompt,
      messages,
    });
    const reportText = stripConversationalFraming(stripMarkdown(extractText(response.content)));
    const finalMessages = [...messages, { role: 'assistant', content: reportText }];

    const { rows } = await pool.query(
      `INSERT INTO letter_draft_sessions (school_id, created_by, document_type, metadata, messages)
       VALUES ($1, $2, 'board_report', $3, $4)
       RETURNING id`,
      [req.schoolId, req.user.id, JSON.stringify(metadata), JSON.stringify(finalMessages)]
    );

    res.status(201).json({ session_id: rows[0].id, report: reportText, facts });
  } catch (err) {
    console.error('[Board Report] generation failed:', err.message);
    res.status(502).json({ error: 'Report generation failed. Please try again.' });
  } finally {
    releaseSlot(req.schoolId);
  }
});

// GET /api/board-report/:session_id/pdf
router.get('/:session_id/pdf', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT metadata, messages FROM letter_draft_sessions
       WHERE id = $1 AND school_id = $2 AND document_type = 'board_report'`,
      [req.params.session_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Report session not found' });

    const session = rows[0];
    const lastAssistant = [...session.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return res.status(404).json({ error: 'No report draft found in this session' });

    const { rows: schRows } = await pool.query(`SELECT * FROM schools WHERE id = $1`, [req.schoolId]);
    if (!schRows.length) return res.status(404).json({ error: 'School not found' });

    const pdfBuffer = await generateBoardReportPDFBuffer(lastAssistant.content, session.metadata.facts, schRows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="board-report-${req.params.session_id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/board-report/history — past board-report sessions for this school
router.get('/history', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, metadata->>'period_label' AS period_label, finalized_at, created_at
       FROM letter_draft_sessions
       WHERE school_id = $1 AND document_type = 'board_report'
       ORDER BY created_at DESC LIMIT 50`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
