'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Find the school(s) — show all so we can pick the right one
  const { rows: schools } = await pool.query(
    `SELECT id, name, address, phone, email, motto,
            letterhead_url, headmaster_signature_url,
            primary_color, accent_color
     FROM schools ORDER BY name`
  );
  console.log('\n=== SCHOOLS TABLE ===');
  for (const s of schools) {
    console.log(`\nid:                     ${s.id}`);
    console.log(`name:                   ${s.name ?? '(null)'}`);
    console.log(`address:                ${s.address ?? '(null)'}`);
    console.log(`phone:                  ${s.phone ?? '(null)'}`);
    console.log(`email:                  ${s.email ?? '(null)'}`);
    console.log(`motto:                  ${s.motto ?? '(null)'}`);
    console.log(`letterhead_url:         ${s.letterhead_url ? s.letterhead_url.slice(0,60)+'...' : '(null)'}`);
    console.log(`headmaster_sig_url:     ${s.headmaster_signature_url ? s.headmaster_signature_url.slice(0,60)+'...' : '(null)'}`);
    console.log(`primary_color:          ${s.primary_color ?? '(null)'}`);
    console.log(`accent_color:           ${s.accent_color ?? '(null)'}`);
  }

  if (!schools.length) { console.log('No schools found.'); await pool.end(); return; }

  // Use first school (or St Augustine's if found)
  const target = schools.find(s => s.name?.toLowerCase().includes('augustine')) || schools[0];
  console.log(`\n\nUsing school: ${target.name} (${target.id})`);

  // Get admission settings
  const { rows: settings } = await pool.query(
    `SELECT admission_year, admission_reporting_requirements
     FROM school_admission_settings WHERE school_id = $1`,
    [target.id]
  );
  console.log('\n=== ADMISSION SETTINGS ===');
  if (settings.length) {
    console.log(`admission_year:                  ${settings[0].admission_year ?? '(null)'}`);
    console.log(`admission_reporting_requirements: ${settings[0].admission_reporting_requirements ?? '(null)'}`);
  } else {
    console.log('(no settings row found)');
  }

  // Assemble schoolData exactly as the endpoint does
  const schoolData = {
    ...target,
    admission_year:                   settings[0]?.admission_year,
    admission_reporting_requirements:  settings[0]?.admission_reporting_requirements || null,
  };

  console.log('\n=== schoolData passed to buildAdmissionLetterHTML ===');
  console.log(JSON.stringify(schoolData, null, 2));

  // Get a sample completed application
  const { rows: apps } = await pool.query(
    `SELECT a.*, p.name AS program_name
     FROM admission_applications a
     LEFT JOIN programs p ON p.id = a.program_id
     WHERE a.school_id = $1 AND a.status IN ('completed','reported','migrated')
     ORDER BY a.created_at DESC LIMIT 1`,
    [target.id]
  );

  if (!apps.length) {
    console.log('\nNo completed application found — building with dummy data');
  }

  const application = apps[0] ?? {
    id: 'test', admission_number: 'TEST000125', full_name: 'Test Student',
    index_number: null, admission_type: 'direct', program_name: 'General Science',
    house: 'Alpha', residential_status: 'Boarding', gender: 'Male', aggregate: 12,
  };

  // Build the HTML and save it
  const { buildAdmissionLetterHTML, generateAdmissionLetterPDF } = require('./src/services/pdf.service');
  const html = buildAdmissionLetterHTML({ application, school: schoolData });

  const outPath = require('path').join(__dirname, 'admission-letter-test.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n=== HTML saved to: ${outPath} ===`);
  console.log('Check it in a browser to verify letterhead rendering.');

  // Show the top of the body to confirm renderLetterhead output
  const bodyStart = html.indexOf('<body>');
  const snippet = html.slice(bodyStart, bodyStart + 800);
  console.log('\n=== Body start (first 800 chars) ===');
  console.log(snippet);

  // Full PDF generation test — exercises fetchAsDataUri + Puppeteer
  console.log('\n=== Generating real PDF (this may take ~10s) ===');
  try {
    const pdfUrl = await generateAdmissionLetterPDF({ application, school: schoolData });
    console.log(`\n✓ PDF URL: ${pdfUrl}`);
    console.log('Open the URL in a browser to verify letterhead and signature appear.');
  } catch (e) {
    console.error('\n✗ PDF generation failed:', e.message);
  }

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
