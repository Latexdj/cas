const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ogcnlgevqiwfemzavnis:Emmanuel_2011_cas@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#0B3D2E'`);
  await pool.query(`ALTER TABLE schools ADD COLUMN IF NOT EXISTS accent_color  TEXT DEFAULT '#C8973A'`);
  const { rows } = await pool.query(`SELECT id, name, code, primary_color, accent_color FROM schools`);
  console.log('Schools:', rows);
  await pool.end();
})().catch(e => console.error(e.message));
