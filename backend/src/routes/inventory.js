'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

async function inventoryStaffOnly(req, res, next) {
  try {
    const role = req.user?.role;
    if (role === 'admin' || role === 'super_admin') return next();
    if (role === 'teacher') {
      const { rows } = await pool.query(
        `SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id = $1 AND tr.school_id = $2 AND tr.module_key = 'inventory'`,
        [req.user.id, req.schoolId]
      );
      if (rows.length) return next();
    }
    return res.status(403).json({ error: 'Inventory staff access only' });
  } catch (err) { next(err); }
}
router.use(inventoryStaffOnly);

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const [totalsRow, issuedRow, damagedRow, txnRow] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_items,
                COALESCE(SUM(quantity_total),0)::int AS total_units,
                COALESCE(SUM(quantity_available),0)::int AS available_units
         FROM inventory_items WHERE school_id = $1 AND condition != 'Written Off'`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS items_with_issued
         FROM inventory_items
         WHERE school_id = $1 AND quantity_available < quantity_total AND condition != 'Written Off'`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS damaged_items
         FROM inventory_items WHERE school_id = $1 AND condition = 'Damaged'`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS transactions_today
         FROM inventory_transactions WHERE school_id = $1 AND created_at::date = CURRENT_DATE`,
        [req.schoolId]
      ),
    ]);
    res.json({
      ...totalsRow.rows[0],
      ...issuedRow.rows[0],
      ...damagedRow.rows[0],
      ...txnRow.rows[0],
    });
  } catch (err) { next(err); }
});

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(i.id)::int AS item_count
       FROM inventory_categories c
       LEFT JOIN inventory_items i ON i.category_id = c.id
       WHERE c.school_id = $1
       GROUP BY c.id ORDER BY c.name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/categories', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name is required' });
    const { rows } = await pool.query(
      `INSERT INTO inventory_categories (school_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.schoolId, name.trim(), description?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/categories/:id', async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name is required' });
    const { rows } = await pool.query(
      `UPDATE inventory_categories SET name=$1, description=$2
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [name.trim(), description?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const { rows: items } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE category_id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (items[0].cnt > 0) {
      return res.status(400).json({ error: `Cannot delete — ${items[0].cnt} item(s) use this category. Reassign or delete them first.` });
    }
    const { rows } = await pool.query(
      `DELETE FROM inventory_categories WHERE id=$1 AND school_id=$2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted' });
  } catch (err) { next(err); }
});

// ── Items ─────────────────────────────────────────────────────────────────────

router.get('/items', async (req, res, next) => {
  try {
    const { search, category_id, condition, item_type } = req.query;
    const conditions = ['i.school_id = $1'];
    const params = [req.schoolId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(i.name ILIKE $${params.length} OR i.serial_number ILIKE $${params.length} OR i.asset_tag ILIKE $${params.length})`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`i.category_id = $${params.length}`);
    }
    if (condition) {
      params.push(condition);
      conditions.push(`i.condition = $${params.length}`);
    }
    if (item_type) {
      params.push(item_type);
      conditions.push(`i.item_type = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT i.*, c.name AS category_name
       FROM inventory_items i
       LEFT JOIN inventory_categories c ON c.id = i.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const { name, item_type, category_id, description, serial_number, asset_tag,
            quantity, condition, location, acquired_date, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });
    const qty = parseInt(quantity) || 1;
    const { rows } = await pool.query(
      `INSERT INTO inventory_items
         (school_id, category_id, name, item_type, description, serial_number, asset_tag,
          quantity_total, quantity_available, condition, location, acquired_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12)
       RETURNING *`,
      [req.schoolId, category_id || null, name.trim(), item_type || 'equipment',
       description?.trim() || null, serial_number?.trim() || null, asset_tag?.trim() || null,
       qty, condition || 'Good', location?.trim() || null,
       acquired_date || null, notes?.trim() || null]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id, item_id, type, quantity, notes, performed_by_id, performed_by_name)
       VALUES ($1,$2,'added',$3,$4,$5,$6)`,
      [req.schoolId, rows[0].id, qty, `Item added to inventory`, req.user.id, req.user.name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/items/:id', async (req, res, next) => {
  try {
    const { rows: item } = await pool.query(
      `SELECT i.*, c.name AS category_name
       FROM inventory_items i
       LEFT JOIN inventory_categories c ON c.id = i.category_id
       WHERE i.id = $1 AND i.school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });

    const { rows: transactions } = await pool.query(
      `SELECT * FROM inventory_transactions WHERE item_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ ...item[0], transactions });
  } catch (err) { next(err); }
});

router.put('/items/:id', async (req, res, next) => {
  try {
    const { name, item_type, category_id, description, serial_number, asset_tag,
            location, acquired_date, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });
    const { rows } = await pool.query(
      `UPDATE inventory_items
       SET name=$1, item_type=$2, category_id=$3, description=$4, serial_number=$5,
           asset_tag=$6, location=$7, acquired_date=$8, notes=$9, updated_at=now()
       WHERE id=$10 AND school_id=$11 RETURNING *`,
      [name.trim(), item_type || 'equipment', category_id || null,
       description?.trim() || null, serial_number?.trim() || null, asset_tag?.trim() || null,
       location?.trim() || null, acquired_date || null, notes?.trim() || null,
       req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM inventory_items WHERE id=$1 AND school_id=$2 RETURNING id`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

// ── Issue / Return / Condition updates ───────────────────────────────────────

router.post('/items/:id/issue', async (req, res, next) => {
  try {
    const { issued_to_name, issued_to_role, quantity, notes } = req.body;
    if (!issued_to_name?.trim()) return res.status(400).json({ error: 'Recipient name is required' });
    const qty = parseInt(quantity) || 1;

    const { rows: item } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    if (item[0].condition === 'Written Off') return res.status(400).json({ error: 'Cannot issue a written-off item' });
    if (item[0].quantity_available < qty) {
      return res.status(400).json({ error: `Only ${item[0].quantity_available} unit(s) available` });
    }

    const { rows: updated } = await pool.query(
      `UPDATE inventory_items
       SET quantity_available = quantity_available - $1, updated_at = now()
       WHERE id = $2 AND school_id = $3 RETURNING *`,
      [qty, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id, item_id, type, quantity, issued_to_name, issued_to_role, notes, performed_by_id, performed_by_name)
       VALUES ($1,$2,'issued',$3,$4,$5,$6,$7,$8)`,
      [req.schoolId, req.params.id, qty, issued_to_name.trim(),
       issued_to_role?.trim() || null, notes?.trim() || null, req.user.id, req.user.name]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.post('/items/:id/return', async (req, res, next) => {
  try {
    const { quantity, condition, notes } = req.body;
    const qty = parseInt(quantity) || 1;

    const { rows: item } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    const maxReturn = item[0].quantity_total - item[0].quantity_available;
    if (qty > maxReturn) {
      return res.status(400).json({ error: `Only ${maxReturn} unit(s) are currently issued` });
    }

    const newCondition = condition && ['Good', 'Damaged'].includes(condition) ? condition : item[0].condition;
    const { rows: updated } = await pool.query(
      `UPDATE inventory_items
       SET quantity_available = quantity_available + $1, condition = $2, updated_at = now()
       WHERE id = $3 AND school_id = $4 RETURNING *`,
      [qty, newCondition, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id, item_id, type, quantity, notes, performed_by_id, performed_by_name)
       VALUES ($1,$2,'returned',$3,$4,$5,$6)`,
      [req.schoolId, req.params.id, qty,
       notes?.trim() || null, req.user.id, req.user.name]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.post('/items/:id/condition', async (req, res, next) => {
  try {
    const { condition, notes } = req.body;
    const validConditions = ['Good', 'Damaged', 'Written Off'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ error: 'condition must be Good, Damaged, or Written Off' });
    }

    const txnType = condition === 'Written Off' ? 'written_off'
                  : condition === 'Damaged'     ? 'damaged'
                  : 'repaired';

    const { rows: updated } = await pool.query(
      `UPDATE inventory_items
       SET condition = $1,
           quantity_available = CASE WHEN $1 = 'Written Off' THEN 0 ELSE quantity_available END,
           updated_at = now()
       WHERE id = $2 AND school_id = $3 RETURNING *`,
      [condition, req.params.id, req.schoolId]
    );
    if (!updated.length) return res.status(404).json({ error: 'Item not found' });

    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id, item_id, type, quantity, notes, performed_by_id, performed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.schoolId, req.params.id, txnType, updated[0].quantity_total,
       notes?.trim() || null, req.user.id, req.user.name]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// ── Transaction log ───────────────────────────────────────────────────────────

router.get('/transactions', async (req, res, next) => {
  try {
    const { item_id, type, limit = 100, offset = 0 } = req.query;
    const conditions = ['t.school_id = $1'];
    const params = [req.schoolId];

    if (item_id) {
      params.push(item_id);
      conditions.push(`t.item_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`t.type = $${params.length}`);
    }

    params.push(parseInt(limit));
    params.push(parseInt(offset));

    const { rows } = await pool.query(
      `SELECT t.*, i.name AS item_name, i.item_type, c.name AS category_name
       FROM inventory_transactions t
       JOIN inventory_items i ON i.id = t.item_id
       LEFT JOIN inventory_categories c ON c.id = i.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
