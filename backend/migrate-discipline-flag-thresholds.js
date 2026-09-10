'use strict';
const pool = require('./src/config/db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS discipline_flag_thresholds (
        school_id                    UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
        repeat_offense_count         INT  NOT NULL DEFAULT 3,
        category_concentration_count INT  NOT NULL DEFAULT 3,
        time_density_count           INT  NOT NULL DEFAULT 2,
        time_density_days            INT  NOT NULL DEFAULT 30,
        stale_case_days              INT  NOT NULL DEFAULT 30,
        updated_at                   TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('Table discipline_flag_thresholds created (or already exists).');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
