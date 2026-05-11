const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ogcnlgevqiwfemzavnis:Emmanuel_2011_cas@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS code TEXT UNIQUE`);
  await pool.query(`UPDATE schools SET code = 'CAS001' WHERE code IS NULL`);
  const { rows } = await pool.query(`SELECT id, name, code FROM schools`);
  console.log('Schools:', rows);
  await pool.end();
})().catch(e => console.error(e.message));
