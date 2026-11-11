'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const crypto = require('crypto');
const { uploadFile, deleteFile } = require('../services/storage.service');

router.use(authenticate, requireActiveSubscription, checkModuleAccess('inventory'));

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
        `SELECT id FROM departments WHERE school_id=$1 AND head_teacher_id=$2 ORDER BY name`,
        [req.schoolId, req.user.id]
      );
      if (dept.length) {
        const requestedId = req.query.dept_id || req.body?.dept_id;
        const selected = requestedId ? (dept.find(r => r.id === requestedId) ?? dept[0]) : dept[0];
        req.inventoryScope = 'department';
        req.inventoryDeptId = selected.id;
        return next();
      }
    }

    if (role === 'staff' && req.staffRoles?.includes('inventory')) {
      req.inventoryScope = 'general'; return next();
    }

    // 'stores' — full access, same scope as admin (general + departmental).
    // Distinct from the limited 'inventory' role above (general items only).
    if (role === 'staff' && req.staffRoles?.includes('stores')) {
      req.inventoryScope = 'all'; return next();
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

// performed_by_id is FK'd to teachers(id); a 'stores'-role school_staff
// account's id lives in school_staff instead, so it goes in the separate
// performed_by_staff_id column — returns [performed_by_id, performed_by_staff_id].
function performedBy(req) {
  return req.user?.role === 'staff' ? [null, req.user.id] : [req.user.id, null];
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
            ownership_type, department_id, is_returnable } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });

    const ownershipType = (['general', 'departmental'].includes(ownership_type)) ? ownership_type : 'general';
    const deptId = ownershipType === 'departmental' ? (department_id || null) : null;
    const returnable = is_returnable === true || is_returnable === 'true';

    // Scope check: non-admin can only create within their scope
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, { ownership_type: ownershipType, department_id: deptId });
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    const tag = asset_tag?.trim() || await nextAssetTag(req.schoolId);
    const qty = parseInt(quantity) || 1;

    const { rows } = await pool.query(
      `INSERT INTO inventory_items
         (school_id, category_id, name, item_type, description, serial_number, asset_tag,
          quantity_total, quantity_available, condition, location, acquired_date, notes,
          ownership_type, department_id, is_returnable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [req.schoolId, category_id || null, name.trim(), item_type || 'equipment',
       description?.trim() || null, serial_number?.trim() || null, tag, qty,
       condition || 'Good', location?.trim() || null, acquired_date || null,
       notes?.trim() || null, ownershipType, deptId, returnable]
    );
    await pool.query(
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,'added',$3,'Item added to inventory',$4,$5,$6)`,
      [req.schoolId, rows[0].id, qty, ...performedBy(req), req.user.name]
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
            location, acquired_date, notes, ownership_type, department_id, is_returnable } = req.body;
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
    const returnable = is_returnable === undefined ? existing[0].is_returnable : (is_returnable === true || is_returnable === 'true');

    const { rows } = await pool.query(
      `UPDATE inventory_items
       SET name=$1, item_type=$2, category_id=$3, description=$4, serial_number=$5,
           asset_tag=$6, location=$7, acquired_date=$8, notes=$9, updated_at=now(),
           ownership_type=$10, department_id=$11, is_returnable=$12
       WHERE id=$13 AND school_id=$14 RETURNING *`,
      [name.trim(), item_type || 'equipment', category_id || null,
       description?.trim() || null, serial_number?.trim() || null, tag,
       location?.trim() || null, acquired_date || null, notes?.trim() || null,
       ownershipType, deptId, returnable, req.params.id, req.schoolId]
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

    const { rows: activeLoans } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM inventory_loans WHERE item_id=$1 AND status='active'`,
      [req.params.id]
    );
    if (activeLoans[0].cnt > 0) {
      return res.status(400).json({ error: `Cannot delete: ${activeLoans[0].cnt} active loan(s) use this item. Record their return first.` });
    }

    try {
      await pool.query(`DELETE FROM inventory_items WHERE id=$1 AND school_id=$2`, [req.params.id, req.schoolId]);
    } catch (delErr) {
      // item_id on inventory_loans is ON DELETE RESTRICT — an item with only
      // returned (closed) loan history still blocks deletion, by design,
      // same as a library book that's ever circulated.
      if (delErr.code === '23503') {
        return res.status(400).json({ error: 'This item has loan or bulk-issue history, so it cannot be deleted. Write it off instead.' });
      }
      throw delErr;
    }
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
});

// ── Issue / Return / Condition ────────────────────────────────────────────────
router.post('/items/:id/issue', async (req, res, next) => {
  try {
    const { issued_to_name, issued_to_role, issued_to_type, student_id, teacher_id, due_date, quantity, notes } = req.body;
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

    // A returnable item (test books, tablets, drawing boards — anything
    // expected back) must be issued to a named student or teacher so a
    // loan can be tracked; a non-returnable consumable keeps today's
    // behavior unchanged (free-text staff/department recipient, no loan).
    if (item[0].is_returnable) {
      if (!['student', 'teacher'].includes(issued_to_type)) {
        return res.status(400).json({ error: 'Returnable items can only be issued to a student or teacher' });
      }
      if (issued_to_type === 'student' && !student_id) return res.status(400).json({ error: 'student_id is required' });
      if (issued_to_type === 'teacher' && !teacher_id) return res.status(400).json({ error: 'teacher_id is required' });
    }

    const { rows: updated } = await pool.query(
      `UPDATE inventory_items SET quantity_available=quantity_available-$1, updated_at=now()
       WHERE id=$2 AND school_id=$3 RETURNING *`,
      [qty, req.params.id, req.schoolId]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id,item_id,type,quantity,issued_to_name,issued_to_role,issued_to_type,student_id,teacher_id,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,'issued',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [req.schoolId, req.params.id, qty, issued_to_name.trim(),
       issued_to_role?.trim() || null,
       issued_to_type || 'staff',
       student_id || null, teacher_id || null,
       notes?.trim() || null, ...performedBy(req), req.user.name]
    );

    let loan = null;
    if (item[0].is_returnable) {
      const [issuedByTeacherId, issuedBySchoolStaffId] = performedBy(req);
      const { rows: loanRows } = await pool.query(
        `INSERT INTO inventory_loans
           (school_id,item_id,quantity,borrower_type,student_id,teacher_id,borrower_name,borrower_detail,
            due_date,notes,issued_by_teacher_id,issued_by_school_staff_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [req.schoolId, req.params.id, qty, issued_to_type, student_id || null, teacher_id || null,
         issued_to_name.trim(), issued_to_role?.trim() || null,
         due_date || null, notes?.trim() || null, issuedByTeacherId, issuedBySchoolStaffId]
      );
      loan = loanRows[0];
    }

    res.json({ ...updated[0], loan });
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
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,'returned',$3,$4,$5,$6,$7)`,
      [req.schoolId, req.params.id, qty, notes?.trim() || null, ...performedBy(req), req.user.name]
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
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.schoolId, req.params.id, txnType, updated[0].quantity_total, notes?.trim() || null, ...performedBy(req), req.user.name]
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

// ── Student / teacher lookup (for issue + loan-return workflows) ─────────────
// Exact-code lookup (not search) — the caller already knows who they're
// looking for (issuing to them, or finding their outstanding loans to
// return one), same convention library.js's own student-code lookup uses.
router.get('/students/:code', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name, picture_url
       FROM students WHERE school_id=$1 AND UPPER(student_code)=UPPER($2) AND status='Active'`,
      [req.schoolId, req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const loanParams = [rows[0].id, req.schoolId];
    const loanScope = appendScope(loanParams, req.inventoryScope, req.inventoryDeptId);
    const { rows: loans } = await pool.query(
      `SELECT l.id, l.quantity, l.issued_at, l.due_date, l.notes,
              (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE)::boolean AS is_overdue,
              i.name AS item_name, i.asset_tag
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       WHERE l.student_id=$1 AND l.school_id=$2 AND l.status='active' ${loanScope}
       ORDER BY l.due_date ASC NULLS LAST`,
      loanParams
    );
    res.json({ ...rows[0], loans });
  } catch (err) { next(err); }
});

// Debounced search (Issue flow — browsing for a teacher borrower, same
// shape as clinic.js's /teachers/search). Must be registered BEFORE
// /teachers/:code below — Express matches routes in registration order,
// so a wildcard :code param would otherwise swallow the literal "search"
// path segment and this route would be unreachable.
router.get('/teachers/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department
       FROM teachers WHERE school_id=$1 AND status='Active'
         AND (name ILIKE $2 OR teacher_code ILIKE $2)
       ORDER BY name LIMIT 15`,
      [req.schoolId, `%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/teachers/:code', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, teacher_code, department
       FROM teachers WHERE school_id=$1 AND UPPER(teacher_code)=UPPER($2) AND status='Active'`,
      [req.schoolId, req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Teacher not found' });
    const loanParams = [rows[0].id, req.schoolId];
    const loanScope = appendScope(loanParams, req.inventoryScope, req.inventoryDeptId);
    const { rows: loans } = await pool.query(
      `SELECT l.id, l.quantity, l.issued_at, l.due_date, l.notes,
              (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE)::boolean AS is_overdue,
              i.name AS item_name, i.asset_tag
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       WHERE l.teacher_id=$1 AND l.school_id=$2 AND l.status='active' ${loanScope}
       ORDER BY l.due_date ASC NULLS LAST`,
      loanParams
    );
    res.json({ ...rows[0], loans });
  } catch (err) { next(err); }
});

// ── Loans (returnable items) ─────────────────────────────────────────────────
router.get('/loans/active', async (req, res, next) => {
  try {
    const { search, overdue_only, item_id } = req.query;
    const { inventoryScope: scope, inventoryDeptId: deptId } = req;
    const conditions = [`l.school_id=$1`, `l.status='active'`];
    const params = [req.schoolId];
    if (scope === 'general') {
      conditions.push(`i.ownership_type='general'`);
    } else if (scope === 'department') {
      params.push('departmental', deptId);
      conditions.push(`i.ownership_type=$${params.length - 1} AND i.department_id=$${params.length}`);
    }
    if (item_id) { params.push(item_id); conditions.push(`l.item_id=$${params.length}`); }
    if (overdue_only === 'true') conditions.push(`l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE`);
    if (search) { params.push(`%${search}%`); conditions.push(`(l.borrower_name ILIKE $${params.length} OR i.name ILIKE $${params.length})`); }

    const { rows } = await pool.query(
      `SELECT l.*, i.name AS item_name, i.asset_tag,
              (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE)::boolean AS is_overdue
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY (l.due_date IS NULL), l.due_date ASC, l.issued_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/loans/:id/return', async (req, res, next) => {
  try {
    const { condition_on_return, notes } = req.body;
    const { rows: loanRows } = await pool.query(
      `SELECT l.*, i.quantity_total, i.quantity_available, i.ownership_type, i.department_id
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       WHERE l.id=$1 AND l.school_id=$2 AND l.status='active'`,
      [req.params.id, req.schoolId]
    );
    if (!loanRows.length) return res.status(404).json({ error: 'Active loan not found' });
    const loan = loanRows[0];
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, loan);
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    // Written Off has side effects (zeroing availability) that belong in
    // the dedicated /items/:id/condition route, not a loan return.
    const newCondition = ['Good', 'Damaged'].includes(condition_on_return) ? condition_on_return : null;

    const { rows: updatedItem } = await pool.query(
      `UPDATE inventory_items
       SET quantity_available = LEAST(quantity_total, quantity_available + $1),
           condition = COALESCE($2, condition), updated_at = now()
       WHERE id=$3 AND school_id=$4 RETURNING *`,
      [loan.quantity, newCondition, loan.item_id, req.schoolId]
    );
    const { rows: updatedLoan } = await pool.query(
      `UPDATE inventory_loans SET status='returned', returned_at=now(),
              condition_on_return=$1, notes=COALESCE($2, notes)
       WHERE id=$3 RETURNING *`,
      [newCondition, notes?.trim() || null, loan.id]
    );
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id,item_id,type,quantity,issued_to_name,issued_to_type,student_id,teacher_id,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,'returned',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [req.schoolId, loan.item_id, loan.quantity, loan.borrower_name, loan.borrower_type,
       loan.student_id, loan.teacher_id, notes?.trim() || null, ...performedBy(req), req.user.name]
    );
    res.json({ item: updatedItem[0], loan: updatedLoan[0] });
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
         COALESCE(SUM(i.quantity_total), 0)::int AS total_units,
         COALESCE(SUM(i.quantity_available), 0)::int AS available_units,
         COALESCE(SUM(CASE WHEN i.condition != 'Written Off' THEN i.quantity_total - i.quantity_available ELSE 0 END), 0)::int AS units_issued,
         COALESCE(SUM(CASE WHEN i.condition = 'Good'         THEN 1 ELSE 0 END), 0)::int AS good_count,
         COALESCE(SUM(CASE WHEN i.condition = 'Damaged'      THEN 1 ELSE 0 END), 0)::int AS damaged_count,
         COALESCE(SUM(CASE WHEN i.condition = 'Written Off'  THEN 1 ELSE 0 END), 0)::int AS written_off_count
       FROM inventory_items i
       LEFT JOIN departments d ON d.id = i.department_id
       WHERE i.school_id = $1
       GROUP BY i.ownership_type, d.name
       ORDER BY i.ownership_type DESC, COALESCE(d.name, '') ASC`,
      [req.schoolId]
    );

    const { rows: totals } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_items,
         COALESCE(SUM(quantity_total), 0)::int AS total_units,
         COALESCE(SUM(quantity_available), 0)::int AS available_units,
         COALESCE(SUM(CASE WHEN condition = 'Good'        THEN 1 ELSE 0 END), 0)::int AS good_count,
         COALESCE(SUM(CASE WHEN condition = 'Damaged'     THEN 1 ELSE 0 END), 0)::int AS damaged_count,
         COALESCE(SUM(CASE WHEN condition = 'Written Off' THEN 1 ELSE 0 END), 0)::int AS written_off_count
       FROM inventory_items WHERE school_id = $1`,
      [req.schoolId]
    );

    res.json({ summary, totals: totals[0] });
  } catch (err) { next(err); }
});

// ── Sign List: available filter options ───────────────────────────────────────
router.get('/sign-list/filters', async (req, res, next) => {
  try {
    const [classesR, programsR, deptsR, yearsR] = await Promise.allSettled([
      pool.query(
        `SELECT DISTINCT class_name FROM students WHERE school_id=$1 AND status='Active' ORDER BY class_name`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT id, name FROM programs WHERE school_id=$1 ORDER BY name`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT id, name FROM departments WHERE school_id=$1 ORDER BY name`,
        [req.schoolId]
      ),
      pool.query(
        `SELECT DISTINCT year_of_admission AS year
         FROM students WHERE school_id=$1 AND status='Active' AND year_of_admission IS NOT NULL
         ORDER BY year DESC`,
        [req.schoolId]
      ),
    ]);
    res.json({
      classes:     classesR.status === 'fulfilled' ? classesR.value.rows.map(r => r.class_name) : [],
      programs:    programsR.status === 'fulfilled' ? programsR.value.rows : [],
      departments: deptsR.status === 'fulfilled' ? deptsR.value.rows : [],
      years:       yearsR.status === 'fulfilled' ? yearsR.value.rows.map(r => r.year).filter(Boolean) : [],
    });
  } catch (err) { next(err); }
});

// ── Sign List: recipient list ─────────────────────────────────────────────────
router.get('/sign-list/recipients', async (req, res, next) => {
  try {
    const { recipient_type, class_name, program_id, gender, residential_status, department_id, year_of_admission } = req.query;

    if (!recipient_type || !['students', 'teachers'].includes(recipient_type)) {
      return res.status(400).json({ error: 'recipient_type must be "students" or "teachers"' });
    }

    const { rows: schRows } = await pool.query(
      `SELECT name, address, logo_url FROM schools WHERE id=$1`,
      [req.schoolId]
    );
    const school = schRows[0] ?? {};

    if (recipient_type === 'students') {
      const params = [req.schoolId];
      const conditions = [`s.school_id=$1`, `s.status='Active'`];

      if (class_name)         { params.push(class_name);         conditions.push(`s.class_name=$${params.length}`); }
      if (program_id)         { params.push(program_id);         conditions.push(`s.program_id=$${params.length}`); }
      if (gender)             { params.push(gender);             conditions.push(`s.gender=$${params.length}`); }
      if (residential_status) { params.push(residential_status); conditions.push(`s.residential_status=$${params.length}`); }
      if (year_of_admission)  { params.push(parseInt(year_of_admission)); conditions.push(`s.year_of_admission=$${params.length}`); }

      const { rows } = await pool.query(
        `SELECT s.id, s.name, s.student_code, s.class_name, s.gender, s.residential_status,
                s.jhs_index_number, p.name AS program_name
         FROM students s
         LEFT JOIN programs p ON p.id=s.program_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.class_name, s.name`,
        params
      );
      return res.json({ recipients: rows, school, total: rows.length });
    }

    // Teachers
    const params = [req.schoolId];
    const conditions = [`t.school_id=$1`, `t.status='Active'`];

    if (gender)        { params.push(gender);        conditions.push(`t.gender=$${params.length}`); }
    if (department_id) { params.push(department_id); conditions.push(`d.id=$${params.length}`); }

    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.teacher_code, t.gender, t.department, d.id AS dept_id, d.name AS dept_name
       FROM teachers t
       LEFT JOIN departments d ON d.school_id=t.school_id AND LOWER(d.name)=LOWER(t.department)
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.name`,
      params
    );
    return res.json({ recipients: rows, school, total: rows.length });
  } catch (err) { next(err); }
});

// ── Bulk issue records ───────────────────────────────────────────────────────
// One record per bulk issue (e.g. 2 exercise books each to Form 1A). Stock is
// deducted once, each recipient gets their own 'issued' transaction (and a
// loan, for returnable items), and the signed sheet is attached for audit.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_LIST_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const SIGNED_LIST_MAX_BYTES = 15 * 1024 * 1024;

function httpErr(status, message) {
  const e = new Error(message); e.status = status; e.expose = true; return e;
}
function sendErr(res, next, err) {
  if (err.expose) return res.status(err.status).json({ error: err.message });
  return next(err);
}

async function resolveRecipients(db, schoolId, type, ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw httpErr(400, 'Select at least one recipient');
  const unique = [...new Set(ids)];
  if (!unique.every(id => typeof id === 'string' && UUID_RE.test(id))) throw httpErr(400, 'Invalid recipient list');
  if (unique.length > 5000) throw httpErr(400, 'Too many recipients in one issue (max 5000)');
  const { rows } = type === 'student'
    ? await db.query(
        `SELECT id, name, student_code AS code, class_name AS detail
         FROM students WHERE school_id=$1 AND status='Active' AND id = ANY($2::uuid[])`,
        [schoolId, unique])
    : await db.query(
        `SELECT id, name, teacher_code AS code, department AS detail
         FROM teachers WHERE school_id=$1 AND status='Active' AND id = ANY($2::uuid[])`,
        [schoolId, unique]);
  if (rows.length !== unique.length) {
    throw httpErr(400, `${unique.length - rows.length} selected ${type === 'student' ? 'student(s)' : 'teacher(s)'} could not be found or are no longer active`);
  }
  return rows;
}

// Writes one 'issued' transaction per recipient (plus a loan per recipient
// for returnable items) in two set-based inserts, so 1000 students is two
// queries, not 2000.
async function recordBatchIssues(db, req, { item, batch, recipients }) {
  const ids     = recipients.map(r => r.id);
  const names   = recipients.map(r => r.name);
  const details = recipients.map(r => r.detail ?? null);
  const codes   = recipients.map(r => r.code ?? null);
  const [byTeacher, byStaff] = performedBy(req);

  await db.query(
    `INSERT INTO inventory_transactions
       (school_id, item_id, type, quantity, issued_to_name, issued_to_role, issued_to_type,
        student_id, teacher_id, notes, performed_by_id, performed_by_staff_id, performed_by_name, batch_id)
     SELECT $1, $2, 'issued', $3, r.name, r.detail, $4::text,
            CASE WHEN $4::text = 'student' THEN r.id END,
            CASE WHEN $4::text = 'teacher' THEN r.id END,
            $5, $6, $7, $8, $9
     FROM unnest($10::uuid[], $11::text[], $12::text[]) AS r(id, name, detail)`,
    [req.schoolId, item.id, batch.qty_per_person, batch.recipient_type,
     batch.title, byTeacher, byStaff, req.user.name, batch.id,
     ids, names, details]
  );

  if (item.is_returnable) {
    await db.query(
      `INSERT INTO inventory_loans
         (school_id, item_id, quantity, borrower_type, student_id, teacher_id,
          borrower_name, borrower_detail, due_date, notes,
          issued_by_teacher_id, issued_by_school_staff_id, batch_id)
       SELECT $1, $2, $3, $4::text,
              CASE WHEN $4::text = 'student' THEN r.id END,
              CASE WHEN $4::text = 'teacher' THEN r.id END,
              r.name, NULLIF(CONCAT_WS(' · ', r.code, r.detail), ''), $5, $6, $7, $8, $9
       FROM unnest($10::uuid[], $11::text[], $12::text[], $13::text[]) AS r(id, name, code, detail)`,
      [req.schoolId, item.id, batch.qty_per_person, batch.recipient_type,
       batch.due_date, batch.title, byTeacher, byStaff, batch.id,
       ids, names, codes, details]
    );
  }
}

async function loadScopedBatch(db, req, id, { lock = false } = {}) {
  if (!UUID_RE.test(id)) throw httpErr(404, 'Issue record not found');
  const { rows } = await db.query(
    `SELECT b.*, i.name AS item_name, i.asset_tag, i.is_returnable,
            i.ownership_type, i.department_id
     FROM inventory_issue_batches b JOIN inventory_items i ON i.id = b.item_id
     WHERE b.id=$1 AND b.school_id=$2 ${lock ? 'FOR UPDATE OF b' : ''}`,
    [id, req.schoolId]
  );
  if (!rows.length) throw httpErr(404, 'Issue record not found');
  const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, rows[0]);
  if (scopeErr) throw httpErr(403, scopeErr);
  return rows[0];
}

router.post('/batches', async (req, res, next) => {
  const { item_id, title, recipient_type, recipient_ids, qty_per_person,
          due_date, notes, filters, filter_label } = req.body;
  const client = await pool.connect();
  try {
    if (!title?.trim()) throw httpErr(400, 'Enter a title, for example "Exercise Books for Form 1A, Term 1"');
    if (!['student', 'teacher'].includes(recipient_type)) throw httpErr(400, 'recipient_type must be "student" or "teacher"');
    if (typeof item_id !== 'string' || !UUID_RE.test(item_id)) throw httpErr(400, 'Select an item');
    const qty = parseInt(qty_per_person);
    if (!qty || qty < 1) throw httpErr(400, 'Quantity per person must be at least 1');

    await client.query('BEGIN');
    const { rows: itemRows } = await client.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2 FOR UPDATE`,
      [item_id, req.schoolId]
    );
    if (!itemRows.length) throw httpErr(404, 'Item not found');
    const item = itemRows[0];
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, item);
    if (scopeErr) throw httpErr(403, scopeErr);
    if (item.condition === 'Written Off') throw httpErr(400, 'Cannot issue a written-off item');

    const recipients = await resolveRecipients(client, req.schoolId, recipient_type, recipient_ids);
    const total = recipients.length * qty;
    if (item.quantity_available < total) {
      throw httpErr(400, `Not enough stock: ${recipients.length} × ${qty} = ${total} needed, only ${item.quantity_available} available`);
    }

    const [byTeacher, byStaff] = performedBy(req);
    const { rows: batchRows } = await client.query(
      `INSERT INTO inventory_issue_batches
         (school_id, item_id, title, recipient_type, qty_per_person, recipient_count, total_quantity,
          filters, filter_label, due_date, notes, created_by_teacher_id, created_by_school_staff_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.schoolId, item.id, title.trim(), recipient_type, qty, recipients.length, total,
       JSON.stringify(filters && typeof filters === 'object' ? filters : {}),
       filter_label?.trim() || null,
       item.is_returnable ? (due_date || null) : null,
       notes?.trim() || null, byTeacher, byStaff, req.user.name]
    );
    const batch = batchRows[0];

    await recordBatchIssues(client, req, { item, batch, recipients });
    await client.query(
      `UPDATE inventory_items SET quantity_available = quantity_available - $1, updated_at = now() WHERE id=$2`,
      [total, item.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...batch, item_name: item.name, is_returnable: item.is_returnable });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendErr(res, next, err);
  } finally { client.release(); }
});

router.get('/batches', async (req, res, next) => {
  try {
    const { item_id, search } = req.query;
    const params = [req.schoolId];
    const conditions = [`b.school_id=$1`];
    const sf = appendScope(params, req.inventoryScope, req.inventoryDeptId);
    if (sf) conditions.push(sf.replace(/^AND /, ''));
    if (item_id && UUID_RE.test(item_id)) { params.push(item_id); conditions.push(`b.item_id=$${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(b.title ILIKE $${params.length} OR i.name ILIKE $${params.length} OR b.filter_label ILIKE $${params.length})`);
    }
    const { rows } = await pool.query(
      `SELECT b.id, b.title, b.recipient_type, b.qty_per_person, b.recipient_count, b.total_quantity,
              b.filter_label, b.due_date, b.issued_at, b.created_by_name,
              b.signed_list_url, b.signed_list_filename, b.signed_list_mime, b.signed_list_uploaded_at,
              i.name AS item_name, i.asset_tag, i.is_returnable
       FROM inventory_issue_batches b JOIN inventory_items i ON i.id = b.item_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.issued_at DESC LIMIT 300`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/batches/:id', async (req, res, next) => {
  try {
    const batch = await loadScopedBatch(pool, req, req.params.id);
    const [{ rows: recipients }, { rows: schRows }] = await Promise.all([
      pool.query(
        `SELECT t.id AS transaction_id, t.created_at, t.issued_to_name AS name, t.quantity,
                COALESCE(t.student_id, t.teacher_id) AS person_id,
                s.student_code, s.class_name, s.residential_status,
                te.teacher_code, te.department,
                (t.created_at > $2::timestamptz + interval '2 minutes') AS added_later
         FROM inventory_transactions t
         LEFT JOIN students s  ON s.id  = t.student_id
         LEFT JOIN teachers te ON te.id = t.teacher_id
         WHERE t.batch_id=$1 AND t.type='issued'
         ORDER BY s.class_name NULLS LAST, t.issued_to_name`,
        [batch.id, batch.issued_at]
      ),
      pool.query(`SELECT name, address, logo_url FROM schools WHERE id=$1`, [req.schoolId]),
    ]);
    res.json({ ...batch, recipients, school: schRows[0] ?? {} });
  } catch (err) { sendErr(res, next, err); }
});

// Late collectors — people who were absent on the day and collect later.
router.post('/batches/:id/recipients', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batch = await loadScopedBatch(client, req, req.params.id, { lock: true });
    const { rows: itemRows } = await client.query(
      `SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE`, [batch.item_id]
    );
    const item = itemRows[0];
    if (item.condition === 'Written Off') throw httpErr(400, 'This item has been written off');

    const { rows: existing } = await client.query(
      `SELECT COALESCE(student_id, teacher_id) AS person_id FROM inventory_transactions
       WHERE batch_id=$1 AND type='issued'`,
      [batch.id]
    );
    const already = new Set(existing.map(r => r.person_id));
    const requested = Array.isArray(req.body.recipient_ids) ? req.body.recipient_ids : [];
    const fresh = [...new Set(requested)].filter(id => !already.has(id));
    if (!fresh.length) throw httpErr(400, 'Everyone selected has already received this item in this record');

    const recipients = await resolveRecipients(client, req.schoolId, batch.recipient_type, fresh);
    const total = recipients.length * batch.qty_per_person;
    if (item.quantity_available < total) {
      throw httpErr(400, `Not enough stock: ${total} needed, only ${item.quantity_available} available`);
    }

    await recordBatchIssues(client, req, { item, batch, recipients });
    await client.query(
      `UPDATE inventory_items SET quantity_available = quantity_available - $1, updated_at = now() WHERE id=$2`,
      [total, item.id]
    );
    const { rows: updated } = await client.query(
      `UPDATE inventory_issue_batches
       SET recipient_count = recipient_count + $1, total_quantity = total_quantity + $2
       WHERE id=$3 RETURNING *`,
      [recipients.length, total, batch.id]
    );
    await client.query('COMMIT');
    res.json({ ...updated[0], added: recipients.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendErr(res, next, err);
  } finally { client.release(); }
});

// Upload (or replace) the signed sheet — a phone photo or scanned PDF.
router.put('/batches/:id/signed-list', async (req, res, next) => {
  try {
    const batch = await loadScopedBatch(pool, req, req.params.id);
    const { file_data, filename } = req.body;
    const m = typeof file_data === 'string' ? file_data.match(/^data:([^;]+);base64,(.+)$/) : null;
    if (!m) throw httpErr(400, 'Attach the signed sheet as a PDF or image');
    const mime = m[1].toLowerCase();
    if (!SIGNED_LIST_MIMES.includes(mime)) throw httpErr(400, 'Only PDF, JPG, PNG or WebP files are accepted');
    if (Math.floor(m[2].length * 3 / 4) > SIGNED_LIST_MAX_BYTES) throw httpErr(400, 'File is too large (max 15 MB)');

    const safeName = String(filename || 'signed-list').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    const path = `inventory-signed-lists/${req.schoolId}/${batch.id}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
    const url = await uploadFile(file_data, path);

    const { rows } = await pool.query(
      `UPDATE inventory_issue_batches
       SET signed_list_url=$1, signed_list_path=$2, signed_list_filename=$3, signed_list_mime=$4,
           signed_list_uploaded_at=now(), signed_list_uploaded_by=$5
       WHERE id=$6 RETURNING *`,
      [url, path, safeName, mime, req.user.name, batch.id]
    );
    if (batch.signed_list_path) {
      deleteFile(batch.signed_list_path).catch(e => console.error('[inventory] old signed list delete failed:', e.message));
    }
    res.json(rows[0]);
  } catch (err) { sendErr(res, next, err); }
});

router.delete('/batches/:id/signed-list', async (req, res, next) => {
  try {
    const batch = await loadScopedBatch(pool, req, req.params.id);
    if (!batch.signed_list_path) throw httpErr(400, 'No signed sheet is attached');
    const { rows } = await pool.query(
      `UPDATE inventory_issue_batches
       SET signed_list_url=NULL, signed_list_path=NULL, signed_list_filename=NULL, signed_list_mime=NULL,
           signed_list_uploaded_at=NULL, signed_list_uploaded_by=NULL
       WHERE id=$1 RETURNING *`,
      [batch.id]
    );
    deleteFile(batch.signed_list_path).catch(e => console.error('[inventory] signed list delete failed:', e.message));
    res.json(rows[0]);
  } catch (err) { sendErr(res, next, err); }
});

module.exports = router;
