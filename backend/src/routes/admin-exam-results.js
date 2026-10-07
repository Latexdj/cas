'use strict';
const router   = require('express').Router();
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const pool     = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { parseWaecListing } = require('../utils/waecParser');
const { computeReport } = require('../utils/examResultsReport');
const { WAEC_CORE_SUBJECTS } = require('../utils/waecSubjects');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate, requireActiveSubscription, adminOnly);

async function getGradeBoundaries(schoolId, examBody) {
  const { rows } = await pool.query(
    `SELECT grade, remark, sort_order FROM grade_boundaries WHERE school_id = $1 AND exam_body = $2`,
    [schoolId, examBody]
  );
  return rows;
}

// Shared by the JSON report endpoint and both exports — computes the full
// Analysis Report live from stored candidates/grades + this school's
// grade_boundaries. Throws a {status, message} shaped error on failure so
// each caller can respond in its own format (JSON vs a file download).
async function buildReportForBatch(schoolId, batchId) {
  const { rows: batchRows } = await pool.query(
    `SELECT id, exam_body, year, school_number, registered_data FROM exam_result_batches WHERE id = $1 AND school_id = $2`,
    [batchId, schoolId]
  );
  if (!batchRows.length) { const e = new Error('Batch not found'); e.status = 404; throw e; }
  const batch = batchRows[0];

  const [{ rows: candidateRows }, gradeBoundaries] = await Promise.all([
    pool.query(
      `SELECT c.id, c.index_number, c.name, c.gender, c.dob,
              COALESCE(json_agg(json_build_object('subjectName', g.subject_name, 'grade', g.grade)) FILTER (WHERE g.id IS NOT NULL), '[]') AS grades
       FROM exam_result_candidates c
       LEFT JOIN exam_result_grades g ON g.candidate_id = c.id
       WHERE c.batch_id = $1
       GROUP BY c.id
       ORDER BY c.index_number`,
      [batch.id]
    ),
    getGradeBoundaries(schoolId, batch.exam_body),
  ]);

  if (!gradeBoundaries.length) {
    const e = new Error(`No ${batch.exam_body} grade boundaries are configured for this school. Set them up under Grade Boundaries first.`);
    e.status = 400;
    throw e;
  }

  const report = computeReport({
    candidates: candidateRows,
    gradeBoundaries,
    registeredData: batch.registered_data,
    coreSubjects: WAEC_CORE_SUBJECTS,
  });

  return { year: batch.year, examBody: batch.exam_body, schoolNumber: batch.school_number, ...report };
}

// POST /parse — accepts either a PDF upload (multipart, field "pdf") or
// pasted text ({ raw_text } JSON body); runs the shared parser either way.
// Nothing is persisted here — this is the preview step.
router.post('/parse', upload.single('pdf'), async (req, res, next) => {
  try {
    let rawText;
    let source;
    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Uploaded file must be a PDF.' });
      // pdf-parse/PDF.js fails with Node's Buffer type on Node >=24 — Uint8Array works on all versions.
      const parsed = await pdfParse(new Uint8Array(req.file.buffer));
      rawText = parsed.text;
      source = 'upload';
    } else if (req.body.raw_text && req.body.raw_text.trim()) {
      rawText = req.body.raw_text;
      source = 'paste';
    } else {
      return res.status(400).json({ error: 'Upload a PDF or paste the listing text.' });
    }

    const parsed = parseWaecListing(rawText);
    res.json({ ...parsed, source, rawText });
  } catch (err) { next(err); }
});

// POST /batches — re-parses raw_text server-side (never trusts
// client-edited candidate JSON, only year/registered_data/source
// metadata) and replaces any existing batch for this school/exam_body/year.
router.post('/batches', async (req, res, next) => {
  try {
    const { exam_body, year, source, raw_text, school_number, registered_data } = req.body;
    if (!['WAEC', 'CTVET'].includes(exam_body)) return res.status(400).json({ error: 'exam_body must be WAEC or CTVET.' });
    if (!year || !Number.isInteger(year)) return res.status(400).json({ error: 'A valid year is required.' });
    if (!['upload', 'paste'].includes(source)) return res.status(400).json({ error: 'source must be upload or paste.' });
    if (!raw_text || !raw_text.trim()) return res.status(400).json({ error: 'raw_text is required.' });

    const parsed = parseWaecListing(raw_text);
    if (!parsed.candidates.length) return res.status(400).json({ error: 'No candidates could be parsed from this text.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        `SELECT id FROM exam_result_batches WHERE school_id = $1 AND exam_body = $2 AND year = $3`,
        [req.schoolId, exam_body, year]
      );
      let batchId;
      if (existing.length) {
        batchId = existing[0].id;
        await client.query(`DELETE FROM exam_result_candidates WHERE batch_id = $1`, [batchId]);
        await client.query(
          `UPDATE exam_result_batches SET school_number = $1, source = $2, raw_text = $3, registered_data = $4, updated_at = now() WHERE id = $5`,
          [school_number || parsed.schoolNumber || null, source, raw_text, registered_data || null, batchId]
        );
      } else {
        const { rows } = await client.query(
          `INSERT INTO exam_result_batches (school_id, exam_body, year, school_number, source, raw_text, registered_data, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [req.schoolId, exam_body, year, school_number || parsed.schoolNumber || null, source, raw_text, registered_data || null, req.user.id]
        );
        batchId = rows[0].id;
      }

      for (const c of parsed.candidates) {
        const { rows: candRows } = await client.query(
          `INSERT INTO exam_result_candidates (batch_id, index_number, name, gender, dob)
           VALUES ($1,$2,$3,$4,TO_DATE($5,'DD/MM/YYYY')) RETURNING id`,
          [batchId, c.indexNumber, c.name, c.gender, c.dob]
        );
        const candidateId = candRows[0].id;
        for (const g of c.grades) {
          await client.query(
            `INSERT INTO exam_result_grades (candidate_id, subject_raw, subject_name, grade) VALUES ($1,$2,$3,$4)`,
            [candidateId, g.subjectRaw, g.subjectName, g.grade]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ id: batchId, candidateCount: parsed.candidates.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A batch for this year already exists.' });
    next(err);
  }
});

// GET /batches?exam_body=WAEC
router.get('/batches', async (req, res, next) => {
  try {
    const examBody = req.query.exam_body === 'CTVET' ? 'CTVET' : 'WAEC';
    const { rows } = await pool.query(
      `SELECT b.id, b.exam_body, b.year, b.school_number, b.source, b.created_at, b.updated_at,
              count(c.id)::int AS candidate_count
       FROM exam_result_batches b
       LEFT JOIN exam_result_candidates c ON c.batch_id = b.id
       WHERE b.school_id = $1 AND b.exam_body = $2
       GROUP BY b.id
       ORDER BY b.year DESC`,
      [req.schoolId, examBody]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/batches/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, exam_body, year, school_number, source, registered_data, created_at, updated_at
       FROM exam_result_batches WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /batches/:id/report — computes the full Analysis Report live from
// stored candidates/grades + this school's WAEC grade_boundaries. Never
// cached/pre-stored, so it always reflects the current boundaries.
router.get('/batches/:id/report', async (req, res, next) => {
  try {
    const report = await buildReportForBatch(req.schoolId, req.params.id);
    res.json(report);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /batches/:id/export.xlsx — matches the GES Analysis Report layout:
// one row per subject, B/G/T columns for Registered/Presented/Absent/each
// grade/% Pass, with the Summary of Subjects Passed block below.
router.get('/batches/:id/export.xlsx', async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const report = await buildReportForBatch(req.schoolId, req.params.id);
    const gradeOrder = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Analysis Report');

    ws.mergeCells('A1:C1');
    ws.getCell('A1').value = `${report.examBody} ${report.year} School Result Analysis`;
    ws.getCell('A1').font = { bold: true, size: 13 };

    const headerRow1 = ['Subject', 'Registered', '', '', 'Presented', '', '', 'Absent', '', '',
      ...gradeOrder.flatMap(g => [g, '', '']), '% Pass', '', ''];
    const headerRow2 = ['', 'B', 'G', 'T', 'B', 'G', 'T', 'B', 'G', 'T',
      ...gradeOrder.flatMap(() => ['B', 'G', 'T']), 'B', 'G', 'T'];
    const r1 = ws.addRow(headerRow1);
    const r2 = ws.addRow(headerRow2);
    [r1, r2].forEach(r => { r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }; });
    // r1.number, not a hardcoded 1 — row 1 is the title row (already
    // merged A1:C1 above), and addRow() placed this header content on
    // whatever row actually came after it. Merging against a hardcoded 1
    // collided with the title's own merge ("Cannot merge already merged
    // cells") instead of merging the header row's own cells.
    let col = 2;
    for (const span of [3, 3, 3, ...gradeOrder.map(() => 3), 3]) {
      ws.mergeCells(r1.number, col, r1.number, col + span - 1);
      col += span;
    }

    const addSection = (title, subjects) => {
      if (!subjects.length) return;
      const titleRow = ws.addRow([title]);
      titleRow.font = { bold: true, italic: true };
      for (const s of subjects) {
        ws.addRow([
          s.name,
          s.registered.boys, s.registered.girls, s.registered.total,
          s.presented.boys, s.presented.girls, s.presented.total,
          s.absent.boys, s.absent.girls, s.absent.total,
          ...gradeOrder.flatMap(g => {
            const d = s.gradeDistribution[g];
            return [d?.boys || 0, d?.girls || 0, d ? d.boys + d.girls : 0];
          }),
          s.percentagePass.boys, s.percentagePass.girls, s.percentagePass.total,
        ]);
      }
    };
    addSection('Core', report.subjects.filter(s => s.isCore));
    addSection('Electives', report.subjects.filter(s => !s.isCore));

    ws.addRow([]);
    const summaryTitle = ws.addRow(['Summary of Subjects Passed']);
    summaryTitle.font = { bold: true };
    ws.addRow(['Total Number of Candidates', report.totalCandidates]);
    const maxBucket = Math.max(0, ...Object.keys(report.summaryOfPasses.buckets).map(Number));
    for (let n = maxBucket; n >= 1; n--) ws.addRow([`${n} Pass${n === 1 ? '' : 'es'}`, report.summaryOfPasses.buckets[n] || 0]);
    ws.addRow(['Failures', report.summaryOfPasses.failures]);
    ws.addRow(['Entire Results Cancelled', report.summaryOfPasses.entireResultsCancelled]);

    ws.columns.forEach(c => { c.width = 12; });
    ws.getColumn(1).width = 26;

    const filename = `${report.examBody}_${report.year}_Analysis_Report.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /batches/:id/export.pdf — same report, rendered via the existing
// puppeteer-core + @sparticuz/chromium HTML-to-PDF pipeline already used
// for discipline/admission letters (pdf.service.js), returning a buffer
// directly rather than persisting to storage (see that function's comment).
router.get('/batches/:id/export.pdf', async (req, res, next) => {
  try {
    const { generateExamAnalysisReportPDFBuffer } = require('../services/pdf.service');
    const report = await buildReportForBatch(req.schoolId, req.params.id);
    const { rows: schoolRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
    const school = schoolRows[0] || { name: 'School' };

    const pdfBuffer = await generateExamAnalysisReportPDFBuffer(report, school);
    const filename = `${report.examBody}_${report.year}_Analysis_Report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/batches/:id/registered-data', async (req, res, next) => {
  try {
    const { registered_data } = req.body;
    const { rows } = await pool.query(
      `UPDATE exam_result_batches SET registered_data = $1, updated_at = now() WHERE id = $2 AND school_id = $3 RETURNING id`,
      [registered_data || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/batches/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM exam_result_batches WHERE id = $1 AND school_id = $2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Batch not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
