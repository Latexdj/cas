'use strict';
// Run: node migrate-6a.js
// Applies Phase 6a schema to the connected Supabase instance.
require('dotenv').config();
const pool = require('./src/config/db');
const fs   = require('fs');
const path = require('path');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate-6a.sql'), 'utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    console.log('→', preview);
    try {
      await pool.query(stmt);
      console.log('  OK');
    } catch (e) {
      console.error('  FAILED:', e.message);
      // HNSW index failure is non-fatal — table still works via seqscan
      if (!stmt.includes('hnsw')) process.exit(1);
      console.log('  (HNSW index skipped — continuing)');
    }
  }
  console.log('\nMigration complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
