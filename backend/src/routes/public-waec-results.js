'use strict';

const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const router = require('express').Router();
const pool = require('../config/db');
const { parseWaecListing } = require('../utils/waecParser');
const { computeReport } = require('../utils/examResultsReport');
const { publicWaecInitLimiter, publicWaecGenerateLimiter, publicWaecDownloadLimiter } = require('../middleware/rateLimiter');
// publicWaecExport.service.js is required lazily, inside the two download
// route handlers below, not here — it pulls in pdf.service.js, which pulls
// in @sparticuz/chromium (ESM-only; Jest's CJS transform can't parse it at
// require-time). Every other route in this codebase that touches
// pdf.service.js requires it the same lazy way for the same reason; an
// eager top-level require here would crash this whole file — and every
// test that imports it — before a single test runs.

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const REPORT_PRICE_PESEWAS = 3000; // GHS 30, fixed server-side — never trust a client-supplied amount
const PASTE_PAGE_URL = process.env.PUBLIC_WAEC_PASTE_URL || 'http://localhost:3001/public-waec-results/paste';

// Temporary testing toggle, set PUBLIC_WAEC_SKIP_PAYMENT=true to let schools
// try the full analyse/download flow with no Paystack involved at all before
// payment is turned on for real. Flip it off (or unset it) to go live —
// nothing else in this file changes.
const SKIP_PAYMENT = process.env.PUBLIC_WAEC_SKIP_PAYMENT === 'true';

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
    // Never set anywhere else in this flow (the admin-side equivalent
    // pulls it from a saved batch row, which doesn't exist here) — both
    // the web report header and the PDF/Excel templates reused from
    // publicWaecExport.service.js reference report.examBody, so it needs
    // a real value, not undefined.
    examBody: 'WASSCE',
    schoolName: parsed.schoolName,
    schoolNumber: parsed.schoolNumber,
    year: parsed.year,
    declaredTotal: parsed.declaredTotal,
    warnings: parsed.warnings || [],
  };
}

router.get('/config', (req, res) => {
  res.json({ payment_required: !SKIP_PAYMENT, amount_pesewas: REPORT_PRICE_PESEWAS });
});

router.post('/initialize', publicWaecInitLimiter, async (req, res, next) => {
  try {
    const contactName = typeof req.body?.contact_name === 'string' ? req.body.contact_name.trim() : '';
    const contactEmail = typeof req.body?.contact_email === 'string' ? req.body.contact_email.trim() : '';
    const contactPhone = typeof req.body?.contact_phone === 'string' ? req.body.contact_phone.trim() : null;
    const schoolNameHint = typeof req.body?.school_name_hint === 'string' ? req.body.school_name_hint.trim() : null;

    if (!contactName) return res.status(400).json({ error: 'Your name is required.' });
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }

    const reference = `pub-waec-${SKIP_PAYMENT ? 'test-' : ''}${crypto.randomUUID()}`;

    if (SKIP_PAYMENT) {
      const { rows } = await pool.query(
        `INSERT INTO public_waec_results
           (contact_name, contact_email, contact_phone, school_name_hint, amount_pesewas, paystack_reference, status, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'paid', now())
         RETURNING id`,
        [contactName, contactEmail, contactPhone, schoolNameHint, REPORT_PRICE_PESEWAS, reference]
      );
      return res.json({ id: rows[0].id, authorization_url: null });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Payments are not configured. Please try again later.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO public_waec_results
         (contact_name, contact_email, contact_phone, school_name_hint, amount_pesewas, paystack_reference)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [contactName, contactEmail, contactPhone, schoolNameHint, REPORT_PRICE_PESEWAS, reference]
    );
    const id = rows[0].id;

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: contactEmail,
        amount: REPORT_PRICE_PESEWAS,
        currency: 'GHS',
        reference,
        callback_url: `${PASTE_PAGE_URL}?id=${id}`,
      }),
    });
    const paystackData = await paystackRes.json().catch(() => ({}));

    if (!paystackRes.ok || !paystackData?.status) {
      await pool.query(`UPDATE public_waec_results SET status = 'failed' WHERE id = $1`, [id]);
      return res.status(502).json({ error: 'Could not start the payment. Please try again.' });
    }

    return res.json({ id, authorization_url: paystackData.data.authorization_url });
  } catch (err) {
    return next(err);
  }
});

// Mounted directly in index.js with express.raw() ahead of the global JSON
// parser — Paystack's signature is computed over the exact raw request
// body, so it must never pass through express.json() first.
async function webhookHandler(req, res) {
  try {
    if (!PAYSTACK_SECRET_KEY) return res.sendStatus(500);

    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.body; // Buffer
    const expectedHash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
    if (!signature || signature !== expectedHash) {
      return res.sendStatus(401);
    }

    res.sendStatus(200); // acknowledge immediately, Paystack retries on timeout

    const event = JSON.parse(rawBody.toString('utf8'));
    if (event?.event === 'charge.success') {
      const reference = event.data?.reference;
      if (reference) {
        await pool.query(
          `UPDATE public_waec_results
           SET status = 'paid', paid_at = now()
           WHERE paystack_reference = $1 AND status = 'pending'`,
          [reference]
        );
      }
    }
  } catch (err) {
    console.error('[public-waec-results webhook]', err.message);
  }
}

router.get('/:id/status', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM public_waec_results WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });
    return res.json({ status: rows[0].status });
  } catch (err) {
    if (err && err.code === '22P02') return res.status(404).json({ error: 'Not found.' });
    return next(err);
  }
});

// Accepts either a pasted listing ({ raw_text } JSON body) or a PDF upload
// (multipart, field "pdf") — same dual-mode contract as the admin-side
// POST /admin/exam-results/parse, extracted with the same pdf-parse call.
router.post('/:id/generate', publicWaecGenerateLimiter, upload.single('pdf'), async (req, res, next) => {
  try {
    let rawText;
    if (req.file) {
      if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Uploaded file must be a PDF.' });
      // pdf-parse/PDF.js fails with Node's Buffer type on Node >=24 — Uint8Array works on all versions.
      const parsed = await pdfParse(new Uint8Array(req.file.buffer));
      rawText = parsed.text;
    } else {
      rawText = typeof req.body?.raw_text === 'string' ? req.body.raw_text.trim() : '';
    }
    if (!rawText) return res.status(400).json({ error: 'Upload a PDF or paste the listing text.' });

    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT status FROM public_waec_results WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });

    const { status } = rows[0];
    if (status === 'completed') {
      return res.status(409).json({ error: 'A report has already been generated for this payment.' });
    }
    if (status !== 'paid') {
      // Paystack's webhook can lag behind a Mobile Money confirmation —
      // double-check directly with Paystack before giving up.
      const verified = await verifyWithPaystack(id);
      if (!verified) return res.status(402).json({ error: 'Payment has not been confirmed yet.' });
    }

    const report = buildPublicReport(rawText);

    await pool.query(
      `UPDATE public_waec_results
       SET status = 'completed', report = $2::jsonb
       WHERE id = $1`,
      [id, JSON.stringify(report)]
    );

    return res.json({ id, report });
  } catch (err) {
    return next(err);
  }
});

async function verifyWithPaystack(id) {
  if (!PAYSTACK_SECRET_KEY) return false;
  const { rows } = await pool.query(
    `SELECT paystack_reference, status FROM public_waec_results WHERE id = $1`,
    [id]
  );
  if (!rows.length) return false;
  if (rows[0].status === 'paid') return true;

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(rows[0].paystack_reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json().catch(() => ({}));
  const confirmed = res.ok && data?.data?.status === 'success';
  if (confirmed) {
    await pool.query(
      `UPDATE public_waec_results SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending'`,
      [id]
    );
  }
  return confirmed;
}

// Shared by /:id/report and both /:id/download.* routes — a completed
// report is the one state all three need, so the "not found yet" /
// "not generated yet" distinction (and the JSONB-string-or-object
// normalization) only needs writing once.
async function loadCompletedReport(id) {
  const { rows } = await pool.query(
    `SELECT id, status, report, created_at FROM public_waec_results WHERE id = $1`,
    [id]
  );
  if (!rows.length) return { error: 'Public WAEC analysis not found.', status: 404 };

  const record = rows[0];
  if (record.status !== 'completed') return { error: 'This analysis has not been generated yet.', status: 404 };

  let report = record.report;
  if (typeof report === 'string') {
    try { report = JSON.parse(report); } catch (e) { report = {}; }
  }
  return { record, report };
}

router.get('/:id/report', async (req, res, next) => {
  try {
    const { record, report, error, status } = await loadCompletedReport(req.params.id);
    if (error) return res.status(status).json({ error });
    return res.json({ id: record.id, created_at: record.created_at, report });
  } catch (err) {
    if (err && err.code === '22P02') {
      return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    }
    return next(err);
  }
});

function downloadFilename(report, extension) {
  const slug = (report.schoolName || 'waec-results').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${slug || 'waec-results'}-${report.year || ''}-analysis.${extension}`.replace(/--+/g, '-');
}

router.get('/:id/download.pdf', publicWaecDownloadLimiter, async (req, res, next) => {
  try {
    const { report, error, status } = await loadCompletedReport(req.params.id);
    if (error) return res.status(status).json({ error });

    const { generatePublicWaecPDFBuffer } = require('../services/publicWaecExport.service');
    const pdfBuffer = await generatePublicWaecPDFBuffer(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename(report, 'pdf')}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    if (err && err.code === '22P02') return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    return next(err);
  }
});

router.get('/:id/download.xlsx', publicWaecDownloadLimiter, async (req, res, next) => {
  try {
    const { report, error, status } = await loadCompletedReport(req.params.id);
    if (error) return res.status(status).json({ error });

    const { generatePublicWaecExcelBuffer } = require('../services/publicWaecExport.service');
    const excelBuffer = await generatePublicWaecExcelBuffer(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename(report, 'xlsx')}"`);
    return res.send(excelBuffer);
  } catch (err) {
    if (err && err.code === '22P02') return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    return next(err);
  }
});

module.exports = { router, webhookHandler };
