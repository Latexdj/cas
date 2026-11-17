'use strict';
// The link between a school's CAS School Server (on its local network) and
// CAS. A school admin makes a short pairing code; the server trades it for a
// long-lived token, then uses that token to copy down the roster and LMS
// quizzes and to send back tests made and taken offline.

const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

// ── Admin (CAS admin portal) ──────────────────────────────────────────────────

const admin = [authenticate, adminOnly];

router.post('/pairing-code', admin, async (req, res, next) => {
  try {
    // Easy to read aloud and type: no 0/O, 1/I.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.randomBytes(8), b => alphabet[b % alphabet.length]).join('');
    await pool.query(`DELETE FROM school_server_pairing WHERE school_id=$1 OR expires_at < now()`, [req.schoolId]);
    const { rows } = await pool.query(
      `INSERT INTO school_server_pairing (school_id, code_hash, expires_at, created_by)
       VALUES ($1,$2, now() + interval '15 minutes', $3) RETURNING expires_at`,
      [req.schoolId, sha256(code), req.user.id || null]);
    res.json({ code, expires_at: rows[0].expires_at });
  } catch (err) { next(err); }
});

router.get('/servers', admin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, last_seen_at, last_sync_summary, created_at
         FROM school_servers WHERE school_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.delete('/servers/:id', admin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE school_servers SET revoked_at=now() WHERE id=$1 AND school_id=$2 AND revoked_at IS NULL`,
      [req.params.id, req.schoolId]);
    if (!rowCount) return res.status(404).json({ error: 'Server not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Pairing (called by the school server) ────────────────────────────────────

router.post('/pair', async (req, res, next) => {
  try {
    const schoolCode = String(req.body?.school_code || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[\s-]/g, '');
    const name = String(req.body?.name || 'School server').slice(0, 80);
    if (!schoolCode || !code) return res.status(400).json({ error: 'Enter the school code and the pairing code.' });
    const { rows: [school] } = await pool.query(`SELECT id, name FROM schools WHERE UPPER(code)=UPPER($1)`, [schoolCode]);
    if (!school) return res.status(404).json({ error: 'That school code was not found.' });
    const { rows: [pairing] } = await pool.query(
      `DELETE FROM school_server_pairing WHERE school_id=$1 AND code_hash=$2 AND expires_at > now() RETURNING id`,
      [school.id, sha256(code)]);
    if (!pairing) return res.status(400).json({ error: 'That pairing code is wrong or has expired. Make a new one in CAS: Settings, School server.' });
    const token = crypto.randomBytes(32).toString('hex');
    const { rows: [server] } = await pool.query(
      `INSERT INTO school_servers (school_id, name, token_hash, last_seen_at) VALUES ($1,$2,$3, now()) RETURNING id`,
      [school.id, name, sha256(token)]);
    res.json({ token, server_id: server.id, school: { id: school.id, name: school.name, code: schoolCode.toUpperCase() } });
  } catch (err) { next(err); }
});

// ── Sync (school server token) ───────────────────────────────────────────────

async function serverAuth(req, res, next) {
  try {
    const m = String(req.headers.authorization || '').match(/^Server\s+([a-f0-9]{64})$/i);
    if (!m) return res.status(401).json({ error: 'Server token required' });
    const { rows: [s] } = await pool.query(
      `UPDATE school_servers SET last_seen_at=now()
        WHERE token_hash=$1 AND revoked_at IS NULL RETURNING id, school_id`, [sha256(m[1])]);
    if (!s) return res.status(401).json({ error: 'This school server has been disconnected from CAS. Connect it again.' });
    req.schoolId = s.school_id; req.serverId = s.id;
    next();
  } catch (err) { next(err); }
}

async function currentTerm(schoolId) {
  const { rows: [y] } = await pool.query(
    `SELECT id, name, current_semester FROM academic_years WHERE school_id=$1 AND is_current=true ORDER BY name DESC LIMIT 1`, [schoolId]);
  return y ? { academic_year_id: y.id, year_name: y.name, semester: y.current_semester || 1 } : null;
}

router.get('/roster', serverAuth, async (req, res, next) => {
  try {
    const [{ rows: school }, { rows: students }, { rows: teachers }, term] = await Promise.all([
      pool.query(`SELECT name, code FROM schools WHERE id=$1`, [req.schoolId]),
      pool.query(`SELECT id, student_code, name, class_name, pin_hash FROM students
                   WHERE school_id=$1 AND status='Active' AND student_code IS NOT NULL ORDER BY class_name, name`, [req.schoolId]),
      pool.query(`SELECT id, teacher_code, name, pin_hash FROM teachers
                   WHERE school_id=$1 AND status='Active' AND teacher_code IS NOT NULL ORDER BY name`, [req.schoolId]),
      currentTerm(req.schoolId),
    ]);
    const courses = term ? (await pool.query(
      `SELECT id, teacher_id, subject_name, class_name FROM lms_courses
        WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND status <> 'archived'`,
      [req.schoolId, term.academic_year_id, term.semester])).rows : [];
    res.json({ school: school[0], term, students, teachers, courses, at: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/lms/quizzes', serverAuth, async (req, res, next) => {
  try {
    const term = await currentTerm(req.schoolId);
    if (!term) return res.json({ quizzes: [] });
    const { rows: quizzes } = await pool.query(
      `SELECT q.id, q.title, q.instructions, q.time_limit_mins, q.max_attempts, q.randomise_questions,
              q.show_answers_after, q.offline_ref, c.teacher_id, c.subject_name, c.class_name
         FROM lms_quizzes q JOIN lms_courses c ON c.id = q.course_id
        WHERE q.school_id=$1 AND q.is_published=true AND c.academic_year_id=$2 AND c.semester=$3`,
      [req.schoolId, term.academic_year_id, term.semester]);
    const ids = quizzes.map(q => q.id);
    const { rows: questions } = ids.length ? await pool.query(
      `SELECT id, quiz_id, question_text, question_type, options, explanation, marks, sort_order
         FROM lms_quiz_questions WHERE quiz_id = ANY($1) ORDER BY sort_order`, [ids]) : { rows: [] };
    for (const q of quizzes) {
      q.questions = questions.filter(x => x.quiz_id === q.id).map(x => {
        const opts = Array.isArray(x.options) ? x.options : [];
        const ci = opts.findIndex(o => o?.is_correct === true);
        return {
          id: x.id, type: x.question_type === 'short' ? 'short' : 'mcq', text: x.question_text,
          options: opts.map(o => o?.text ?? ''), correct: ci >= 0 ? LETTERS[ci] : null,
          explanation: x.explanation, marks: Number(x.marks) || 1, sort: x.sort_order,
        };
      });
    }
    res.json({ quizzes });
  } catch (err) { next(err); }
});

// Tests made on the school server's teacher page. Idempotent on offline_ref.
router.post('/lms/quizzes', serverAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const term = await currentTerm(req.schoolId);
    if (!term) { client.release(); return res.status(400).json({ error: 'The school has no current academic year in CAS.' }); }
    const input = Array.isArray(req.body?.quizzes) ? req.body.quizzes : [];
    const out = [];
    for (const qz of input) {
      const ref = String(qz.offline_ref || '').slice(0, 80);
      if (!ref || !qz.teacher_id || !qz.subject || !qz.class_name || !qz.title) continue;
      await client.query('BEGIN');
      try {
        const { rows: [t] } = await client.query(`SELECT id FROM teachers WHERE id=$1 AND school_id=$2`, [qz.teacher_id, req.schoolId]);
        if (!t) { await client.query('ROLLBACK'); out.push({ offline_ref: ref, error: 'Teacher not found' }); continue; }
        const { rows: [course] } = await client.query(
          `INSERT INTO lms_courses (school_id, teacher_id, subject_name, class_name, academic_year_id, semester, status)
           VALUES ($1,$2,$3,$4,$5,$6,'published')
           ON CONFLICT (school_id, teacher_id, subject_name, class_name, academic_year_id, semester)
           DO UPDATE SET subject_name = EXCLUDED.subject_name RETURNING id`,
          [req.schoolId, qz.teacher_id, qz.subject, qz.class_name, term.academic_year_id, term.semester]);
        const { rows: [quiz] } = await client.query(
          `INSERT INTO lms_quizzes (course_id, school_id, title, instructions, time_limit_mins, max_attempts,
                                    is_published, randomise_questions, show_answers_after, offline_ref)
           VALUES ($1,$2,$3,$4,$5,1,true,$6,$7,$8)
           ON CONFLICT (offline_ref) WHERE offline_ref IS NOT NULL
           DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, time_limit_mins=EXCLUDED.time_limit_mins,
                         randomise_questions=EXCLUDED.randomise_questions, show_answers_after=EXCLUDED.show_answers_after
           RETURNING id`,
          [course.id, req.schoolId, String(qz.title).slice(0, 200), qz.instructions || null,
           qz.time_limit_mins ? parseInt(qz.time_limit_mins, 10) : null, !!qz.randomise, qz.show_answers_after !== false, ref]);
        // Questions are replaced only while no one has answered them in CAS.
        const { rows: [{ n }] } = await client.query(
          `SELECT COUNT(*)::int AS n FROM lms_quiz_attempts WHERE quiz_id=$1`, [quiz.id]);
        const questionIds = {};
        if (n === 0) {
          await client.query(`DELETE FROM lms_quiz_questions WHERE quiz_id=$1`, [quiz.id]);
          for (const [i, q] of (qz.questions || []).entries()) {
            const isShort = q.type === 'short';
            const ci = LETTERS.indexOf(String(q.correct || '').toLowerCase());
            const options = isShort ? null : JSON.stringify((q.options || []).map((t, k) => ({ text: String(t), is_correct: k === ci })));
            const { rows: [row] } = await client.query(
              `INSERT INTO lms_quiz_questions (quiz_id, school_id, question_text, question_type, options, explanation, marks, sort_order)
               VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id`,
              [quiz.id, req.schoolId, String(q.text || ''), isShort ? 'short' : 'mcq', options, q.explanation || null,
               Number(q.marks) || 1, i]);
            questionIds[q.local_id] = row.id;
          }
        } else {
          const { rows } = await client.query(`SELECT id, sort_order FROM lms_quiz_questions WHERE quiz_id=$1 ORDER BY sort_order`, [quiz.id]);
          (qz.questions || []).forEach((q, i) => { if (rows[i]) questionIds[q.local_id] = rows[i].id; });
        }
        await client.query('COMMIT');
        out.push({ offline_ref: ref, quiz_id: quiz.id, question_ids: questionIds });
      } catch (e) { await client.query('ROLLBACK'); out.push({ offline_ref: ref, error: e.message }); }
    }
    res.json({ quizzes: out });
  } catch (err) { next(err); } finally { client.release(); }
});

// Attempts taken on the school network. Idempotent on offline_ref; sending
// one again (after the teacher marks short answers) updates its marks.
router.post('/lms/results', serverAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const input = Array.isArray(req.body?.attempts) ? req.body.attempts : [];
    const accepted = [], rejected = [];
    for (const a of input) {
      const ref = String(a.offline_ref || '').slice(0, 80);
      try {
        const { rows: [quiz] } = await client.query(
          `SELECT q.id FROM lms_quizzes q WHERE q.id=$1 AND q.school_id=$2`, [a.quiz_id, req.schoolId]);
        const { rows: [st] } = await client.query(`SELECT id FROM students WHERE id=$1 AND school_id=$2`, [a.student_id, req.schoolId]);
        if (!ref || !quiz || !st) { rejected.push({ offline_ref: ref, error: !quiz ? 'Quiz not in CAS' : 'Student not found' }); continue; }
        await client.query('BEGIN');
        const { rows: [att] } = await client.query(
          `INSERT INTO lms_quiz_attempts (quiz_id, student_id, school_id, started_at, submitted_at, score, max_score, is_complete, offline_ref)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
           ON CONFLICT (offline_ref) WHERE offline_ref IS NOT NULL
           DO UPDATE SET score=EXCLUDED.score, max_score=EXCLUDED.max_score, submitted_at=EXCLUDED.submitted_at
           RETURNING id`,
          [quiz.id, st.id, req.schoolId, a.started_at || new Date(), a.submitted_at || new Date(),
           Number(a.score) || 0, Number(a.max_score) || 0, ref]);
        for (const ans of a.answers || []) {
          if (!ans.question_id) continue;
          await client.query(
            `INSERT INTO lms_quiz_answers (attempt_id, question_id, selected_option, answer_text, is_correct, marks_awarded)
             SELECT $1, q.id, $3, $4, $5, $6 FROM lms_quiz_questions q WHERE q.id=$2 AND q.quiz_id=$7
             ON CONFLICT (attempt_id, question_id)
             DO UPDATE SET selected_option=EXCLUDED.selected_option, answer_text=EXCLUDED.answer_text,
                           is_correct=EXCLUDED.is_correct, marks_awarded=EXCLUDED.marks_awarded`,
            [att.id, ans.question_id, ans.selected_option ?? null, ans.answer_text ?? null,
             ans.is_correct ?? null, Number(ans.marks_awarded) || 0, quiz.id]);
        }
        await client.query('COMMIT');
        accepted.push(ref);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        rejected.push({ offline_ref: ref, error: e.message });
      }
    }
    res.json({ accepted, rejected });
  } catch (err) { next(err); } finally { client.release(); }
});

router.post('/summary', serverAuth, async (req, res, next) => {
  try {
    await pool.query(`UPDATE school_servers SET last_sync_summary=$1 WHERE id=$2`,
      [String(req.body?.summary || '').slice(0, 300), req.serverId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
