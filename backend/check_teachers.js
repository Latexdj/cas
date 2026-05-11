const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ogcnlgevqiwfemzavnis:Emmanuel_2011_cas@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const { rows } = await pool.query("SELECT id, name, status, is_admin, pin_hash FROM teachers ORDER BY created_at DESC");
  console.log('All teachers:');
  for (const t of rows) {
    const match1234 = await bcrypt.compare('1234', t.pin_hash);
    console.log(`  name: "${t.name}" | status: ${t.status} | is_admin: ${t.is_admin} | password=1234: ${match1234 ? 'YES' : 'NO'}`);
  }
  await pool.end();
})().catch(e => console.error(e.message));
