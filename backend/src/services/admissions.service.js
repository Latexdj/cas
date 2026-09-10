'use strict';
const pool = require('../config/db');

async function generateAdmissionNumber(schoolId, client) {
  const { rows } = await client.query(
    `UPDATE school_admission_settings
     SET next_sequence = next_sequence + 1, updated_at = now()
     WHERE school_id = $1
     RETURNING next_sequence - 1 AS seq, admission_prefix, admission_year`,
    [schoolId]
  );
  if (!rows.length) throw new Error('Admission settings not configured. Please set up Portal Settings first.');
  const { seq, admission_prefix, admission_year } = rows[0];
  // padStart(4) pads sequences < 1000 to 4 digits; sequences ≥ 10000 naturally
  // extend to 5 digits (format grows rather than truncates — acceptable).
  return `${admission_prefix}${String(seq).padStart(4, '0')}${String(admission_year).padStart(2, '0')}`;
}

// assignHouse — caller MUST pass a transaction client so the FOR UPDATE lock on
// the houses rows serialises concurrent assignments. Without the lock, all
// concurrent callers read stale counts (all zero) and pile into the same house.
//
// Correct usage:
//   const client = await pool.connect();
//   await client.query('BEGIN');
//   const house = await assignHouse(schoolId, gender, res, prog, client);
//   await client.query('UPDATE admission_applications SET house=$1 …', [house]);
//   await client.query('COMMIT');
async function assignHouse(schoolId, gender, residentialStatus, programId, client) {
  if (!client) {
    // Safety: fall back to pool (no lock) so existing callers don't break,
    // but log a warning so we can track down any remaining unguarded call sites.
    console.warn('[assignHouse] called without a transaction client — house distribution may skew under concurrent load');
  }
  const db = client || pool;
  // FOR UPDATE on all house rows for this school acts as a mutex:
  // the second concurrent transaction blocks here until the first commits,
  // then re-reads fresh counts before choosing a house.
  const lockClause = client ? ' FOR UPDATE' : '';
  const { rows: houses } = await db.query(
    `SELECT name FROM houses WHERE school_id = $1 ORDER BY name${lockClause}`,
    [schoolId]
  );
  if (!houses.length) return null;

  const { rows: counts } = await db.query(
    `SELECT house,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE program_id = $4)::int AS prog_count
     FROM admission_applications
     WHERE school_id = $1
       AND LOWER(gender) = LOWER($2)
       AND LOWER(residential_status) = LOWER($3)
       AND status != 'pending'
       AND house IS NOT NULL
     GROUP BY house`,
    [schoolId, gender, residentialStatus, programId]
  );

  const total = {}, prog = {};
  for (const r of counts) { total[r.house] = r.total; prog[r.house] = r.prog_count; }

  // Tie-breaking: ORDER BY name above makes the house list deterministic,
  // so equal scores always resolve to the alphabetically first house in the tie.
  let best = null, bestScore = Infinity;
  for (const h of houses) {
    const score = (total[h.name] ?? 0) + 0.3 * (prog[h.name] ?? 0);
    if (score < bestScore) { bestScore = score; best = h.name; }
  }
  return best;
}

module.exports = { generateAdmissionNumber, assignHouse };
