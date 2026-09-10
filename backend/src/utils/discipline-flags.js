'use strict';

// ─── Student flags SQL ────────────────────────────────────────────────────────
// Rules 1-4 are current-year scoped. Rule 5 (stale serious case) is NOT.
// filterByClass: when true, requires $2 = class_name (form-master scoping).

function buildStudentFlagSQL(filterByClass = false) {
  const classFilter = filterByClass ? "AND LOWER(s.class_name) = LOWER($2)" : '';
  return `
WITH
thresholds AS (
  SELECT
    COALESCE(t.repeat_offense_count,         3)  AS repeat_offense_count,
    COALESCE(t.category_concentration_count, 3)  AS category_concentration_count,
    COALESCE(t.time_density_count,           2)  AS time_density_count,
    COALESCE(t.time_density_days,           30)  AS time_density_days,
    COALESCE(t.stale_case_days,             30)  AS stale_case_days
  FROM (VALUES (1)) d(x)
  LEFT JOIN discipline_flag_thresholds t ON t.school_id = $1
),
current_year AS (
  SELECT id FROM academic_years
  WHERE school_id = $1 AND is_current = true
  ORDER BY name DESC LIMIT 1
),
-- Rule 1: Repeat offense (low) — >= N non-resolved letters in current year
repeat_offense AS (
  SELECT sdl.student_id, COUNT(*) AS letter_count
  FROM student_disciplinary_letters sdl
  JOIN current_year cy ON sdl.academic_year_id = cy.id
  WHERE sdl.school_id = $1 AND sdl.status != 'resolved'
  GROUP BY sdl.student_id
  HAVING COUNT(*) >= (SELECT repeat_offense_count FROM thresholds)
),
-- Rule 2: Escalation trajectory (medium) — serious letter after a prior warning, same year
escalation_trajectory AS (
  SELECT DISTINCT serious.student_id
  FROM student_disciplinary_letters serious
  JOIN current_year cy ON serious.academic_year_id = cy.id
  WHERE serious.school_id = $1
    AND serious.letter_type IN ('final_warning','suspension','dismissal')
    AND serious.status != 'resolved'
    AND EXISTS (
      SELECT 1 FROM student_disciplinary_letters warn
      JOIN current_year cy2 ON warn.academic_year_id = cy2.id
      WHERE warn.student_id = serious.student_id
        AND warn.school_id  = $1
        AND warn.letter_type = 'warning'
        AND warn.issued_date < serious.issued_date
    )
),
-- Rule 3: Category concentration (medium) — >= N letters in same category+semester, current year
cat_counts AS (
  SELECT sdl.student_id, sdl.offense_category, sdl.semester, COUNT(*) AS cnt
  FROM student_disciplinary_letters sdl
  JOIN current_year cy ON sdl.academic_year_id = cy.id
  WHERE sdl.school_id = $1
    AND sdl.semester IS NOT NULL
    AND sdl.status != 'resolved'
  GROUP BY sdl.student_id, sdl.offense_category, sdl.semester
),
category_concentration AS (
  SELECT DISTINCT ON (student_id)
    student_id, offense_category AS conc_category, semester AS conc_semester
  FROM cat_counts
  WHERE cnt >= (SELECT category_concentration_count FROM thresholds)
  ORDER BY student_id, cnt DESC
),
-- Rule 4: Time density (medium) — >= N letters within a D-day window, current year
time_density AS (
  SELECT DISTINCT a.student_id
  FROM student_disciplinary_letters a
  JOIN current_year cy ON a.academic_year_id = cy.id
  WHERE a.school_id = $1
    AND a.status != 'resolved'
    AND (
      SELECT COUNT(*)
      FROM student_disciplinary_letters b
      JOIN current_year cy2 ON b.academic_year_id = cy2.id
      WHERE b.student_id = a.student_id
        AND b.school_id  = $1
        AND b.status    != 'resolved'
        AND b.issued_date >= a.issued_date
        AND b.issued_date <= a.issued_date + (SELECT time_density_days FROM thresholds) * INTERVAL '1 day'
    ) >= (SELECT time_density_count FROM thresholds)
),
-- Rule 5: Stale serious case (high) — serious letter stale > N days (NOT year-scoped)
stale_serious AS (
  SELECT DISTINCT ON (sdl.student_id)
    sdl.student_id,
    (CURRENT_DATE - sdl.issued_date::date)::int AS stale_days,
    sdl.letter_type                              AS stale_letter_type
  FROM student_disciplinary_letters sdl
  WHERE sdl.school_id = $1
    AND sdl.letter_type IN ('final_warning','suspension','dismissal')
    AND sdl.status IN ('issued','acknowledged')
    AND (CURRENT_DATE - sdl.issued_date::date) > (SELECT stale_case_days FROM thresholds)
  ORDER BY sdl.student_id, sdl.issued_date ASC
),
-- Most recent letter date per student, for "days since last action"
last_action AS (
  SELECT student_id,
    (CURRENT_DATE - MAX(issued_date::date))::int AS days_since_last
  FROM student_disciplinary_letters
  WHERE school_id = $1
  GROUP BY student_id
)
SELECT
  s.id                                         AS student_id,
  s.name                                       AS student_name,
  s.class_name,
  ro.student_id IS NOT NULL                    AS has_repeat_offense,
  COALESCE(ro.letter_count::int, 0)            AS letter_count,
  et.student_id IS NOT NULL                    AS has_escalation_trajectory,
  cc.student_id IS NOT NULL                    AS has_category_concentration,
  cc.conc_category,
  cc.conc_semester,
  td.student_id IS NOT NULL                    AS has_time_density,
  ss.student_id IS NOT NULL                    AS has_stale_serious,
  ss.stale_days,
  ss.stale_letter_type,
  fta.teacher_id                               AS form_master_id,
  ft.name                                      AS form_master_name,
  COALESCE(la.days_since_last, 0)              AS days_since_last_action,
  CASE
    WHEN ss.student_id IS NOT NULL THEN 3
    WHEN et.student_id IS NOT NULL
      OR cc.student_id IS NOT NULL
      OR td.student_id IS NOT NULL THEN 2
    WHEN ro.student_id IS NOT NULL THEN 1
    ELSE 0
  END AS severity_score
FROM students s
LEFT JOIN repeat_offense        ro  ON ro.student_id  = s.id
LEFT JOIN escalation_trajectory et  ON et.student_id  = s.id
LEFT JOIN category_concentration cc ON cc.student_id  = s.id
LEFT JOIN time_density           td  ON td.student_id  = s.id
LEFT JOIN stale_serious          ss  ON ss.student_id  = s.id
LEFT JOIN form_teacher_assignments fta
  ON  fta.school_id  = s.school_id
  AND LOWER(fta.class_name) = LOWER(s.class_name)
  AND fta.academic_year_id  = (SELECT id FROM current_year)
LEFT JOIN teachers ft ON ft.id = fta.teacher_id
LEFT JOIN last_action la ON la.student_id = s.id
WHERE s.school_id  = $1
  AND s.status     = 'Active'
  ${classFilter}
  AND (
    ro.student_id IS NOT NULL OR et.student_id IS NOT NULL OR
    cc.student_id IS NOT NULL OR td.student_id IS NOT NULL OR
    ss.student_id IS NOT NULL
  )
ORDER BY severity_score DESC, days_since_last_action DESC, student_name ASC
`;
}

// ─── Teacher flags SQL ────────────────────────────────────────────────────────

const TEACHER_FLAG_SQL = `
WITH
current_year AS (
  SELECT id FROM academic_years
  WHERE school_id = $1 AND is_current = true
  ORDER BY name DESC LIMIT 1
),
teacher_escalated AS (
  SELECT tq.teacher_id, COUNT(*)::int AS escalated_count
  FROM teacher_queries tq
  WHERE tq.school_id = $1 AND tq.status = 'escalated'
  GROUP BY tq.teacher_id
),
teacher_repeat AS (
  SELECT tq.teacher_id, COUNT(*)::int AS query_count
  FROM teacher_queries tq
  JOIN current_year cy ON tq.academic_year_id = cy.id
  WHERE tq.school_id = $1
  GROUP BY tq.teacher_id
  HAVING COUNT(*) >= 2
)
SELECT
  t.id                              AS teacher_id,
  t.name                            AS teacher_name,
  t.department,
  te.teacher_id IS NOT NULL         AS has_escalated_query,
  COALESCE(te.escalated_count, 0)   AS escalated_count,
  tr.teacher_id IS NOT NULL         AS has_repeat_queries,
  COALESCE(tr.query_count, 0)       AS query_count,
  CASE
    WHEN te.teacher_id IS NOT NULL THEN 2
    WHEN tr.teacher_id IS NOT NULL THEN 1
    ELSE 0
  END AS severity_score
FROM teachers t
LEFT JOIN teacher_escalated te ON te.teacher_id = t.id
LEFT JOIN teacher_repeat    tr ON tr.teacher_id = t.id
WHERE t.school_id = $1
  AND t.status = 'Active'
  AND (te.teacher_id IS NOT NULL OR tr.teacher_id IS NOT NULL)
ORDER BY severity_score DESC, teacher_name ASC
`;

// ─── Row processors ───────────────────────────────────────────────────────────

const OFFENSE_LABELS = {
  lateness_absenteeism: 'Lateness / Absenteeism',
  fighting_assault:     'Fighting / Assault',
  exam_malpractice:     'Exam Malpractice',
  substance_use:        'Substance Use',
  insubordination:      'Insubordination',
  theft_damage:         'Theft / Property Damage',
  bullying_harassment:  'Bullying / Harassment',
  indecent_behavior:    'Indecent Behavior',
  vandalism:            'Vandalism',
  other:                'Other',
};

function processStudentRows(rows) {
  return rows.map(row => {
    const flags = [];
    if (row.has_stale_serious) {
      const typeLabel = (row.stale_letter_type || '').replace(/_/g, ' ');
      flags.push({
        type: 'stale_serious_case', severity: 'high',
        detail: `${typeLabel} unresolved for ${row.stale_days} days`,
      });
    }
    if (row.has_escalation_trajectory) {
      flags.push({
        type: 'escalation_trajectory', severity: 'medium',
        detail: 'Escalating severity — warning followed by serious letter',
      });
    }
    if (row.has_category_concentration) {
      const catLabel = OFFENSE_LABELS[row.conc_category] || (row.conc_category || '').replace(/_/g, ' ');
      flags.push({
        type: 'category_concentration', severity: 'medium',
        detail: `Repeated ${catLabel}${row.conc_semester ? `, Semester ${row.conc_semester}` : ''}`,
      });
    }
    if (row.has_time_density) {
      flags.push({
        type: 'time_density', severity: 'medium',
        detail: 'Multiple letters in a short window',
      });
    }
    if (row.has_repeat_offense) {
      flags.push({
        type: 'repeat_offense', severity: 'low',
        detail: `${row.letter_count} active letters this academic year`,
      });
    }
    return {
      student_id:           row.student_id,
      student_name:         row.student_name,
      class_name:           row.class_name,
      form_master_id:       row.form_master_id   || null,
      form_master_name:     row.form_master_name || null,
      flags,
      severity_score:       Number(row.severity_score),
      days_since_last_action: Number(row.days_since_last_action),
    };
  });
}

function processTeacherRows(rows) {
  return rows.map(row => {
    const flags = [];
    if (row.has_escalated_query) {
      flags.push({
        type: 'escalated_query', severity: 'high',
        detail: `${row.escalated_count} escalated ${row.escalated_count === 1 ? 'query' : 'queries'}`,
      });
    }
    if (row.has_repeat_queries) {
      flags.push({
        type: 'repeat_queries', severity: 'medium',
        detail: `${row.query_count} queries this academic year`,
      });
    }
    return {
      teacher_id:     row.teacher_id,
      teacher_name:   row.teacher_name,
      department:     row.department || null,
      flags,
      severity_score: Number(row.severity_score),
    };
  });
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

async function queryFlaggedStudents(pool, schoolId, className = null) {
  const sql    = buildStudentFlagSQL(!!className);
  const params = className ? [schoolId, className] : [schoolId];
  const { rows } = await pool.query(sql, params);
  return processStudentRows(rows);
}

async function queryFlaggedTeachers(pool, schoolId) {
  const { rows } = await pool.query(TEACHER_FLAG_SQL, [schoolId]);
  return processTeacherRows(rows);
}

async function queryThresholds(pool, schoolId) {
  const { rows } = await pool.query(
    `SELECT repeat_offense_count, category_concentration_count,
            time_density_count, time_density_days, stale_case_days
     FROM discipline_flag_thresholds WHERE school_id = $1`,
    [schoolId]
  );
  return rows[0] ?? {
    repeat_offense_count:         3,
    category_concentration_count: 3,
    time_density_count:           2,
    time_density_days:            30,
    stale_case_days:              30,
  };
}

module.exports = { queryFlaggedStudents, queryFlaggedTeachers, queryThresholds };
