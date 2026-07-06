const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription);

// ── Role helpers ──────────────────────────────────────────────────────────────

function teacherOrAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'teacher' && role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Teacher or admin access required' });
  }
  next();
}

function studentOnly(req, res, next) {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ error: 'Student access required' });
  }
  next();
}

async function assertCourseOwner(req, courseId) {
  const { rows } = await pool.query(
    `SELECT teacher_id FROM lms_courses WHERE id=$1 AND school_id=$2`,
    [courseId, req.schoolId]
  );
  if (!rows.length) return { error: 'Course not found', status: 404 };
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'super_admin' && rows[0].teacher_id !== req.user.id) {
    return { error: 'You do not own this course', status: 403 };
  }
  return null;
}

// ── COURSES ───────────────────────────────────────────────────────────────────

// Teacher: list own courses
router.get('/my-courses', teacherOrAdmin, async (req, res, next) => {
  try {
    const { academic_year_id, semester } = req.query;
    const params = [req.schoolId, req.user.id];
    const conds  = ['c.school_id=$1', 'c.teacher_id=$2'];
    if (academic_year_id) { params.push(academic_year_id); conds.push(`c.academic_year_id=$${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`c.semester=$${params.length}`); }

    const { rows } = await pool.query(`
      SELECT c.*, ay.name AS academic_year_name, t.name AS teacher_name,
        (SELECT COUNT(*)::int FROM lms_lessons     WHERE course_id=c.id AND is_published=true)  AS lesson_count,
        (SELECT COUNT(*)::int FROM lms_assignments WHERE course_id=c.id AND is_published=true)  AS assignment_count,
        (SELECT COUNT(*)::int FROM lms_quizzes     WHERE course_id=c.id AND is_published=true)  AS quiz_count,
        (SELECT COUNT(*)::int FROM lms_submissions s
           JOIN lms_assignments a ON a.id=s.assignment_id
           WHERE a.course_id=c.id AND s.score IS NULL)                                          AS pending_submissions
      FROM lms_courses c
      LEFT JOIN academic_years ay ON ay.id=c.academic_year_id
      LEFT JOIN teachers t ON t.id=c.teacher_id
      WHERE ${conds.join(' AND ')}
      ORDER BY ay.name DESC NULLS LAST, c.class_name, c.subject_name`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin: list all courses
router.get('/admin/courses', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id, semester, class_name } = req.query;
    const params = [req.schoolId];
    const conds  = ['c.school_id=$1'];
    if (academic_year_id) { params.push(academic_year_id); conds.push(`c.academic_year_id=$${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`c.semester=$${params.length}`); }
    if (class_name)       { params.push(class_name);         conds.push(`c.class_name=$${params.length}`); }

    const { rows } = await pool.query(`
      SELECT c.*, ay.name AS academic_year_name, t.name AS teacher_name,
        (SELECT COUNT(*)::int FROM lms_lessons     WHERE course_id=c.id) AS lesson_count,
        (SELECT COUNT(*)::int FROM lms_assignments WHERE course_id=c.id) AS assignment_count,
        (SELECT COUNT(*)::int FROM lms_quizzes     WHERE course_id=c.id) AS quiz_count
      FROM lms_courses c
      LEFT JOIN academic_years ay ON ay.id=c.academic_year_id
      LEFT JOIN teachers t ON t.id=c.teacher_id
      WHERE ${conds.join(' AND ')}
      ORDER BY ay.name DESC NULLS LAST, c.class_name, c.subject_name`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Admin stats summary
router.get('/admin/stats', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM lms_courses     WHERE school_id=$1 AND status='published') AS active_courses,
        (SELECT COUNT(*)::int FROM lms_lessons     WHERE school_id=$1 AND is_published=true)  AS published_lessons,
        (SELECT COUNT(*)::int FROM lms_assignments WHERE school_id=$1 AND is_published=true)  AS active_assignments,
        (SELECT COUNT(*)::int FROM lms_submissions WHERE school_id=$1 AND score IS NULL)      AS pending_grades,
        (SELECT COUNT(*)::int FROM lms_pasco_questions WHERE school_id=$1)                   AS pasco_questions`, [req.schoolId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Create course
router.post('/courses', teacherOrAdmin, async (req, res, next) => {
  try {
    const { subject_name, class_name, academic_year_id, semester, description } = req.body;
    if (!subject_name || !class_name) {
      return res.status(400).json({ error: 'subject_name and class_name are required' });
    }
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const teacher_id = (isAdmin && req.body.teacher_id) ? req.body.teacher_id : req.user.id;

    const { rows } = await pool.query(
      `INSERT INTO lms_courses (school_id, teacher_id, subject_name, class_name, academic_year_id, semester, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.schoolId, teacher_id, subject_name, class_name,
       academic_year_id || null, semester ? parseInt(semester) : null, description || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A course for this subject/class/semester already exists' });
    next(err);
  }
});

// Get one course
router.get('/courses/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, ay.name AS academic_year_name, t.name AS teacher_name
      FROM lms_courses c
      LEFT JOIN academic_years ay ON ay.id=c.academic_year_id
      LEFT JOIN teachers t ON t.id=c.teacher_id
      WHERE c.id=$1 AND c.school_id=$2`, [req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Course not found' });
    if (req.user.role === 'student') {
      const { rows: st } = await pool.query('SELECT class_name FROM students WHERE id=$1', [req.user.id]);
      if (rows[0].status !== 'published' || rows[0].class_name !== st[0]?.class_name) {
        return res.status(403).json({ error: 'Course not available' });
      }
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Patch course (description, status)
router.patch('/courses/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.id);
    if (err) return res.status(err.status).json({ error: err.error });
    const { description, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_courses SET
         description=COALESCE($1,description),
         status=COALESCE($2,status)
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [description ?? null, status ?? null, req.params.id, req.schoolId]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Delete course
router.delete('/courses/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.id);
    if (err) return res.status(err.status).json({ error: err.error });
    await pool.query('DELETE FROM lms_courses WHERE id=$1 AND school_id=$2', [req.params.id, req.schoolId]);
    res.json({ message: 'Course deleted' });
  } catch (e) { next(e); }
});

// ── LESSONS ───────────────────────────────────────────────────────────────────

router.get('/courses/:courseId/lessons', async (req, res, next) => {
  try {
    const { rows: course } = await pool.query(
      'SELECT status FROM lms_courses WHERE id=$1 AND school_id=$2',
      [req.params.courseId, req.schoolId]);
    if (!course.length) return res.status(404).json({ error: 'Course not found' });

    let q = 'SELECT * FROM lms_lessons WHERE course_id=$1 AND school_id=$2';
    if (req.user.role === 'student') {
      if (course[0].status !== 'published') return res.status(403).json({ error: 'Course not available' });
      q += ' AND is_published=true';
    }
    q += ' ORDER BY sort_order, created_at';
    const { rows } = await pool.query(q, [req.params.courseId, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/courses/:courseId/lessons', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.courseId);
    if (err) return res.status(err.status).json({ error: err.error });
    const { title, content_type, body, external_url, is_published, sort_order, file_data } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await pool.query(
      `INSERT INTO lms_lessons (course_id, school_id, title, content_type, body, external_url, is_published, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.courseId, req.schoolId, title, content_type || 'text',
       body || null, external_url || null, is_published ?? false, parseInt(sort_order) || 0]);
    let lesson = rows[0];

    if (file_data) {
      try {
        const url = await uploadFile(file_data, `lms-lessons/${req.schoolId}/${lesson.id}`, { upsert: true });
        const { rows: u } = await pool.query('UPDATE lms_lessons SET file_url=$1 WHERE id=$2 RETURNING *', [url, lesson.id]);
        lesson = u[0];
      } catch (e) { console.error('Lesson file upload failed:', e.message); }
    }
    res.status(201).json(lesson);
  } catch (err) { next(err); }
});

router.put('/lessons/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT c.teacher_id FROM lms_lessons l JOIN lms_courses c ON c.id=l.course_id
       WHERE l.id=$1 AND l.school_id=$2`, [req.params.id, req.schoolId]);
    if (!existing.length) return res.status(404).json({ error: 'Lesson not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && existing[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Not your course' });

    const { title, content_type, body, external_url, is_published, sort_order, file_data } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_lessons SET
         title=COALESCE($1,title), content_type=COALESCE($2,content_type),
         body=$3, external_url=$4,
         is_published=COALESCE($5,is_published), sort_order=COALESCE($6,sort_order),
         updated_at=now()
       WHERE id=$7 AND school_id=$8 RETURNING *`,
      [title, content_type, body ?? null, external_url ?? null,
       is_published, sort_order ? parseInt(sort_order) : null, req.params.id, req.schoolId]);
    let lesson = rows[0];

    if (file_data) {
      try {
        const url = await uploadFile(file_data, `lms-lessons/${req.schoolId}/${lesson.id}`, { upsert: true });
        const { rows: u } = await pool.query('UPDATE lms_lessons SET file_url=$1 WHERE id=$2 RETURNING *', [url, lesson.id]);
        lesson = u[0];
      } catch (e) { console.error('Lesson file upload failed:', e.message); }
    }
    res.json(lesson);
  } catch (err) { next(err); }
});

router.delete('/lessons/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT c.teacher_id FROM lms_lessons l JOIN lms_courses c ON c.id=l.course_id
       WHERE l.id=$1 AND l.school_id=$2`, [req.params.id, req.schoolId]);
    if (!existing.length) return res.status(404).json({ error: 'Lesson not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && existing[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Not your course' });
    await pool.query('DELETE FROM lms_lessons WHERE id=$1', [req.params.id]);
    res.json({ message: 'Lesson deleted' });
  } catch (err) { next(err); }
});

// ── ASSIGNMENTS ───────────────────────────────────────────────────────────────

router.get('/courses/:courseId/assignments', async (req, res, next) => {
  try {
    const { rows: course } = await pool.query(
      'SELECT status FROM lms_courses WHERE id=$1 AND school_id=$2',
      [req.params.courseId, req.schoolId]);
    if (!course.length) return res.status(404).json({ error: 'Course not found' });

    if (req.user.role === 'student') {
      if (course[0].status !== 'published') return res.status(403).json({ error: 'Course not available' });
      const { rows } = await pool.query(
        `SELECT a.*,
           s.id AS submission_id, s.submitted_at, s.score, s.feedback, s.is_late
         FROM lms_assignments a
         LEFT JOIN lms_submissions s ON s.assignment_id=a.id AND s.student_id=$3
         WHERE a.course_id=$1 AND a.school_id=$2 AND a.is_published=true
         ORDER BY a.due_date NULLS LAST, a.created_at`,
        [req.params.courseId, req.schoolId, req.user.id]);
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT a.*,
         (SELECT COUNT(*)::int FROM lms_submissions WHERE assignment_id=a.id) AS submission_count,
         (SELECT COUNT(*)::int FROM lms_submissions WHERE assignment_id=a.id AND score IS NOT NULL) AS graded_count
       FROM lms_assignments a
       WHERE a.course_id=$1 AND a.school_id=$2
       ORDER BY a.due_date NULLS LAST, a.created_at`,
      [req.params.courseId, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/courses/:courseId/assignments', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.courseId);
    if (err) return res.status(err.status).json({ error: err.error });
    const { title, instructions, max_score, due_date, allow_late, is_published } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO lms_assignments (course_id, school_id, title, instructions, max_score, due_date, allow_late, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.courseId, req.schoolId, title, instructions || null,
       parseFloat(max_score) || 100, due_date || null, allow_late ?? true, is_published ?? true]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/assignments/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows: ex } = await pool.query(
      `SELECT c.teacher_id FROM lms_assignments a JOIN lms_courses c ON c.id=a.course_id
       WHERE a.id=$1 AND a.school_id=$2`, [req.params.id, req.schoolId]);
    if (!ex.length) return res.status(404).json({ error: 'Assignment not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && ex[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Not your course' });
    const { title, instructions, max_score, due_date, allow_late, is_published } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_assignments SET
         title=COALESCE($1,title), instructions=$2,
         max_score=COALESCE($3,max_score), due_date=$4,
         allow_late=COALESCE($5,allow_late), is_published=COALESCE($6,is_published)
       WHERE id=$7 AND school_id=$8 RETURNING *`,
      [title, instructions ?? null, max_score ? parseFloat(max_score) : null,
       due_date ?? null, allow_late, is_published, req.params.id, req.schoolId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/assignments/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM lms_assignments WHERE id=$1 AND school_id=$2', [req.params.id, req.schoolId]);
    res.json({ message: 'Assignment deleted' });
  } catch (err) { next(err); }
});

// Teacher: list submissions for an assignment
router.get('/assignments/:id/submissions', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.*, st.name AS student_name, st.student_code, st.class_name
       FROM lms_submissions s JOIN students st ON st.id=s.student_id
       WHERE s.assignment_id=$1 AND s.school_id=$2
       ORDER BY s.submitted_at DESC`,
      [req.params.id, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Student: submit an assignment
router.post('/assignments/:id/submit', studentOnly, async (req, res, next) => {
  try {
    const { rows: asgn } = await pool.query(
      `SELECT a.*, c.class_name FROM lms_assignments a JOIN lms_courses c ON c.id=a.course_id
       WHERE a.id=$1 AND a.school_id=$2 AND a.is_published=true`,
      [req.params.id, req.schoolId]);
    if (!asgn.length) return res.status(404).json({ error: 'Assignment not found' });

    const { rows: st } = await pool.query('SELECT class_name FROM students WHERE id=$1', [req.user.id]);
    if (!st.length || st[0].class_name !== asgn[0].class_name) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    const isLate = asgn[0].due_date && new Date() > new Date(asgn[0].due_date);
    if (isLate && !asgn[0].allow_late) {
      return res.status(400).json({ error: 'Due date has passed and late submissions are not allowed' });
    }

    const { body_text, file_data } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO lms_submissions (assignment_id, student_id, school_id, body_text, is_late)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (assignment_id, student_id)
         DO UPDATE SET body_text=EXCLUDED.body_text, is_late=EXCLUDED.is_late, submitted_at=now()
       RETURNING *`,
      [req.params.id, req.user.id, req.schoolId, body_text || null, isLate]);
    let submission = rows[0];

    if (file_data) {
      try {
        const url = await uploadFile(file_data, `lms-submissions/${req.schoolId}/${submission.id}`, { upsert: true });
        const { rows: u } = await pool.query('UPDATE lms_submissions SET file_url=$1 WHERE id=$2 RETURNING *', [url, submission.id]);
        submission = u[0];
      } catch (e) { console.error('Submission file upload failed:', e.message); }
    }
    res.status(201).json(submission);
  } catch (err) { next(err); }
});

// Teacher: grade a submission
router.patch('/submissions/:id/grade', teacherOrAdmin, async (req, res, next) => {
  try {
    const { score, feedback } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_submissions SET score=$1, feedback=$2, graded_at=now()
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [parseFloat(score), feedback || null, req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── QUIZZES ───────────────────────────────────────────────────────────────────

router.get('/courses/:courseId/quizzes', async (req, res, next) => {
  try {
    const { rows: course } = await pool.query(
      'SELECT status FROM lms_courses WHERE id=$1 AND school_id=$2',
      [req.params.courseId, req.schoolId]);
    if (!course.length) return res.status(404).json({ error: 'Course not found' });

    let q = `SELECT q.*,
      (SELECT COUNT(*)::int FROM lms_quiz_questions WHERE quiz_id=q.id) AS question_count,
      (SELECT COALESCE(SUM(marks),0) FROM lms_quiz_questions WHERE quiz_id=q.id) AS total_marks
      FROM lms_quizzes q WHERE q.course_id=$1 AND q.school_id=$2`;
    if (req.user.role === 'student') q += ' AND q.is_published=true';
    q += ' ORDER BY q.created_at';

    const { rows } = await pool.query(q, [req.params.courseId, req.schoolId]);

    if (req.user.role === 'student' && rows.length > 0) {
      const ids = rows.map(r => r.id);
      const { rows: atts } = await pool.query(
        `SELECT quiz_id, COUNT(*)::int AS attempt_count, MAX(score) AS best_score
         FROM lms_quiz_attempts WHERE student_id=$1 AND quiz_id=ANY($2) AND is_complete=true GROUP BY quiz_id`,
        [req.user.id, ids]);
      const attMap = Object.fromEntries(atts.map(a => [a.quiz_id, a]));
      return res.json(rows.map(r => ({ ...r, ...(attMap[r.id] || {}) })));
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/courses/:courseId/quizzes', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.courseId);
    if (err) return res.status(err.status).json({ error: err.error });
    const { title, instructions, time_limit_mins, max_attempts, is_published, randomise_questions, show_answers_after } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO lms_quizzes (course_id, school_id, title, instructions, time_limit_mins, max_attempts, is_published, randomise_questions, show_answers_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.courseId, req.schoolId, title, instructions || null,
       time_limit_mins ? parseInt(time_limit_mins) : null,
       parseInt(max_attempts) || 1, is_published ?? false,
       randomise_questions ?? false, show_answers_after ?? true]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT quiz: update metadata + replace all questions
router.put('/quizzes/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows: ex } = await pool.query(
      `SELECT c.teacher_id FROM lms_quizzes q JOIN lms_courses c ON c.id=q.course_id
       WHERE q.id=$1 AND q.school_id=$2`, [req.params.id, req.schoolId]);
    if (!ex.length) return res.status(404).json({ error: 'Quiz not found' });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && ex[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'Not your course' });

    const { title, instructions, time_limit_mins, max_attempts, is_published, randomise_questions, show_answers_after, questions } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_quizzes SET
         title=COALESCE($1,title), instructions=$2,
         time_limit_mins=$3, max_attempts=COALESCE($4,max_attempts),
         is_published=COALESCE($5,is_published),
         randomise_questions=COALESCE($6,randomise_questions),
         show_answers_after=COALESCE($7,show_answers_after)
       WHERE id=$8 AND school_id=$9 RETURNING *`,
      [title, instructions ?? null, time_limit_mins ? parseInt(time_limit_mins) : null,
       max_attempts ? parseInt(max_attempts) : null, is_published,
       randomise_questions, show_answers_after, req.params.id, req.schoolId]);

    if (Array.isArray(questions)) {
      await pool.query('DELETE FROM lms_quiz_questions WHERE quiz_id=$1', [req.params.id]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await pool.query(
          `INSERT INTO lms_quiz_questions (quiz_id, school_id, question_text, question_type, options, explanation, marks, sort_order)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
          [req.params.id, req.schoolId, q.question_text, q.question_type || 'mcq',
           q.options ? JSON.stringify(q.options) : null,
           q.explanation || null, parseFloat(q.marks) || 1, i]);
      }
    }

    const { rows: qs } = await pool.query(
      'SELECT * FROM lms_quiz_questions WHERE quiz_id=$1 ORDER BY sort_order', [req.params.id]);
    res.json({ ...rows[0], questions: qs });
  } catch (err) { next(err); }
});

router.delete('/quizzes/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM lms_quizzes WHERE id=$1 AND school_id=$2', [req.params.id, req.schoolId]);
    res.json({ message: 'Quiz deleted' });
  } catch (err) { next(err); }
});

// Get quiz questions (teacher sees correct answers, student sees masked)
router.get('/quizzes/:id/questions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM lms_quiz_questions WHERE quiz_id=$1 AND school_id=$2 ORDER BY sort_order',
      [req.params.id, req.schoolId]);
    if (req.user.role === 'student') {
      return res.json(rows.map(q => ({
        ...q, explanation: null,
        options: Array.isArray(q.options) ? q.options.map((o) => ({ text: o.text })) : q.options,
      })));
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// Student: start quiz attempt
router.post('/quizzes/:quizId/attempt', studentOnly, async (req, res, next) => {
  try {
    const { rows: quiz } = await pool.query(
      `SELECT q.*, c.class_name FROM lms_quizzes q JOIN lms_courses c ON c.id=q.course_id
       WHERE q.id=$1 AND q.school_id=$2 AND q.is_published=true`,
      [req.params.quizId, req.schoolId]);
    if (!quiz.length) return res.status(404).json({ error: 'Quiz not found' });

    const { rows: st } = await pool.query('SELECT class_name FROM students WHERE id=$1', [req.user.id]);
    if (!st.length || st[0].class_name !== quiz[0].class_name) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    const { rows: prev } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM lms_quiz_attempts
       WHERE quiz_id=$1 AND student_id=$2 AND is_complete=true`,
      [req.params.quizId, req.user.id]);
    if (prev[0].cnt >= quiz[0].max_attempts) {
      return res.status(400).json({ error: `Maximum ${quiz[0].max_attempts} attempt(s) reached` });
    }

    // Clean up any abandoned attempt
    await pool.query(
      'DELETE FROM lms_quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND is_complete=false',
      [req.params.quizId, req.user.id]);

    const { rows: totals } = await pool.query(
      'SELECT COALESCE(SUM(marks),0) AS max_score FROM lms_quiz_questions WHERE quiz_id=$1',
      [req.params.quizId]);

    const { rows: attempt } = await pool.query(
      `INSERT INTO lms_quiz_attempts (quiz_id, student_id, school_id, max_score)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.quizId, req.user.id, req.schoolId, totals[0].max_score]);

    const { rows: questions } = await pool.query(
      `SELECT id, question_text, question_type, options, marks, sort_order
       FROM lms_quiz_questions WHERE quiz_id=$1 ORDER BY sort_order`,
      [req.params.quizId]);

    const safeQ = questions.map(q => ({
      ...q,
      options: Array.isArray(q.options) ? q.options.map((o) => ({ text: o.text })) : q.options,
    }));

    res.status(201).json({ attempt: attempt[0], questions: safeQ, quiz: quiz[0] });
  } catch (err) { next(err); }
});

// Student: submit attempt answers (auto-grades MCQ)
router.post('/attempts/:id/submit', studentOnly, async (req, res, next) => {
  try {
    const { rows: attempt } = await pool.query(
      `SELECT a.*, q.show_answers_after FROM lms_quiz_attempts a
       JOIN lms_quizzes q ON q.id=a.quiz_id
       WHERE a.id=$1 AND a.student_id=$2 AND a.is_complete=false`,
      [req.params.id, req.user.id]);
    if (!attempt.length) return res.status(404).json({ error: 'Attempt not found or already submitted' });

    const { answers } = req.body;
    if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers array required' });

    const { rows: questions } = await pool.query(
      'SELECT * FROM lms_quiz_questions WHERE quiz_id=$1', [attempt[0].quiz_id]);
    const qMap = Object.fromEntries(questions.map(q => [q.id, q]));

    let totalScore = 0;
    const results = [];

    for (const ans of answers) {
      const question = qMap[ans.question_id];
      if (!question) continue;

      let is_correct = null;
      let marks_awarded = 0;
      let correct_index = null;

      if (question.question_type === 'mcq' && Array.isArray(question.options)) {
        correct_index = question.options.findIndex((o) => o.is_correct === true);
        const selected = question.options[ans.selected_option];
        is_correct = selected?.is_correct === true;
        marks_awarded = is_correct ? parseFloat(question.marks) : 0;
        totalScore += marks_awarded;
      }

      await pool.query(
        `INSERT INTO lms_quiz_answers (attempt_id, question_id, selected_option, answer_text, is_correct, marks_awarded)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [req.params.id, ans.question_id, ans.selected_option ?? null,
         ans.answer_text || null, is_correct, marks_awarded]);

      results.push({
        question_id:   ans.question_id,
        is_correct,
        marks_awarded,
        correct_index,
        explanation: attempt[0].show_answers_after ? question.explanation : null,
      });
    }

    const { rows: updated } = await pool.query(
      'UPDATE lms_quiz_attempts SET score=$1, is_complete=true, submitted_at=now() WHERE id=$2 RETURNING *',
      [totalScore, req.params.id]);

    res.json({ attempt: updated[0], results });
  } catch (err) { next(err); }
});

// Teacher: quiz results for a class
router.get('/quizzes/:id/results', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, s.name AS student_name, s.student_code
       FROM lms_quiz_attempts a JOIN students s ON s.id=a.student_id
       WHERE a.quiz_id=$1 AND a.school_id=$2 AND a.is_complete=true
       ORDER BY a.score DESC NULLS LAST`,
      [req.params.id, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// Student: get their own completed attempt
router.get('/attempts/:id', studentOnly, async (req, res, next) => {
  try {
    const { rows: attempt } = await pool.query(
      `SELECT a.*, q.show_answers_after FROM lms_quiz_attempts a
       JOIN lms_quizzes q ON q.id=a.quiz_id
       WHERE a.id=$1 AND a.student_id=$2`,
      [req.params.id, req.user.id]);
    if (!attempt.length) return res.status(404).json({ error: 'Attempt not found' });

    const { rows: answers } = await pool.query(
      `SELECT ans.*, qq.question_text, qq.options, qq.question_type, qq.marks,
              CASE WHEN $2 THEN qq.explanation ELSE NULL END AS explanation
       FROM lms_quiz_answers ans JOIN lms_quiz_questions qq ON qq.id=ans.question_id
       WHERE ans.attempt_id=$1`,
      [req.params.id, attempt[0].show_answers_after]);
    res.json({ attempt: attempt[0], answers });
  } catch (err) { next(err); }
});

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────────

router.get('/courses/:courseId/announcements', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM lms_announcements WHERE course_id=$1 AND school_id=$2
       ORDER BY is_pinned DESC, created_at DESC`,
      [req.params.courseId, req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/courses/:courseId/announcements', teacherOrAdmin, async (req, res, next) => {
  try {
    const err = await assertCourseOwner(req, req.params.courseId);
    if (err) return res.status(err.status).json({ error: err.error });
    const { title, body, is_pinned } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO lms_announcements (course_id, school_id, title, body, is_pinned)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.courseId, req.schoolId, title, body || null, is_pinned ?? false]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/announcements/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM lms_announcements WHERE id=$1 AND school_id=$2', [req.params.id, req.schoolId]);
    res.json({ message: 'Announcement deleted' });
  } catch (err) { next(err); }
});

// ── PASCO BANK ────────────────────────────────────────────────────────────────

router.get('/pasco', async (req, res, next) => {
  try {
    const { subject_name, topic, difficulty, year, limit = 20, randomise } = req.query;
    const params = [req.schoolId];
    const conds  = ['school_id=$1'];
    if (subject_name) { params.push(subject_name); conds.push(`subject_name=$${params.length}`); }
    if (topic)        { params.push(`%${topic}%`); conds.push(`topic ILIKE $${params.length}`); }
    if (difficulty)   { params.push(difficulty);   conds.push(`difficulty=$${params.length}`); }
    if (year)         { params.push(parseInt(year)); conds.push(`year=$${params.length}`); }

    const order = randomise === 'true' ? 'RANDOM()' : 'created_at DESC';
    params.push(Math.min(parseInt(limit) || 20, 100));
    const { rows } = await pool.query(
      `SELECT * FROM lms_pasco_questions WHERE ${conds.join(' AND ')} ORDER BY ${order} LIMIT $${params.length}`,
      params);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/pasco', teacherOrAdmin, async (req, res, next) => {
  try {
    const { subject_name, year, source, question_text, options, explanation, topic, difficulty } = req.body;
    if (!subject_name || !question_text || !options) {
      return res.status(400).json({ error: 'subject_name, question_text and options required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO lms_pasco_questions (school_id, subject_name, year, source, question_text, options, explanation, topic, difficulty)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
      [req.schoolId, subject_name, year ? parseInt(year) : null, source || null,
       question_text, JSON.stringify(options), explanation || null, topic || null, difficulty || 'medium']);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/pasco/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { subject_name, year, source, question_text, options, explanation, topic, difficulty } = req.body;
    const { rows } = await pool.query(
      `UPDATE lms_pasco_questions SET
         subject_name=COALESCE($1,subject_name), year=$2, source=$3,
         question_text=COALESCE($4,question_text),
         options=COALESCE($5::jsonb,options),
         explanation=$6, topic=$7, difficulty=COALESCE($8,difficulty)
       WHERE id=$9 AND school_id=$10 RETURNING *`,
      [subject_name, year ? parseInt(year) : null, source || null, question_text,
       options ? JSON.stringify(options) : null,
       explanation || null, topic || null, difficulty, req.params.id, req.schoolId]);
    if (!rows.length) return res.status(404).json({ error: 'Question not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/pasco/:id', teacherOrAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM lms_pasco_questions WHERE id=$1 AND school_id=$2', [req.params.id, req.schoolId]);
    if (!rowCount) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Question deleted' });
  } catch (err) { next(err); }
});

// ── STUDENT AGGREGATE ROUTES ──────────────────────────────────────────────────

// Student: list enrolled courses
router.get('/student/courses', studentOnly, async (req, res, next) => {
  try {
    const { rows: st } = await pool.query('SELECT class_name FROM students WHERE id=$1', [req.user.id]);
    if (!st.length) return res.status(404).json({ error: 'Student not found' });

    const { academic_year_id, semester } = req.query;
    const params = [req.schoolId, st[0].class_name, req.user.id];
    const conds  = [`c.school_id=$1`, `c.class_name=$2`, `c.status='published'`];
    if (academic_year_id) { params.push(academic_year_id); conds.push(`c.academic_year_id=$${params.length}`); }
    if (semester)         { params.push(parseInt(semester)); conds.push(`c.semester=$${params.length}`); }

    const { rows } = await pool.query(`
      SELECT c.*, ay.name AS academic_year_name, t.name AS teacher_name,
        (SELECT COUNT(*)::int FROM lms_lessons    WHERE course_id=c.id AND is_published=true) AS lesson_count,
        (SELECT COUNT(*)::int FROM lms_assignments WHERE course_id=c.id AND is_published=true) AS assignment_count,
        (SELECT COUNT(*)::int FROM lms_assignments a WHERE a.course_id=c.id AND a.is_published=true
         AND NOT EXISTS (SELECT 1 FROM lms_submissions s WHERE s.assignment_id=a.id AND s.student_id=$3)) AS pending_assignments,
        (SELECT COUNT(*)::int FROM lms_quizzes WHERE course_id=c.id AND is_published=true) AS quiz_count,
        (SELECT COUNT(*)::int FROM lms_announcements WHERE course_id=c.id) AS announcement_count
      FROM lms_courses c
      LEFT JOIN academic_years ay ON ay.id=c.academic_year_id
      LEFT JOIN teachers t ON t.id=c.teacher_id
      WHERE ${conds.join(' AND ')}
      ORDER BY c.subject_name`, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Student: all assignments across enrolled courses
router.get('/student/assignments', studentOnly, async (req, res, next) => {
  try {
    const { rows: st } = await pool.query('SELECT class_name FROM students WHERE id=$1', [req.user.id]);
    if (!st.length) return res.status(404).json({ error: 'Student not found' });
    const { status } = req.query;
    let extra = '';
    if (status === 'pending')   extra = 'AND s.id IS NULL';
    if (status === 'submitted') extra = 'AND s.id IS NOT NULL AND s.score IS NULL';
    if (status === 'graded')    extra = 'AND s.score IS NOT NULL';
    const { rows } = await pool.query(
      `SELECT a.*, c.subject_name,
         s.id AS submission_id, s.submitted_at, s.score, s.feedback, s.is_late
       FROM lms_assignments a
       JOIN lms_courses c ON c.id=a.course_id
       LEFT JOIN lms_submissions s ON s.assignment_id=a.id AND s.student_id=$1
       WHERE c.school_id=$2 AND c.class_name=$3 AND c.status='published' AND a.is_published=true ${extra}
       ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
      [req.user.id, req.schoolId, st[0].class_name]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
