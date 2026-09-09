'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    ALTER TABLE school_admission_settings
      ADD COLUMN IF NOT EXISTS admission_letter_template   TEXT,
      ADD COLUMN IF NOT EXISTS admission_reporting_date    TEXT
  `);
  console.log('✓ admission_letter_template and admission_reporting_date added to school_admission_settings');
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
