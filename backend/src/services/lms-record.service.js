'use strict';
// Records an LMS quiz's scores in the Assessments module: as a CA assessment
// under the quiz's assessment mode, or as the end-of-semester exam.
// Used by the teacher's "Sync to CA" button and by Offline Assessment tests
// from a CAS School Server, which are recorded when the teacher closes them.
//
// Students who did not take the quiz are left blank (not marked absent).
// Nothing is written once the class's results for the subject are locked
// (submitted to the HOD or later).

const pool = require('../config/db');

const LOCKED_STATUSES = ['submitted', 'hod_approved', 'final_approved', 'published'];

async function submissionStatus(db, schoolId, yearId, semester, subject, className) {
  if (!yearId) return 'draft';
  const { rows } = await db.query(
    `SELECT status FROM result_submissions
      WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5`,
    [schoolId, yearId, parseInt(semester, 10), subject, className]);
  return rows[0]?.status ?? 'draft';
}

/**
 * @returns {Promise<{ ok: boolean, kind?: 'ca'|'exam', assessment_id?: string, student_count?: number, error?: string, code?: string }>}
 */
async function recordQuiz(quizId, schoolId, { teacherId = null } = {}) {
  const { rows: [quiz] } = await pool.query(
    `SELECT q.*, c.subject_name, c.class_name, c.academic_year_id, c.semester, c.teacher_id
       FROM lms_quizzes q JOIN lms_courses c ON c.id = q.course_id
      WHERE q.id=$1 AND q.school_id=$2`, [quizId, schoolId]);
  if (!quiz) return { ok: false, code: 'NOT_FOUND', error: 'Quiz not found' };
  if (teacherId && quiz.teacher_id !== teacherId) return { ok: false, code: 'FORBIDDEN', error: 'Not your course' };
  const asExam = !!quiz.record_as_exam;
  if (!asExam && !quiz.assessment_mode_id) {
    return { ok: false, code: 'NO_MODE', error: 'No assessment mode set for this quiz. Edit the quiz and select a CA mode first.' };
  }
  const status = await submissionStatus(pool, schoolId, quiz.academic_year_id, quiz.semester, quiz.subject_name, quiz.class_name);
  if (LOCKED_STATUSES.includes(status)) {
    return { ok: false, code: 'LOCKED', error: `Scores for ${quiz.subject_name}, ${quiz.class_name} are locked (results ${status.replace(/_/g, ' ')}).` };
  }

  const { rows: [{ total }] } = await pool.query(
    'SELECT COALESCE(SUM(marks),0) AS total FROM lms_quiz_questions WHERE quiz_id=$1', [quizId]);
  const quizMax = parseFloat(total) || 100;
  const { rows: attempts } = await pool.query(
    `SELECT DISTINCT ON (student_id) student_id, score, max_score
       FROM lms_quiz_attempts WHERE quiz_id=$1 AND is_complete=true AND school_id=$2
      ORDER BY student_id, submitted_at DESC NULLS LAST`, [quizId, schoolId]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let assessmentId = null;
    if (asExam) {
      // Keep the class's exam on one scale: use the out-of already in use for
      // this subject and class, or the quiz's total if there is none yet.
      const { rows: [cur] } = await client.query(
        `SELECT max_score FROM exam_scores WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND subject=$4 AND class_name=$5
          AND max_score IS NOT NULL LIMIT 1`,
        [schoolId, quiz.academic_year_id, quiz.semester, quiz.subject_name, quiz.class_name]);
      const outOf = cur ? parseFloat(cur.max_score) : quizMax;
      for (const a of attempts) {
        const max = parseFloat(a.max_score) || quizMax;
        const scaled = max > 0 ? Math.round(((parseFloat(a.score) || 0) / max) * outOf * 100) / 100 : 0;
        await client.query(
          `INSERT INTO exam_scores (school_id, academic_year_id, semester, subject, class_name, student_id, teacher_id, score, max_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (academic_year_id, semester, subject, class_name, student_id)
           DO UPDATE SET score=EXCLUDED.score, max_score=EXCLUDED.max_score, teacher_id=EXCLUDED.teacher_id`,
          [schoolId, quiz.academic_year_id, quiz.semester, quiz.subject_name, quiz.class_name, a.student_id, quiz.teacher_id, scaled, outOf]);
      }
    } else {
      const { rows: [ass] } = await client.query(
        `INSERT INTO assessments (school_id, academic_year_id, semester, subject, class_name, teacher_id, mode_id, title, date, max_score, lms_quiz_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,$10)
         ON CONFLICT (lms_quiz_id) WHERE lms_quiz_id IS NOT NULL
           DO UPDATE SET title=EXCLUDED.title, max_score=EXCLUDED.max_score, teacher_id=EXCLUDED.teacher_id, mode_id=EXCLUDED.mode_id
         RETURNING id`,
        [schoolId, quiz.academic_year_id, quiz.semester, quiz.subject_name, quiz.class_name,
          quiz.teacher_id, quiz.assessment_mode_id, quiz.title, quizMax, quizId]);
      assessmentId = ass.id;
      for (const a of attempts) {
        const max = parseFloat(a.max_score) || quizMax;
        const scaled = max > 0 ? Math.round(((parseFloat(a.score) || 0) / max) * quizMax * 100) / 100 : 0;
        await client.query(
          `INSERT INTO assessment_scores (assessment_id, student_id, score) VALUES ($1,$2,$3)
           ON CONFLICT (assessment_id, student_id) DO UPDATE SET score=EXCLUDED.score, absent=false`,
          [assessmentId, a.student_id, scaled]);
      }
    }
    await client.query('UPDATE lms_quizzes SET ca_synced_at=now() WHERE id=$1', [quizId]);
    await client.query('COMMIT');
    return { ok: true, kind: asExam ? 'exam' : 'ca', assessment_id: assessmentId, student_count: attempts.length };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

module.exports = { recordQuiz, submissionStatus, LOCKED_STATUSES };
