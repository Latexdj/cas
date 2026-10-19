'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { clinicStaffOnly } = require('./clinic');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('clinic'));

const ITEM_SELECT = `
  SELECT id, name, category, unit, quantity_on_hand, reorder_level,
         batch_number, expiry_date::text, notes, is_active, created_at, updated_at,
         (quantity_on_hand <= reorder_level) AS is_low_stock
  FROM clinic_inventory_items
`;

function dispensedByFields(req) {
  return {
    staffId: req.user.role === 'staff' ? req.user.id : null,
    teacherId: (req.user.role === 'teacher' || req.user.role === 'admin') ? req.user.id : null,
  };
}

// ── Items ─────────────────────────────────────────────────────────────────────

router.get('/items', clinicStaffOnly, async (req, res, next) => {
  try {
    const { active_only } = req.query;
    const conditions = ['school_id = $1'];
    const params = [req.schoolId];
    if (active_only === 'true') conditions.push('is_active = true');
    const { rows } = await pool.query(
      `${ITEM_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', clinicStaffOnly, async (req, res, next) => {
  try {
    const { name, category, unit, reorder_level, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO clinic_inventory_items (school_id, name, category, unit, reorder_level, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.schoolId, name.trim(), category ?? 'medication', unit ?? 'unit', reorder_level ?? 0, notes ?? null]
    );
    const { rows: full } = await pool.query(`${ITEM_SELECT} WHERE id = $1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An item with this name already exists' });
    next(err);
  }
});

router.put('/items/:id', clinicStaffOnly, async (req, res, next) => {
  try {
    const { name, category, unit, reorder_level, notes, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE clinic_inventory_items SET
         name = COALESCE($1, name), category = COALESCE($2, category), unit = COALESCE($3, unit),
         reorder_level = COALESCE($4, reorder_level), notes = $5,
         is_active = COALESCE($6, is_active), updated_at = now()
       WHERE id = $7 AND school_id = $8
       RETURNING id`,
      [name?.trim() ?? null, category ?? null, unit ?? null, reorder_level ?? null,
       notes ?? null, is_active ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    const { rows: full } = await pool.query(`${ITEM_SELECT} WHERE id = $1`, [rows[0].id]);
    res.json(full[0]);
  } catch (err) { next(err); }
});

router.delete('/items/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows: txnRows } = await pool.query(
      `SELECT 1 FROM clinic_inventory_transactions WHERE item_id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (txnRows.length) {
      return res.status(400).json({ error: 'This item has dispensing history and cannot be deleted. Disable it instead.' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM clinic_inventory_items WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Stock movements ───────────────────────────────────────────────────────────

router.post('/items/:id/restock', clinicStaffOnly, async (req, res, next) => {
  try {
    const { quantity, batch_number, expiry_date, notes } = req.body;
    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });

    const { rows } = await pool.query(
      `UPDATE clinic_inventory_items
       SET quantity_on_hand = quantity_on_hand + $1,
           batch_number = COALESCE($2, batch_number),
           expiry_date = COALESCE($3, expiry_date),
           updated_at = now()
       WHERE id = $4 AND school_id = $5
       RETURNING id, quantity_on_hand`,
      [qty, batch_number ?? null, expiry_date ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });

    const { staffId, teacherId } = dispensedByFields(req);
    await pool.query(
      `INSERT INTO clinic_inventory_transactions
         (school_id, item_id, type, quantity, dispensed_by_staff_id, dispensed_by_teacher_id, notes)
       VALUES ($1,$2,'restock',$3,$4,$5,$6)`,
      [req.schoolId, req.params.id, qty, staffId, teacherId, notes ?? null]
    );
    const { rows: full } = await pool.query(`${ITEM_SELECT} WHERE id = $1`, [req.params.id]);
    res.json(full[0]);
  } catch (err) { next(err); }
});

router.post('/items/:id/dispense', clinicStaffOnly, async (req, res, next) => {
  try {
    const { quantity, clinic_visit_id, notes } = req.body;
    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
    if (!clinic_visit_id) return res.status(400).json({ error: 'clinic_visit_id is required' });

    const { rows: visitRows } = await pool.query(
      `SELECT id FROM clinic_visits WHERE id = $1 AND school_id = $2`,
      [clinic_visit_id, req.schoolId]
    );
    if (!visitRows.length) return res.status(404).json({ error: 'Clinic visit not found' });

    const { rows } = await pool.query(
      `UPDATE clinic_inventory_items
       SET quantity_on_hand = quantity_on_hand - $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 AND quantity_on_hand >= $1
       RETURNING id, quantity_on_hand`,
      [qty, req.params.id, req.schoolId]
    );
    if (!rows.length) {
      const { rows: exists } = await pool.query(`SELECT 1 FROM clinic_inventory_items WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
      if (!exists.length) return res.status(404).json({ error: 'Item not found' });
      return res.status(409).json({ error: 'Not enough stock on hand for this quantity' });
    }

    const { staffId, teacherId } = dispensedByFields(req);
    const { rows: txn } = await pool.query(
      `INSERT INTO clinic_inventory_transactions
         (school_id, item_id, type, quantity, clinic_visit_id, dispensed_by_staff_id, dispensed_by_teacher_id, notes)
       VALUES ($1,$2,'dispensed',$3,$4,$5,$6,$7) RETURNING id`,
      [req.schoolId, req.params.id, qty, clinic_visit_id, staffId, teacherId, notes ?? null]
    );
    res.status(201).json({ transaction_id: txn[0].id, quantity_on_hand: rows[0].quantity_on_hand });
  } catch (err) { next(err); }
});

router.post('/items/:id/write-off', clinicStaffOnly, async (req, res, next) => {
  try {
    const { quantity, notes } = req.body;
    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
    if (!notes?.trim()) return res.status(400).json({ error: 'A reason is required to write off stock' });

    const { rows } = await pool.query(
      `UPDATE clinic_inventory_items
       SET quantity_on_hand = quantity_on_hand - $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 AND quantity_on_hand >= $1
       RETURNING id, quantity_on_hand`,
      [qty, req.params.id, req.schoolId]
    );
    if (!rows.length) {
      const { rows: exists } = await pool.query(`SELECT 1 FROM clinic_inventory_items WHERE id = $1 AND school_id = $2`, [req.params.id, req.schoolId]);
      if (!exists.length) return res.status(404).json({ error: 'Item not found' });
      return res.status(409).json({ error: 'Not enough stock on hand for this quantity' });
    }

    const { staffId, teacherId } = dispensedByFields(req);
    await pool.query(
      `INSERT INTO clinic_inventory_transactions
         (school_id, item_id, type, quantity, dispensed_by_staff_id, dispensed_by_teacher_id, notes)
       VALUES ($1,$2,'written_off',$3,$4,$5,$6)`,
      [req.schoolId, req.params.id, qty, staffId, teacherId, notes.trim()]
    );
    const { rows: full } = await pool.query(`${ITEM_SELECT} WHERE id = $1`, [req.params.id]);
    res.json(full[0]);
  } catch (err) { next(err); }
});

// ── Transactions / visit lines ────────────────────────────────────────────────

router.get('/visits/:visitId/dispensed', clinicStaffOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.quantity, t.notes, t.created_at, i.name AS item_name, i.unit
       FROM clinic_inventory_transactions t
       JOIN clinic_inventory_items i ON i.id = t.item_id
       WHERE t.clinic_visit_id = $1 AND t.school_id = $2 AND t.type = 'dispensed'
       ORDER BY t.created_at`,
      [req.params.visitId, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/transactions', clinicStaffOnly, async (req, res, next) => {
  try {
    const { item_id, type, date_from, date_to } = req.query;
    const conditions = ['t.school_id = $1'];
    const params = [req.schoolId];
    if (item_id) { params.push(item_id); conditions.push(`t.item_id = $${params.length}`); }
    if (type) { params.push(type); conditions.push(`t.type = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`t.created_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`t.created_at <= $${params.length}::date + interval '1 day'`); }
    const { rows } = await pool.query(
      `SELECT t.id, t.type, t.quantity, t.notes, t.created_at,
              i.name AS item_name, i.unit,
              COALESCE(dt.name, dss.name) AS dispensed_by_name,
              CASE WHEN v.patient_type = 'student' THEN ps.name ELSE pt.name END AS patient_name
       FROM clinic_inventory_transactions t
       JOIN clinic_inventory_items i ON i.id = t.item_id
       LEFT JOIN teachers dt ON dt.id = t.dispensed_by_teacher_id
       LEFT JOIN school_staff dss ON dss.id = t.dispensed_by_staff_id
       LEFT JOIN clinic_visits v ON v.id = t.clinic_visit_id
       LEFT JOIN students ps ON ps.id = v.student_id
       LEFT JOIN teachers pt ON pt.id = v.teacher_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/low-stock', clinicStaffOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${ITEM_SELECT} WHERE school_id = $1 AND is_active = true AND quantity_on_hand <= reorder_level ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/expiring', clinicStaffOnly, async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 30;
    const { rows } = await pool.query(
      `${ITEM_SELECT} WHERE school_id = $1 AND is_active = true AND expiry_date IS NOT NULL
       AND expiry_date <= CURRENT_DATE + ($2 || ' days')::interval ORDER BY expiry_date`,
      [req.schoolId, days]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Admin reports ──────────────────────────────────────────────────────────────

router.get('/report', adminOnly, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ['t.school_id = $1'];
    const params = [req.schoolId];
    if (date_from) { params.push(date_from); conditions.push(`t.created_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`t.created_at <= $${params.length}::date + interval '1 day'`); }
    const { rows } = await pool.query(
      `SELECT i.name AS item_name, t.type, SUM(t.quantity)::int AS total_quantity
       FROM clinic_inventory_transactions t
       JOIN clinic_inventory_items i ON i.id = t.item_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY i.name, t.type
       ORDER BY i.name, t.type`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/report/export', adminOnly, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = ['t.school_id = $1'];
    const params = [req.schoolId];
    if (date_from) { params.push(date_from); conditions.push(`t.created_at >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`t.created_at <= $${params.length}::date + interval '1 day'`); }
    const { rows } = await pool.query(
      `SELECT t.created_at, i.name AS item_name, t.type, t.quantity,
              CASE WHEN v.patient_type = 'student' THEN ps.name ELSE pt.name END AS patient_name,
              COALESCE(dt.name, dss.name) AS dispensed_by, t.notes
       FROM clinic_inventory_transactions t
       JOIN clinic_inventory_items i ON i.id = t.item_id
       LEFT JOIN clinic_visits v ON v.id = t.clinic_visit_id
       LEFT JOIN students ps ON ps.id = v.student_id
       LEFT JOIN teachers pt ON pt.id = v.teacher_id
       LEFT JOIN teachers dt ON dt.id = t.dispensed_by_teacher_id
       LEFT JOIN school_staff dss ON dss.id = t.dispensed_by_staff_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
