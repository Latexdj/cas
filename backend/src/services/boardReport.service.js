'use strict';
const pool = require('../config/db');
const { assembleResults, loadTermTrend, computeResultsAnalytics } = require('../routes/results');
const { computeAssessmentMonitorRows } = require('../routes/assessment-monitoring');

// Resolves (academicYearId, semester) to a concrete date range for the
// tables that only carry dates, not a period FK (exeats, school_expenses,
// clinic_visits). semester-level boundaries come from the admin-managed
// `semesters` table; if that row was never filled in for this school, the
// whole academic year's own start_date/end_date is the only defensible
// fallback — it's wider than the true semester, but never silently wrong
// in the other direction (narrower than the real period, missing data).
async function resolvePeriod(schoolId, academicYearId, semester) {
  const { rows: ayRows } = await pool.query(
    `SELECT id, name, start_date::text, end_date::text FROM academic_years WHERE id = $1 AND school_id = $2`,
    [academicYearId, schoolId]
  );
  const ay = ayRows[0];
  if (!ay) return null;

  let from = ay.start_date;
  let to = ay.end_date;
  let periodLabel = ay.name;

  if (semester) {
    const semInt = parseInt(semester);
    const { rows: semRows } = await pool.query(
      `SELECT start_date::text, end_date::text FROM semesters
       WHERE school_id = $1 AND academic_year_id = $2 AND number = $3`,
      [schoolId, academicYearId, semInt]
    );
    if (semRows[0]?.start_date && semRows[0]?.end_date) {
      from = semRows[0].start_date;
      to = semRows[0].end_date;
    }
    periodLabel = `${ay.name} — Semester ${semInt}`;
  }

  return { academic_year_id: ay.id, academic_year_name: ay.name, semester: semester ? parseInt(semester) : null, period_label: periodLabel, from, to };
}

async function computeAcademicsFacts(schoolId, academicYearId, semester) {
  // computeResultsAnalytics requires a specific semester (it's keyed off
  // exam_scores/assessments rows tagged with one); if the report spans the
  // whole year with no semester chosen, run it for both and let the
  // aggregator average the two rather than guessing which one to show.
  const semesters = semester ? [parseInt(semester)] : [1, 2];
  const analyticsBySem = await Promise.all(
    semesters.map(s => computeResultsAnalytics(schoolId, academicYearId, s, 'Active'))
  );
  const monitorBySem = await Promise.all(
    semesters.map(s => computeAssessmentMonitorRows(pool, schoolId, academicYearId, s))
  );

  const totalStudents = analyticsBySem.reduce((s, a) => s + (a.summary.total_students || 0), 0);
  const weightedAvgSum = analyticsBySem.reduce((s, a) => s + (a.summary.average || 0) * (a.summary.total_students || 0), 0);
  const weightedPassSum = analyticsBySem.reduce((s, a) => s + (a.summary.pass_rate || 0) * (a.summary.total_students || 0), 0);

  const nonSubmitting = [];
  let entryTotal = 0, entryNotStarted = 0, entryInProgress = 0, entrySubmittedOrBetter = 0;
  for (const m of monitorBySem) {
    entryTotal += m.summary.total;
    entryNotStarted += m.summary.not_started;
    entryInProgress += m.summary.in_progress;
    entrySubmittedOrBetter += m.summary.submitted;
    for (const r of m.rows) {
      if (r.status === 'not_started' || r.status === 'in_progress') {
        nonSubmitting.push({ teacher_name: r.teacher_name, subject: r.subject, class_name: r.class_name, status: r.status, completion_pct: r.completion_pct });
      }
    }
  }
  // Capped — this feeds an AI prompt, not a full export; the counts above
  // already carry the complete picture, this list is illustrative context.
  nonSubmitting.sort((a, b) => a.completion_pct - b.completion_pct);

  return {
    total_students: totalStudents,
    average: totalStudents ? Math.round((weightedAvgSum / totalStudents) * 10) / 10 : null,
    pass_rate: totalStudents ? Math.round((weightedPassSum / totalStudents) * 10) / 10 : null,
    by_class: analyticsBySem.flatMap(a => a.by_class),
    by_subject: analyticsBySem.flatMap(a => a.by_subject),
    result_entry: {
      total_teacher_subject_class_rows: entryTotal,
      not_started: entryNotStarted,
      in_progress: entryInProgress,
      submitted_or_approved_or_published: entrySubmittedOrBetter,
      non_submitting_sample: nonSubmitting.slice(0, 15),
    },
  };
}

async function computeStaffAttendanceFacts(schoolId, academicYearId, semester) {
  const { rows } = await pool.query(
    `WITH att AS (
       SELECT COALESCE(SUM(periods), 0) AS present_periods
       FROM attendance
       WHERE school_id = $1 AND academic_year_id = $2 AND ($3::int IS NULL OR semester = $3::int)
     ),
     abs AS (
       SELECT
         COALESCE(SUM(COALESCE(periods_lost, 1)) FILTER (WHERE status NOT IN ('Excused','Made Up','Verified')), 0) AS absent_periods,
         COALESCE(SUM(COALESCE(periods_lost, 1)) FILTER (WHERE status = 'Excused'), 0) AS excused_periods
       FROM absences WHERE school_id = $1 AND academic_year_id = $2
     ),
     made AS (
       SELECT COALESCE(SUM(COALESCE(rl.duration_periods, 1)), 0) AS made_up_periods
       FROM absences ab JOIN remedial_lessons rl ON rl.absence_id = ab.id
       WHERE ab.school_id = $1 AND ab.academic_year_id = $2 AND ab.status IN ('Made Up','Verified')
     )
     SELECT
       (att.present_periods + made.made_up_periods)::int AS present_periods,
       abs.absent_periods::int AS absent_periods,
       abs.excused_periods::int AS excused_periods,
       made.made_up_periods::int AS made_up_periods
     FROM att, abs, made`,
    [schoolId, academicYearId, semester ? parseInt(semester) : null]
  );
  const r = rows[0];
  const totalScheduled = r.present_periods + r.absent_periods;
  return {
    present_periods: r.present_periods,
    absent_periods: r.absent_periods,
    excused_periods: r.excused_periods,
    made_up_periods: r.made_up_periods,
    attendance_pct: totalScheduled ? Math.round((r.present_periods / totalScheduled) * 1000) / 10 : null,
  };
}

async function computeStudentAttendanceFacts(schoolId, academicYearId, semester) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(r.id)::int AS total_sessions,
       SUM(CASE WHEN r.status = 'Present' THEN 1 ELSE 0 END)::int AS present,
       SUM(CASE WHEN r.status = 'Absent'  THEN 1 ELSE 0 END)::int AS absent,
       SUM(CASE WHEN r.status = 'Late'    THEN 1 ELSE 0 END)::int AS late,
       SUM(CASE WHEN r.status = 'Excused' THEN 1 ELSE 0 END)::int AS excused
     FROM student_attendance_records r
     JOIN student_attendance_sessions s ON s.id = r.session_id
     WHERE r.school_id = $1 AND s.academic_year_id = $2 AND ($3::int IS NULL OR s.semester = $3::int)`,
    [schoolId, academicYearId, semester ? parseInt(semester) : null]
  );
  const r = rows[0];
  const denom = r.total_sessions - r.excused;
  return {
    total_sessions: r.total_sessions,
    present: r.present,
    absent: r.absent,
    late: r.late,
    excused: r.excused,
    present_pct: denom > 0 ? Math.round((r.present / denom) * 1000) / 10 : null,
  };
}

async function computeDisciplineFacts(schoolId, academicYearId, semester) {
  const queryParams = [schoolId, academicYearId];
  const { rows: qRows } = await pool.query(
    `SELECT
       COUNT(*)                                                                             AS total,
       COUNT(*) FILTER (WHERE status IN ('issued','acknowledged','responded'))             AS open,
       COUNT(*) FILTER (WHERE status = 'resolved')                                         AS resolved,
       COUNT(*) FILTER (WHERE status = 'escalated')                                        AS escalated,
       COUNT(*) FILTER (WHERE response_deadline < CURRENT_DATE
                         AND status NOT IN ('responded','resolved','escalated'))           AS overdue
     FROM teacher_queries WHERE school_id = $1 AND academic_year_id = $2`,
    queryParams
  );

  const letterParams = semester ? [schoolId, academicYearId, parseInt(semester)] : [schoolId, academicYearId];
  const { rows: lRows } = await pool.query(
    `SELECT
       COUNT(*)                                                     AS total,
       COUNT(*) FILTER (WHERE status NOT IN ('resolved'))           AS active,
       COUNT(*) FILTER (WHERE status = 'resolved')                  AS resolved,
       COUNT(*) FILTER (WHERE letter_type = 'warning')               AS warning,
       COUNT(*) FILTER (WHERE letter_type = 'final_warning')         AS final_warning,
       COUNT(*) FILTER (WHERE letter_type = 'suspension')            AS suspension,
       COUNT(*) FILTER (WHERE letter_type = 'dismissal')             AS dismissal
     FROM student_disciplinary_letters
     WHERE school_id = $1 AND academic_year_id = $2 ${semester ? 'AND semester = $3' : ''}`,
    letterParams
  );

  return { teacher_queries: qRows[0], student_letters: lRows[0] };
}

async function computeExeatFacts(schoolId, from, to) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                                     AS total,
       COUNT(*) FILTER (WHERE exeat_type = 'internal')              AS internal,
       COUNT(*) FILTER (WHERE exeat_type = 'external')              AS external,
       COUNT(*) FILTER (WHERE status = 'overdue')                   AS overdue,
       COUNT(*) FILTER (WHERE status = 'rejected')                  AS rejected,
       AVG(
         EXTRACT(EPOCH FROM (
           (actual_return_date::timestamp + actual_return_time) -
           (departure_date::timestamp + departure_time)
         )) / 3600.0
       ) FILTER (WHERE status = 'returned' AND actual_return_date IS NOT NULL) AS avg_duration_hours
     FROM exeats WHERE school_id = $1 AND departure_date >= $2 AND departure_date <= $3`,
    [schoolId, from, to]
  );
  const r = rows[0];
  return {
    total: parseInt(r.total),
    internal: parseInt(r.internal),
    external: parseInt(r.external),
    overdue: parseInt(r.overdue),
    rejected: parseInt(r.rejected),
    avg_duration_hours: r.avg_duration_hours != null ? Math.round(parseFloat(r.avg_duration_hours) * 10) / 10 : null,
  };
}

async function computeClinicFacts(schoolId, from, to) {
  const [bySeverity, byOutcome, byPatientType, total] = await Promise.all([
    pool.query(`SELECT severity, COUNT(*)::int AS count FROM clinic_visits WHERE school_id=$1 AND visit_date>=$2 AND visit_date<=$3 GROUP BY severity`, [schoolId, from, to]),
    pool.query(`SELECT outcome, COUNT(*)::int AS count FROM clinic_visits WHERE school_id=$1 AND visit_date>=$2 AND visit_date<=$3 AND outcome IS NOT NULL GROUP BY outcome`, [schoolId, from, to]),
    pool.query(`SELECT patient_type, COUNT(*)::int AS count FROM clinic_visits WHERE school_id=$1 AND visit_date>=$2 AND visit_date<=$3 GROUP BY patient_type`, [schoolId, from, to]),
    pool.query(`SELECT COUNT(*)::int AS total FROM clinic_visits WHERE school_id=$1 AND visit_date>=$2 AND visit_date<=$3`, [schoolId, from, to]),
  ]);
  return {
    total: total.rows[0].total,
    by_severity: bySeverity.rows,
    by_outcome: byOutcome.rows,
    by_patient_type: byPatientType.rows,
  };
}

async function computeFinanceFacts(schoolId, academicYearId, semester, from, to) {
  const billParams = [schoolId, academicYearId];
  const semClause = semester ? 'AND sb.semester = $3' : '';
  if (semester) billParams.push(parseInt(semester));

  const [billedRes, collectedRes, expenseRes] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(sb.amount),0) AS total, COUNT(DISTINCT sb.student_id)::int AS students FROM student_bills sb WHERE sb.school_id=$1 AND sb.academic_year_id=$2 ${semClause}`, billParams),
    pool.query(`SELECT COALESCE(SUM(fp.amount),0) AS total FROM fee_payments fp JOIN student_bills sb ON sb.id=fp.bill_id WHERE sb.school_id=$1 AND sb.academic_year_id=$2 ${semClause}`, billParams),
    pool.query(`SELECT COALESCE(SUM(se.amount),0) AS total FROM school_expenses se WHERE se.school_id=$1 AND se.expense_date>=$2 AND se.expense_date<=$3`, [schoolId, from, to]),
  ]);

  const total_billed = Number(billedRes.rows[0].total);
  const total_collected = Number(collectedRes.rows[0].total);
  const total_expenses = Number(expenseRes.rows[0].total);
  return {
    total_billed,
    total_collected,
    outstanding: total_billed - total_collected,
    total_expenses,
    net_position: total_collected - total_expenses,
    students_with_bills: billedRes.rows[0].students,
  };
}

async function computeEnrollmentFacts(schoolId) {
  // Current snapshot, not period-scoped — students has no admission-event
  // log, only a static year_of_admission column (same data batch-year-review
  // already shows), so "enrollment this period" can only mean "enrollment
  // as things stand today."
  const [byClassYear, total] = await Promise.all([
    pool.query(
      `SELECT class_name, COUNT(*)::int AS count
       FROM students WHERE school_id=$1 AND status='Active'
       GROUP BY class_name ORDER BY class_name`,
      [schoolId]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM students WHERE school_id=$1 AND status='Active'`, [schoolId]),
  ]);
  return { total_active_students: total.rows[0].total, by_class: byClassYear.rows };
}

async function computeBoardReportFacts(schoolId, academicYearId, semester) {
  const period = await resolvePeriod(schoolId, academicYearId, semester);
  if (!period) return null;

  const [academics, staffAttendance, studentAttendance, discipline, exeat, clinic, finance, enrollment] = await Promise.all([
    computeAcademicsFacts(schoolId, academicYearId, semester),
    computeStaffAttendanceFacts(schoolId, academicYearId, semester),
    computeStudentAttendanceFacts(schoolId, academicYearId, semester),
    computeDisciplineFacts(schoolId, academicYearId, semester),
    computeExeatFacts(schoolId, period.from, period.to),
    computeClinicFacts(schoolId, period.from, period.to),
    computeFinanceFacts(schoolId, academicYearId, semester, period.from, period.to),
    computeEnrollmentFacts(schoolId),
  ]);

  return {
    period,
    academics,
    attendance: { staff: staffAttendance, students: studentAttendance },
    discipline,
    exeat,
    clinic,
    finance,
    enrollment,
  };
}

module.exports = { computeBoardReportFacts, resolvePeriod };
