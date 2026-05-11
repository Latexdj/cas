require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await pool.query(`
    ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS photo_size_kb INTEGER;
  `);
  console.log('photo_size_kb column added to attendance table');
  await pool.end();
})().catch(err => { console.error(err); process.exit(1); });
