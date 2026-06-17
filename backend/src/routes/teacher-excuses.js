const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadDocument } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription);

// Marks any auto-generated 'Absent' records in the given date range as 'Excused'.
// Called whenever an excuse is approved (immediately on admin-create, or on explicit approve).
async function excuseExistingAbsences(schoolId, teacherId, dateFrom, dateTo) {
  const { rowCount } = await pool.query(
    `UPDATE absences
     SET status = 'Excused', updated_at = now()
     WHERE school_id = $1
       AND teacher_id = $2
       AND date BETWEEN $3 AND $4
       AND status = 'Absent'
       AND is_auto_generated = true`,
    [schoolId, teacherId, dateFrom, dateTo]
  );
  return rowCount;
}

// GET /api/teacher-excuses  — admin sees all; teacher sees own
router.get('/', async (req, res, next) => {
  try {
    const conditions = ['te.school_id = $1'];
    const params     = [req.schoolId];

    if (req.user.role === 'teacher') {
      params.push(req.user.id);
      conditions.push(`te.teacher_id = $${params.length}`);
    } else {
      if (req.query.teacherId) {
        params.push(req.query.teacherId);
        conditions.push(`te.teacher_id = $${params.length}`);
      }
      if (req.query.status) {
        params.push(req.query.status);
        conditions.push(`te.status = $${params.length}`);
      }
    }
    if (req.query.from) {
      params.push(req.query.from);
      conditions.push(`te.date_to >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      conditions.push(`te.date_from <= $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         te.id, te.date_from, te.date_to, te.type, te.reason,
         te.status, te.approved_at, te.created_at,
         te.document_url, te.document_filename, te.rejection_reason,
         t.id   AS teacher_id,
         t.name AS teacher_name,
         a.name AS approved_by_name
       FROM teacher_excuses te
       JOIN teachers t  ON t.id  = te.teacher_id
       LEFT JOIN teachers a ON a.id = te.approved_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/teacher-excuses — admin creates (auto-approved) or teacher requests (Pending)
router.post('/', async (req, res, next) => {
  try {
    const { teacherId, dateFrom, dateTo, type, reason, documentBase64, documentFilename } = req.body;
    const valid = ['Official Duty', 'Permission', 'Sick Leave', 'Other'];

    if (!teacherId || !dateFrom || !dateTo || !type || !reason) {
      return res.status(400).json({ error: 'teacherId, dateFrom, dateTo, type and reason are required' });
    }
    if (!valid.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${valid.join(', ')}` });
    }
    if (new Date(dateTo) < new Date(dateFrom)) {
      return res.status(400).json({ error: 'dateTo must be on or after dateFrom' });
    }

    if (req.user.role === 'teacher' && req.user.id !== teacherId) {
      return res.status(403).json({ error: 'You can only submit excuses for yourself' });
    }

    // Teachers submitting non-Official Duty leave must include a supporting document
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && type !== 'Official Duty' && !documentBase64) {
      return res.status(400).json({ error: 'A supporting document (PDF or Word) is required for this leave type' });
    }

    // Upload document if provided
    let docUrl      = null;
    let docFilename = null;
    if (documentBase64 && documentFilename) {
      try {
        const result = await uploadDocument(
          documentBase64,
          documentFilename,
          `leave-documents/${req.schoolId}`
        );
        docUrl      = result.url;
        docFilename = result.filename;
      } catch (uploadErr) {
        return res.status(400).json({ error: uploadErr.message });
      }
    }

    const status   = isAdmin ? 'Approved' : 'Pending';
    const approver = (isAdmin && req.user.id) ? req.user.id : null;

    const { rows } = await pool.query(
      `INSERT INTO teacher_excuses
         (school_id, teacher_id, date_from, date_to, type, reason,
          document_url, document_filename, status, approved_by, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${isAdmin ? 'now()' : 'NULL'})
       RETURNING *`,
      [req.schoolId, teacherId, dateFrom, dateTo, type, reason.trim(),
       docUrl, docFilename, status, approver]
    );

    // Admin-created excuses are immediately approved — retroactively excuses any existing absences
    if (isAdmin) {
      const updated = await excuseExistingAbsences(req.schoolId, teacherId, dateFrom, dateTo);
      if (updated > 0) {
        console.log(`[Excuses] Retroactively excused ${updated} absence record(s) for teacher ${teacherId}`);
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/approve
router.patch('/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const approver = req.user.id || null;

    // Fetch the excuse first to check document requirement
    const { rows: check } = await pool.query(
      'SELECT type, document_url FROM teacher_excuses WHERE id = $1 AND school_id = $2',
      [req.params.id, req.schoolId]
    );
    if (!check.length) return res.status(404).json({ error: 'Excuse not found' });

    if (check[0].type !== 'Official Duty' && !check[0].document_url) {
      return res.status(400).json({
        error: 'A supporting document is required before this leave can be approved',
      });
    }

    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Approved', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE id = $2 AND school_id = $3
       RETURNING id, status, teacher_id, date_from, date_to`,
      [approver, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found' });

    // Retroactively excuse any absences that were recorded before this approval
    const { teacher_id, date_from, date_to } = rows[0];
    const updated = await excuseExistingAbsences(req.schoolId, teacher_id, date_from, date_to);
    if (updated > 0) {
      console.log(`[Excuses] Retroactively excused ${updated} absence record(s) on approval`);
    }

    res.json({ id: rows[0].id, status: rows[0].status, absences_excused: updated });
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/reject
router.patch('/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const reason = req.body?.reason?.trim();
    if (!reason) return res.status(400).json({ error: 'A reason is required when rejecting a leave request' });

    const approver = req.user.id || null;
    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Rejected', approved_by = $1, approved_at = now(), updated_at = now(),
           rejection_reason = $2
       WHERE id = $3 AND school_id = $4
       RETURNING id, status, rejection_reason`,
      [approver, reason, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/teacher-excuses/:id  — admin only
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM teacher_excuses WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Excuse not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
