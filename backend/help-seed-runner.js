'use strict';
// Shared runner for help-entry seeds. Inserts each global entry (school_id
// NULL) and, when an entry with the same title already exists, updates its
// text, area and roles so re-running a seed keeps the help assistant current.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

// retire: titles of entries that no longer describe the app; they are hidden
// from the assistant (is_active = false) rather than deleted.
async function runSeed(label, entries, { retire = [] } = {}) {
  const url = process.env.DATABASE_URL || '';
  // Hosted databases need SSL; a local database (for testing) usually does not.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  console.log(`Seeding ${entries.length} ${label} help entries…\n`);
  let inserted = 0, updated = 0, unchanged = 0;
  try {
    for (const e of entries) {
      const upd = await pool.query(
        `UPDATE help_entries
            SET feature_area = $1, applicable_roles = $2, body = $4, is_active = true, updated_at = now()
          WHERE school_id IS NULL AND title = $3
            AND (body IS DISTINCT FROM $4 OR feature_area IS DISTINCT FROM $1 OR applicable_roles IS DISTINCT FROM $2::text[])`,
        [e.feature_area, e.applicable_roles, e.title, e.body]
      );
      if (upd.rowCount) { updated++; console.log(`  ↻  ${e.title}`); continue; }
      const ins = await pool.query(
        `INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
         SELECT NULL, $1, $2, $3, $4, true
         WHERE NOT EXISTS (SELECT 1 FROM help_entries WHERE school_id IS NULL AND title = $3)`,
        [e.feature_area, e.applicable_roles, e.title, e.body]
      );
      if (ins.rowCount) { inserted++; console.log(`  ✓  ${e.title}`); }
      else { unchanged++; console.log(`  –  ${e.title} (unchanged)`); }
    }
    if (retire.length) {
      const r = await pool.query(
        `UPDATE help_entries SET is_active = false, updated_at = now()
          WHERE school_id IS NULL AND title = ANY($1::text[]) AND is_active`, [retire]);
      if (r.rowCount) console.log(`  ✗  retired ${r.rowCount} outdated entr${r.rowCount === 1 ? 'y' : 'ies'}`);
    }
    console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`);
  } finally {
    await pool.end();
  }
}

module.exports = { runSeed };
