'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { generateAndUploadPDF } = require('../services/pdf.service');
const { sendTeacherEmail } = require('../services/notification.service');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('discipline'));

// Admin (role: admin | super_admin) OR management (type: management) may issue memos.
// Same population as general_letters — copied here to match that file's existing
// pattern (each letter-family route file keeps its own copy today; promoting to a
// shared helper is a separate, later cleanup, not part of this build).
function adminOrManagement(req, res, next) {
  const role = req.user?.role;
  const type = req.user?.type;
  if (role !== 'admin' && role !== 'super_admin' && type !== 'management') {
    return res.status(403).json({ error: 'Admin or management access required' });
  }
  next();
}

const VALID_DISTRIBUTION_TYPES = ['all', 'department', 'responsibility', 'specific'];

function roleLabel(role) {
  if (role === 'principal') return 'Principal';
  if (role === 'vice_principal') return 'Vice Principal';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function resolveIssuedBy(req) {
  const id = req.user?.id ?? null;
  if (!id) return { issued_by_id: null, issued_by_name: '' };
  const { rows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [id]);
  return { issued_by_id: id, issued_by_name: rows[0]?.name ?? '' };
}

async function generateMemoRefNumber(schoolId) {
  const { rows } = await pool.query(
    `UPDATE schools SET memo_ref_counter = memo_ref_counter + 1
     WHERE id = $1
     RETURNING memo_ref_counter, letter_ref_prefix`,
    [schoolId]
  );
  const { memo_ref_counter, letter_ref_prefix } = rows[0];
  const year = new Date().getFullYear();
  const seq  = String(memo_ref_counter).padStart(4, '0');
  return letter_ref_prefix ? `${letter_ref_prefix}/MEMO/${year}/${seq}` : `MEMO/${year}/${seq}`;
}

// Resolves distribution_type + distribution_ref into a concrete list of active
// teacher IDs plus a frozen audience_label. Throws on invalid input — callers
// turn that into a 400.
async function resolveDistribution(schoolId, distributionType, distributionRef) {
  if (distributionType === 'all') {
    const { rows } = await pool.query(
      `SELECT id FROM teachers WHERE school_id = $1 AND status = 'Active'`,
      [schoolId]
    );
    return { teacherIds: rows.map(r => r.id), audienceLabel: 'ALL STAFF' };
  }

  if (distributionType === 'department') {
    const departmentId = distributionRef?.department_id;
    if (!departmentId) throw new Error('distribution_ref.department_id is required for department distribution');
    const { rows: deptRows } = await pool.query(
      `SELECT name FROM departments WHERE id = $1 AND school_id = $2`,
      [departmentId, schoolId]
    );
    if (!deptRows.length) throw new Error('Department not found');
    const { rows } = await pool.query(
      `SELECT t.id FROM department_teachers dt
       JOIN teachers t ON t.id = dt.teacher_id
       WHERE dt.department_id = $1 AND dt.school_id = $2 AND t.status = 'Active'`,
      [departmentId, schoolId]
    );
    return { teacherIds: rows.map(r => r.id), audienceLabel: `${deptRows[0].name.toUpperCase()} DEPARTMENT` };
  }

  if (distributionType === 'responsibility') {
    const responsibilityId = distributionRef?.responsibility_id;
    if (!responsibilityId) throw new Error('distribution_ref.responsibility_id is required for responsibility distribution');
    const { rows: respRows } = await pool.query(
      `SELECT name FROM teacher_responsibilities WHERE id = $1 AND school_id = $2`,
      [responsibilityId, schoolId]
    );
    if (!respRows.length) throw new Error('Responsibility not found');
    const { rows } = await pool.query(
      `SELECT t.id FROM teacher_responsibility_assignments tra
       JOIN teachers t ON t.id = tra.teacher_id
       WHERE tra.responsibility_id = $1 AND tra.school_id = $2 AND t.status = 'Active'`,
      [responsibilityId, schoolId]
    );
    return { teacherIds: rows.map(r => r.id), audienceLabel: `ALL ${respRows[0].name.toUpperCase()}` };
  }

  if (distributionType === 'specific') {
    const teacherIds = distributionRef?.teacher_ids;
    if (!Array.isArray(teacherIds) || !teacherIds.length)
      throw new Error('distribution_ref.teacher_ids must be a non-empty array for specific distribution');
    const { rows } = await pool.query(
      `SELECT id, name FROM teachers WHERE id = ANY($1::uuid[]) AND school_id = $2 AND status = 'Active'`,
      [teacherIds, schoolId]
    );
    if (!rows.length) throw new Error('No valid active teachers found in the specific distribution list');
    const audienceLabel = rows.length <= 5
      ? rows.map(r => r.name).join(', ').toUpperCase()
      : 'SELECTED STAFF';
    return { teacherIds: rows.map(r => r.id), audienceLabel };
  }

  throw new Error('Invalid distribution_type');
}

// Inserts memo_recipients rows and fans out one notifications row per
// recipient — notifications (not teacher_notifications), confirmed in the
// design doc as the table TeacherShell's bell icon actually polls.
async function fanOutMemo({ memoId, schoolId, teacherIds, subject }) {
  if (!teacherIds.length) return;
  await pool.query(
    `INSERT INTO memo_recipients (memo_id, teacher_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [memoId, teacherIds]
  );
  await pool.query(
    `INSERT INTO notifications (school_id, user_id, user_type, message, link)
     SELECT $1, unnest($2::uuid[]), 'teacher', $3, $4`,
    [schoolId, teacherIds, `New memo: ${subject}`, `/teacher/memos/${memoId}`]
  );
}

// Emails each recipient, matching the existing notification.service.js pattern
// used for attendance/profile events (in-app + email, not in-app alone).
// Fire-and-forget from the caller — never awaited before responding, same
// reasoning as generateMemoPdf below: this can be slow for a large staff list
// and must not risk outlasting the frontend's request timeout. sendTeacherEmail
// already no-ops per-recipient on a missing email/API key and never throws.
async function emailMemoRecipients(schoolId, teacherIds, memo) {
  if (!teacherIds.length) return;
  const { rows } = await pool.query(
    `SELECT name, email FROM teachers WHERE id = ANY($1::uuid[]) AND email IS NOT NULL`,
    [teacherIds]
  );
  const subjectLine = `New Memo: ${memo.subject}`;
  for (const t of rows) {
    const fromLine = memo.issued_by_name
      ? ` by ${memo.issued_by_name}${memo.issued_by_title ? `, ${memo.issued_by_title}` : ''}`
      : '';
    const body = `Dear ${t.name},\n\nA new memo has been issued${fromLine}.\n\n` +
      `${memo.ref_number ? `Ref: ${memo.ref_number}\n` : ''}To: ${memo.audience_label}\nSubject: ${memo.subject}\n\n${memo.body}\n\n` +
      `Log in to the staff portal to view this memo and its signed PDF copy.\n\n— CAS Administration`;
    sendTeacherEmail(t.email, subjectLine, body).catch(e => {
      console.error('[memos] email failed for', t.email, e.message);
    });
  }
}

// Generates the memo's PDF and saves pdf_url on the row. Called automatically
// the moment a memo becomes 'issued' (direct issue or finalize) — unlike
// general_letters/discipline, a memo has no approval step and no watermark
// distinction, so there's no reason to make an admin trigger this by hand;
// recipients should be able to open a PDF the instant they're notified.
// POST /:id/pdf below stays as a manual re-generate path.
async function generateMemoPdf(memo, schoolId) {
  const { rows: sRows } = await pool.query(
    `SELECT name, address, phone, email, motto, letterhead_url FROM schools WHERE id = $1`,
    [schoolId]
  );
  const school = sRows[0];
  const pdfUrl = await generateAndUploadPDF({
    letter: memo,
    school,
    recipientType: 'staff',
    letterKind: 'memo',
    watermark: false,
    pathPrefix: `memos/${schoolId}`,
  });
  await pool.query(`UPDATE memos SET pdf_url = $1, updated_at = now() WHERE id = $2`, [pdfUrl, memo.id]);
  return pdfUrl;
}

// ── issued_by_title default resolution ──────────────────────────────────────
// Must be defined before /:id to avoid Express matching this as an id.
// GET /api/memos/issued-by-title-default
router.get('/issued-by-title-default', adminOrManagement, async (req, res, next) => {
  try {
    const { rows: tRows } = await pool.query(
      `SELECT management_role FROM teachers WHERE id = $1`,
      [req.user.id]
    );
    const managementRole = tRows[0]?.management_role;
    if (managementRole) {
      return res.json({ title: roleLabel(managementRole), source: 'management_role' });
    }
    const { rows: mRows } = await pool.query(
      `SELECT issued_by_title FROM memos
       WHERE issued_by_id = $1 AND school_id = $2 AND issued_by_title IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, req.schoolId]
    );
    if (mRows.length) return res.json({ title: mRows[0].issued_by_title, source: 'last_used' });
    res.json({ title: null, source: null });
  } catch (err) { next(err); }
});

// GET /api/memos
router.get('/', adminOrManagement, async (req, res, next) => {
  try {
    // Exclude in-progress AI drafts (status='draft') from the default listing,
    // same convention as general_letters.
    const { rows } = await pool.query(
      `SELECT m.id, m.ref_number, m.distribution_type, m.audience_label,
              m.subject, m.issued_date::text, m.status, m.pdf_url,
              m.issued_by_name, m.issued_by_title, m.created_at,
              (SELECT COUNT(*)::int FROM memo_recipients mr WHERE mr.memo_id = m.id) AS recipient_count,
              (SELECT COUNT(*)::int FROM memo_recipients mr WHERE mr.memo_id = m.id AND mr.read_at IS NOT NULL) AS read_count
       FROM memos m
       WHERE m.school_id = $1 AND m.status != 'draft'
       ORDER BY m.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/memos
// Pass status:'draft' (with no body) to pre-create a shell record for the AI
// drafting flow. Distribution is resolved and frozen immediately either way —
// an admin picks the audience before drafting starts, same moment
// general_letters freezes its recipient fields.
router.post('/', adminOrManagement, async (req, res, next) => {
  try {
    const {
      distribution_type, distribution_ref,
      issued_by_title, subject, body, issued_date,
      status: requestedStatus,
    } = req.body;

    const savingAsDraft = requestedStatus === 'draft';

    if (!VALID_DISTRIBUTION_TYPES.includes(distribution_type))
      return res.status(400).json({ error: 'Invalid distribution_type' });
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!savingAsDraft && !body?.trim()) return res.status(400).json({ error: 'body is required' });

    let resolved;
    try {
      resolved = await resolveDistribution(req.schoolId, distribution_type, distribution_ref);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const { issued_by_id, issued_by_name } = await resolveIssuedBy(req);

    let ref_number = null;
    if (!savingAsDraft) ref_number = await generateMemoRefNumber(req.schoolId);
    const computed_status = savingAsDraft ? 'draft' : 'issued';
    // Default to today when a memo is actually being issued and no explicit
    // date was given — general_letters' "always has a date" behavior turned
    // out to come entirely from its frontend form defaulting to today, not
    // any backend guarantee (its column is NOT NULL, so an omitted date there
    // would 500, not silently succeed). memos.issued_date is nullable, so
    // without this it would silently print a blank date on an issued memo —
    // worse than general_letters' failure mode, not equivalent to it. A draft
    // deliberately does NOT get a date yet — it isn't issued until finalize.
    const resolvedIssuedDate = savingAsDraft ? (issued_date || null) : (issued_date || new Date().toISOString().slice(0, 10));

    const { rows } = await pool.query(
      `INSERT INTO memos (
         school_id, issued_by_id, issued_by_name, issued_by_title,
         distribution_type, distribution_ref, audience_label,
         subject, body, issued_date, ref_number, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *, issued_date::text`,
      [
        req.schoolId, issued_by_id, issued_by_name, issued_by_title?.trim() || null,
        distribution_type, JSON.stringify(distribution_ref ?? null), resolved.audienceLabel,
        subject.trim(), (body?.trim() || ''), resolvedIssuedDate, ref_number, computed_status,
      ]
    );
    const memo = rows[0];

    if (!savingAsDraft) {
      await fanOutMemo({ memoId: memo.id, schoolId: req.schoolId, teacherIds: resolved.teacherIds, subject: memo.subject });
      emailMemoRecipients(req.schoolId, resolved.teacherIds, memo).catch(e => {
        console.error('[memos] email fan-out failed:', e.message);
      });
      // Fire-and-forget: PDF generation (Puppeteer render + upload) is slow
      // enough to exceed the frontend's request timeout, which would make the
      // client show an error for a request that actually succeeded server-side
      // — never await it before responding. Non-fatal either way; the memo
      // itself, its recipients, and notifications are already fully saved.
      generateMemoPdf(memo, req.schoolId).catch(e => {
        console.error('[memos] PDF generation failed for', memo.id, e.message);
      });
    }

    res.status(201).json(memo);
  } catch (err) { next(err); }
});

// PATCH /api/memos/:id/finalize — finalizes an AI-drafted memo.
// Generates ref_number, sets body, transitions draft -> issued, fans out.
// Must be defined before /:id to avoid Express matching 'finalize' as an id.
router.patch('/:id/finalize', adminOrManagement, async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });

    const { rows: existing } = await pool.query(
      `SELECT * FROM memos WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Memo not found' });
    const draft = existing[0];
    if (draft.status !== 'draft') {
      return res.status(400).json({ error: 'Memo is not a draft' });
    }

    const ref_number = await generateMemoRefNumber(req.schoolId);
    // A draft created via POST / with status:'draft' never got an issued_date
    // (see POST / above) — finalize is this memo's actual issue moment, so
    // set it now if it's still unset. COALESCE, not overwrite: if the intake
    // form (next phase) ever lets an issuer pick a specific date up front,
    // that choice is preserved rather than clobbered here.
    const { rows } = await pool.query(
      `UPDATE memos
       SET body = $1, ref_number = $2, status = 'issued', updated_at = now(),
           issued_date = COALESCE(issued_date, CURRENT_DATE)
       WHERE id = $3 AND school_id = $4
       RETURNING *, issued_date::text`,
      [body.trim(), ref_number, req.params.id, req.schoolId]
    );
    const memo = rows[0];

    let resolved;
    try {
      resolved = await resolveDistribution(req.schoolId, memo.distribution_type, memo.distribution_ref);
    } catch (e) {
      // Distribution was valid at creation time; if membership changed such
      // that it no longer resolves (e.g. department deleted since), issue the
      // memo with zero recipients rather than failing the finalize outright —
      // the memo record itself, ref number, and PDF are still valid.
      resolved = { teacherIds: [] };
    }
    await fanOutMemo({ memoId: memo.id, schoolId: req.schoolId, teacherIds: resolved.teacherIds, subject: memo.subject });
    emailMemoRecipients(req.schoolId, resolved.teacherIds, memo).catch(e => {
      console.error('[memos] email fan-out failed:', e.message);
    });
    // Fire-and-forget — see the matching comment in POST / above: this must
    // not block the response, or a slow render can outlast the frontend's
    // request timeout and make a successful finalize look like a failure.
    generateMemoPdf(memo, req.schoolId).catch(e => {
      console.error('[memos] PDF generation failed for', memo.id, e.message);
    });

    res.json(memo);
  } catch (err) { next(err); }
});

// POST /api/memos/:id/pdf — manual re-generate (PDF is already generated
// automatically at issue time; this is for the rare case that failed).
// Must be registered before GET /:id to prevent Express matching 'pdf' as an id.
router.post('/:id/pdf', adminOrManagement, async (req, res, next) => {
  try {
    const { rows: mRows } = await pool.query(
      `SELECT *, issued_date::text FROM memos WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Memo not found' });

    const pdfUrl = await generateMemoPdf(mRows[0], req.schoolId);
    res.json({ pdf_url: pdfUrl });
  } catch (err) { next(err); }
});

// GET /api/memos/mine — teacher-facing memo list. No adminOrManagement: any
// authenticated teacher may call this, scoped to memos they're actually a
// recipient of. Must be defined before /:id.
router.get('/mine', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { rows } = await pool.query(
      `SELECT m.id, m.ref_number, m.subject, m.audience_label, m.issued_date::text,
              m.issued_by_name, m.issued_by_title, m.pdf_url, m.created_at,
              mr.read_at
       FROM memo_recipients mr
       JOIN memos m ON m.id = mr.memo_id
       WHERE mr.teacher_id = $1 AND m.school_id = $2
       ORDER BY m.created_at DESC`,
      [req.user.id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PATCH /api/memos/:id/read — teacher marks a memo as read (idempotent — a
// re-open never overwrites the original read_at). Must be before /:id.
router.patch('/:id/read', async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Teacher access only' });
    }
    const { rows } = await pool.query(
      `UPDATE memo_recipients SET read_at = COALESCE(read_at, now())
       WHERE memo_id = $1 AND teacher_id = $2
       RETURNING read_at`,
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not a recipient of this memo' });
    res.json({ read_at: rows[0].read_at });
  } catch (err) { next(err); }
});

// GET /api/memos/:id — admin/management see any memo in their school;
// a teacher may see one only if they're an actual recipient of it (checked
// against memo_recipients, not inferred from role).
router.get('/:id', async (req, res, next) => {
  try {
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'super_admin' || req.user?.type === 'management';

    const { rows } = await pool.query(
      `SELECT m.*, m.issued_date::text,
              (SELECT COUNT(*)::int FROM memo_recipients mr WHERE mr.memo_id = m.id) AS recipient_count,
              (SELECT COUNT(*)::int FROM memo_recipients mr WHERE mr.memo_id = m.id AND mr.read_at IS NOT NULL) AS read_count
       FROM memos m WHERE m.id = $1 AND m.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Memo not found' });

    if (!isStaff) {
      const { rows: recRows } = await pool.query(
        `SELECT 1 FROM memo_recipients WHERE memo_id = $1 AND teacher_id = $2`,
        [req.params.id, req.user.id]
      );
      if (!recRows.length) return res.status(403).json({ error: 'Not authorized to view this memo' });
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
