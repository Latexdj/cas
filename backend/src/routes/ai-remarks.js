const router   = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const pool     = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { computeStudentResult, computePrimaryStudentResult } = require('../services/results-service');

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
// Body: { student_id, academic_year_id, semester, track, subject? }
// All score/attendance/position data is fetched server-side; any context sent by the client is ignored.
router.post('/draft-remark', async (req, res, next) => {
  const { student_id, academic_year_id, semester, track, subject } = req.body;

  if (!student_id || !academic_year_id || !semester || !track) {
    return res.status(400).json({ error: 'student_id, academic_year_id, semester, track are required' });
  }
  if (!['secondary_overall', 'secondary_subject', 'primary'].includes(track)) {
    return res.status(400).json({ error: 'track must be secondary_overall, secondary_subject, or primary' });
  }
  if (track === 'secondary_subject' && !subject) {
    return res.status(400).json({ error: 'subject is required for secondary_subject track' });
  }

  // For primary track, body uses term_id instead of academic_year_id+semester
  const { term_id } = req.body;
  if (track === 'primary' && !term_id) {
    return res.status(400).json({ error: 'term_id is required for primary track' });
  }

  // Verify student belongs to this school (different table for primary)
  if (track === 'primary') {
    const { rows: stRows } = await pool.query(
      `SELECT id FROM primary_students WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [student_id, req.schoolId]
    );
    if (!stRows.length) return res.status(403).json({ error: 'Student not found' });

    // Guard: check for open disciplinary letter
    const { rows: discRows } = await pool.query(
      `SELECT id FROM student_disciplinary_letters
       WHERE school_id = $1 AND student_id = $2 AND status NOT IN ('resolved')
       LIMIT 1`,
      [req.schoolId, student_id]
    );
    if (discRows.length) {
      return res.status(403).json({
        error: 'AI drafting is disabled for students with open disciplinary matters. Please write the remark directly.',
        disciplinary_hold: true,
      });
    }
  } else {
    const { rows: stRows } = await pool.query(
      `SELECT id FROM students WHERE id = $1 AND school_id = $2 LIMIT 1`,
      [student_id, req.schoolId]
    );
    if (!stRows.length) return res.status(403).json({ error: 'Student not found' });
  }

  if (!acquireSlot(req.schoolId)) {
    return res.status(429).json({ error: 'Too many drafts generating at once. Please try again shortly.' });
  }

  try {
    // ── Primary track ─────────────────────────────────────────────────────────
    if (track === 'primary') {
      const [examplesRes, primaryResult] = await Promise.all([
        pool.query(
          `SELECT example_text FROM remark_examples WHERE school_id = $1 AND track = 'primary' ORDER BY created_at DESC LIMIT 8`,
          [req.schoolId]
        ),
        computePrimaryStudentResult(req.schoolId, student_id, term_id),
      ]);

      if (!primaryResult) {
        return res.status(404).json({ error: 'Student result data not found.' });
      }

      // Fetch previous term's approved remark (most recent prior term, same school)
      const { rows: prevRows } = await pool.query(
        `SELECT prr.class_teacher_remarks
         FROM primary_report_remarks prr
         JOIN primary_terms pt ON pt.id = prr.term_id
         WHERE prr.school_id = $1 AND prr.student_id = $2 AND prr.term_id != $3
           AND prr.status = 'approved'
         ORDER BY pt.start_date DESC LIMIT 1`,
        [req.schoolId, student_id, term_id]
      );
      const previous_remark = prevRows[0]?.class_teacher_remarks ?? null;

      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        return res.status(503).json({ error: 'Draft unavailable — AI not configured. Please write the remark directly.' });
      }

      const examples = examplesRes.rows.map(e => e.example_text);
      const ctx = {
        student_name:   primaryResult.student_name,
        class_name:     primaryResult.class_name,
        term_name:      primaryResult.term_name,
        year_name:      primaryResult.year_name,
        scores:         primaryResult.scores,
        grand_total:    primaryResult.grand_total,
        class_position: primaryResult.class_position,
        class_total:    primaryResult.class_total,
        attendance:     primaryResult.attendance,
        previous_remark,
      };

      const client = new Anthropic({ apiKey: key });
      const prompt = buildPrimaryPrompt(ctx, examples);
      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system:     PRIMARY_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      });

      const draft = message.content?.[0]?.text?.trim() ?? '';
      return res.json({ draft });
    }

    // ── Secondary tracks ──────────────────────────────────────────────────────
    // Fetch academic year name and school-specific tone examples in parallel with result computation
    const [yearRes, examplesRes, studentResult] = await Promise.all([
      pool.query(
        `SELECT name FROM academic_years WHERE id = $1 AND school_id = $2 LIMIT 1`,
        [academic_year_id, req.schoolId]
      ),
      pool.query(
        `SELECT example_text FROM remark_examples WHERE school_id = $1 AND track = $2 ORDER BY created_at DESC LIMIT 8`,
        [req.schoolId, track]
      ),
      computeStudentResult(req.schoolId, student_id, academic_year_id, semester),
    ]);

    if (!studentResult) {
      return res.status(404).json({ error: 'Student result data not found.' });
    }

    const year_name = yearRes.rows[0]?.name ?? '';
    const examples  = examplesRes.rows.map(e => e.example_text);
    const sem       = parseInt(semester);

    // Fetch previous remark server-side
    let previous_remark = null;
    if (track === 'secondary_overall') {
      const prevSem = sem === 2 ? 1 : null; // sem 1 -> no "previous" in same year
      if (prevSem) {
        const { rows } = await pool.query(
          `SELECT general_remarks FROM report_remarks
           WHERE school_id = $1 AND student_id = $2 AND academic_year_id = $3 AND semester = $4
           LIMIT 1`,
          [req.schoolId, student_id, academic_year_id, prevSem]
        );
        previous_remark = rows[0]?.general_remarks ?? null;
      } else {
        // Semester 1: look in the most recent prior academic year, semester 2
        const { rows } = await pool.query(
          `SELECT rr.general_remarks
           FROM report_remarks rr
           JOIN academic_years ay ON ay.id = rr.academic_year_id
           WHERE rr.school_id = $1 AND rr.student_id = $2 AND ay.id != $3
             AND rr.semester = 2
           ORDER BY ay.name DESC LIMIT 1`,
          [req.schoolId, student_id, academic_year_id]
        );
        previous_remark = rows[0]?.general_remarks ?? null;
      }
    } else {
      // secondary_subject: look for same subject, previous semester (or previous year sem 2)
      const prevSem = sem === 2 ? 1 : null;
      if (prevSem) {
        const { rows } = await pool.query(
          `SELECT remarks FROM subject_remarks
           WHERE school_id = $1 AND student_id = $2 AND academic_year_id = $3 AND semester = $4
             AND LOWER(subject) = LOWER($5)
           LIMIT 1`,
          [req.schoolId, student_id, academic_year_id, prevSem, subject]
        );
        previous_remark = rows[0]?.remarks ?? null;
      } else {
        const { rows } = await pool.query(
          `SELECT sr.remarks
           FROM subject_remarks sr
           JOIN academic_years ay ON ay.id = sr.academic_year_id
           WHERE sr.school_id = $1 AND sr.student_id = $2 AND ay.id != $3
             AND sr.semester = 2 AND LOWER(sr.subject) = LOWER($4)
           ORDER BY ay.name DESC LIMIT 1`,
          [req.schoolId, student_id, academic_year_id, subject]
        );
        previous_remark = rows[0]?.remarks ?? null;
      }
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return res.status(503).json({ error: 'Draft unavailable — AI not configured. Please write the remark directly.' });
    }

    // Build context from server-fetched data (client-supplied context fields are never used)
    const ctx = track === 'secondary_overall'
      ? {
          student_name:   studentResult.student_name,
          class_name:     studentResult.class_name,
          year_name,
          semester:       sem,
          subjects:       studentResult.subjects,
          class_position: studentResult.class_position ?? null,
          class_total:    studentResult.class_total    ?? null,
          average:        studentResult.average,
          overall_grade:  studentResult.overall_grade,
          attendance:     studentResult.attendance,
          previous_remark,
        }
      : {
          student_name:     studentResult.student_name,
          class_name:       studentResult.class_name,
          year_name,
          semester:         sem,
          subject_name:     subject,
          ...(studentResult.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase()) ?? {}),
          class_size:       studentResult.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase())?.class_size ?? null,
          previous_remark,
        };

    const client = new Anthropic({ apiKey: key });
    const prompt = buildPrompt(track, ctx, examples);
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: prompt }],
    });

    const draft = message.content?.[0]?.text?.trim() ?? '';
    res.json({ draft });
  } catch (err) {
    console.error('[ai-remarks] error:', err.message);
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
      attendance = {}, previous_remark,
    } = ctx;

    const semLabel  = semester === 1 ? 'First' : 'Second';
    const absentDays = attendance.absent ?? 0;
    const attNote   = absentDays >= 5
      ? `Attendance: Present ${attendance.present ?? 0} days, Absent ${absentDays} days${(attendance.late ?? 0) > 0 ? `, Late ${attendance.late} days` : ''} — include a brief, constructive attendance note.`
      : `Attendance: Present ${attendance.present ?? 0} days, Absent ${absentDays} days — do NOT comment on attendance in the remark.`;

    const subjectLines = subjects
      .filter(s => s.total != null)
      .map(s => `  ${s.subject}: Total ${s.total}, Grade ${s.grade}, Position ${s.subject_position ?? '?'} of ${s.class_size ?? '?'}`)
      .join('\n');

    const perfNote = average != null
      ? `Class position: ${class_position ?? '?'} of ${class_total ?? '?'} | Semester average: ${average} | Overall grade: ${overall_grade}`
      : 'Results not yet available.';

    const prevNote = previous_remark
      ? `Previous semester remark (for context only, do not repeat it): "${previous_remark}"`
      : '';

    return `Write a form teacher remark for this student.

Student: ${student_name}
Class: ${class_name} | ${semLabel} Semester${year_name ? `, ${year_name}` : ''}

Subject results this semester:
${subjectLines || '  (no subject scores available yet)'}

${perfNote}

${attNote}
${prevNote}
${exampleBlock}
Write the remark:`;
  }

  // secondary_subject
  const {
    student_name, class_name, year_name, semester,
    subject_name, ca_score, exam_score, total, grade,
    subject_position, class_size, previous_remark,
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

const PRIMARY_SYSTEM_PROMPT = `You are a professional class teacher in a Ghanaian primary school writing end-of-term remarks for student report cards.

Rules you must follow exactly:
- Write one to three sentences only.
- Third person only: "Ama has shown..." not "You have done well..."
- Do not mention specific numeric scores, totals, positions, or grade letters. Those appear separately on the report card.
- Do not use the words "weak", "poor", "failed", "disappointing", "lazy", or "struggling". Frame all areas for development as forward-looking opportunities.
- Constructive, warm, encouraging tone appropriate for a Ghanaian primary school report card read by parents and young students.
- Include attendance commentary only when the student has missed a significant number of days (5 or more absences). When absences are low, omit attendance entirely.
- Output only the remark text. No quotation marks. No preamble. No explanation.`;

function buildPrimaryPrompt(ctx, examples) {
  const {
    student_name, class_name, term_name, year_name,
    scores = [], grand_total, class_position, class_total,
    attendance = {}, previous_remark,
  } = ctx;

  const exampleBlock = examples.length
    ? `\nFor tone reference, here are example remarks from this school:\n${examples.map((e, i) => `Example ${i + 1}: ${e}`).join('\n')}\n`
    : '';

  const subjectLines = scores
    .filter(s => s.total != null)
    .map(s => `  ${s.subject_name}: Total ${s.total}, Grade ${s.grade ?? '-'}, Position ${s.position ?? '?'}`)
    .join('\n');

  const absentDays = attendance.absent ?? 0;
  const attNote = absentDays >= 5
    ? `Attendance: Present ${attendance.present ?? 0} days, Absent ${absentDays} days${(attendance.late ?? 0) > 0 ? `, Late ${attendance.late} days` : ''} — include a brief, constructive attendance note.`
    : `Attendance: Present ${attendance.present ?? 0} days, Absent ${absentDays} days — do NOT comment on attendance.`;

  const perfNote = grand_total != null
    ? `Grand total: ${grand_total} | Class position: ${class_position ?? '?'} of ${class_total ?? '?'}`
    : 'Results not yet available.';

  const prevNote = previous_remark
    ? `Previous term remark (for context only, do not repeat it): "${previous_remark}"`
    : '';

  return `Write a class teacher remark for this primary school student.

Student: ${student_name}
Class: ${class_name} | ${term_name}${year_name ? `, ${year_name}` : ''}

Subject results this term:
${subjectLines || '  (no subject scores available yet)'}

${perfNote}

${attNote}
${prevNote}
${exampleBlock}
Write the remark:`;
}

module.exports = router;
