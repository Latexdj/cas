'use strict';
// One-time fix: recalculate periods_lost on existing absences so breaks inside
// a lesson are not counted (the same count the register uses). Before this,
// a 09:30-15:00 lesson with a 12:30-13:00 break was recorded as 6 periods lost
// at 60-minute periods, though attending it counts 5.
//
// Only absences whose lesson time is known (scheduled_period like
// "09:30:00–15:00:00") and that count at least one period are changed. Rows
// holding 0 are the extra classes of a merged lesson and stay 0. The school's
// CURRENT bell schedule and period length are used, so if breaks have changed
// since an absence, its count follows today's breaks.
//
// Usage:
//   node src/scripts/recalcPeriodsLost.js            (dry run: reports changes, writes nothing)
//   node src/scripts/recalcPeriodsLost.js --commit   (writes the new counts)
require('dotenv').config();
const pool = require('../config/db');
const { effectivePeriods, parsePeriodRange, isoDayOfWeek } = require('../utils/breaks');

const COMMIT = process.argv.includes('--commit');

async function run() {
  const { rows: schools } = await pool.query(`SELECT id, name, COALESCE(period_duration_minutes, 60) AS mins FROM schools ORDER BY name`);
  let checked = 0, changed = 0, skipped = 0;

  for (const school of schools) {
    const { rows: breaks } = await pool.query(
      `SELECT start_time::text, end_time::text, day_of_week FROM school_breaks WHERE school_id = $1`, [school.id]);
    const breaksFor = (dow) => breaks.filter(b => b.day_of_week == null || Number(b.day_of_week) === dow);

    const { rows: absences } = await pool.query(
      `SELECT id, date::text AS date, scheduled_period, periods_lost
         FROM absences
        WHERE school_id = $1 AND (periods_lost IS NULL OR periods_lost > 0)`, [school.id]);

    const updates = [];
    for (const a of absences) {
      const range = parsePeriodRange(a.scheduled_period);
      if (!range) { skipped++; continue; }
      checked++;
      const want = effectivePeriods(range.start, range.end, breaksFor(isoDayOfWeek(a.date)), school.mins);
      if (want !== a.periods_lost) updates.push({ id: a.id, from: a.periods_lost, to: want, date: a.date, period: a.scheduled_period });
    }
    if (!updates.length) continue;
    changed += updates.length;

    console.log(`\n${school.name}: ${updates.length} absence${updates.length === 1 ? '' : 's'} to correct (${school.mins}-minute periods)`);
    for (const u of updates.slice(0, 10)) console.log(`  ${u.date}  ${u.period}  ${u.from ?? 'blank'} -> ${u.to}`);
    if (updates.length > 10) console.log(`  …and ${updates.length - 10} more`);

    if (COMMIT) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const u of updates) await client.query(`UPDATE absences SET periods_lost = $1 WHERE id = $2`, [u.to, u.id]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
  }

  console.log(`\nChecked ${checked} absence${checked === 1 ? '' : 's'} with a lesson time. ${skipped} had no lesson time and ${skipped === 1 ? 'was left as it is' : 'were left as they are'}.`);
  console.log(COMMIT ? `Corrected ${changed}.` : `${changed} would change. Run again with --commit to write them.`);
}

run().then(() => pool.end()).catch(e => { console.error(e); pool.end(); process.exit(1); });
