'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

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
async function resolveExpiresAt(schoolId) {
  const { rows } = await pool.query(
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
        `SELECT id, name, class_name, jhs_index_number, student_code, picture_url
         FROM students WHERE id = $1 AND school_id = $2`,
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
        `SELECT id, name, class_name, jhs_index_number, student_code, picture_url
         FROM students WHERE id = $1 AND school_id = $2`,
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
