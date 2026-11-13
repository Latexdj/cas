'use strict';
const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const crypto = require('crypto');
const { getHeadedDepartments } = require('../services/hod.service');
const { uploadFile, deleteFile } = require('../services/storage.service');
const { refreshStudentsClearance } = require('../services/clearance-blockers');

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

      const dept = await getHeadedDepartments(req.schoolId, req.user.id);
      if (dept.length) {
        const requestedId = req.query.dept_id || req.body?.dept_id;
        const selected = requestedId ? (dept.find(r => r.id === requestedId) ?? dept[0]) : dept[0];
        req.inventoryScope = 'department';
        req.inventoryDeptId = selected.id;
        return next();
      }
    }

    // 'stores' — full access, same scope as admin (general + departmental).
    // Checked before the limited 'inventory' role (general items only), so
    // staff who hold both roles get the full access 'stores' grants.
    if (role === 'staff' && req.staffRoles?.includes('stores')) {
      req.inventoryScope = 'all'; return next();
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

// performed_by_id is FK'd to teachers(id); a 'stores'-role school_staff
// account's id lives in school_staff instead, so it goes in the separate
// performed_by_staff_id column — returns [performed_by_id, performed_by_staff_id].
function performedBy(req) {
  return req.user?.role === 'staff' ? [null, req.user.id] : [req.user.id, null];
}

// Items with track_units keep their stock counts derived from their units:
// total = units the school still holds (in store or out on loan), available =
// units in store and in good condition.
async function syncUnitCounts(db, itemId) {
  await db.query(
    `UPDATE inventory_items i SET
       quantity_total     = (SELECT COUNT(*) FROM inventory_units u WHERE u.item_id = i.id AND u.status IN ('in_store','issued')),
       quantity_available = (SELECT COUNT(*) FROM inventory_units u WHERE u.item_id = i.id AND u.status = 'in_store' AND u.condition = 'Good'),
       updated_at = now()
     WHERE i.id = $1 AND i.track_units`,
    [itemId]
  );
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
      conditions.push(`(i.name ILIKE $${params.length} OR i.serial_number ILIKE $${params.length} OR i.asset_tag ILIKE $${params.length}
        OR EXISTS (SELECT 1 FROM inventory_units u WHERE u.item_id = i.id AND (u.tag_number ILIKE $${params.length} OR u.imei ILIKE $${params.length})))`);
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
            ownership_type, department_id, is_returnable, track_units } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });

    const ownershipType = (['general', 'departmental'].includes(ownership_type)) ? ownership_type : 'general';
    const deptId = ownershipType === 'departmental' ? (department_id || null) : null;
    const tracked = track_units === true || track_units === 'true';
    // Individually tracked items are always lent and expected back.
    const returnable = tracked || is_returnable === true || is_returnable === 'true';

    // Scope check: non-admin can only create within their scope
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, { ownership_type: ownershipType, department_id: deptId });
    if (scopeErr) return res.status(403).json({ error: scopeErr });

    const tag = asset_tag?.trim() || await nextAssetTag(req.schoolId);
    // Tracked items start empty; their count comes from the units added.
    const qty = tracked ? 0 : (parseInt(quantity) || 1);

    const { rows } = await pool.query(
      `INSERT INTO inventory_items
         (school_id, category_id, name, item_type, description, serial_number, asset_tag,
          quantity_total, quantity_available, condition, location, acquired_date, notes,
          ownership_type, department_id, is_returnable, track_units)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [req.schoolId, category_id || null, name.trim(), item_type || 'equipment',
       description?.trim() || null, serial_number?.trim() || null, tag, qty,
       condition || 'Good', location?.trim() || null, acquired_date || null,
       notes?.trim() || null, ownershipType, deptId, returnable, tracked]
    );
    if (!tracked) await pool.query(
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
            location, acquired_date, notes, ownership_type, department_id, is_returnable, track_units } = req.body;
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
    const tracked = track_units === undefined ? existing[0].track_units : (track_units === true || track_units === 'true');
    const returnable = tracked || (is_returnable === undefined ? existing[0].is_returnable : (is_returnable === true || is_returnable === 'true'));

    if (tracked !== existing[0].track_units) {
      const [{ rows: [{ units }] }, { rows: [{ loans }] }] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS units FROM inventory_units WHERE item_id=$1`, [req.params.id]),
        pool.query(`SELECT COUNT(*)::int AS loans FROM inventory_loans WHERE item_id=$1 AND status='active'`, [req.params.id]),
      ]);
      if (!tracked && units > 0) return res.status(400).json({ error: 'This item has individual units recorded, so unit tracking cannot be switched off.' });
      // Loans already out stay as they are. Each can be given its tag later
      // from Loans ("Add tag"), which marks that unit as on loan.
      void loans;
    }

    const { rows } = await pool.query(
      `UPDATE inventory_items
       SET name=$1, item_type=$2, category_id=$3, description=$4, serial_number=$5,
           asset_tag=$6, location=$7, acquired_date=$8, notes=$9, updated_at=now(),
           ownership_type=$10, department_id=$11, is_returnable=$12, track_units=$15
       WHERE id=$13 AND school_id=$14 RETURNING *`,
      [name.trim(), item_type || 'equipment', category_id || null,
       description?.trim() || null, serial_number?.trim() || null, tag,
       location?.trim() || null, acquired_date || null, notes?.trim() || null,
       ownershipType, deptId, returnable, req.params.id, req.schoolId, tracked]
    );
    if (tracked && !existing[0].track_units) {
      await syncUnitCounts(pool, req.params.id);
      const { rows: fresh } = await pool.query(`SELECT * FROM inventory_items WHERE id=$1`, [req.params.id]);
      return res.json(fresh[0]);
    }
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
    const { issued_to_name, issued_to_role, issued_to_type, student_id, teacher_id, due_date, quantity, notes, unit_id } = req.body;
    if (!issued_to_name?.trim()) return res.status(400).json({ error: 'Recipient name is required' });
    let qty = parseInt(quantity) || 1;

    const { rows: item } = await pool.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`,
      [req.params.id, req.schoolId]
    );
    if (!item.length) return res.status(404).json({ error: 'Item not found' });
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, item[0]);
    if (scopeErr) return res.status(403).json({ error: scopeErr });
    if (item[0].condition === 'Written Off') return res.status(400).json({ error: 'Cannot issue a written-off item' });
    if (item[0].track_units) qty = 1;
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

    // A tracked item goes out one named unit at a time. Claiming it with a
    // conditional update means two people can never be given the same unit.
    let unit = null;
    if (item[0].track_units) {
      if (typeof unit_id !== 'string' || !UUID_RE.test(unit_id)) return res.status(400).json({ error: 'Choose which unit (tag number) is being issued' });
      const { rows: claimed } = await pool.query(
        `UPDATE inventory_units SET status='issued', updated_at=now()
         WHERE id=$1 AND item_id=$2 AND status='in_store' AND condition='Good' RETURNING *`,
        [unit_id, req.params.id]
      );
      if (!claimed.length) return res.status(400).json({ error: 'That unit is not in store, or is damaged. Choose another tag number.' });
      unit = claimed[0];
    }

    let updated;
    if (unit) {
      await syncUnitCounts(pool, req.params.id);
      ({ rows: updated } = await pool.query(`SELECT * FROM inventory_items WHERE id=$1`, [req.params.id]));
    } else {
      ({ rows: updated } = await pool.query(
        `UPDATE inventory_items SET quantity_available=quantity_available-$1, updated_at=now()
         WHERE id=$2 AND school_id=$3 RETURNING *`,
        [qty, req.params.id, req.schoolId]
      ));
    }
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id,item_id,type,quantity,issued_to_name,issued_to_role,issued_to_type,student_id,teacher_id,notes,performed_by_id,performed_by_staff_id,performed_by_name,unit_id)
       VALUES ($1,$2,'issued',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [req.schoolId, req.params.id, qty, issued_to_name.trim(),
       issued_to_role?.trim() || null,
       issued_to_type || 'staff',
       student_id || null, teacher_id || null,
       notes?.trim() || null, ...performedBy(req), req.user.name, unit?.id ?? null]
    );

    let loan = null;
    if (item[0].is_returnable) {
      const [issuedByTeacherId, issuedBySchoolStaffId] = performedBy(req);
      const { rows: loanRows } = await pool.query(
        `INSERT INTO inventory_loans
           (school_id,item_id,quantity,borrower_type,student_id,teacher_id,borrower_name,borrower_detail,
            due_date,notes,issued_by_teacher_id,issued_by_school_staff_id,unit_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [req.schoolId, req.params.id, qty, issued_to_type, student_id || null, teacher_id || null,
         issued_to_name.trim(), issued_to_role?.trim() || null,
         due_date || null, notes?.trim() || null, issuedByTeacherId, issuedBySchoolStaffId, unit?.id ?? null]
      );
      loan = { ...loanRows[0], tag_number: unit?.tag_number ?? null, imei: unit?.imei ?? null };
      if (student_id) refreshStudentsClearance(req.schoolId, [student_id]);
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
    if (item[0].track_units) return res.status(400).json({ error: "This item is tracked by unit. Record returns from Loans, and change a unit's condition from its Units list." });
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

    if (item[0].track_units) return res.status(400).json({ error: "This item is tracked by unit. Record returns from Loans, and change a unit's condition from its Units list." });
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
// Name-or-ID search for the issue boxes. Registered before /students/:code
// so "search" isn't read as a student code.
router.get('/students/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { rows } = await pool.query(
      `SELECT id, name, student_code, class_name FROM students
       WHERE school_id = $1 AND status = 'Active' AND (name ILIKE $2 OR student_code ILIKE $2)
       ORDER BY (UPPER(student_code) = UPPER($3)) DESC, name LIMIT 15`,
      [req.schoolId, `%${q}%`, q]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

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
              i.name AS item_name, i.asset_tag, i.track_units, u.tag_number, u.imei
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       LEFT JOIN inventory_units u ON u.id = l.unit_id
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
              i.name AS item_name, i.asset_tag, i.track_units, u.tag_number, u.imei
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       LEFT JOIN inventory_units u ON u.id = l.unit_id
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
    if (search) { params.push(`%${search}%`); conditions.push(`(l.borrower_name ILIKE $${params.length} OR i.name ILIKE $${params.length} OR u.tag_number ILIKE $${params.length} OR u.imei ILIKE $${params.length} OR l.borrower_detail ILIKE $${params.length})`); }

    const { rows } = await pool.query(
      `SELECT l.*, i.name AS item_name, i.asset_tag, i.track_units, u.tag_number, u.imei, u.serial_number AS unit_serial,
              (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE)::boolean AS is_overdue
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       LEFT JOIN inventory_units u ON u.id = l.unit_id
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
      `SELECT l.*, i.quantity_total, i.quantity_available, i.ownership_type, i.department_id, i.track_units
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
    // "Lost" closes the loan (so it no longer holds up the borrower's
    // clearance) without putting anything back in store.
    const lost = condition_on_return === 'Lost';
    if (lost && !notes?.trim()) return res.status(400).json({ error: 'Add a note saying how the item was lost and any charge agreed' });
    const newCondition = ['Good', 'Damaged', 'Lost'].includes(condition_on_return) ? condition_on_return : null;

    // Close the loan first, guarded on status, so a double click can't
    // return the same loan twice.
    const { rows: updatedLoan } = await pool.query(
      `UPDATE inventory_loans SET status='returned', returned_at=now(),
              condition_on_return=$1, notes=COALESCE($2, notes)
       WHERE id=$3 AND status='active' RETURNING *`,
      [newCondition, notes?.trim() || null, loan.id]
    );
    if (!updatedLoan.length) return res.status(409).json({ error: 'This loan has already been returned' });

    let updatedItem;
    if (loan.track_units && !loan.unit_id) {
      await syncUnitCounts(pool, loan.item_id);
      ({ rows: updatedItem } = await pool.query(`SELECT * FROM inventory_items WHERE id=$1`, [loan.item_id]));
    } else if (loan.track_units && loan.unit_id) {
      await pool.query(
        `UPDATE inventory_units SET status=$1, condition=COALESCE($2, condition), updated_at=now() WHERE id=$3`,
        [lost ? 'lost' : 'in_store', lost ? null : newCondition, loan.unit_id]
      );
      await syncUnitCounts(pool, loan.item_id);
      ({ rows: updatedItem } = await pool.query(`SELECT * FROM inventory_items WHERE id=$1`, [loan.item_id]));
    } else if (lost) {
      ({ rows: updatedItem } = await pool.query(
        `UPDATE inventory_items SET quantity_total = GREATEST(0, quantity_total - $1),
                quantity_available = LEAST(quantity_available, GREATEST(0, quantity_total - $1)), updated_at = now()
         WHERE id=$2 AND school_id=$3 RETURNING *`,
        [loan.quantity, loan.item_id, req.schoolId]
      ));
    } else {
      ({ rows: updatedItem } = await pool.query(
        `UPDATE inventory_items
         SET quantity_available = LEAST(quantity_total, quantity_available + $1),
             condition = COALESCE($2, condition), updated_at = now()
         WHERE id=$3 AND school_id=$4 RETURNING *`,
        [loan.quantity, newCondition, loan.item_id, req.schoolId]
      ));
    }
    await pool.query(
      `INSERT INTO inventory_transactions
         (school_id,item_id,type,quantity,issued_to_name,issued_to_type,student_id,teacher_id,notes,performed_by_id,performed_by_staff_id,performed_by_name,unit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [req.schoolId, loan.item_id, lost ? 'lost' : 'returned', loan.quantity, loan.borrower_name, loan.borrower_type,
       loan.student_id, loan.teacher_id, notes?.trim() || null, ...performedBy(req), req.user.name, loan.unit_id ?? null]
    );
    if (loan.student_id) refreshStudentsClearance(req.schoolId, [loan.student_id]);
    res.json({ item: updatedItem[0], loan: updatedLoan[0] });
  } catch (err) { next(err); }
});

// Give a loan made before unit tracking was switched on its exact unit, so
// the record shows which tablet that person has.
router.post('/loans/:id/assign-unit', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!UUID_RE.test(req.params.id) || !UUID_RE.test(String(req.body.unit_id))) throw httpErr(400, 'Choose a unit');
    await client.query('BEGIN');
    const { rows: loanRows } = await client.query(
      `SELECT l.*, i.ownership_type, i.department_id, i.track_units
       FROM inventory_loans l JOIN inventory_items i ON i.id = l.item_id
       WHERE l.id=$1 AND l.school_id=$2 AND l.status='active' FOR UPDATE OF l`,
      [req.params.id, req.schoolId]
    );
    if (!loanRows.length) throw httpErr(404, 'Active loan not found');
    const loan = loanRows[0];
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, loan);
    if (scopeErr) throw httpErr(403, scopeErr);
    if (!loan.track_units) throw httpErr(400, 'This item is not tracked by unit');
    if (loan.unit_id) throw httpErr(400, 'This loan already has a tag');
    const { rows: claimed } = await client.query(
      `UPDATE inventory_units SET status='issued', updated_at=now()
       WHERE id=$1 AND item_id=$2 AND status='in_store' RETURNING *`,
      [req.body.unit_id, loan.item_id]
    );
    if (!claimed.length) throw httpErr(400, 'That unit is not in store. Choose another tag number.');
    await client.query(`UPDATE inventory_loans SET unit_id=$1 WHERE id=$2`, [claimed[0].id, loan.id]);
    await client.query(
      `UPDATE inventory_transactions SET unit_id=$1
       WHERE id = (SELECT id FROM inventory_transactions
                   WHERE item_id=$2 AND type='issued' AND unit_id IS NULL
                     AND COALESCE(student_id, teacher_id) = COALESCE($3::uuid, $4::uuid)
                   ORDER BY created_at DESC LIMIT 1)`,
      [claimed[0].id, loan.item_id, loan.student_id, loan.teacher_id]
    );
    await syncUnitCounts(client, loan.item_id);
    await client.query('COMMIT');
    res.json({ ok: true, tag_number: claimed[0].tag_number, imei: claimed[0].imei });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendErr(res, next, err);
  } finally { client.release(); }
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
  const units   = recipients.map(r => r.unit_id ?? null);
  const [byTeacher, byStaff] = performedBy(req);

  await db.query(
    `INSERT INTO inventory_transactions
       (school_id, item_id, type, quantity, issued_to_name, issued_to_role, issued_to_type,
        student_id, teacher_id, notes, performed_by_id, performed_by_staff_id, performed_by_name, batch_id, unit_id)
     SELECT $1, $2, 'issued', $3, r.name, r.detail, $4::text,
            CASE WHEN $4::text = 'student' THEN r.id END,
            CASE WHEN $4::text = 'teacher' THEN r.id END,
            $5, $6, $7, $8, $9, r.unit_id
     FROM unnest($10::uuid[], $11::text[], $12::text[], $13::uuid[]) AS r(id, name, detail, unit_id)`,
    [req.schoolId, item.id, batch.qty_per_person, batch.recipient_type,
     batch.title, byTeacher, byStaff, req.user.name, batch.id,
     ids, names, details, units]
  );

  if (item.is_returnable) {
    await db.query(
      `INSERT INTO inventory_loans
         (school_id, item_id, quantity, borrower_type, student_id, teacher_id,
          borrower_name, borrower_detail, due_date, notes,
          issued_by_teacher_id, issued_by_school_staff_id, batch_id, unit_id)
       SELECT $1, $2, $3, $4::text,
              CASE WHEN $4::text = 'student' THEN r.id END,
              CASE WHEN $4::text = 'teacher' THEN r.id END,
              r.name, NULLIF(CONCAT_WS(' · ', r.code, r.detail), ''), $5, $6, $7, $8, $9, r.unit_id
       FROM unnest($10::uuid[], $11::text[], $12::text[], $13::text[], $14::uuid[]) AS r(id, name, code, detail, unit_id)`,
      [req.schoolId, item.id, batch.qty_per_person, batch.recipient_type,
       batch.due_date, batch.title, byTeacher, byStaff, batch.id,
       ids, names, codes, details, units]
    );
  }
}

// For an item tracked by unit, every recipient must be paired with exactly
// one unit (tag number). The units are claimed in one conditional update so
// none can be handed to two people, even with two officers issuing at once.
async function assignUnits(db, item, recipients, assignments) {
  if (!Array.isArray(assignments) || !assignments.length) {
    throw httpErr(400, 'Pair each person with the tag number of the unit they are receiving');
  }
  const byPerson = new Map();
  for (const a of assignments) {
    if (!a || !UUID_RE.test(String(a.recipient_id)) || !UUID_RE.test(String(a.unit_id))) throw httpErr(400, 'Invalid tag assignment');
    byPerson.set(a.recipient_id, a.unit_id);
  }
  const missing = recipients.filter(r => !byPerson.has(r.id));
  if (missing.length) throw httpErr(400, `${missing.length} person(s) have no tag number assigned, e.g. ${missing[0].name}`);
  const unitIds = recipients.map(r => byPerson.get(r.id));
  if (new Set(unitIds).size !== unitIds.length) throw httpErr(400, 'The same tag number is assigned to more than one person');

  const { rows: claimed } = await db.query(
    `UPDATE inventory_units SET status='issued', updated_at=now()
     WHERE id = ANY($1::uuid[]) AND item_id=$2 AND status='in_store' AND condition='Good' RETURNING id`,
    [unitIds, item.id]
  );
  if (claimed.length !== unitIds.length) {
    const ok = new Set(claimed.map(r => r.id));
    const { rows: bad } = await db.query(
      `SELECT tag_number FROM inventory_units WHERE id = ANY($1::uuid[]) ORDER BY tag_number LIMIT 5`,
      [unitIds.filter(id => !ok.has(id))]
    );
    throw httpErr(400, `These units are no longer in store or are damaged: ${bad.map(b => b.tag_number).join(', ') || 'unknown'}. Refresh and assign others.`);
  }
  for (const r of recipients) r.unit_id = byPerson.get(r.id);
}

async function loadScopedBatch(db, req, id, { lock = false } = {}) {
  if (!UUID_RE.test(id)) throw httpErr(404, 'Issue record not found');
  const { rows } = await db.query(
    `SELECT b.*, i.name AS item_name, i.asset_tag, i.is_returnable, i.track_units,
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
          due_date, notes, filters, filter_label, assignments } = req.body;
  const client = await pool.connect();
  try {
    if (!title?.trim()) throw httpErr(400, 'Enter a title, for example "Exercise Books for Form 1A, Term 1"');
    if (!['student', 'teacher'].includes(recipient_type)) throw httpErr(400, 'recipient_type must be "student" or "teacher"');
    if (typeof item_id !== 'string' || !UUID_RE.test(item_id)) throw httpErr(400, 'Select an item');
    let qty = parseInt(qty_per_person);
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
    if (item.track_units) qty = 1;

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

    if (item.track_units) await assignUnits(client, item, recipients, assignments);
    await recordBatchIssues(client, req, { item, batch, recipients });
    if (item.track_units) await syncUnitCounts(client, item.id);
    else await client.query(
      `UPDATE inventory_items SET quantity_available = quantity_available - $1, updated_at = now() WHERE id=$2`,
      [total, item.id]
    );
    await client.query('COMMIT');
    if (item.is_returnable && recipient_type === 'student') refreshStudentsClearance(req.schoolId, recipients.map(r => r.id));
    res.status(201).json({ ...batch, item_name: item.name, is_returnable: item.is_returnable, track_units: item.track_units });
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
                te.teacher_code, te.department, u.tag_number, u.imei,
                (t.created_at > $2::timestamptz + interval '2 minutes') AS added_later
         FROM inventory_transactions t
         LEFT JOIN students s  ON s.id  = t.student_id
         LEFT JOIN teachers te ON te.id = t.teacher_id
         LEFT JOIN inventory_units u ON u.id = t.unit_id
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

    if (item.track_units) await assignUnits(client, item, recipients, req.body.assignments);
    await recordBatchIssues(client, req, { item, batch, recipients });
    if (item.track_units) await syncUnitCounts(client, item.id);
    else await client.query(
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
    if (item.is_returnable && batch.recipient_type === 'student') refreshStudentsClearance(req.schoolId, recipients.map(r => r.id));
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

// ── Individually tracked units (tablets, laptops) ───────────────────────────
// Each unit has its own tag number and IMEI. The item's stock counts are
// derived from its units (see syncUnitCounts).

async function loadScopedItem(db, req, id) {
  if (!UUID_RE.test(String(id))) throw httpErr(404, 'Item not found');
  const { rows } = await db.query(`SELECT * FROM inventory_items WHERE id=$1 AND school_id=$2`, [id, req.schoolId]);
  if (!rows.length) throw httpErr(404, 'Item not found');
  const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, rows[0]);
  if (scopeErr) throw httpErr(403, scopeErr);
  if (!rows[0].track_units) throw httpErr(400, 'This item is not tracked by unit');
  return rows[0];
}

const UNIT_SELECT = `
  SELECT u.*, l.id AS loan_id, l.borrower_type, l.borrower_name, l.borrower_detail,
         l.issued_at, l.due_date,
         (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE) AS is_overdue
  FROM inventory_units u
  LEFT JOIN inventory_loans l ON l.unit_id = u.id AND l.status = 'active'`;

function cleanTag(v)  { return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 60); }
function cleanImei(v) { return String(v ?? '').replace(/[\s-]/g, '').slice(0, 40); }

router.get('/items/:id/units', async (req, res, next) => {
  try {
    const item = await loadScopedItem(pool, req, req.params.id);
    const params = [item.id];
    const where = ['u.item_id = $1'];
    const { status, search, available } = req.query;
    if (available === 'true') where.push(`u.status = 'in_store' AND u.condition = 'Good'`);
    else if (status) { params.push(status); where.push(`u.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.tag_number ILIKE $${params.length} OR u.imei ILIKE $${params.length} OR u.serial_number ILIKE $${params.length} OR l.borrower_name ILIKE $${params.length})`);
    }
    // The tag picker only needs the first matches; bulk issue asks for every free unit.
    const limit = available === 'true' && req.query.all !== 'true' ? 'LIMIT 50' : '';
    const { rows } = await pool.query(
      `${UNIT_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY LENGTH(u.tag_number), u.tag_number ${limit}`,
      params
    );
    res.json(rows);
  } catch (err) { sendErr(res, next, err); }
});

// Add units in bulk (pasted from Excel or a CSV). With dry_run the rows are
// only checked, so the officer can fix problems before saving anything.
router.post('/items/:id/units', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const item = await loadScopedItem(client, req, req.params.id);
    const input = Array.isArray(req.body.units) ? req.body.units : [];
    if (!input.length) throw httpErr(400, 'Add at least one unit');
    if (input.length > 5000) throw httpErr(400, 'Too many units in one upload (max 5000)');

    const rows = input.map((u, i) => ({
      line: i + 1,
      tag_number: cleanTag(u.tag_number),
      imei: cleanImei(u.imei) || null,
      serial_number: String(u.serial_number ?? '').trim().slice(0, 80) || null,
      notes: String(u.notes ?? '').trim().slice(0, 300) || null,
    }));
    const errors = [];
    const seenTag = new Map(), seenImei = new Map();
    for (const r of rows) {
      if (!r.tag_number) { errors.push({ line: r.line, error: 'Tag number is missing' }); continue; }
      if (r.imei && !/^[0-9A-Za-z]{6,40}$/.test(r.imei)) errors.push({ line: r.line, error: `IMEI "${r.imei}" doesn't look right` });
      const t = r.tag_number.toUpperCase();
      if (seenTag.has(t)) errors.push({ line: r.line, error: `Tag ${r.tag_number} is repeated (also line ${seenTag.get(t)})` });
      else seenTag.set(t, r.line);
      if (r.imei) {
        if (seenImei.has(r.imei)) errors.push({ line: r.line, error: `IMEI ${r.imei} is repeated (also line ${seenImei.get(r.imei)})` });
        else seenImei.set(r.imei, r.line);
      }
    }
    const tags = rows.map(r => r.tag_number.toUpperCase()).filter(Boolean);
    const imeis = rows.map(r => r.imei).filter(Boolean);
    const { rows: clash } = await client.query(
      `SELECT u.tag_number, u.imei, i.name AS item_name FROM inventory_units u JOIN inventory_items i ON i.id = u.item_id
       WHERE u.school_id = $1 AND (UPPER(u.tag_number) = ANY($2::text[]) OR u.imei = ANY($3::text[]))`,
      [req.schoolId, tags, imeis]
    );
    for (const c of clash) {
      const tl = seenTag.get(c.tag_number.toUpperCase());
      if (tl) errors.push({ line: tl, error: `Tag ${c.tag_number} is already recorded (${c.item_name})` });
      if (c.imei && seenImei.has(c.imei)) errors.push({ line: seenImei.get(c.imei), error: `IMEI ${c.imei} is already recorded (${c.item_name})` });
    }
    errors.sort((a, b) => a.line - b.line);

    if (req.body.dry_run || errors.length) {
      return res.status(errors.length && !req.body.dry_run ? 400 : 200)
        .json({ ok: !errors.length, count: rows.length, errors, error: errors.length ? `${errors.length} problem(s) found. Fix them and try again.` : undefined });
    }

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO inventory_units (school_id, item_id, tag_number, imei, serial_number, notes)
       SELECT $1, $2, r.tag, r.imei, r.serial, r.notes
       FROM unnest($3::text[], $4::text[], $5::text[], $6::text[]) AS r(tag, imei, serial, notes)`,
      [req.schoolId, item.id, rows.map(r => r.tag_number), rows.map(r => r.imei), rows.map(r => r.serial_number), rows.map(r => r.notes)]
    );
    await client.query(
      `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_staff_id,performed_by_name)
       VALUES ($1,$2,'added',$3,$4,$5,$6,$7)`,
      [req.schoolId, item.id, rows.length, `${rows.length} unit(s) registered with tag numbers`, ...performedBy(req), req.user.name]
    );
    await syncUnitCounts(client, item.id);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, added: rows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(400).json({ error: 'A tag number or IMEI in this list is already recorded. Check the list and try again.' });
    sendErr(res, next, err);
  } finally { client.release(); }
});

// Edit a unit's details, or mark it damaged, repaired, written off or found.
router.put('/units/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpErr(404, 'Unit not found');
    const { rows: found } = await pool.query(
      `SELECT u.*, i.ownership_type, i.department_id FROM inventory_units u JOIN inventory_items i ON i.id = u.item_id
       WHERE u.id=$1 AND u.school_id=$2`, [req.params.id, req.schoolId]);
    if (!found.length) throw httpErr(404, 'Unit not found');
    const unit = found[0];
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, unit);
    if (scopeErr) throw httpErr(403, scopeErr);

    const tag = req.body.tag_number !== undefined ? cleanTag(req.body.tag_number) : unit.tag_number;
    if (!tag) throw httpErr(400, 'Tag number is required');
    const imei = req.body.imei !== undefined ? (cleanImei(req.body.imei) || null) : unit.imei;
    const serial = req.body.serial_number !== undefined ? (String(req.body.serial_number).trim() || null) : unit.serial_number;
    const notes = req.body.notes !== undefined ? (String(req.body.notes).trim() || null) : unit.notes;
    let condition = unit.condition, status = unit.status;
    if (req.body.condition !== undefined) {
      if (!['Good', 'Damaged'].includes(req.body.condition)) throw httpErr(400, 'Condition must be Good or Damaged');
      condition = req.body.condition;
    }
    if (req.body.status !== undefined && req.body.status !== unit.status) {
      if (unit.status === 'issued') throw httpErr(400, 'This unit is on loan. Record its return from Loans first.');
      if (!['in_store', 'written_off'].includes(req.body.status)) throw httpErr(400, 'A unit can be put back in store or written off here');
      status = req.body.status;
    }

    const { rows } = await pool.query(
      `UPDATE inventory_units SET tag_number=$1, imei=$2, serial_number=$3, notes=$4, condition=$5, status=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [tag, imei, serial, notes, condition, status, unit.id]
    );
    if (condition !== unit.condition || status !== unit.status) {
      const type = status === 'written_off' ? 'written_off' : condition === 'Damaged' && unit.condition !== 'Damaged' ? 'damaged' : 'repaired';
      await pool.query(
        `INSERT INTO inventory_transactions (school_id,item_id,type,quantity,notes,performed_by_id,performed_by_staff_id,performed_by_name,unit_id)
         VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8)`,
        [req.schoolId, unit.item_id, type, `Unit ${tag}${req.body.reason ? `: ${String(req.body.reason).trim()}` : ''}`, ...performedBy(req), req.user.name, unit.id]
      );
    }
    await syncUnitCounts(pool, unit.item_id);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Another unit already has that tag number or IMEI' });
    sendErr(res, next, err);
  }
});

// Remove a unit entered by mistake. One that has ever been lent keeps its
// history, so it can only be written off.
router.delete('/units/:id', async (req, res, next) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw httpErr(404, 'Unit not found');
    const { rows: found } = await pool.query(
      `SELECT u.*, i.ownership_type, i.department_id FROM inventory_units u JOIN inventory_items i ON i.id = u.item_id
       WHERE u.id=$1 AND u.school_id=$2`, [req.params.id, req.schoolId]);
    if (!found.length) throw httpErr(404, 'Unit not found');
    const scopeErr = checkItemScope(req.inventoryScope, req.inventoryDeptId, found[0]);
    if (scopeErr) throw httpErr(403, scopeErr);
    try {
      await pool.query(`DELETE FROM inventory_units WHERE id=$1`, [req.params.id]);
    } catch (e) {
      if (e.code === '23503') throw httpErr(400, 'This unit has been lent before, so it is kept for the record. Write it off instead.');
      throw e;
    }
    await syncUnitCounts(pool, found[0].item_id);
    res.json({ ok: true });
  } catch (err) { sendErr(res, next, err); }
});

// "Who has tablet T-123?" — find units by tag number or IMEI across every
// tracked item the caller can see, with each unit's loan history.
router.get('/units/lookup', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const params = [req.schoolId, `%${q}%`];
    const scope = appendScope(params, req.inventoryScope, req.inventoryDeptId);
    const { rows: units } = await pool.query(
      `SELECT u.*, i.name AS item_name, l.id AS loan_id, l.borrower_type, l.borrower_name, l.borrower_detail,
              l.issued_at, l.due_date, (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE) AS is_overdue
       FROM inventory_units u
       JOIN inventory_items i ON i.id = u.item_id
       LEFT JOIN inventory_loans l ON l.unit_id = u.id AND l.status = 'active'
       WHERE u.school_id = $1 AND (u.tag_number ILIKE $2 OR u.imei ILIKE $2 OR u.serial_number ILIKE $2) ${scope}
       ORDER BY LENGTH(u.tag_number), u.tag_number LIMIT 20`,
      params
    );
    if (!units.length) return res.json([]);
    const { rows: history } = await pool.query(
      `SELECT unit_id, borrower_name, borrower_detail, issued_at, returned_at, condition_on_return, status
       FROM inventory_loans WHERE unit_id = ANY($1::uuid[]) ORDER BY issued_at DESC`,
      [units.map(u => u.id)]
    );
    res.json(units.map(u => ({ ...u, history: history.filter(h => h.unit_id === u.id).slice(0, 10) })));
  } catch (err) { next(err); }
});

module.exports = router;
