'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

// ── Access control ─────────────────────────────────────────────────────────────
// Sets req.inventoryScope: 'all' | 'general' | 'department'
// Sets req.inventoryDeptId (UUID) when scope === 'department'
async function inventoryAccess(req, res, next) {
  try {
    const role = req.user?.role;

    if (role === 'admin' || role === 'super_admin') {
      req.inventoryScope = 'all'; return next();
    }

    if (role === 'teacher') {
      const { rows: resp } = await pool.query(
        `SELECT 1 FROM teacher_responsibility_assignments tra
         JOIN teacher_responsibilities tr ON tr.id = tra.responsibility_id
         WHERE tra.teacher_id=$1 AND tr.school_id=$2 AND tr.module_key='inventory'`,
        [req.user.id, req.schoolId]
      );
      if (resp.length) { req.inventoryScope = 'all'; return next(); }

      const { rows: dept } = await pool.query(
        `SELECT id FROM departments WHERE school_id=$1 AND head_teacher_id=$2`,
        [req.schoolId, req.user.id]
      );
      if (dept.length) {
        req.inventoryScope = 'department';
        req.inventoryDeptId = dept[0].id;
        return next();
      }
    }

    if (role === 'staff' && req.staffRoles?.includes('inventory')) {
      req.inventoryScope = 'general'; return next();
    }

    return res.status(403).json({ error: 'Inventory access denied' });
  } catch (err) { next(err); }
}

router.use(inventoryAccess);

// Append scope params to existing array, return SQL fragment (starts with 'AND ')
function appendScope(p, scope, deptId) {
  if (scope === 'general') {
    p.push('general');
    return `AND i.ownership_type = $${p.length}`;
  }
  if (scope === 'department') {
    p.push('departmental', deptId);
    return `AND i.ownership_type = $${p.length - 1} AND i.department_id = $${p.length}`;
  }
  return '';
}

// Verify caller can act on an item (by its ownership)
function checkItemScope(scope, deptId, item) {
  if (scope === 'all') return null;
  if (scope === 'general' && item.ownership_type !== 'general')
    return 'You can only manage general inventory items';
  if (scope === 'department' && (item.ownership_type !== 'departmental' || item.department_id !== deptId))
    return 'You can only manage items assigned to your department';
  return null;
}

// Auto-generate next asset tag (AST-0001 pattern)
async function nextAssetTag(schoolId) {
  const { rows } = await pool.query(
    `SELECT asset_tag FROM inventory_items WHERE school_id=$1 AND asset_tag ~ '^AST-[0-9]+$'
     ORDER BY LENGTH(asset_tag) DESC, asset_tag DESC LIMIT 1`,
    [schoolId]
  );
  const max = rows.length ? parseInt(rows[0].asset_tag.replace('AST-', '')) : 0;
  return `AST-${String(max + 1).padStart(4, '0')}`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const { inventoryScope: scope, inventoryDeptId: deptId, schoolId } = req;

    let scopeSql = '';
    let extraParams = [];
    if (scope === 'general')    { extraParams = ['general'];              scopeSql = `AND ownership_type = $2`; }
    if (scope === 'department') { extraParams = ['departmental', deptId]; scopeSql = `AND ownership_type = $2 AND department_id = $3`; }

    const [totalsRow, issuedRow, damagedRow, txnRow] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total_items, COALESCE(SUM(quantity_total),0)::int AS total_units, COALESCE(SUM(quantity_available),0)::int AS available_units FROM inventory_items WHERE school_id=$1 AND condition!='Written Off' ${scopeSql}`, [schoolId, ...extraParams]),
      pool.query(`SELECT COUNT(*)::int AS items_with_issued FROM inventory_items WHERE school_id=$1 AND quantity_available<quantity_total AND condition!='Written Off' ${scopeSql}`, [schoolId, ...extraParams]),
      pool.query(`SELECT COUNT(*)::int AS damaged_items FROM inventory_items WHERE school_id=$1 AND condition='Damaged' ${scopeSql}`, [schoolId, ...extraParams]),
      pool.query(`SELECT COUNT(*)::int AS transactions_today FROM inventory_transactions WHERE school_id=$1 AND created_at::date=CURRENT_DATE`, [schoolId]),
    ]);
    res.json({ ...totalsRow.rows[0], ...issuedRow.rows[0], ...damagedRow.rows[0], ...txnRow.rows[0] });
  } catch (err) { next(err); }
});

// ── Departments list (for dropdowns) ─────────────────────────────────────────
router.get('/departments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM departments WHERE school_id=$1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(i.id)::int AS item_count
       FROM inventory_categories c
       LEFT JOIN inventory_items i ON i.category_id = c.id
       WHERE c.school_id=$1
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
      `INSERT INTO inventory_categories (school_id, name, description) VALUES ($1,$2,$3) RETURNING *`,
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
      `UPDATE inventory_categories SET name=$1, description=$2 WHERE id=$3 AND school_id=$4 RETURNING *`,
      [name.trim(), description?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const { rows: items } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM inventory_items WHERE category_id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (items[0].cnt > 0)
      return res.status(400).json({ error: `Cannot delete — ${items[0].cnt} item(s) use this category` });
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
    const { search, category_id, condition, item_type, ownership_type } = req.query;
    const { inventoryScope: scope, inventoryDeptId: deptId } = req;

    const conditions = ['i.school_id = $1'];
    const params = [req.schoolId];

    const sf = appendScope(params, scope, deptId);
    if (sf) conditions.push(sf.replace(/^AND /, ''));
    // Admin can additionally filter by ownership_type
    if (scope === 'all' && ownership_type) {
      params.push(ownership_type);
      conditions.push(`i.ownership_type = $${params.length}`);
    }

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
      `SELECT i.*, c.name AS category_name, d.name AS department_name
       FROM inventory_items i
       LEFT JOIN inventory_categories c ON c.id = i.category_id
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/items', async (req, res, next) => {
  try {
    const { name, item_type, category_id, description, serial_number,
            asset_tag, quantity, condition, location, acquired_date, notes,
            ownership_type, department_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });

    const ownershipType = (['general', 'departmental'].includes(ownership_type)) ? ownership_type : 'general';
    const deptId = ownershipType === 'departmental' ? (department_id || null) : null;

    // Scope check: non-admin can only create within their scope
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, { ownership_type: ownershipType, department_id: deptId });
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    const tag = asset_tag?.trim() || await nextAssetTag(req.schoolId);
    const qty = parseInt(quantity) || 1;

    const { rows } = await pool.query(
      `INSERT INTO inventory_items
         (school_id, category_id, name, item_type, description, serial_number, asset_tag,
          quantity_total, quantity_available, condition, location, acquired_date, notes,
          ownership_type, department_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [req.schoolId, category_id || null, name.trim(), item_type || 'equipment',
       description?.trim() || null, serial_number?.trim() || null, tag, qty,
       condition || 'Good', location?.trim() || null, acquired_date || null,
       notes?.trim() || null, ownershipType, deptId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_name)
       VALUES ($1,$2,'added',$3,'Item added to inventory',$4,$5)`,
      [req.schoolId, rows[0].id, qty, req.user.id, req.user.name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/items/:id', async (req, res, next) => {
  try {
    const { rows: item } = await pool.query(
      `SELECT i.*, c.name AS category_name, d.name AS department_name
       FROM inventory_items i
       LEFT JOIN inventory_categories c ON c.id = i.category_id
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE i.id=$1 AND i.school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    const err = checkItemScope(req.inventoryScope, req.inventoryDeptId, item[0]);
    if (err) return res.status(403).json({ error: err });

    const { rows: transactions } = await pool.query(
      `SELECT * FROM inventory_transactions WHERE item_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ ...item[0], transactions });
  } catch (err) { next(err); }
});

router.put('/items/:id', async (req, res, next) => {
  try {
    const { name, item_type, category_id, description, serial_number, asset_tag,
            location, acquired_date, notes, ownership_type, department_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });

    const { rows: existing } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Item not found' });
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, existing[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    const ownershipType = (['general', 'departmental'].includes(ownership_type)) ? ownership_type : existing[0].ownership_type;
    const deptId = ownershipType === 'departmental' ? (department_id || null) : null;
    const tag = asset_tag?.trim() || existing[0].asset_tag || await nextAssetTag(req.schoolId);

    const { rows } = await pool.query(
      `UPDATE inventory_items
       SET name=$1, item_type=$2, category_id=$3, description=$4, serial_number=$5,
           asset_tag=$6, location=$7, acquired_date=$8, notes=$9, updated_at=now(),
           ownership_type=$10, department_id=$11
       WHERE id=$12 AND school_id=$13 RETURNING *`,
      [name.trim(), item_type || 'equipment', category_id || null,
       description?.trim() || null, serial_number?.trim() || null, tag,
       location?.trim() || null, acquired_date || null, notes?.trim() || null,
       ownershipType, deptId, req.params.id, req.schoolId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Item not found' });
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, existing[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    await pool.query(`DELETE FROM inventory_items WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

// ── Issue / Return / Condition ────────────────────────────────────────────────
router.post('/items/:id/issue', async (req, res, next) => {
  try {
    const { issued_to_name, issued_to_role, issued_to_type, student_id, quantity, notes } = req.body;
    if (!issued_to_name?.trim()) return res.status(400).json({ error: 'Recipient name is required' });
    const qty = parseInt(quantity) || 1;

    const { rows: item } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, item[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });
    if (item[0].condition === 'Written Off') return res.status(400).json({ error: 'Cannot issue a written-off item' });
    if (item[0].quantity_available < qty) return res.status(400).json({ error: `Only ${item[0].quantity_available} unit(s) available` });

    const { rows: updated } = await pool.query(
      `UPDATE inventory_items SET quantity_available=quantity_available-$1, updated_at=now()
       WHERE id=$2 AND school_id=$3 RETURNING *`,
      [qty, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id,item_id,type,quantity,issued_to_name,issued_to_role,issued_to_type,student_id,notes,performed_by_id,performed_by_name)
       VALUES ($1,$2,'issued',$3,$4,$5,$6,$7,$8,$9,$10)`,
      [req.schoolId, req.params.id, qty, issued_to_name.trim(),
       issued_to_role?.trim() || null,
       issued_to_type || 'staff',
       student_id || null,
       notes?.trim() || null, req.user.id, req.user.name]
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
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, item[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });
    const maxReturn = item[0].quantity_total - item[0].quantity_available;
    if (qty > maxReturn) return res.status(400).json({ error: `Only ${maxReturn} unit(s) currently issued` });

    const newCondition = condition && ['Good', 'Damaged'].includes(condition) ? condition : item[0].condition;
    const { rows: updated } = await pool.query(
      `UPDATE inventory_items SET quantity_available=quantity_available+$1, condition=$2, updated_at=now()
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [qty, newCondition, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_name)
       VALUES ($1,$2,'returned',$3,$4,$5,$6)`,
      [req.schoolId, req.params.id, qty, notes?.trim() || null, req.user.id, req.user.name]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

router.post('/items/:id/condition', async (req, res, next) => {
  try {
    const { condition, notes } = req.body;
    if (!['Good', 'Damaged', 'Written Off'].includes(condition))
      return res.status(400).json({ error: 'condition must be Good, Damaged, or Written Off' });

    const { rows: item } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, item[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    const txnType = condition === 'Written Off' ? 'written_off' : condition === 'Damaged' ? 'damaged' : 'repaired';
    const { rows: updated } = await pool.query(
      `UPDATE inventory_items
       SET condition=$1, quantity_available=CASE WHEN $1='Written Off' THEN 0 ELSE quantity_available END, updated_at=now()
       WHERE id=$2 AND school_id=$3 RETURNING *`,
      [condition, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.schoolId, req.params.id, txnType, updated[0].quantity_total, notes?.trim() || null, req.user.id, req.user.name]
    );
    res.json(updated[0]);
  } catch (err) { next(err); }
});

// ── Transaction log ───────────────────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { item_id, type, limit = 100, offset = 0 } = req.query;
    const { inventoryScope: scope, inventoryDeptId: deptId } = req;

    const conditions = ['t.school_id = $1'];
    const params = [req.schoolId];

    // Scope filter via JOIN on items
    if (scope === 'general') {
      conditions.push(`i.ownership_type = 'general'`);
    } else if (scope === 'department') {
      params.push('departmental', deptId);
      conditions.push(`i.ownership_type = $${params.length - 1} AND i.department_id = $${params.length}`);
    }

    if (item_id) { params.push(item_id); conditions.push(`t.item_id=$${params.length}`); }
    if (type)    { params.push(type);    conditions.push(`t.type=$${params.length}`); }

    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(
      `SELECT t.*, i.name AS item_name, i.item_type, i.ownership_type, c.name AS category_name
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

// ── Student lookup (for issue workflows) ─────────────────────────────────────
router.get('/students/:code', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name, picture_url
       FROM students WHERE school_id=$1 AND UPPER(student_code)=UPPER($2) AND status='Active'`,
      [req.schoolId, req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Management report (admin / full access only) ──────────────────────────────
router.get('/report', async (req, res, next) => {
  try {
    if (req.inventoryScope !== 'all')
      return res.status(403).json({ error: 'Report access requires admin or inventory manager role' });

    const { rows: summary } = await pool.query(
      `SELECT
         i.ownership_type,
         d.name AS department_name,
         COUNT(i.id)::int AS item_count,
         COALESCE(SUM(i.quantity_total),0)::int AS total_units,
         COALESCE(SUM(i.quantity_available),0)::int AS available_units,
         COALESCE(SUM(i.quantity_total - i.quantity_available) FILTER (WHERE i.condition!='Written Off'),0)::int AS units_issued,
         COUNT(i.id) FILTER (WHERE i.condition='Good')::int AS good_count,
         COUNT(i.id) FILTER (WHERE i.condition='Damaged')::int AS damaged_count,
         COUNT(i.id) FILTER (WHERE i.condition='Written Off')::int AS written_off_count
       FROM inventory_items i
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE i.school_id=$1
       GROUP BY i.ownership_type, d.name
       ORDER BY i.ownership_type DESC, COALESCE(d.name,'') ASC`,
      [req.schoolId]
    );

    const { rows: totals } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_items,
         COALESCE(SUM(quantity_total),0)::int AS total_units,
         COALESCE(SUM(quantity_available),0)::int AS available_units,
         COUNT(*) FILTER (WHERE condition='Good')::int AS good_count,
         COUNT(*) FILTER (WHERE condition='Damaged')::int AS damaged_count,
         COUNT(*) FILTER (WHERE condition='Written Off')::int AS written_off_count
       FROM inventory_items WHERE school_id=$1`,
      [req.schoolId]
    );

    res.json({ summary, totals: totals[0] });
  } catch (err) { next(err); }
});

module.exports = router;
