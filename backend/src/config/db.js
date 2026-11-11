const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Must stay below the Supabase session-mode pooler's client limit (~15).
  // Above it the pooler refuses connections outright (Postgres XX000) and
  // requests fail at random under load; below it, extra queries just queue
  // here for a moment.
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = pool;
