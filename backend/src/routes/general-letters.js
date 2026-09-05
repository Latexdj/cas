'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, managementOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// Admin (role: admin | super_admin) OR management (type: management) may issue letters.
// This is checked on every route except approve, which is management-only.
function adminOrManagement(req, res, next) {
  const role = req.user?.role;
  const type = req.user?.type;
  if (role !== 'admin' && role !== 'super_admin' && type !== 'management') {
    return res.status(403).json({ error: 'Admin or management access required' });
  }
  next();
}

const VALID_CLASSIFICATIONS = ['parent_communication', 'external_official', 'internal_administrative', 'other'];
const VALID_RECIPIENT_TYPES  = ['student', 'teacher', 'parent', 'external'];

function computeRequiresApproval(classification, is_sensitive) {
  return classification === 'external_official' || is_sensitive === true;
}

async function generateRefNumber(schoolId) {
  const { rows } = await pool.query(
    `UPDATE schools SET letter_ref_counter = letter_ref_counter + 1
     WHERE id = $1
     RETURNING letter_ref_counter, letter_ref_prefix, headmaster_signature_url`,
    [schoolId]
  );
  const { letter_ref_counter, letter_ref_prefix, headmaster_signature_url } = rows[0];
  const year = new Date().getFullYear();
  const seq  = String(letter_ref_counter).padStart(4, '0');
  const ref  = letter_ref_prefix ? `${letter_ref_prefix}/GL/${year}/${seq}` : `GL/${year}/${seq}`;
  return { ref_number: ref, signature_url: headmaster_signature_url || null };
}

async function resolveIssuedBy(req) {
  if (req.user?.type === 'management') {
    return { issued_by_id: null, issued_by_name: req.user?.name ?? req.user?.email ?? 'Management' };
  }
  const id = req.user?.id ?? null;
  if (!id) return { issued_by_id: null, issued_by_name: '' };
  const { rows } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [id]);
  return { issued_by_id: id, issued_by_name: rows[0]?.name ?? '' };
}

// ─── EXTERNAL CONTACTS ────────────────────────────────────────────────────────
// Must be defined BEFORE /:id routes to avoid Express matching 'contacts' as an id.

// GET /api/general-letters/contacts
router.get('/contacts', adminOrManagement, async (req, res, next) => {
  try {
    const { q } = req.query;
    const params = [req.schoolId];
    let extra = '';
    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      extra = ` AND (name ILIKE $${params.length} OR organization ILIKE $${params.length})`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, organization, address, created_at
       FROM external_contacts
       WHERE school_id = $1${extra}
       ORDER BY name ASC
       LIMIT 60`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/general-letters/contacts
router.post('/contacts', adminOrManagement, async (req, res, next) => {
  try {
    const { name, organization, address } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { issued_by_id } = await resolveIssuedBy(req);
    const { rows } = await pool.query(
      `INSERT INTO external_contacts (school_id, name, organization, address, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.schoolId, name.trim(), organization?.trim() || null, address?.trim() || null, issued_by_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ─── GENERAL LETTERS ──────────────────────────────────────────────────────────

// GET /api/general-letters
router.get('/', adminOrManagement, async (req, res, next) => {
  try {
    const { status, classification } = req.query;
    const params = [req.schoolId];
    const clauses = [];
    if (status)         { params.push(status);         clauses.push(`gl.status = $${params.length}`); }
    if (classification) { params.push(classification); clauses.push(`gl.classification = $${params.length}`); }
    const where = clauses.length ? ' AND ' + clauses.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT gl.id, gl.ref_number, gl.classification, gl.recipient_type,
              gl.ext_recipient_name, gl.ext_recipient_org,
              gl.internal_recipient_id, gl.internal_recipient_table,
              gl.subject, gl.is_sensitive, gl.issued_date, gl.status,
              gl.requires_approval, gl.approved_by_name, gl.approved_at,
              gl.issued_by_name, gl.created_at
       FROM general_letters gl
       WHERE gl.school_id = $1${where}
       ORDER BY gl.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/general-letters
router.post('/', adminOrManagement, async (req, res, next) => {
  try {
    const {
      classification, recipient_type,
      internal_recipient_id, internal_recipient_table,
      ext_recipient_name, ext_recipient_org, ext_recipient_address,
      subject, body, is_sensitive, issued_date, academic_year_id,
    } = req.body;

    if (!VALID_CLASSIFICATIONS.includes(classification))
      return res.status(400).json({ error: 'Invalid classification' });
    if (!VALID_RECIPIENT_TYPES.includes(recipient_type))
      return res.status(400).json({ error: 'Invalid recipient_type' });
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!body?.trim())    return res.status(400).json({ error: 'body is required' });

    if (recipient_type === 'external' || recipient_type === 'parent') {
      if (!ext_recipient_name?.trim())
        return res.status(400).json({ error: 'ext_recipient_name is required for external/parent recipients' });
    } else {
      // student or teacher — verify FK in this school
      if (!internal_recipient_id || !internal_recipient_table)
        return res.status(400).json({ error: 'internal_recipient_id and internal_recipient_table are required' });
      if (!['students', 'teachers'].includes(internal_recipient_table))
        return res.status(400).json({ error: 'internal_recipient_table must be students or teachers' });
      const tbl = internal_recipient_table === 'students' ? 'students' : 'teachers';
      const { rows: recRows } = await pool.query(
        `SELECT id FROM ${tbl} WHERE id = $1 AND school_id = $2`,
        [internal_recipient_id, req.schoolId]
      );
      if (!recRows.length) return res.status(404).json({ error: 'Recipient not found in this school' });
    }

    const { issued_by_id, issued_by_name } = await resolveIssuedBy(req);
    const sensitive = is_sensitive === true || is_sensitive === 'true';
    const requires_approval = computeRequiresApproval(classification, sensitive);
    const computed_status = requires_approval ? 'pending_approval' : 'issued';
    const { ref_number, signature_url } = await generateRefNumber(req.schoolId);

    const { rows } = await pool.query(
      `INSERT INTO general_letters (
         school_id, issued_by_id, issued_by_name, issued_by_signature_url,
         classification, recipient_type,
         internal_recipient_id, internal_recipient_table,
         ext_recipient_name, ext_recipient_org, ext_recipient_address,
         subject, body, is_sensitive, issued_date, academic_year_id,
         ref_number, status, requires_approval
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18, $19
       ) RETURNING *`,
      [
        req.schoolId, issued_by_id, issued_by_name, signature_url,
        classification, recipient_type,
        internal_recipient_id || null, internal_recipient_table || null,
        ext_recipient_name?.trim() || null, ext_recipient_org?.trim() || null, ext_recipient_address?.trim() || null,
        subject.trim(), body.trim(), sensitive,
        issued_date || null, academic_year_id || null,
        ref_number, computed_status, requires_approval,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/general-letters/:id
router.get('/:id', adminOrManagement, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM general_letters WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/general-letters/:id/approve  — management only
router.patch('/:id/approve', managementOnly, async (req, res, next) => {
  try {
    const approver_name = req.user?.name ?? req.user?.email ?? 'Management';
    const { rows } = await pool.query(
      `UPDATE general_letters
       SET status = 'issued', approved_by_name = $1, approved_at = now(), updated_at = now()
       WHERE id = $2 AND school_id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [approver_name, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Letter not found or not pending approval' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
