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
  return `${admission_prefix}${String(seq).padStart(4,'0')}${String(admission_year).padStart(2,'0')}`;
}

async function assignHouse(schoolId, gender, residentialStatus, programId) {
  const { rows: houses } = await pool.query(
    `SELECT name FROM houses WHERE school_id = $1 ORDER BY name`,
    [schoolId]
  );
  if (!houses.length) return null;

  const { rows: counts } = await pool.query(
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

  let best = null, bestScore = Infinity;
  for (const h of houses) {
    const score = (total[h.name] ?? 0) + 0.3 * (prog[h.name] ?? 0);
    if (score < bestScore) { bestScore = score; best = h.name; }
  }
  return best;
}

module.exports = { generateAdmissionNumber, assignHouse };
