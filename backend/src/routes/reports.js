const router  = require('express').Router();
const pool    = require('../config/db');
const ExcelJS = require('exceljs');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription, adminOnly);

// ── Student report definitions ─────────────────────────────────────────────────

const STUDENT_REPORTS = {
  program_distribution: {
    label:   'Program Distribution',
    columns: ['Program', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(p.name, 'No Program') AS "group",
             COUNT(*) FILTER (WHERE s.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE s.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE s.school_id = $1 ${sc}
      GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },

  program_residential: {
    label:   'Program Distribution by Residential Status',
    columns: ['Program', 'Day – Male', 'Day – Female', 'Boarding – Male', 'Boarding – Female', 'Total'],
    keys:    ['group', 'day_male', 'day_female', 'boarding_male', 'boarding_female', 'total'],
    sql: sc => `
      SELECT COALESCE(p.name, 'No Program') AS "group",
             COUNT(*) FILTER (WHERE s.residential_status = 'Day'      AND s.gender = 'Male')   AS day_male,
             COUNT(*) FILTER (WHERE s.residential_status = 'Day'      AND s.gender = 'Female') AS day_female,
             COUNT(*) FILTER (WHERE s.residential_status = 'Boarding' AND s.gender = 'Male')   AS boarding_male,
             COUNT(*) FILTER (WHERE s.residential_status = 'Boarding' AND s.gender = 'Female') AS boarding_female,
             COUNT(*) AS total
      FROM students s
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE s.school_id = $1 ${sc}
      GROUP BY p.name ORDER BY p.name NULLS LAST`,
  },

  class_distribution: {
    label:   'Class Distribution',
    columns: ['Class', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT s.class_name AS "group",
             COUNT(*) FILTER (WHERE s.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE s.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM students s
      WHERE s.school_id = $1 ${sc}
      GROUP BY s.class_name ORDER BY s.class_name`,
  },

  house_distribution: {
    label:   'House Distribution',
    columns: ['House', 'Day – Male', 'Day – Female', 'Boarding – Male', 'Boarding – Female', 'Total'],
    keys:    ['group', 'day_male', 'day_female', 'boarding_male', 'boarding_female', 'total'],
    sql: sc => `
      SELECT COALESCE(s.house, 'No House') AS "group",
             COUNT(*) FILTER (WHERE s.residential_status = 'Day'      AND s.gender = 'Male')   AS day_male,
             COUNT(*) FILTER (WHERE s.residential_status = 'Day'      AND s.gender = 'Female') AS day_female,
             COUNT(*) FILTER (WHERE s.residential_status = 'Boarding' AND s.gender = 'Male')   AS boarding_male,
             COUNT(*) FILTER (WHERE s.residential_status = 'Boarding' AND s.gender = 'Female') AS boarding_female,
             COUNT(*) AS total
      FROM students s
      WHERE s.school_id = $1 ${sc}
      GROUP BY s.house ORDER BY s.house NULLS LAST`,
  },

  religion_distribution: {
    label:   'Religion Distribution',
    columns: ['Religion', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(s.religion, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE s.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE s.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM students s
      WHERE s.school_id = $1 ${sc}
      GROUP BY s.religion ORDER BY total DESC`,
  },

  denomination_distribution: {
    label:   'Religious Denomination Distribution',
    columns: ['Denomination', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(s.religious_denomination, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE s.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE s.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM students s
      WHERE s.school_id = $1 ${sc}
      GROUP BY s.religious_denomination ORDER BY total DESC`,
  },

  age_distribution: {
    label:   'Age Distribution',
    columns: ['Age Group', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      WITH aged AS (
        SELECT s.gender,
          CASE
            WHEN s.date_of_birth IS NULL                           THEN 'Not Recorded'
            WHEN DATE_PART('year', AGE(s.date_of_birth)) < 14     THEN 'Under 14'
            WHEN DATE_PART('year', AGE(s.date_of_birth)) > 20     THEN '21 and above'
            ELSE DATE_PART('year', AGE(s.date_of_birth))::int::text
          END AS "group"
        FROM students s
        WHERE s.school_id = $1 ${sc}
      )
      SELECT "group",
             COUNT(*) FILTER (WHERE gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE gender = 'Female') AS female,
             COUNT(*)                                   AS total
      FROM aged GROUP BY "group"
      ORDER BY CASE "group"
        WHEN 'Under 14'     THEN 0
        WHEN '14'           THEN 14  WHEN '15' THEN 15  WHEN '16' THEN 16
        WHEN '17'           THEN 17  WHEN '18' THEN 18  WHEN '19' THEN 19
        WHEN '20'           THEN 20  WHEN '21 and above' THEN 98
        ELSE 99
      END`,
  },

  aggregate_distribution: {
    label:   'Aggregate Range Distribution',
    columns: ['Aggregate Range', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      WITH agg AS (
        SELECT s.gender,
          CASE
            WHEN s.aggregate IS NULL                    THEN 'Not Recorded'
            WHEN s.aggregate BETWEEN 6  AND 12          THEN '6 – 12'
            WHEN s.aggregate BETWEEN 13 AND 18          THEN '13 – 18'
            WHEN s.aggregate BETWEEN 19 AND 24          THEN '19 – 24'
            WHEN s.aggregate BETWEEN 25 AND 30          THEN '25 – 30'
            WHEN s.aggregate BETWEEN 31 AND 36          THEN '31 – 36'
            ELSE '37 and above'
          END AS "group"
        FROM students s
        WHERE s.school_id = $1 ${sc}
      )
      SELECT "group",
             COUNT(*) FILTER (WHERE gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE gender = 'Female') AS female,
             COUNT(*)                                   AS total
      FROM agg GROUP BY "group"
      ORDER BY CASE "group"
        WHEN '6 – 12'      THEN 1  WHEN '13 – 18'     THEN 2
        WHEN '19 – 24'     THEN 3  WHEN '25 – 30'     THEN 4
        WHEN '31 – 36'     THEN 5  WHEN '37 and above' THEN 6
        ELSE 99
      END`,
  },
};

// ── Academic report definitions ────────────────────────────────────────────────

const ACADEMIC_REPORTS = {
  grade_distribution: {
    label: 'Grade Distribution by Subject',
    // Returns: per subject in a class, count of each grade
    // Params needed: academic_year_id, semester, class_name
  },
  class_performance: {
    label: 'Class Performance Summary',
    // Returns: per class, average score, pass rate, subject count
    // Params needed: academic_year_id, semester
  },
  subject_pass_rate: {
    label: 'Subject Pass Rate',
    // Returns: per subject, pass rate across all classes
    // Params needed: academic_year_id, semester
  },
  teacher_completion: {
    label: 'Assessment Submission Tracker',
    // Returns: per teacher, how many subjects submitted vs total
    // Params needed: academic_year_id, semester
  },
  at_risk_students: {
    label: 'At-Risk Students',
    // Returns: students with total average below 40%
    // Params needed: academic_year_id, semester, class_name (optional)
  },
};

// ── Teacher report definitions ─────────────────────────────────────────────────

const TEACHER_REPORTS = {
  gender_summary: {
    label:         'Gender Summary',
    columns:       ['Gender', 'Count', 'Percentage'],
    keys:          ['group', 'count', 'pct'],
    hasPercentage: true,
    sql: sc => `
      SELECT COALESCE(t.gender, 'Not Specified') AS "group",
             COUNT(*) AS count
      FROM teachers t
      WHERE t.school_id = $1 ${sc}
      GROUP BY t.gender ORDER BY t.gender NULLS LAST`,
  },

  department_distribution: {
    label:   'Department Distribution',
    columns: ['Department', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(t.department, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE t.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE t.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM teachers t
      WHERE t.school_id = $1 ${sc}
      GROUP BY t.department ORDER BY t.department NULLS LAST`,
  },

  rank_distribution: {
    label:   'GES Rank Distribution',
    columns: ['Rank', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(t.rank, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE t.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE t.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM teachers t
      WHERE t.school_id = $1 ${sc}
      GROUP BY t.rank ORDER BY total DESC`,
  },

  qualification_distribution: {
    label:   'Qualification Distribution',
    columns: ['Qualification', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(t.academic_qualification, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE t.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE t.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM teachers t
      WHERE t.school_id = $1 ${sc}
      GROUP BY t.academic_qualification ORDER BY total DESC`,
  },

  association_distribution: {
    label:   'Association Distribution',
    columns: ['Association', 'Male', 'Female', 'Total'],
    keys:    ['group', 'male', 'female', 'total'],
    sql: sc => `
      SELECT COALESCE(t.association, 'Not Specified') AS "group",
             COUNT(*) FILTER (WHERE t.gender = 'Male')   AS male,
             COUNT(*) FILTER (WHERE t.gender = 'Female') AS female,
             COUNT(*)                                     AS total
      FROM teachers t
      WHERE t.school_id = $1 ${sc}
      GROUP BY t.association ORDER BY total DESC`,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildTotals(keys, rows, hasPercentage) {
  const totals = { group: 'TOTAL' };
  for (const k of keys.slice(1)) {
    if (k === 'pct') { totals[k] = '100%'; continue; }
    totals[k] = rows.reduce((sum, r) => sum + (parseInt(r[k]) || 0), 0);
  }
  return totals;
}

function addPercentage(rows, keys) {
  const countKey = keys[1];
  const grand = rows.reduce((s, r) => s + (parseInt(r[countKey]) || 0), 0);
  return rows.map(r => ({
    ...r,
    pct: grand ? ((parseInt(r[countKey]) / grand) * 100).toFixed(1) + '%' : '0%',
  }));
}

async function runReport(report, schoolId, status, isStudents) {
  const alias = isStudents ? 's' : 't';
  const sc    = status === 'all' ? '' : `AND ${alias}.status = 'Active'`;
  const { rows } = await pool.query(report.sql(sc), [schoolId]);
  const data = report.hasPercentage ? addPercentage(rows, report.keys) : rows;
  return data;
}

async function buildExcel(report, rows) {
  const GREEN_DARK = '0F4C35';
  const GREEN_MID  = '1A6B45';
  const GREEN_SEP  = '2A8A5A';
  const WHITE      = 'FFFFFF';
  const GREY_ALT   = 'F2F8F5';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CAS';
  wb.created = new Date();

  const ws = wb.addWorksheet(report.label.slice(0, 31), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views:     [{ state: 'frozen', ySplit: 2 }],
  });

  ws.columns = report.columns.map((col, i) => ({
    key:   report.keys[i],
    width: Math.max(col.length + 6, 18),
  }));

  // Row 1: title
  ws.mergeCells(1, 1, 1, report.columns.length);
  const title = ws.getRow(1).getCell(1);
  title.value     = report.label;
  title.font      = { bold: true, size: 13, color: { argb: WHITE }, name: 'Calibri' };
  title.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 28;

  // Row 2: headers
  const hdr = ws.getRow(2);
  hdr.height = 22;
  report.columns.forEach((col, i) => {
    const c     = hdr.getCell(i + 1);
    c.value     = col;
    c.font      = { bold: true, color: { argb: WHITE }, size: 10, name: 'Calibri' };
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_MID } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
    c.border    = { right: { style: 'thin', color: { argb: GREEN_SEP } } };
  });

  // Data rows
  rows.forEach((row, ri) => {
    const wr = ws.getRow(ri + 3);
    wr.height = 18;
    report.keys.forEach((key, ci) => {
      const c     = wr.getCell(ci + 1);
      c.value     = row[key] ?? '';
      c.font      = { size: 10, name: 'Calibri' };
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? WHITE : GREY_ALT } };
      c.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'left' : 'center' };
    });
  });

  // Totals row
  const totals = buildTotals(report.keys, rows, report.hasPercentage);
  const totRow = ws.getRow(rows.length + 3);
  totRow.height = 20;
  report.keys.forEach((key, ci) => {
    const c     = totRow.getCell(ci + 1);
    c.value     = totals[key] ?? '';
    c.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: WHITE } };
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_DARK } };
    c.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'left' : 'center' };
  });

  return wb;
}

// ── Assessment completion helper ───────────────────────────────────────────────
// Returns a flat array of rows used by both the JSON and Excel endpoints.
// Each row: { teacher_name, department, subject, class_name, total_students,
//             outstanding_modes, exam_status, completion_pct, _pct (raw number) }
async function buildTeacherCompletionRows(schoolId, academicYearId, semester) {
  const sem = parseInt(semester);

  // CA modes for this school
  const { rows: modes } = await pool.query(
    `SELECT id, name FROM assessment_modes WHERE school_id = $1 ORDER BY sort_order, name`,
    [schoolId]
  );

  // Timetable matrix
  const { rows: timetable } = await pool.query(`
    WITH expanded AS (
      SELECT DISTINCT t.teacher_id, LOWER(t.subject) AS subject_key, t.subject,
                      TRIM(cls) AS class_name
      FROM timetable t,
           LATERAL unnest(string_to_array(t.class_names, ',')) AS cls
      WHERE t.school_id=$1 AND t.academic_year_id=$2 AND t.semester=$3
    )
    SELECT e.teacher_id, te.name AS teacher_name, te.department,
           e.subject, e.class_name,
           (SELECT COUNT(*)::int FROM students s
            WHERE s.school_id=$1 AND LOWER(s.class_name)=LOWER(e.class_name)
              AND s.status='Active') AS total_students
    FROM expanded e
    JOIN teachers te ON te.id=e.teacher_id AND te.school_id=$1
    ORDER BY te.name, e.subject, e.class_name
  `, [schoolId, academicYearId, sem]);

  if (timetable.length === 0) return [];

  // Per-(teacher, subject, class, mode) assessment + score counts
  const { rows: modeCounts } = await pool.query(
    `SELECT a.teacher_id, LOWER(a.subject) AS subject_key, LOWER(a.class_name) AS class_key,
            a.mode_id,
            COUNT(DISTINCT a.id)::int AS assessments_created,
            COUNT(DISTINCT CASE WHEN asc2.score IS NOT NULL OR asc2.absent = true THEN asc2.student_id END)::int AS students_scored
     FROM assessments a
     LEFT JOIN assessment_scores asc2 ON asc2.assessment_id = a.id
     WHERE a.school_id=$1 AND a.academic_year_id=$2 AND a.semester=$3
     GROUP BY a.teacher_id, LOWER(a.subject), LOWER(a.class_name), a.mode_id`,
    [schoolId, academicYearId, sem]
  );
  const modeMap = {};
  for (const mc of modeCounts) {
    modeMap[`${mc.teacher_id}|${mc.subject_key}|${mc.class_key}|${mc.mode_id}`] = mc;
  }

  // Per-(teacher, subject, class) exam score counts
  const { rows: examCounts } = await pool.query(
    `SELECT teacher_id, LOWER(subject) AS subject_key, LOWER(class_name) AS class_key,
            COUNT(DISTINCT student_id)::int AS students_scored
     FROM exam_scores
     WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3
     GROUP BY teacher_id, LOWER(subject), LOWER(class_name)`,
    [schoolId, academicYearId, sem]
  );
  const examMap = {};
  for (const ec of examCounts) examMap[`${ec.teacher_id}|${ec.subject_key}|${ec.class_key}`] = ec.students_scored;

  return timetable.map(r => {
    const total    = r.total_students || 0;
    const subjKey  = r.subject.toLowerCase();
    const clsKey   = r.class_name.toLowerCase();
    const baseKey  = `${r.teacher_id}|${subjKey}|${clsKey}`;

    // Outstanding CA modes
    const incompleteNames = modes
      .filter(m => {
        const mc = modeMap[`${baseKey}|${m.id}`];
        const created = mc?.assessments_created ?? 0;
        const scored  = mc?.students_scored ?? 0;
        return !(created >= 1 && total > 0 && scored >= total);
      })
      .map(m => {
        const mc      = modeMap[`${baseKey}|${m.id}`];
        const created = mc?.assessments_created ?? 0;
        const scored  = mc?.students_scored ?? 0;
        if (created === 0) return `${m.name} (not started)`;
        return `${m.name} (${scored}/${total} students)`;
      });

    const outstandingModes = incompleteNames.length === 0 ? 'All CA modes complete' : incompleteNames.join(', ');
    const completeModes    = modes.length - incompleteNames.length;

    const examScored   = examMap[baseKey] ?? 0;
    const examComplete = total > 0 && examScored >= total;
    const examStatus   = examComplete
      ? 'Complete'
      : examScored > 0
        ? `${examScored} / ${total} entered`
        : 'Not started';

    const denom  = modes.length + 1;
    const numer  = completeModes + (examComplete ? 1 : 0);
    const pct    = denom === 0 ? 0 : Math.round((numer / denom) * 100);

    return {
      teacher_name:      r.teacher_name,
      department:        r.department ?? '—',
      subject:           r.subject,
      class_name:        r.class_name,
      total_students:    total,
      outstanding_modes: outstandingModes,
      exam_status:       examStatus,
      completion_pct:    pct + '%',
      _pct:              pct,
    };
  }).sort((a, b) => a._pct - b._pct || a.teacher_name.localeCompare(b.teacher_name));
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get('/students', async (req, res, next) => {
  try {
    const { type = 'program_distribution', status = 'active' } = req.query;
    const report = STUDENT_REPORTS[type];
    if (!report) return res.status(400).json({ error: `Unknown report type: ${type}` });
    const rows   = await runReport(report, req.schoolId, status, true);
    const totals = buildTotals(report.keys, rows, report.hasPercentage);
    res.json({ label: report.label, columns: report.columns, keys: report.keys, rows, totals });
  } catch (err) { next(err); }
});

router.get('/teachers', async (req, res, next) => {
  try {
    const { type = 'gender_summary', status = 'active' } = req.query;
    const report = TEACHER_REPORTS[type];
    if (!report) return res.status(400).json({ error: `Unknown report type: ${type}` });
    const rows   = await runReport(report, req.schoolId, status, false);
    const totals = buildTotals(report.keys, rows, report.hasPercentage);
    res.json({ label: report.label, columns: report.columns, keys: report.keys, rows, totals });
  } catch (err) { next(err); }
});

router.get('/students/excel', async (req, res, next) => {
  try {
    const { type = 'program_distribution', status = 'active' } = req.query;
    const report = STUDENT_REPORTS[type];
    if (!report) return res.status(400).json({ error: `Unknown report type: ${type}` });
    const rows = await runReport(report, req.schoolId, status, true);
    const wb   = await buildExcel(report, rows);
    const fname = report.label.replace(/[^a-z0-9]/gi, '_') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

router.get('/teachers/excel', async (req, res, next) => {
  try {
    const { type = 'gender_summary', status = 'active' } = req.query;
    const report = TEACHER_REPORTS[type];
    if (!report) return res.status(400).json({ error: `Unknown report type: ${type}` });
    const rows = await runReport(report, req.schoolId, status, false);
    const wb   = await buildExcel(report, rows);
    const fname = report.label.replace(/[^a-z0-9]/gi, '_') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

router.get('/academic', async (req, res, next) => {
  try {
    const { type, academic_year_id, semester, class_name, status = 'active' } = req.query;
    if (!type || !academic_year_id || !semester) {
      return res.status(400).json({ error: 'type, academic_year_id, and semester are required' });
    }

    const sc = status === 'all' ? '' : `AND s.status = 'Active'`;
    const sem = parseInt(semester);

    if (type === 'grade_distribution') {
      if (!class_name) return res.status(400).json({ error: 'class_name is required for grade_distribution' });
      // Get exam scores joined with grade_boundaries
      const { rows } = await pool.query(`
        SELECT es.subject,
               COALESCE(gb.grade,
                 CASE
                   WHEN (es.score/es.max_score*100) >= 75 THEN 'A1'
                   WHEN (es.score/es.max_score*100) >= 70 THEN 'B2'
                   WHEN (es.score/es.max_score*100) >= 65 THEN 'B3'
                   WHEN (es.score/es.max_score*100) >= 60 THEN 'C4'
                   WHEN (es.score/es.max_score*100) >= 55 THEN 'C5'
                   WHEN (es.score/es.max_score*100) >= 50 THEN 'C6'
                   WHEN (es.score/es.max_score*100) >= 45 THEN 'D7'
                   WHEN (es.score/es.max_score*100) >= 40 THEN 'E8'
                   ELSE 'F9'
                 END
               ) AS grade,
               COUNT(*) AS count
        FROM exam_scores es
        JOIN students st ON st.id = es.student_id
        LEFT JOIN programs p ON p.id = st.program_id
        LEFT JOIN grade_boundaries gb ON gb.school_id = es.school_id
          AND gb.exam_body = COALESCE(p.exam_body, 'WAEC')
          AND (es.score/es.max_score*100) BETWEEN gb.min_pct AND gb.max_pct
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 AND es.class_name=$4
          ${status === 'all' ? '' : "AND st.status = 'Active'"}
        GROUP BY es.subject, grade
        ORDER BY es.subject, grade
      `, [req.schoolId, academic_year_id, sem, class_name]);

      // Pivot: subject → { A1: n, B2: n, ... }
      const gradeOrder = ['A1','B2','B3','C4','C5','C6','D7','E8','F9','A','B+','B-','C+','C-','D','E','F'];
      const subjectMap = {};
      for (const row of rows) {
        if (!subjectMap[row.subject]) subjectMap[row.subject] = { subject: row.subject };
        subjectMap[row.subject][row.grade] = parseInt(row.count);
      }
      const grades = [...new Set(rows.map(r => r.grade))].sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b));
      const resultRows = Object.values(subjectMap);
      const columns = ['Subject', ...grades];
      const keys = ['subject', ...grades];
      const totals = { subject: 'TOTAL' };
      for (const g of grades) totals[g] = resultRows.reduce((s, r) => s + (r[g] || 0), 0);
      return res.json({ label: `Grade Distribution — ${class_name}`, columns, keys, rows: resultRows, totals });
    }

    if (type === 'class_performance') {
      // Average exam score and pass rate per class for this year/semester
      const { rows } = await pool.query(`
        SELECT es.class_name,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               COUNT(*) AS total_students,
               COUNT(*) FILTER (WHERE es.score / es.max_score * 100 >= 40) AS passing,
               ROUND(COUNT(*) FILTER (WHERE es.score / es.max_score * 100 >= 40)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pass_rate
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${sc}
        GROUP BY es.class_name
        ORDER BY avg_pct DESC NULLS LAST
      `, [req.schoolId, academic_year_id, sem]);

      const resultRows = rows.map(r => ({
        group: r.class_name,
        avg_pct: r.avg_pct ? parseFloat(r.avg_pct) + '%' : '—',
        total_students: parseInt(r.total_students),
        passing: parseInt(r.passing),
        pass_rate: r.pass_rate ? parseFloat(r.pass_rate) + '%' : '—',
      }));
      const totals = {
        group: 'TOTAL',
        avg_pct: '—',
        total_students: resultRows.reduce((s, r) => s + r.total_students, 0),
        passing: resultRows.reduce((s, r) => s + r.passing, 0),
        pass_rate: '—',
      };
      return res.json({
        label: 'Class Performance Summary',
        columns: ['Class', 'Avg Score', 'Students Scored', 'Passing', 'Pass Rate'],
        keys: ['group', 'avg_pct', 'total_students', 'passing', 'pass_rate'],
        rows: resultRows, totals,
      });
    }

    if (type === 'subject_pass_rate') {
      const { rows } = await pool.query(`
        SELECT es.subject,
               COUNT(DISTINCT es.student_id) AS total_students,
               COUNT(DISTINCT es.student_id) FILTER (WHERE es.score / es.max_score * 100 >= 40) AS passing,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               ROUND(COUNT(DISTINCT es.student_id) FILTER (WHERE es.score / es.max_score * 100 >= 40)::numeric
                 / NULLIF(COUNT(DISTINCT es.student_id), 0) * 100, 1) AS pass_rate
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${sc}
        GROUP BY es.subject
        ORDER BY pass_rate ASC NULLS LAST
      `, [req.schoolId, academic_year_id, sem]);

      const resultRows = rows.map(r => ({
        group: r.subject,
        avg_pct: r.avg_pct ? parseFloat(r.avg_pct) + '%' : '—',
        total_students: parseInt(r.total_students),
        passing: parseInt(r.passing),
        pass_rate: r.pass_rate ? parseFloat(r.pass_rate) + '%' : '—',
      }));
      const totals = { group: 'TOTAL', avg_pct: '—', total_students: resultRows.reduce((s,r)=>s+r.total_students,0), passing: resultRows.reduce((s,r)=>s+r.passing,0), pass_rate: '—' };
      return res.json({
        label: 'Subject Pass Rate',
        columns: ['Subject', 'Avg Score', 'Students Scored', 'Passing', 'Pass Rate'],
        keys: ['group', 'avg_pct', 'total_students', 'passing', 'pass_rate'],
        rows: resultRows, totals,
      });
    }

    if (type === 'teacher_completion') {
      const tcRows = await buildTeacherCompletionRows(req.schoolId, academic_year_id, sem);
      const totals = {
        teacher_name: `${tcRows.length} assignment${tcRows.length !== 1 ? 's' : ''}`,
        department: '', subject: '', class_name: '', total_students: '',
        outstanding_modes: '', exam_status: '',
        completion_pct: tcRows.length
          ? Math.round(tcRows.reduce((s, r) => s + r._pct, 0) / tcRows.length) + '%'
          : '—',
      };
      return res.json({
        label: 'Assessment Score Entry Report',
        columns: ['Teacher', 'Department', 'Subject', 'Class', 'Students', 'Outstanding CA Modes', 'Exam Status', 'Completion'],
        keys: ['teacher_name', 'department', 'subject', 'class_name', 'total_students', 'outstanding_modes', 'exam_status', 'completion_pct'],
        rows: tcRows, totals,
      });
    }

    if (type === 'at_risk_students') {
      let classFilter = '';
      const params = [req.schoolId, academic_year_id, sem];
      if (class_name) { params.push(class_name); classFilter = `AND es.class_name = $${params.length}`; }

      const { rows } = await pool.query(`
        SELECT s.name, s.student_code, es.class_name,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               COUNT(DISTINCT es.subject) AS subjects_scored
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${classFilter}
          AND s.status = 'Active'
        GROUP BY s.id, s.name, s.student_code, es.class_name
        HAVING ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) < 40
        ORDER BY avg_pct ASC
      `, params);

      const resultRows = rows.map(r => ({
        group: r.name,
        student_code: r.student_code,
        class_name: r.class_name,
        avg_pct: parseFloat(r.avg_pct) + '%',
        subjects_scored: parseInt(r.subjects_scored),
      }));
      const totals = { group: `${resultRows.length} student(s) at risk`, student_code: '', class_name: '', avg_pct: '', subjects_scored: '' };
      return res.json({
        label: 'At-Risk Students (Average < 40%)',
        columns: ['Student', 'Code', 'Class', 'Average', 'Subjects Scored'],
        keys: ['group', 'student_code', 'class_name', 'avg_pct', 'subjects_scored'],
        rows: resultRows, totals,
      });
    }

    return res.status(400).json({ error: `Unknown report type: ${type}` });
  } catch (err) { next(err); }
});

router.get('/academic/excel', async (req, res, next) => {
  try {
    const { type, academic_year_id, semester, class_name, status = 'active' } = req.query;
    if (!type || !academic_year_id || !semester) {
      return res.status(400).json({ error: 'type, academic_year_id, and semester are required' });
    }

    if (!ACADEMIC_REPORTS[type]) return res.status(400).json({ error: `Unknown report type: ${type}` });

    const sc  = status === 'all' ? '' : `AND s.status = 'Active'`;
    const sem = parseInt(semester);
    let label, columns, keys, resultRows;

    if (type === 'grade_distribution') {
      if (!class_name) return res.status(400).json({ error: 'class_name is required for grade_distribution' });
      const { rows } = await pool.query(`
        SELECT es.subject,
               COALESCE(gb.grade,
                 CASE
                   WHEN (es.score/es.max_score*100) >= 75 THEN 'A1'
                   WHEN (es.score/es.max_score*100) >= 70 THEN 'B2'
                   WHEN (es.score/es.max_score*100) >= 65 THEN 'B3'
                   WHEN (es.score/es.max_score*100) >= 60 THEN 'C4'
                   WHEN (es.score/es.max_score*100) >= 55 THEN 'C5'
                   WHEN (es.score/es.max_score*100) >= 50 THEN 'C6'
                   WHEN (es.score/es.max_score*100) >= 45 THEN 'D7'
                   WHEN (es.score/es.max_score*100) >= 40 THEN 'E8'
                   ELSE 'F9'
                 END
               ) AS grade,
               COUNT(*) AS count
        FROM exam_scores es
        JOIN students st ON st.id = es.student_id
        LEFT JOIN programs p ON p.id = st.program_id
        LEFT JOIN grade_boundaries gb ON gb.school_id = es.school_id
          AND gb.exam_body = COALESCE(p.exam_body, 'WAEC')
          AND (es.score/es.max_score*100) BETWEEN gb.min_pct AND gb.max_pct
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 AND es.class_name=$4
          ${status === 'all' ? '' : "AND st.status = 'Active'"}
        GROUP BY es.subject, grade
        ORDER BY es.subject, grade
      `, [req.schoolId, academic_year_id, sem, class_name]);
      const gradeOrder = ['A1','B2','B3','C4','C5','C6','D7','E8','F9','A','B+','B-','C+','C-','D','E','F'];
      const subjectMap = {};
      for (const row of rows) {
        if (!subjectMap[row.subject]) subjectMap[row.subject] = { subject: row.subject };
        subjectMap[row.subject][row.grade] = parseInt(row.count);
      }
      const grades = [...new Set(rows.map(r => r.grade))].sort((a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b));
      resultRows = Object.values(subjectMap);
      label   = `Grade Distribution — ${class_name}`;
      columns = ['Subject', ...grades];
      keys    = ['subject', ...grades];
    } else if (type === 'class_performance') {
      const { rows } = await pool.query(`
        SELECT es.class_name,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               COUNT(*) AS total_students,
               COUNT(*) FILTER (WHERE es.score / es.max_score * 100 >= 40) AS passing,
               ROUND(COUNT(*) FILTER (WHERE es.score / es.max_score * 100 >= 40)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pass_rate
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${sc}
        GROUP BY es.class_name
        ORDER BY avg_pct DESC NULLS LAST
      `, [req.schoolId, academic_year_id, sem]);
      resultRows = rows.map(r => ({
        group: r.class_name,
        avg_pct: r.avg_pct ? parseFloat(r.avg_pct) + '%' : '—',
        total_students: parseInt(r.total_students),
        passing: parseInt(r.passing),
        pass_rate: r.pass_rate ? parseFloat(r.pass_rate) + '%' : '—',
      }));
      label   = 'Class Performance Summary';
      columns = ['Class', 'Avg Score', 'Students Scored', 'Passing', 'Pass Rate'];
      keys    = ['group', 'avg_pct', 'total_students', 'passing', 'pass_rate'];
    } else if (type === 'subject_pass_rate') {
      const { rows } = await pool.query(`
        SELECT es.subject,
               COUNT(DISTINCT es.student_id) AS total_students,
               COUNT(DISTINCT es.student_id) FILTER (WHERE es.score / es.max_score * 100 >= 40) AS passing,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               ROUND(COUNT(DISTINCT es.student_id) FILTER (WHERE es.score / es.max_score * 100 >= 40)::numeric
                 / NULLIF(COUNT(DISTINCT es.student_id), 0) * 100, 1) AS pass_rate
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${sc}
        GROUP BY es.subject
        ORDER BY pass_rate ASC NULLS LAST
      `, [req.schoolId, academic_year_id, sem]);
      resultRows = rows.map(r => ({
        group: r.subject,
        avg_pct: r.avg_pct ? parseFloat(r.avg_pct) + '%' : '—',
        total_students: parseInt(r.total_students),
        passing: parseInt(r.passing),
        pass_rate: r.pass_rate ? parseFloat(r.pass_rate) + '%' : '—',
      }));
      label   = 'Subject Pass Rate';
      columns = ['Subject', 'Avg Score', 'Students Scored', 'Passing', 'Pass Rate'];
      keys    = ['group', 'avg_pct', 'total_students', 'passing', 'pass_rate'];
    } else if (type === 'teacher_completion') {
      resultRows = await buildTeacherCompletionRows(req.schoolId, academic_year_id, sem);
      label   = 'Assessment Score Entry Report';
      columns = ['Teacher', 'Department', 'Subject', 'Class', 'Students', 'Outstanding CA Modes', 'Exam Status', 'Completion'];
      keys    = ['teacher_name', 'department', 'subject', 'class_name', 'total_students', 'outstanding_modes', 'exam_status', 'completion_pct'];
    } else if (type === 'at_risk_students') {
      let classFilter = '';
      const params = [req.schoolId, academic_year_id, sem];
      if (class_name) { params.push(class_name); classFilter = `AND es.class_name = $${params.length}`; }
      const { rows } = await pool.query(`
        SELECT s.name, s.student_code, es.class_name,
               ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) AS avg_pct,
               COUNT(DISTINCT es.subject) AS subjects_scored
        FROM exam_scores es
        JOIN students s ON s.id = es.student_id
        WHERE es.school_id=$1 AND es.academic_year_id=$2 AND es.semester=$3 ${classFilter}
          AND s.status = 'Active'
        GROUP BY s.id, s.name, s.student_code, es.class_name
        HAVING ROUND(AVG(es.score / es.max_score * 100)::numeric, 1) < 40
        ORDER BY avg_pct ASC
      `, params);
      resultRows = rows.map(r => ({
        group: r.name,
        student_code: r.student_code,
        class_name: r.class_name,
        avg_pct: parseFloat(r.avg_pct) + '%',
        subjects_scored: parseInt(r.subjects_scored),
      }));
      label   = 'At-Risk Students (Average < 40%)';
      columns = ['Student', 'Code', 'Class', 'Average', 'Subjects Scored'];
      keys    = ['group', 'student_code', 'class_name', 'avg_pct', 'subjects_scored'];
    } else {
      return res.status(400).json({ error: `Unknown report type: ${type}` });
    }

    const report = { label, columns, keys };
    const wb     = await buildExcel(report, resultRows);
    const fname  = label.replace(/[^a-z0-9]/gi, '_') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

module.exports = router;
