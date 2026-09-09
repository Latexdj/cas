'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    ALTER TABLE school_admission_settings
      ADD COLUMN IF NOT EXISTS admission_reporting_requirements TEXT
  `);
  console.log('✓ admission_reporting_requirements column added to school_admission_settings');
  await pool.end();
  console.log('\nMigration complete.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
