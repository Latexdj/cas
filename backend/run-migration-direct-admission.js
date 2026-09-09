'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`ALTER TABLE admission_applications ALTER COLUMN index_number DROP NOT NULL`);
  console.log('✓ index_number is now nullable');
  await pool.query(`ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS admission_type TEXT DEFAULT 'cssps'`);
  console.log('✓ admission_type column added (default: cssps)');
  await pool.query(`ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS direct_reason TEXT`);
  console.log('✓ direct_reason column added');
  await pool.end();
  console.log('\nMigration complete.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
