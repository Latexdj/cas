'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { generateAndUploadPDF } = require('../services/pdf.service');

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
              (SELECT COUNT(*)::int FROM memo_recipients mr WHERE mr.memo_id = m.id) AS recipient_count
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
        subject.trim(), (body?.trim() || ''), issued_date || null, ref_number, computed_status,
      ]
    );
    const memo = rows[0];

    if (!savingAsDraft) {
      await fanOutMemo({ memoId: memo.id, schoolId: req.schoolId, teacherIds: resolved.teacherIds, subject: memo.subject });
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

    const { rows } = await pool.query(
      `UPDATE memos
       SET body = $1, ref_number = $2, status = 'issued', updated_at = now()
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

    res.json(memo);
  } catch (err) { next(err); }
});

// POST /api/memos/:id/pdf — generate (or re-generate) PDF.
// Must be registered before GET /:id to prevent Express matching 'pdf' as an id.
router.post('/:id/pdf', adminOrManagement, async (req, res, next) => {
  try {
    const { rows: mRows } = await pool.query(
      `SELECT *, issued_date::text FROM memos WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!mRows.length) return res.status(404).json({ error: 'Memo not found' });
    const memo = mRows[0];

    const { rows: sRows } = await pool.query(
      `SELECT name, address, phone, email, motto, letterhead_url FROM schools WHERE id = $1`,
      [req.schoolId]
    );
    const school = sRows[0];

    const pdfUrl = await generateAndUploadPDF({
      letter: memo,
      school,
      recipientType: 'staff',
      letterKind: 'memo',
      watermark: false,
      pathPrefix: `memos/${req.schoolId}`,
    });

    await pool.query(`UPDATE memos SET pdf_url = $1, updated_at = now() WHERE id = $2`, [pdfUrl, memo.id]);

    res.json({ pdf_url: pdfUrl });
  } catch (err) { next(err); }
});

// GET /api/memos/:id
router.get('/:id', adminOrManagement, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, issued_date::text FROM memos WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Memo not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
