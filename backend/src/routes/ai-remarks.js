const router   = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool     = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Per-school concurrency cap: max 5 simultaneous draft requests
const inFlight = new Map();
const MAX_CONCURRENT = 5;

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

// POST /api/ai/draft-remark
// Body: { student_id, academic_year_id, semester, track, subject?, context }
// context for secondary_overall: { student_name, class_name, subjects[], class_position, class_total, average, overall_grade, attendance }
// context for secondary_subject:  { student_name, class_name, subject_name, ca_score, exam_score, total, grade, subject_position, class_size }
router.post('/draft-remark', async (req, res, next) => {
  const { student_id, academic_year_id, semester, track, context } = req.body;

  if (!student_id || !academic_year_id || !semester || !track || !context) {
    return res.status(400).json({ error: 'student_id, academic_year_id, semester, track, context are required' });
  }
  if (!['secondary_overall', 'secondary_subject'].includes(track)) {
    return res.status(400).json({ error: 'track must be secondary_overall or secondary_subject' });
  }

  // Verify student belongs to this school
  const { rows: stRows } = await pool.query(
    `SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1`,
    [student_id, req.schoolId]
  );
  if (!stRows.length) return res.status(403).json({ error: 'Student not found' });

  // Rate limit
  if (!acquireSlot(req.schoolId)) {
    return res.status(429).json({ error: 'Too many drafts generating at once. Please try again shortly.' });
  }

  try {
    // Fetch up to 8 school-specific tone examples for few-shot prompting
    const { rows: examples } = await pool.query(
      `SELECT example_text FROM remark_examples WHERE school_id = $1 AND track = $2 ORDER BY created_at DESC LIMIT 8`,
      [req.schoolId, track]
    );

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return res.status(503).json({ error: 'Draft unavailable — AI not configured. Please write the remark directly.' });
    }

    const client = new Anthropic({ apiKey: key });
    const prompt = buildPrompt(track, context, examples.map(e => e.example_text));
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: prompt }],
    });

    const draft = message.content?.[0]?.text?.trim() ?? '';
    res.json({ draft });
  } catch (err) {
    console.error('[ai-remarks] API error:', err.message);
    res.status(502).json({ error: 'Draft unavailable. Please write the remark directly.' });
  } finally {
    releaseSlot(req.schoolId);
  }
});

// ── Prompt assembly ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a professional form teacher in a Ghanaian secondary school writing end-of-semester remarks for student report cards.

Rules you must follow exactly:
- Write one to three sentences only.
- Third person only: "John has demonstrated..." not "You have done well..."
- Do not mention specific numeric scores, percentages, positions, or grade letters. Those appear separately on the report card.
- Do not use the words "weak", "poor", "failed", "disappointing", "lazy", or "struggling". Frame all areas for development as forward-looking opportunities.
- Constructive, formal, encouraging tone appropriate for a Ghanaian secondary school report card read by parents and students.
- Include attendance commentary only when the student has missed a significant number of days (5 or more absences). When absent days are low, omit attendance entirely — do not praise punctuality for every student.
- Output only the remark text. No quotation marks. No preamble. No explanation.`;

function buildPrompt(track, ctx, examples) {
  const exampleBlock = examples.length
    ? `\nFor tone reference, here are example remarks from this school:\n${examples.map((e, i) => `Example ${i + 1}: ${e}`).join('\n')}\n`
    : '';

  if (track === 'secondary_overall') {
    const {
      student_name, class_name, year_name, semester,
      subjects = [], class_position, class_total, average, overall_grade,
      attendance = {},
    } = ctx;

    const semLabel = semester === 1 ? 'First' : 'Second';
    const attNote  = (attendance.absent ?? 0) >= 5
      ? `Attendance: Present ${attendance.present ?? 0} days, Absent ${attendance.absent} days${attendance.late > 0 ? `, Late ${attendance.late} days` : ''} — include a brief, constructive attendance note in the remark.`
      : `Attendance: Present ${attendance.present ?? 0} days, Absent ${attendance.absent ?? 0} days — attendance is satisfactory; do NOT comment on attendance in the remark.`;

    const subjectLines = subjects
      .filter(s => s.total != null)
      .map(s => `  ${s.subject}: Total ${s.total}, Grade ${s.grade}, Position ${s.subject_position ?? '?'} of ${s.class_size ?? '?'}`)
      .join('\n');

    const perfNote = average != null
      ? `Class position: ${class_position ?? '?'} of ${class_total ?? '?'} | Semester average: ${average} | Overall grade: ${overall_grade}`
      : 'Results not yet available.';

    return `Write a form teacher remark for this student.

Student: ${student_name}
Class: ${class_name} | ${semLabel} Semester${year_name ? `, ${year_name}` : ''}

Subject results this semester:
${subjectLines || '  (no subject scores available yet)'}

${perfNote}

${attNote}
${exampleBlock}
Write the remark:`;
  }

  // secondary_subject
  const {
    student_name, class_name, year_name, semester,
    subject_name, ca_score, exam_score, total, grade,
    subject_position, class_size,
    previous_remark,
  } = ctx;

  const semLabel = semester === 1 ? 'First' : 'Second';
  const prevNote = previous_remark
    ? `Previous semester remark for this subject: "${previous_remark}"`
    : 'No previous semester remark for this subject.';

  return `Write a subject teacher remark for this student.

Subject: ${subject_name}
Student: ${student_name}
Class: ${class_name} | ${semLabel} Semester${year_name ? `, ${year_name}` : ''}

Performance in ${subject_name}:
  CA score: ${ca_score ?? '—'}, Exam score: ${exam_score ?? '—'}, Total: ${total ?? '—'}, Grade: ${grade ?? '—'}
  Position in subject: ${subject_position ?? '?'} of ${class_size ?? '?'}

${prevNote}
${exampleBlock}
Write a brief subject remark (one to two sentences):`;
}

module.exports = router;
