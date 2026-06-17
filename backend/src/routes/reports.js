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

module.exports = router;
