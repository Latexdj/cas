// Auto-bills a single newly-created student against every fee schedule that
// already applies to their class — closes the gap that used to require an
// admin to remember to click "Generate Bills" again after every admission.
// Deliberately independent of the /schedules/:id/generate route's own
// targeting logic (which resolves historical class rosters via
// class_history for year-scoped schedules): a brand-new student has no
// class history yet, so a plain class_name match against their just-assigned
// class is the correct and sufficient check here, not a reason to touch that
// route's already-proven logic.
async function generateBillsForNewStudent(client, schoolId, studentId) {
  const { rows: studentRows } = await client.query(
    `SELECT class_name FROM students WHERE id=$1 AND school_id=$2`,
    [studentId, schoolId]
  );
  if (!studentRows.length) return { inserted: 0, schedules_matched: 0 };
  const className = studentRows[0].class_name;

  const { rows: schedules } = await client.query(
    `SELECT fs.*, fi.name AS fee_item_name, ay.name AS academic_year_name
     FROM fee_schedules fs
     LEFT JOIN fee_items fi ON fi.id = fs.fee_item_id
     LEFT JOIN academic_years ay ON ay.id = fs.academic_year_id
     WHERE fs.school_id = $1 AND (fs.class_name IS NULL OR fs.class_name = $2)`,
    [schoolId, className]
  );
  if (!schedules.length) return { inserted: 0, schedules_matched: 0 };

  const { rows: schoolRows } = await client.query(
    `SELECT school_type, school_level FROM schools WHERE id=$1`, [schoolId]
  );
  const isPrimary = ['Nursery', 'KG', 'Primary'].includes(schoolRows[0]?.school_type) || schoolRows[0]?.school_level === 'primary';
  const periodLabel = isPrimary ? 'Term' : 'Semester';

  let inserted = 0;
  for (const schedule of schedules) {
    const parts = [schedule.fee_item_name];
    if (schedule.academic_year_name) parts.push(schedule.academic_year_name);
    if (schedule.semester) parts.push(`${periodLabel} ${schedule.semester}`);
    const description = parts.join(' — ');

    const { rowCount } = await client.query(
      `INSERT INTO student_bills (school_id, student_id, fee_item_id, fee_schedule_id, academic_year_id, semester, description, amount, due_date)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
       WHERE NOT EXISTS (SELECT 1 FROM student_bills WHERE student_id=$2 AND fee_schedule_id=$4)`,
      [schoolId, studentId, schedule.fee_item_id, schedule.id, schedule.academic_year_id, schedule.semester, description, schedule.amount, schedule.due_date]
    );
    inserted += rowCount;
  }
  return { inserted, schedules_matched: schedules.length };
}

module.exports = { generateBillsForNewStudent };
