'use strict';

const router = require('express').Router();
const pool = require('../config/db');
const { parseWaecListing } = require('../utils/waecParser');
const { computeReport } = require('../utils/examResultsReport');

const PUBLIC_GRADE_BOUNDARIES = [
  { grade: 'A1', remark: 'Excellent', sort_order: 1 },
  { grade: 'B2', remark: 'Very Good', sort_order: 2 },
  { grade: 'B3', remark: 'Good', sort_order: 3 },
  { grade: 'C4', remark: 'Credit', sort_order: 4 },
  { grade: 'C5', remark: 'Credit', sort_order: 5 },
  { grade: 'C6', remark: 'Credit', sort_order: 6 },
  { grade: 'D7', remark: 'Pass', sort_order: 7 },
  { grade: 'E8', remark: 'Pass', sort_order: 8 },
  { grade: 'F9', remark: 'Fail', sort_order: 9 },
];

const CORE_SUBJECTS = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies'];

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPublicReport(rawText) {
  const parsed = parseWaecListing(rawText);
  const report = computeReport({
    candidates: parsed.candidates,
    gradeBoundaries: PUBLIC_GRADE_BOUNDARIES,
    registeredData: null,
    coreSubjects: CORE_SUBJECTS,
    officialSummary: parsed.officialSummary,
  });

  return {
    ...report,
    schoolName: parsed.schoolName,
    schoolNumber: parsed.schoolNumber,
    year: parsed.year,
    declaredTotal: parsed.declaredTotal,
    warnings: parsed.warnings || [],
  };
}

router.post('/checkout', async (req, res, next) => {
  try {
    const rawText = typeof req.body?.raw_text === 'string' ? req.body.raw_text.trim() : '';
    if (!rawText) {
      return res.status(400).json({ error: 'raw_text is required.' });
    }

    const amount = toSafeNumber(req.body?.amount);
    const paymentReference = req.body?.payment_reference || null;
    const report = buildPublicReport(rawText);

    const { rows } = await pool.query(
      `INSERT INTO public_waec_results (payment_reference, amount, paid, raw_text, report, created_at)
       VALUES ($1, $2, true, $3, $4::jsonb, now())
       RETURNING id, payment_reference, amount, paid, created_at`,
      [paymentReference, amount, rawText, JSON.stringify(report)]
    );

    const record = rows[0] || { id: `analysis-${Date.now()}` };
    return res.json({
      id: record.id,
      payment_reference: paymentReference || record.payment_reference || null,
      amount: Number(record.amount ?? amount ?? 0),
      paid: true,
      report,
      created_at: record.created_at || new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/report', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, payment_reference, amount, paid, report, created_at
       FROM public_waec_results
       WHERE id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    }

    const record = rows[0];
    if (!record.paid) {
      return res.status(404).json({ error: 'This analysis has not been paid for.' });
    }

    let report = record.report;
    if (typeof report === 'string') {
      try {
        report = JSON.parse(report);
      } catch (e) {
        report = {};
      }
    }

    return res.json({
      id: record.id,
      payment_reference: record.payment_reference,
      amount: Number(record.amount || 0),
      paid: Boolean(record.paid),
      created_at: record.created_at,
      report,
    });
  } catch (err) {
    if (err && err.code === '22P02') {
      return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    }
    return next(err);
  }
});

module.exports = router;
