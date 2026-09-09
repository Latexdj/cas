'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { generateAndUploadPDF } = require('./src/services/pdf.service');

const SASH = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5'; // St Augustine's

async function run() {
  // Fetch school branding
  const { rows: sRows } = await pool.query(
    `SELECT name, address, phone, email, motto, letterhead_url, headmaster_signature_url,
            primary_color, accent_color
     FROM schools WHERE id = $1`,
    [SASH]
  );
  const school = sRows[0];
  console.log('\nSchool letterhead_url:', school.letterhead_url ? school.letterhead_url.slice(0,70)+'...' : '(null)');
  console.log('School sig_url:', school.headmaster_signature_url ? school.headmaster_signature_url.slice(0,70)+'...' : '(null)');

  // ── Test 1: General letter ──────────────────────────────────────────────────
  console.log('\n=== Test 1: General letter PDF ===');
  const { rows: glRows } = await pool.query(
    `SELECT gl.*,
            CASE WHEN gl.internal_recipient_table = 'students' THEN s.name
                 WHEN gl.internal_recipient_table = 'teachers' THEN t.name
                 ELSE NULL END AS internal_recipient_name,
            s.student_code, s.class_name, t.department
     FROM general_letters gl
     LEFT JOIN students s ON s.id = gl.internal_recipient_id AND gl.internal_recipient_table = 'students'
     LEFT JOIN teachers t ON t.id = gl.internal_recipient_id AND gl.internal_recipient_table = 'teachers'
     WHERE gl.school_id = $1 ORDER BY gl.created_at DESC LIMIT 1`,
    [SASH]
  );
  if (glRows.length) {
    const raw = glRows[0];
    const isExternal = raw.recipient_type === 'external' || raw.recipient_type === 'parent';
    const recipientType = isExternal ? 'external'
      : raw.internal_recipient_table === 'students' ? 'student' : 'teacher';
    const letter = {
      ...raw,
      student_name: raw.internal_recipient_table === 'students' ? raw.internal_recipient_name : undefined,
      teacher_name: raw.internal_recipient_table === 'teachers' ? raw.internal_recipient_name : undefined,
    };
    try {
      const url = await generateAndUploadPDF({ letter, school, recipientType, watermark: true, pathPrefix: `general-letters/${SASH}` });
      console.log('✓ General letter PDF URL:', url);
    } catch (e) {
      console.error('✗ Failed:', e.message);
    }
  } else {
    console.log('No general letters found — using synthetic data.');
    const letter = {
      id: 'test-gl', ref_number: 'SAS/GL/001', subject: 'Test Letter',
      body: 'This is a test general letter to verify letterhead rendering.',
      issued_by_name: 'The Headmaster', issued_date: new Date().toISOString().slice(0,10),
      issued_by_signature_url: school.headmaster_signature_url,
      student_name: 'Test Student', class_name: 'Form 1A', student_code: 'SAS001',
    };
    const url = await generateAndUploadPDF({ letter, school, recipientType: 'student', watermark: true, pathPrefix: `general-letters/${SASH}` });
    console.log('✓ Synthetic general letter PDF URL:', url);
  }

  // ── Test 2: Teacher query (discipline) ─────────────────────────────────────
  console.log('\n=== Test 2: Discipline/teacher-query PDF ===');
  const { rows: tqRows } = await pool.query(
    `SELECT tq.*, t.name AS teacher_name, t.department
     FROM teacher_queries tq
     JOIN teachers t ON t.id = tq.teacher_id
     WHERE tq.school_id = $1 ORDER BY tq.created_at DESC LIMIT 1`,
    [SASH]
  );
  if (tqRows.length) {
    const letter = {
      ...tqRows[0],
      issued_by_signature_url: tqRows[0].issued_by_signature_url || school.headmaster_signature_url,
    };
    try {
      const url = await generateAndUploadPDF({ letter, school, recipientType: 'teacher', watermark: false, pathPrefix: `discipline/letters/${SASH}` });
      console.log('✓ Teacher query PDF URL:', url);
    } catch (e) {
      console.error('✗ Failed:', e.message);
    }
  } else {
    console.log('No teacher queries found — skipping.');
  }

  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
