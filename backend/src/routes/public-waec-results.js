'use strict';

const crypto = require('crypto');
const router = require('express').Router();
const pool = require('../config/db');
const { parseWaecListing } = require('../utils/waecParser');
const { computeReport } = require('../utils/examResultsReport');
const { publicWaecInitLimiter, publicWaecGenerateLimiter } = require('../middleware/rateLimiter');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const REPORT_PRICE_PESEWAS = 3000; // GHS 30, fixed server-side — never trust a client-supplied amount
const PASTE_PAGE_URL = process.env.PUBLIC_WAEC_PASTE_URL || 'http://localhost:3001/public-waec-results/paste';

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
    schoolName: parsed.schoolName,
    schoolNumber: parsed.schoolNumber,
    year: parsed.year,
    declaredTotal: parsed.declaredTotal,
    warnings: parsed.warnings || [],
  };
}

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
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Payments are not configured. Please try again later.' });
    }

    const reference = `pub-waec-${crypto.randomUUID()}`;

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

router.post('/:id/generate', publicWaecGenerateLimiter, async (req, res, next) => {
  try {
    const rawText = typeof req.body?.raw_text === 'string' ? req.body.raw_text.trim() : '';
    if (!rawText) return res.status(400).json({ error: 'raw_text is required.' });

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

router.get('/:id/report', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, status, report, created_at FROM public_waec_results WHERE id = $1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    }

    const record = rows[0];
    if (record.status !== 'completed') {
      return res.status(404).json({ error: 'This analysis has not been generated yet.' });
    }

    let report = record.report;
    if (typeof report === 'string') {
      try { report = JSON.parse(report); } catch (e) { report = {}; }
    }

    return res.json({ id: record.id, created_at: record.created_at, report });
  } catch (err) {
    if (err && err.code === '22P02') {
      return res.status(404).json({ error: 'Public WAEC analysis not found.' });
    }
    return next(err);
  }
});

module.exports = { router, webhookHandler };
