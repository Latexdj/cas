'use strict';
const crypto = require('crypto');
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { generateCardBuffer, generateBatchAndUpload, generateCardPng } = require('../services/pdf.service');
const QRCode = require('qrcode');

// ── In-memory batch job store ─────────────────────────────────────────────────
// Jobs are kept for the lifetime of the server process.  A whole-school batch
// for a few hundred students takes ~1–2 min; the admin polls for status.
const batchJobs = new Map();

function createBatchJob({ schoolId, createdBy, filter, issuedAt, expiresAt }) {
  const id  = crypto.randomUUID();
  const job = {
    id, schoolId, createdBy,
    filter,                         // { className: string } | { all: true }
    issuedAt:  issuedAt  ?? null,   // explicit issue date for newly minted cards
    expiresAt: expiresAt ?? null,   // explicit expiry; null → resolveExpiresAt
    status:   'queued',             // queued | processing | done | failed
    progress: { done: 0, total: 0 },
    report:   null,                 // set on completion
    pdfUrl:   null,
    error:    null,
    createdAt: new Date(),
  };
  batchJobs.set(id, job);
  return job;
}

// Processes a batch job in the background.  Never throws — marks job failed instead.
// Uses a dedicated short-lived pool so the shared app pool's idle-timeout is
// unaffected, and so the dedicated connections stay alive during the multi-minute
// Puppeteer rendering phase without touching any other request's pool.
async function processBatchJob(job) {
  job.status = 'processing';

  const { Pool } = require('pg');
  const batchPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:  { rejectUnauthorized: false },
    max:  3,
    idleTimeoutMillis:    0,      // never evict — must survive the Puppeteer render phase
    connectionTimeoutMillis: 10000,
  });

  try {
    const { rows: [school] } = await batchPool.query(
      `SELECT name, logo_url, primary_color, accent_color,
              vision, mission, core_values,
              lost_card_contact_1, lost_card_contact_2,
              headmaster_name, headmaster_signature_url
       FROM schools WHERE id = $1`, [job.schoolId]
    );

    // Load active students matching the filter
    let studentRows;
    if (job.filter.all) {
      ({ rows: studentRows } = await batchPool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house,
                p.name AS program_name, p.display_name AS program_display_name
         FROM students s
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.school_id = $1 AND LOWER(s.status) = 'active'
         ORDER BY s.class_name, s.name`,
        [job.schoolId]
      ));
    } else {
      ({ rows: studentRows } = await batchPool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house,
                p.name AS program_name, p.display_name AS program_display_name
         FROM students s
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.school_id = $1 AND s.class_name = $2 AND LOWER(s.status) = 'active'
         ORDER BY s.name`,
        [job.schoolId, job.filter.className]
      ));
    }

    job.progress.total = studentRows.length;

    const expiresAt     = job.expiresAt ?? await resolveExpiresAt(job.schoolId, batchPool);
    const issuedAt      = job.issuedAt  ?? null;
    const entries       = [];
    let newlyMinted = 0, reused = 0, noPhoto = 0;

    // Mint/reuse tokens sequentially — avoids DB contention and memory spikes.
    for (const student of studentRows) {
      const { rows: existing } = await batchPool.query(
        `SELECT * FROM student_id_cards
         WHERE student_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [student.id]
      );

      let card;
      if (existing.length) {
        card = existing[0];
        reused++;
      } else {
        const { rows: [numRow] } = await batchPool.query(
          `SELECT COALESCE(MAX(issue_number), 0) AS max_num
           FROM student_id_cards WHERE student_id = $1`,
          [student.id]
        );
        const { rows: [newCard] } = await batchPool.query(
          `INSERT INTO student_id_cards (student_id, school_id, issue_number, expires_at, issued_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE)) RETURNING *`,
          [student.id, job.schoolId, parseInt(numRow.max_num) + 1, expiresAt, issuedAt]
        );
        card = newCard;
        newlyMinted++;
      }

      if (!student.picture_url) noPhoto++;

      // Generate QR data URL inline (sequential, not concurrent).
      const qrDataUrl = await QRCode.toDataURL(card.token, {
        errorCorrectionLevel: 'M', width: 200, margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      entries.push({ student, card, school, qrDataUrl });
      job.progress.done++;
    }

    // All DB work is done — drain the batch pool before the long Puppeteer render
    // so we hold no connections during that phase either.
    await batchPool.end();

    // Render all cards into an A4 batch PDF and upload to Supabase.
    const pdfUrl = await generateBatchAndUpload({ entries, schoolId: job.schoolId });

    job.report = {
      total:        studentRows.length,
      newly_minted: newlyMinted,
      reused,
      no_photo:     noPhoto,
    };
    job.pdfUrl  = pdfUrl;
    job.status  = 'done';
  } catch (err) {
    job.status = 'failed';
    job.error  = err.message;
    await batchPool.end().catch(() => {});
  }
}

// ── Soft authenticate — decodes JWT if present, never blocks ─────────────────
// Used by the verify endpoint to distinguish public vs. authenticated callers.
const jwt = require('jsonwebtoken');
function softAuthenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user     = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.schoolId = req.user.schoolId || null;
    } catch { /* invalid token — treat as public */ }
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Log a scan regardless of outcome. Fire-and-forget — never throws to caller.
async function logScan({ token_queried, response_status, scanned_by, ip }) {
  try {
    await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, scanned_by, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [token_queried, response_status, scanned_by ?? null, ip ?? null]
    );
  } catch { /* don't let logging failure surface to user */ }
}

// Live exeat check: is the student currently on an active, approved exeat?
// Returns true only for status='active' with valid date window.
// 'overdue' → false (they were approved but should have returned — reflect immediately).
async function hasActiveExeat(studentId) {
  const { rows } = await pool.query(
    `SELECT id FROM exeats
     WHERE student_id = $1
       AND status = 'active'
       AND departure_date <= CURRENT_DATE
       AND expected_return_date >= CURRENT_DATE
     LIMIT 1`,
    [studentId]
  );
  return rows.length > 0;
}

// Get or resolve expires_at from the school's current academic year.
// Accepts an optional db parameter so callers can supply a dedicated pool
// (e.g. the batch job's own pool) instead of the shared app pool.
async function resolveExpiresAt(schoolId, db = pool) {
  const { rows } = await db.query(
    `SELECT end_date FROM academic_years
     WHERE school_id = $1 AND is_current = true
     LIMIT 1`,
    [schoolId]
  );
  if (!rows.length || !rows[0].end_date) return null;
  // pg returns DATE columns as JS Date objects (midnight UTC); shift to end-of-day.
  const d = new Date(rows[0].end_date);
  d.setUTCHours(23, 59, 59, 0);
  return d;
}

// ── POST /api/id-cards/generate/:studentId ───────────────────────────────────
// Admin only. Mints a new token if the student has no active card; otherwise
// returns the existing active card. Returns the full card record + token.
router.post(
  '/generate/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;

      // Confirm student belongs to this school
      const { rows: sRows } = await pool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house, p.name AS program_name
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
      const student = sRows[0];

      // Check for existing active card
      const { rows: existing } = await pool.query(
        `SELECT * FROM student_id_cards
         WHERE student_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [studentId]
      );
      if (existing.length) {
        return res.json({ card: existing[0], student, reused: true });
      }

      // Mint new card
      const expiresAt = await resolveExpiresAt(req.schoolId);

      // Determine next issue_number (highest ever issued for this student + 1)
      const { rows: numRows } = await pool.query(
        `SELECT COALESCE(MAX(issue_number), 0) AS max_num
         FROM student_id_cards WHERE student_id = $1`,
        [studentId]
      );
      const issueNumber = parseInt(numRows[0].max_num) + 1;

      const { rows: newCard } = await pool.query(
        `INSERT INTO student_id_cards
           (student_id, school_id, issue_number, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [studentId, req.schoolId, issueNumber, expiresAt]
      );

      res.status(201).json({ card: newCard[0], student, reused: false });
    } catch (err) { next(err); }
  }
);

// ── POST /api/id-cards/revoke/:studentId ─────────────────────────────────────
// Admin only. Marks the current active card revoked and immediately mints a
// replacement with an incremented issue_number and the same expiry logic.
router.post(
  '/revoke/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const { reason = 'Lost' } = req.body;

      // Must belong to same school
      const { rows: sRows } = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });

      // Find active card
      const { rows: active } = await pool.query(
        `SELECT * FROM student_id_cards
         WHERE student_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [studentId]
      );
      if (!active.length) return res.status(404).json({ error: 'No active card found for this student' });

      const current = active[0];

      // Revoke it
      await pool.query(
        `UPDATE student_id_cards
         SET status = 'revoked', revoked_at = now(), revoke_reason = $1
         WHERE id = $2`,
        [reason, current.id]
      );

      // Issue replacement
      const expiresAt  = await resolveExpiresAt(req.schoolId);
      const nextIssue  = current.issue_number + 1;
      const { rows: newCard } = await pool.query(
        `INSERT INTO student_id_cards
           (student_id, school_id, issue_number, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [studentId, req.schoolId, nextIssue, expiresAt]
      );

      res.json({
        revoked: { id: current.id, token: current.token, issue_number: current.issue_number },
        replacement: newCard[0],
      });
    } catch (err) { next(err); }
  }
);

// ── GET /api/id-cards/student/:studentId ─────────────────────────────────────
// Admin only. Returns the current card and last 5 scans for a student.
router.get(
  '/student/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const { rows: sRows } = await pool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house, p.name AS program_name
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });

      const { rows: cards } = await pool.query(
        `SELECT * FROM student_id_cards
         WHERE student_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [studentId]
      );

      const activeCard = cards.find(c => c.status === 'active') ?? null;
      let recentScans = [];
      if (activeCard) {
        const { rows: scans } = await pool.query(
          `SELECT token_queried, response_status, scanned_by, scanned_at
           FROM id_card_scans WHERE token_queried = $1
           ORDER BY scanned_at DESC LIMIT 5`,
          [activeCard.token]
        );
        recentScans = scans;
      }

      res.json({ student: sRows[0], active_card: activeCard, card_history: cards, recent_scans: recentScans });
    } catch (err) { next(err); }
  }
);

// ── POST /api/id-cards/pdf/:studentId ────────────────────────────────────────
// Admin only. Mints or reuses active card, then streams a CR80 PDF as download.
router.post(
  '/pdf/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;

      const { rows: sRows } = await pool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house, p.name AS program_name
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
      const student = sRows[0];

      const { rows: schRows } = await pool.query(
        `SELECT name, logo_url, primary_color, accent_color,
                vision, mission, core_values,
                lost_card_contact_1, lost_card_contact_2,
                headmaster_name, headmaster_signature_url
         FROM schools WHERE id = $1`, [req.schoolId]
      );
      const school = schRows[0] ?? { name: '', logo_url: null };

      const { issued_at, expires_at } = req.body ?? {};

      // Mint or reuse
      let card;
      const { rows: existing } = await pool.query(
        `SELECT * FROM student_id_cards WHERE student_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [studentId]
      );
      if (existing.length) {
        // Always apply the caller-provided dates so the PDF reflects what the admin chose.
        const expiresAt = expires_at || existing[0].expires_at;
        const { rows: updated } = await pool.query(
          `UPDATE student_id_cards
           SET expires_at = $1, issued_at = COALESCE($2::date, issued_at)
           WHERE id = $3 RETURNING *`,
          [expiresAt, issued_at || null, existing[0].id]
        );
        card = updated[0];
      } else {
        const expiresAt = expires_at || await resolveExpiresAt(req.schoolId);
        const { rows: numRows } = await pool.query(
          `SELECT COALESCE(MAX(issue_number), 0) AS max_num FROM student_id_cards WHERE student_id = $1`,
          [studentId]
        );
        const { rows: newRows } = await pool.query(
          `INSERT INTO student_id_cards (student_id, school_id, issue_number, expires_at, issued_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE)) RETURNING *`,
          [studentId, req.schoolId, parseInt(numRows[0].max_num) + 1, expiresAt, issued_at || null]
        );
        card = newRows[0];
      }

      const pdfBuffer = await generateCardBuffer({ student, card, school });
      const safe = student.name.replace(/[^A-Za-z0-9]/g, '_');
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="ID_${safe}_Issue${card.issue_number}.pdf"`,
        'Content-Length':      pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (err) { next(err); }
  }
);

// ── POST /api/id-cards/reissue-pdf/:studentId ─────────────────────────────────
// Admin only. Revokes any active card, mints a replacement with incremented
// issue_number, and streams the new card PDF as download.
router.post(
  '/reissue-pdf/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const { reason = 'Reissued', issued_at, expires_at } = req.body ?? {};

      const { rows: sRows } = await pool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house, p.name AS program_name
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
      const student = sRows[0];

      const { rows: schRows } = await pool.query(
        `SELECT name, logo_url, primary_color, accent_color,
                vision, mission, core_values,
                lost_card_contact_1, lost_card_contact_2,
                headmaster_name, headmaster_signature_url
         FROM schools WHERE id = $1`, [req.schoolId]
      );
      const school = schRows[0] ?? { name: '', logo_url: null };

      // Revoke existing if any
      const { rows: active } = await pool.query(
        `SELECT * FROM student_id_cards WHERE student_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [studentId]
      );
      let nextIssue = 1;
      if (active.length) {
        await pool.query(
          `UPDATE student_id_cards SET status = 'revoked', revoked_at = now(), revoke_reason = $1 WHERE id = $2`,
          [reason, active[0].id]
        );
        nextIssue = active[0].issue_number + 1;
      } else {
        const { rows: numRows } = await pool.query(
          `SELECT COALESCE(MAX(issue_number), 0) AS max_num FROM student_id_cards WHERE student_id = $1`,
          [studentId]
        );
        nextIssue = parseInt(numRows[0].max_num) + 1;
      }

      const expiresAt = expires_at ? new Date(expires_at) : await resolveExpiresAt(req.schoolId);
      const { rows: newRows } = await pool.query(
        `INSERT INTO student_id_cards (student_id, school_id, issue_number, expires_at, issued_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE)) RETURNING *`,
        [studentId, req.schoolId, nextIssue, expiresAt, issued_at || null]
      );
      const card = newRows[0];

      const pdfBuffer = await generateCardBuffer({ student, card, school });
      const safe = student.name.replace(/[^A-Za-z0-9]/g, '_');
      res.set({
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="ID_${safe}_Issue${card.issue_number}.pdf"`,
        'Content-Length':      pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (err) { next(err); }
  }
);

// ── POST /api/id-cards/png/:studentId ────────────────────────────────────────
// Admin only. Returns a 648×408 PNG screenshot of the card front.
// Uses the active card if one exists; mints a new card only if there is none.
router.post(
  '/png/:studentId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const { issued_at, expires_at } = req.body ?? {};

      const { rows: sRows } = await pool.query(
        `SELECT s.id, s.name, s.class_name, s.jhs_index_number, s.student_code, s.picture_url,
                s.gender, s.residential_status, s.house, p.name AS program_name, p.display_name AS program_display_name
         FROM students s LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!sRows.length) return res.status(404).json({ error: 'Student not found' });
      const student = sRows[0];

      const { rows: schoolRows } = await pool.query(
        `SELECT name, logo_url, primary_color, accent_color, vision, mission FROM schools WHERE id = $1`,
        [req.schoolId]
      );
      const school = schoolRows[0] ?? {};

      // Use existing active card or mint a new one
      const { rows: existing } = await pool.query(
        `SELECT * FROM student_id_cards WHERE student_id = $1 AND status = 'active' ORDER BY issue_number DESC LIMIT 1`,
        [studentId]
      );

      let card;
      if (existing.length) {
        card = existing[0];
      } else {
        const expiresAt = expires_at || resolveExpiresAt();
        const { rows: newRows } = await pool.query(
          `INSERT INTO student_id_cards (student_id, school_id, issue_number, expires_at, issued_at)
           VALUES ($1, $2, 1, $3, COALESCE($4::date, CURRENT_DATE)) RETURNING *`,
          [studentId, req.schoolId, expiresAt, issued_at || null]
        );
        card = newRows[0];
      }

      const pngBuffer = await generateCardPng({ student, card, school });
      const safe = student.name.replace(/[^A-Za-z0-9]/g, '_');
      res.set({
        'Content-Type':        'image/png',
        'Content-Disposition': `attachment; filename="ID_${safe}_Issue${card.issue_number}.png"`,
        'Content-Length':      pngBuffer.length,
      });
      res.end(pngBuffer);
    } catch (err) { next(err); }
  }
);

// ── GET /api/id-cards/student/:studentId/scans ───────────────────────────────
// Admin only. Full scan history for a student across all their cards (newest first).
// Used by the student profile page audit view.
router.get(
  '/student/:studentId/scans',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { studentId } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);

      const { rows: [student] } = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND school_id = $2`,
        [studentId, req.schoolId]
      );
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const { rows: scans } = await pool.query(
        `SELECT s.token_queried, s.response_status, s.scanned_by, s.scanned_at, s.ip_address,
                c.issue_number, c.status AS card_status,
                t.name AS scanned_by_name
         FROM id_card_scans s
         JOIN student_id_cards c ON c.token::text = s.token_queried
         LEFT JOIN teachers t ON t.id = s.scanned_by
         WHERE c.student_id = $1
         ORDER BY s.scanned_at DESC
         LIMIT $2`,
        [studentId, limit]
      );

      res.json({ scans });
    } catch (err) { next(err); }
  }
);

// ── GET /api/id-cards/anomalies ───────────────────────────────────────────────
// Admin only. Returns three categories of flagged scan events for review.
//   revoked_scans  — active scans hitting a revoked card in the last 30 days
//   multi_ip_events — tokens scanned from 3+ distinct IPs within any 6-hour window
//   odd_hour_scans  — valid scans before 05:00 or after 23:00 local (Africa/Accra)
router.get(
  '/anomalies',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      // ── (a) Revoked-card scans ──────────────────────────────────────────────
      const { rows: revokedScans } = await pool.query(
        `SELECT s.token_queried, s.response_status, s.scanned_at, s.ip_address,
                c.issue_number, c.revoked_at,
                st.id AS student_id, st.name AS student_name,
                st.student_code, st.class_name
         FROM id_card_scans s
         JOIN student_id_cards c ON c.token::text = s.token_queried AND c.status = 'revoked'
         JOIN students st ON st.id = c.student_id AND st.school_id = $1
         WHERE s.scanned_at >= NOW() - INTERVAL '30 days'
           AND s.response_status = 'revoked'
         ORDER BY s.scanned_at DESC
         LIMIT 200`,
        [req.schoolId]
      );

      // ── (b) Multi-IP events (3+ distinct IPs in a 6-hour window) ───────────
      const { rows: multiIpEvents } = await pool.query(
        `WITH school_scans AS (
           SELECT s.token_queried, s.ip_address, s.scanned_at,
                  c.issue_number, c.status AS card_status,
                  st.id AS student_id, st.name AS student_name,
                  st.student_code, st.class_name
           FROM id_card_scans s
           JOIN student_id_cards c ON c.token::text = s.token_queried
           JOIN students st ON st.id = c.student_id AND st.school_id = $1
           WHERE s.scanned_at >= NOW() - INTERVAL '30 days'
             AND s.ip_address IS NOT NULL
         ),
         windows AS (
           SELECT a.token_queried, a.scanned_at AS window_start,
                  a.scanned_at + INTERVAL '6 hours' AS window_end,
                  COUNT(DISTINCT b.ip_address) AS ip_count
           FROM school_scans a
           JOIN school_scans b ON b.token_queried = a.token_queried
             AND b.scanned_at >= a.scanned_at
             AND b.scanned_at < a.scanned_at + INTERVAL '6 hours'
           GROUP BY a.token_queried, a.scanned_at
           HAVING COUNT(DISTINCT b.ip_address) >= 3
         )
         SELECT DISTINCT ON (w.token_queried)
           w.token_queried, w.window_start, w.window_end, w.ip_count,
           ss.student_id, ss.student_name, ss.student_code, ss.class_name, ss.card_status
         FROM windows w
         JOIN school_scans ss ON ss.token_queried = w.token_queried
         ORDER BY w.token_queried, w.ip_count DESC
         LIMIT 50`,
        [req.schoolId]
      );

      // ── (c) Off-hours scans (before 05:00 or after 23:00 Africa/Accra) ─────
      const { rows: oddHourScans } = await pool.query(
        `SELECT s.token_queried, s.response_status, s.scanned_at, s.ip_address,
                c.issue_number,
                st.id AS student_id, st.name AS student_name,
                st.student_code, st.class_name,
                EXTRACT(HOUR FROM s.scanned_at AT TIME ZONE 'Africa/Accra')::int AS local_hour
         FROM id_card_scans s
         JOIN student_id_cards c ON c.token::text = s.token_queried
         JOIN students st ON st.id = c.student_id AND st.school_id = $1
         WHERE s.scanned_at >= NOW() - INTERVAL '30 days'
           AND s.response_status IN ('valid_auth', 'valid_public')
           AND (  EXTRACT(HOUR FROM s.scanned_at AT TIME ZONE 'Africa/Accra') < 5
               OR EXTRACT(HOUR FROM s.scanned_at AT TIME ZONE 'Africa/Accra') >= 23)
         ORDER BY s.scanned_at DESC
         LIMIT 200`,
        [req.schoolId]
      );

      res.json({
        revoked_scans:   revokedScans,
        multi_ip_events: multiIpEvents,
        odd_hour_scans:  oddHourScans,
        generated_at:    new Date().toISOString(),
      });
    } catch (err) { next(err); }
  }
);

// ── GET /api/id-cards/missing-photos ─────────────────────────────────────────
// Admin only. Returns active students in the given scope who have no photo.
// Query params: ?class_name=X or ?all=true  (same scoping as the batch endpoint)
router.get(
  '/missing-photos',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { class_name, all: isAll } = req.query;
      if (!class_name && !isAll) {
        return res.status(400).json({ error: 'Provide class_name or all=true' });
      }

      let rows;
      if (isAll === 'true' || isAll === '1') {
        ({ rows } = await pool.query(
          `SELECT id, name, class_name, student_code
           FROM students
           WHERE school_id = $1 AND LOWER(status) = 'active'
             AND (picture_url IS NULL OR picture_url = '')
           ORDER BY class_name, name`,
          [req.schoolId]
        ));
      } else {
        ({ rows } = await pool.query(
          `SELECT id, name, class_name, student_code
           FROM students
           WHERE school_id = $1 AND class_name = $2 AND LOWER(status) = 'active'
             AND (picture_url IS NULL OR picture_url = '')
           ORDER BY name`,
          [req.schoolId, class_name]
        ));
      }

      res.json({ students: rows, total: rows.length });
    } catch (err) { next(err); }
  }
);

// ── POST /api/id-cards/batch ──────────────────────────────────────────────────
// Admin only. Starts a background batch job.
// Body: { class_name: "Form 1A" } — specific class
//    or { all: true }             — whole school
// Returns immediately: { jobId }
router.post(
  '/batch',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const { class_name, all: isAll, issued_at, expires_at } = req.body;
      if (!class_name && !isAll) {
        return res.status(400).json({ error: 'Provide class_name or all: true' });
      }

      const filter = isAll ? { all: true } : { className: class_name };
      const job    = createBatchJob({
        schoolId: req.schoolId, createdBy: req.user.id, filter,
        issuedAt:  issued_at  || null,
        expiresAt: expires_at ? new Date(expires_at) : null,
      });

      // Fire-and-forget — respond before processing starts.
      res.status(202).json({ jobId: job.id });

      // Background processing — errors are caught inside processBatchJob.
      processBatchJob(job).catch(() => { /* already marked failed inside */ });
    } catch (err) { next(err); }
  }
);

// ── GET /api/id-cards/batch/:jobId ───────────────────────────────────────────
// Admin only. Returns status, progress, report, and download URL when done.
router.get(
  '/batch/:jobId',
  authenticate, adminOnly, requireActiveSubscription,
  async (req, res, next) => {
    try {
      const job = batchJobs.get(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Batch job not found' });
      if (job.schoolId !== req.schoolId) return res.status(403).json({ error: 'Not your job' });

      res.json({
        jobId:     job.id,
        status:    job.status,
        progress:  job.progress,
        report:    job.report,
        pdfUrl:    job.pdfUrl,
        error:     job.error,
        filter:    job.filter,
        createdAt: job.createdAt,
      });
    } catch (err) { next(err); }
  }
);

// ── GET /api/verify/:token ────────────────────────────────────────────────────
// PUBLIC — no auth required. Tiered response based on whether caller is logged in.
// Logs every request to id_card_scans including invalid tokens.
// Router is mounted at /api/verify, so the handler path is just /:token.
router.get('/:token', softAuthenticate, async (req, res, next) => {
  const tokenParam = req.params.token;
  const ip         = req.ip ?? null;
  const scannedBy  = req.user?.id ?? null;

  try {
    // Look up card — UUID cast catches malformed tokens safely
    let card = null;
    try {
      const { rows } = await pool.query(
        `SELECT c.*, s.name AS student_name, s.class_name, s.jhs_index_number,
                s.student_code, s.picture_url, s.school_id AS student_school_id,
                sch.name AS school_name
         FROM student_id_cards c
         JOIN students s   ON s.id  = c.student_id
         JOIN schools  sch ON sch.id = c.school_id
         WHERE c.token = $1::uuid`,
        [tokenParam]
      );
      card = rows[0] ?? null;
    } catch { /* invalid UUID format — card stays null */ }

    // ── Unknown token ─────────────────────────────────────────────────────────
    if (!card) {
      await logScan({ token_queried: tokenParam, response_status: 'unknown', scanned_by: scannedBy, ip });
      return res.status(404).json({ valid: false, message: 'QR code not recognised.' });
    }

    // ── Revoked ───────────────────────────────────────────────────────────────
    if (card.status === 'revoked') {
      await logScan({ token_queried: tokenParam, response_status: 'revoked', scanned_by: scannedBy, ip });
      return res.json({
        valid:    false,
        status:   'revoked',
        message:  'This ID card has been cancelled. Please report to the school office.',
        school:   card.school_name,
      });
    }

    // ── Expired ───────────────────────────────────────────────────────────────
    if (card.status === 'expired' || (card.expires_at && new Date(card.expires_at) < new Date())) {
      // Lazily mark expired in DB (best-effort)
      pool.query(`UPDATE student_id_cards SET status = 'expired' WHERE id = $1 AND status = 'active'`, [card.id])
        .catch(() => {});
      await logScan({ token_queried: tokenParam, response_status: 'expired', scanned_by: scannedBy, ip });
      return res.json({
        valid:    false,
        status:   'expired',
        message:  'This ID card has expired. The student should obtain a new card from the school.',
        school:   card.school_name,
      });
    }

    // ── Active card — determine tier ──────────────────────────────────────────
    const exeatActive = await hasActiveExeat(card.student_id);

    // Check if caller is authenticated AND belongs to the same school
    const isAuth       = !!req.user;
    const sameSchool   = isAuth && (req.schoolId === card.school_id || req.user?.role === 'super_admin');
    const authAndSame  = isAuth && sameSchool;

    const tier = authAndSame ? 'valid_auth' : 'valid_public';
    await logScan({ token_queried: tokenParam, response_status: tier, scanned_by: scannedBy, ip });

    // Public response — no PII
    const publicPayload = {
      valid:          true,
      status:         'active',
      school:         card.school_name,
      issue_number:   card.issue_number,
      exeat_approved: exeatActive,
      message:        exeatActive
        ? 'Valid CAS student. Exeat currently approved — student has permission to be off campus.'
        : 'Valid CAS student. No active exeat — student does not currently have off-campus permission.',
    };

    if (!authAndSame) {
      return res.json(publicPayload);
    }

    // Authenticated tier — add identity details + last 3 scans
    // token_queried is TEXT, so no ::uuid cast needed here.
    const { rows: scans } = await pool.query(
      `SELECT response_status, scanned_at, ip_address
       FROM id_card_scans WHERE token_queried = $1
       ORDER BY scanned_at DESC LIMIT 3`,
      [tokenParam]
    );

    return res.json({
      ...publicPayload,
      student: {
        name:         card.student_name,
        class_name:   card.class_name,
        index_number: card.jhs_index_number,
        student_code: card.student_code,
        photo_url:    card.picture_url ?? null,
      },
      recent_scans: scans,
    });
  } catch (err) { next(err); }
});

module.exports = router;
