'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SASH = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5'; // St Augustine's
const MALI = '5bdd02e1-5bd0-463d-8a02-93cb9bc23e77'; // Maalibio

async function run() {
  const { rows: gl } = await pool.query(
    `SELECT id, status, created_at, pdf_url IS NOT NULL AS has_pdf
     FROM general_letters WHERE school_id = $1 ORDER BY created_at DESC`,
    [SASH]
  );

  const { rows: dl } = await pool.query(
    `SELECT id, status, created_at, pdf_url IS NOT NULL AS has_pdf
     FROM student_disciplinary_letters WHERE school_id = $1 ORDER BY created_at DESC`,
    [SASH]
  );

  const { rows: tq } = await pool.query(
    `SELECT id, status, created_at, pdf_url IS NOT NULL AS has_pdf
     FROM teacher_queries WHERE school_id = $1 ORDER BY created_at DESC`,
    [SASH]
  );

  console.log("\n=== GENERAL LETTERS — St Augustine's ===");
  console.log('Total:', gl.length);
  gl.forEach(r => console.log(' ', r.created_at.toISOString().slice(0,10), r.status, 'has_pdf:', r.has_pdf));

  console.log("\n=== DISCIPLINE LETTERS (student) — St Augustine's ===");
  console.log('Total:', dl.length);
  dl.forEach(r => console.log(' ', r.created_at.toISOString().slice(0,10), r.status, 'has_pdf:', r.has_pdf));

  console.log("\n=== TEACHER QUERIES — St Augustine's ===");
  console.log('Total:', tq.length);
  tq.forEach(r => console.log(' ', r.created_at.toISOString().slice(0,10), r.status, 'has_pdf:', r.has_pdf));

  const { rows: gl2 } = await pool.query('SELECT COUNT(*) FROM general_letters WHERE school_id = $1', [MALI]);
  const { rows: dl2 } = await pool.query('SELECT COUNT(*) FROM student_disciplinary_letters WHERE school_id = $1', [MALI]);
  console.log('\n=== Maalibio (letterhead_url=null — text fallback, NOT affected) ===');
  console.log('General letters:', gl2[0].count, '| Discipline letters:', dl2[0].count);

  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
