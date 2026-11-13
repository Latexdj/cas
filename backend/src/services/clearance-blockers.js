'use strict';
const pool = require('../config/db');

// Things a student still holds that must come back before they can be
// cleared: returnable inventory items (tablets, test books, drawing boards)
// and library books. Offices still clear students by hand; this only stops
// the overall clearance from completing while anything is outstanding.

async function getOutstandingItems(schoolId, studentIds, db = pool) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  const byStudent = new Map(ids.map(id => [id, []]));
  if (!ids.length) return byStudent;

  const [{ rows: inv }, { rows: lib }] = await Promise.all([
    db.query(
      `SELECT l.student_id, l.id AS loan_id, 'inventory' AS source, i.name AS item_name,
              l.quantity, l.issued_at, l.due_date, u.tag_number, u.imei,
              (l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE) AS is_overdue
       FROM inventory_loans l
       JOIN inventory_items i ON i.id = l.item_id
       LEFT JOIN inventory_units u ON u.id = l.unit_id
       WHERE l.school_id = $1 AND l.status = 'active' AND l.student_id = ANY($2::uuid[])
       ORDER BY l.issued_at`,
      [schoolId, ids]
    ),
    db.query(
      `SELECT ll.student_id, ll.id AS loan_id, 'library' AS source, lb.title AS item_name,
              1 AS quantity, ll.issued_at, ll.due_date, lc.copy_number::text AS tag_number, NULL AS imei,
              (ll.due_date < CURRENT_DATE) AS is_overdue
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       LEFT JOIN library_copies lc ON lc.id = ll.copy_id
       WHERE ll.school_id = $1 AND ll.status = 'active' AND ll.student_id = ANY($2::uuid[])
       ORDER BY ll.issued_at`,
      [schoolId, ids]
    ).catch(() => ({ rows: [] })),
  ]);
  for (const r of [...inv, ...lib]) byStudent.get(r.student_id)?.push(r);
  return byStudent;
}

// Recomputes a clearance's overall result: every office item cleared AND
// nothing still to be returned.
async function recalcFullyCleared(clearanceId, schoolId, db = pool) {
  const { rows } = await db.query(
    `SELECT sc.student_id,
            (SELECT COUNT(*) FROM student_clearance_items i
              WHERE i.clearance_id = sc.id AND i.status != 'cleared')::int AS pending_count
     FROM student_clearances sc WHERE sc.id = $1`,
    [clearanceId]
  );
  if (!rows.length) return;
  const outstanding = (await getOutstandingItems(schoolId, [rows[0].student_id], db)).get(rows[0].student_id) || [];
  const fullyCleared = rows[0].pending_count === 0 && outstanding.length === 0;
  await db.query(
    `UPDATE student_clearances
     SET is_fully_cleared = $1,
         fully_cleared_at = CASE WHEN $1 THEN COALESCE(fully_cleared_at, now()) ELSE NULL END
     WHERE id = $2`,
    [fullyCleared, clearanceId]
  );
}

// Call after anything is lent to or returned by students, so a clearance
// already in progress reflects it straight away. Never throws.
async function refreshStudentsClearance(schoolId, studentIds) {
  try {
    const ids = [...new Set((studentIds || []).filter(Boolean))];
    if (!ids.length) return;
    const { rows } = await pool.query(
      `SELECT id FROM student_clearances WHERE school_id = $1 AND student_id = ANY($2::uuid[])`,
      [schoolId, ids]
    );
    for (const r of rows) await recalcFullyCleared(r.id, schoolId);
  } catch (err) {
    console.error('[clearance] refresh after loan change failed:', err.message);
  }
}

module.exports = { getOutstandingItems, recalcFullyCleared, refreshStudentsClearance };
