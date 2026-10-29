const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { uploadDocument } = require('../services/storage.service');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');
const { sendSms } = require('../services/sms.service');

router.use(authenticate, requireActiveSubscription);

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

// Matches the "HH:MM–HH:MM" (or "HH:MM:SS–HH:MM:SS") format absences.scheduled_period
// is stored in — see absenceCheck.js's `${lesson.start_time}–${lesson.end_time}`.
const PERIOD_RE = /^(\d{2}:\d{2})(?::\d{2})?[–-](\d{2}:\d{2})(?::\d{2})?$/;

// Marks any auto-generated 'Absent' records in the given date range as 'Excused'.
// Called whenever an excuse is approved (immediately on admin-create, or on explicit approve).
// When timeFrom/timeTo are given, only absences whose lesson period overlaps that
// window are cleared — a teacher called away for part of the day can't ride the
// same excuse past the end of the meeting into lessons they simply skipped.
async function excuseExistingAbsences(schoolId, teacherId, dateFrom, dateTo, timeFrom, timeTo) {
  if (!timeFrom || !timeTo) {
    const { rowCount } = await pool.query(
      `UPDATE absences
       SET status = 'Excused', excused_via = 'teacher_excuse', updated_at = now()
       WHERE school_id = $1
         AND teacher_id = $2
         AND date BETWEEN $3 AND $4
         AND status = 'Absent'
         AND is_auto_generated = true`,
      [schoolId, teacherId, dateFrom, dateTo]
    );
    return rowCount;
  }

  const { rows: candidates } = await pool.query(
    `SELECT id, scheduled_period FROM absences
     WHERE school_id = $1 AND teacher_id = $2 AND date BETWEEN $3 AND $4
       AND status = 'Absent' AND is_auto_generated = true`,
    [schoolId, teacherId, dateFrom, dateTo]
  );
  const winFrom = timeToMinutes(timeFrom);
  const winTo   = timeToMinutes(timeTo);
  const toExcuse = candidates.filter(c => {
    const m = PERIOD_RE.exec(c.scheduled_period || '');
    if (!m) return false; // can't tell the lesson's time — leave it alone, safer default
    const lStart = timeToMinutes(m[1]);
    const lEnd   = timeToMinutes(m[2]);
    return lStart < winTo && lEnd > winFrom;
  });
  if (!toExcuse.length) return 0;

  const { rowCount } = await pool.query(
    `UPDATE absences SET status = 'Excused', excused_via = 'teacher_excuse', updated_at = now() WHERE id = ANY($1::uuid[])`,
    [toExcuse.map(c => c.id)]
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
         te.time_from::text, te.time_to::text,
         te.status, te.approved_at, te.created_at,
         te.document_url, te.document_filename, te.rejection_reason, te.approval_note,
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

// GET /api/teacher-excuses/counts — per-teacher count of personal (Approved)
// excuses, optionally scoped to an academic year (?academic_year_id=). Lets
// management see "how many times has this teacher been excused" before
// granting another — institutional exemptions (school events, vacations)
// never create a teacher_excuses row, so they never inflate this number.
router.get('/counts', adminOnly, async (req, res, next) => {
  try {
    const { academic_year_id } = req.query;
    const params = [req.schoolId];
    let where = `te.school_id = $1 AND te.status = 'Approved'`;
    if (academic_year_id) {
      params.push(academic_year_id);
      where += ` AND te.date_from >= (SELECT start_date FROM academic_years WHERE id = $${params.length})
                 AND te.date_from <= (SELECT end_date FROM academic_years WHERE id = $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT te.teacher_id, COUNT(*)::int AS count
       FROM teacher_excuses te
       WHERE ${where}
       GROUP BY te.teacher_id`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/teacher-excuses — admin creates (auto-approved) or teacher requests (Pending)
router.post('/', async (req, res, next) => {
  try {
    const { teacherId, dateFrom, dateTo, type, reason, documentBase64, documentFilename, timeFrom, timeTo } = req.body;
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
    // Leave both blank to excuse the whole day (the default); set both to scope
    // the excuse to just that time window, e.g. the length of a meeting.
    if ((timeFrom && !timeTo) || (timeTo && !timeFrom)) {
      return res.status(400).json({ error: 'timeFrom and timeTo must be provided together' });
    }
    const timeRe = /^\d{2}:\d{2}$/;
    if (timeFrom && timeTo) {
      if (!timeRe.test(timeFrom) || !timeRe.test(timeTo)) {
        return res.status(400).json({ error: 'timeFrom and timeTo must be in HH:MM format' });
      }
      if (timeTo <= timeFrom) {
        return res.status(400).json({ error: 'timeTo must be after timeFrom' });
      }
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
          document_url, document_filename, status, approved_by, approved_at, time_from, time_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${isAdmin ? 'now()' : 'NULL'},$11,$12)
       RETURNING *`,
      [req.schoolId, teacherId, dateFrom, dateTo, type, reason.trim(),
       docUrl, docFilename, status, approver, timeFrom || null, timeTo || null]
    );

    // Admin-created excuses are immediately approved — retroactively excuses any existing absences
    if (isAdmin) {
      const updated = await excuseExistingAbsences(req.schoolId, teacherId, dateFrom, dateTo, timeFrom, timeTo);
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
    const note = req.body?.note?.trim() || null;

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

    // A condition means the leave isn't final yet - the teacher must accept
    // or decline it first. A plain approval (no note) is final immediately.
    const newStatus = note ? 'Pending Acceptance' : 'Approved';
    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = $5, approved_by = $1, approved_at = now(), updated_at = now(), approval_note = $4
       WHERE id = $2 AND school_id = $3 AND status = 'Pending'
       RETURNING id, status, approval_note, teacher_id, date_from, date_to, time_from::text, time_to::text`,
      [approver, req.params.id, req.schoolId, note, newStatus]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found or already actioned' });

    const { teacher_id, date_from, date_to, time_from, time_to } = rows[0];
    let updated = 0;
    if (newStatus === 'Approved') {
      // Retroactively excuse any absences that were recorded before this approval
      updated = await excuseExistingAbsences(req.schoolId, teacher_id, date_from, date_to, time_from, time_to);
      if (updated > 0) {
        console.log(`[Excuses] Retroactively excused ${updated} absence record(s) on approval`);
      }
    }

    // Notify teacher
    try {
      const { rows: tr } = await pool.query(`SELECT name, email, phone FROM teachers WHERE id=$1`, [teacher_id]);
      const t = tr[0];
      const dateRange = date_from === date_to ? date_from : `${date_from} to ${date_to}`;
      const title = note ? 'Leave Request Approved - Condition Needs Your Response' : 'Leave Request Approved';
      const msg = note
        ? `Your leave request for ${dateRange} has been approved, subject to the following condition: ${note}. Please open the app to accept or decline this condition.`
        : `Your leave request for ${dateRange} has been approved.`;
      await createNotification(req.schoolId, teacher_id, title, msg);
      if (t?.email) await sendTeacherEmail(t.email, title, `Dear ${t?.name || 'Teacher'},\n\n${msg}\n\n- CAS`);
      if (t?.phone) await sendSms(t.phone, msg);
    } catch (e) { /* non-fatal */ }

    res.json({ id: rows[0].id, status: rows[0].status, approval_note: rows[0].approval_note, absences_excused: updated });
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
       WHERE id = $3 AND school_id = $4 AND status = 'Pending'
       RETURNING id, status, rejection_reason, teacher_id, date_from, date_to`,
      [approver, reason, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Excuse not found or already actioned' });

    // Notify teacher
    try {
      const { teacher_id, date_from, date_to } = rows[0];
      const { rows: tr } = await pool.query(`SELECT name, email, phone FROM teachers WHERE id=$1`, [teacher_id]);
      const t = tr[0];
      const dateRange = date_from === date_to ? date_from : `${date_from} to ${date_to}`;
      const title = 'Leave Request Rejected';
      const msg = `Your leave request for ${dateRange} has been rejected. Reason: ${reason}`;
      await createNotification(req.schoolId, teacher_id, title, msg);
      if (t?.email) await sendTeacherEmail(t.email, title, `Dear ${t?.name || 'Teacher'},\n\n${msg}\n\nIf you have questions, please contact your administrator.\n\n- CAS`);
      if (t?.phone) await sendSms(t.phone, msg);
    } catch (e) { /* non-fatal */ }

    res.json({ id: rows[0].id, status: rows[0].status, rejection_reason: rows[0].rejection_reason });
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/accept-condition — teacher accepts the
// condition management attached when approving their leave (status must be
// 'Pending Acceptance'). Finalizes the leave as 'Approved'.
router.patch('/:id/accept-condition', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });

    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Approved', updated_at = now()
       WHERE id = $1 AND school_id = $2 AND teacher_id = $3 AND status = 'Pending Acceptance'
       RETURNING id, status, approval_note, teacher_id, date_from, date_to, time_from::text, time_to::text`,
      [req.params.id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found or no condition awaiting your response' });

    const { teacher_id, date_from, date_to, time_from, time_to } = rows[0];
    const updated = await excuseExistingAbsences(req.schoolId, teacher_id, date_from, date_to, time_from, time_to);

    try {
      const { rows: tr } = await pool.query(`SELECT name, email, phone FROM teachers WHERE id=$1`, [teacher_id]);
      const t = tr[0];
      const dateRange = date_from === date_to ? date_from : `${date_from} to ${date_to}`;
      const title = 'Leave Request Approved';
      const msg = `You accepted the condition on your leave request for ${dateRange}. It is now fully approved.`;
      await createNotification(req.schoolId, teacher_id, title, msg);
      if (t?.email) await sendTeacherEmail(t.email, title, `Dear ${t?.name || 'Teacher'},\n\n${msg}\n\n- CAS`);
      if (t?.phone) await sendSms(t.phone, msg);
    } catch (e) { /* non-fatal */ }

    res.json({ id: rows[0].id, status: rows[0].status, absences_excused: updated });
  } catch (err) { next(err); }
});

// PATCH /api/teacher-excuses/:id/decline-condition — teacher declines the
// condition. The leave is rejected outright, and whoever set the condition
// (the approver) is notified by SMS and email.
router.patch('/:id/decline-condition', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Teacher access only' });

    const { rows } = await pool.query(
      `UPDATE teacher_excuses
       SET status = 'Rejected', updated_at = now(),
           rejection_reason = 'Teacher declined the condition: ' || approval_note
       WHERE id = $1 AND school_id = $2 AND teacher_id = $3 AND status = 'Pending Acceptance'
       RETURNING id, status, rejection_reason, approval_note, approved_by, teacher_id, date_from, date_to`,
      [req.params.id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found or no condition awaiting your response' });

    try {
      const { approved_by, teacher_id, date_from, date_to, approval_note } = rows[0];
      const dateRange = date_from === date_to ? date_from : `${date_from} to ${date_to}`;
      if (approved_by) {
        const { rows: ar } = await pool.query(`SELECT name, email, phone FROM teachers WHERE id=$1`, [approved_by]);
        const approver = ar[0];
        const { rows: teacherRows } = await pool.query(`SELECT name FROM teachers WHERE id=$1`, [teacher_id]);
        const teacherName = teacherRows[0]?.name || 'The teacher';
        const title = 'Leave Condition Declined - Request Rejected';
        const msg = `${teacherName} declined the condition you attached to their leave request for ${dateRange} ("${approval_note}"). The leave request has been automatically rejected.`;
        if (approver?.email) await sendTeacherEmail(approver.email, title, `Dear ${approver?.name || 'Sir/Madam'},\n\n${msg}\n\n- CAS`);
        if (approver?.phone) await sendSms(approver.phone, msg);
      }
    } catch (e) { /* non-fatal */ }

    res.json({ id: rows[0].id, status: rows[0].status, rejection_reason: rows[0].rejection_reason });
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
