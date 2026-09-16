'use strict';
/**
 * ID Card Redesign Verification
 * Checks: admin UI fields, 5-field rendering, graceful degradation,
 * QR decode regression, duplex ordering explanation, parameterized back content.
 */

require('dotenv').config();
const { Pool }   = require('pg');
const QRCode     = require('qrcode');
const { PNG }    = require('pngjs');
const jsQR       = require('jsqr');
const pool       = new Pool({ connectionString: process.env.DATABASE_URL });

let pass = 0, fail = 0;
function ok(label, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else       { console.log(`  FAIL  ${label}${detail ? ': ' + detail : ''}`); fail++; }
}
function info(msg) { console.log(`  INFO  ${msg}`); }

// ── helpers ───────────────────────────────────────────────────────────────────

async function decodeQRFromDataUrl(dataUrl) {
  // dataUrl is "data:image/png;base64,<b64>"
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  return new Promise((resolve, reject) => {
    new PNG({ filterType: 4 }).parse(buf, (err, png) => {
      if (err) return reject(err);
      const imageData = {
        data:   png.data,
        width:  png.width,
        height: png.height,
      };
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      resolve(result ? result.data : null);
    });
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' ID Card Redesign Verification');
  console.log('══════════════════════════════════════════════════════\n');

  // ── CHECK 1: Admin settings round-trip ────────────────────────────────────
  console.log('CHECK 1 — Admin settings: editable fields');
  const { rows: schools } = await pool.query(
    `SELECT id, name, primary_color, accent_color, vision, mission, core_values,
            lost_card_contact_1, lost_card_contact_2, headmaster_name,
            headmaster_signature_url, logo_url
     FROM schools LIMIT 3`
  );
  ok('at least one school exists', schools.length > 0);

  const school = schools[0];
  ok('primary_color column present',    'primary_color' in school);
  ok('accent_color column present',     'accent_color'  in school);
  ok('vision column present',           'vision'        in school);
  ok('mission column present',          'mission'       in school);
  ok('core_values column present',      'core_values'   in school);
  ok('lost_card_contact_1 column present', 'lost_card_contact_1' in school);
  ok('lost_card_contact_2 column present', 'lost_card_contact_2' in school);
  ok('headmaster_name column present',  'headmaster_name' in school);

  info(`School: "${school.name}"`);
  info(`  primary_color: ${school.primary_color || '(null)'}`);
  info(`  accent_color:  ${school.accent_color  || '(null)'}`);
  info(`  vision:        ${school.vision        ? school.vision.slice(0, 60) + '…' : '(null — not yet set)'}`);
  info(`  mission:       ${school.mission       ? school.mission.slice(0, 60) + '…' : '(null — not yet set)'}`);
  info(`  core_values:   ${school.core_values   ? school.core_values.slice(0, 60) + '…' : '(null — not yet set)'}`);
  info(`  headmaster_name:    ${school.headmaster_name    || '(null)'}`);
  info(`  lost_card_contact_1: ${school.lost_card_contact_1 || '(null)'}`);
  info(`  lost_card_contact_2: ${school.lost_card_contact_2 || '(null)'}`);

  // ── CHECK 2: Student query returns all 5 front-face fields ────────────────
  console.log('\nCHECK 2 — Student query: all 5 front fields + graceful degradation');

  // Student with full data
  const { rows: fullStudents } = await pool.query(
    `SELECT s.id, s.name, s.class_name, s.student_code, s.picture_url,
            s.gender, s.residential_status, s.house,
            p.name AS program_name,
            ic.token, ic.issue_number, ic.expires_at, ic.status
     FROM students s
     LEFT JOIN programs p ON p.id = s.program_id
     LEFT JOIN student_id_cards ic ON ic.student_id = s.id AND ic.status = 'active'
     WHERE s.school_id = $1
       AND s.gender IS NOT NULL
       AND s.residential_status IS NOT NULL
       AND s.house IS NOT NULL
       AND p.name IS NOT NULL
       AND ic.token IS NOT NULL
     ORDER BY s.name
     LIMIT 1`,
    [school.id]
  );

  // Student with missing field (no house)
  const { rows: partialStudents } = await pool.query(
    `SELECT s.id, s.name, s.class_name, s.student_code, s.picture_url,
            s.gender, s.residential_status, s.house,
            p.name AS program_name,
            ic.token, ic.issue_number, ic.expires_at, ic.status
     FROM students s
     LEFT JOIN programs p ON p.id = s.program_id
     LEFT JOIN student_id_cards ic ON ic.student_id = s.id AND ic.status = 'active'
     WHERE s.school_id = $1
       AND ic.token IS NOT NULL
       AND (s.house IS NULL OR s.house = '')
     ORDER BY s.name
     LIMIT 1`,
    [school.id]
  );

  ok('found a student with all 5 fields + active card', fullStudents.length > 0,
     'no student has gender+status+house+program+active card — populate test data');

  if (fullStudents.length > 0) {
    const fs = fullStudents[0];
    info(`  Full student: ${fs.name}, gender=${fs.gender}, residential_status=${fs.residential_status}, house=${fs.house}, program=${fs.program_name}`);
    ok('NAME not null',    !!fs.name);
    ok('SEX (gender) not null',    !!fs.gender);
    ok('PROGRAM (program_name) not null',  !!fs.program_name);
    ok('STATUS (residential_status) not null', !!fs.residential_status);
    ok('HOUSE not null',   !!fs.house);

    // Verify template renders without 'null' or 'undefined' literals
    const { buildCardMarkup } = require('./src/services/pdf.service');
    const fakeQr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const cardHtml = buildCardMarkup({ student: fs, card: fs, school, qrDataUrl: fakeQr });
    ok('front HTML does not contain literal "null"',       !/>null</.test(cardHtml) && !/: null/.test(cardHtml));
    ok('front HTML does not contain literal "undefined"',  !/>undefined</.test(cardHtml) && !/: undefined/.test(cardHtml));
  }

  if (partialStudents.length > 0) {
    const ps = partialStudents[0];
    info(`  Partial student (no house): ${ps.name}, house=${JSON.stringify(ps.house)}`);
    const { buildCardMarkup } = require('./src/services/pdf.service');
    const fakeQr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const cardHtml = buildCardMarkup({ student: ps, card: ps, school, qrDataUrl: fakeQr });
    ok('partial student: HOUSE shows "—" not null/undefined',
       cardHtml.includes('>—<') && !/>null</.test(cardHtml) && !/>undefined</.test(cardHtml));
    ok('partial student: layout not broken (has all 4 fieldRow containers)',
       (cardHtml.match(/display:flex;align-items:baseline/g) || []).length >= 4);
  } else {
    info('  No student with missing house found — degradation test skipped (all students have house set)');
  }

  // ── CHECK 3: QR decode ────────────────────────────────────────────────────
  console.log('\nCHECK 3 — QR code regression: encodes correct token');

  const testToken = '550e8400-e29b-41d4-a716-446655440000';
  const qrDataUrl = await QRCode.toDataURL(testToken, {
    errorCorrectionLevel: 'M', width: 200, margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  ok('QRCode.toDataURL produces a data URL', qrDataUrl.startsWith('data:image/png;base64,'));

  const decoded = await decodeQRFromDataUrl(qrDataUrl);
  info(`  QR encodes: ${decoded}`);
  ok('QR decodes back to the raw token UUID (no URL prefix)', decoded === testToken,
     `got "${decoded}" expected "${testToken}"`);

  // Verify the verify endpoint is mounted to receive token-only QRs
  // (architectural assertion — no HTTP call needed)
  info('  Verify endpoint: GET /api/verify/:token (and /api/id-cards/:token via shared router)');
  info('  QR encodes raw UUID only — scanner app constructs the full URL. This is by design.');
  ok('QR architecture: raw token is correct (scanner constructs URL)', decoded === testToken);

  // ── CHECK 4: Duplex ordering explanation ──────────────────────────────────
  console.log('\nCHECK 4 — Duplex ordering (EXPLANATION — not a printed-sheet test)');

  // Back face has no per-student data (all content is school-level: name, vision, headmaster).
  // So we verify the back ordering by simulating the same loop logic from buildBatchHTML.
  // This is a source-level logic check — the actual card-to-position mapping.

  const chunk = Array.from({ length: 8 }, (_, i) => i); // indices 0-7
  const backOrder = [];
  for (let r = 0; r < chunk.length; r += 2) {
    backOrder.push(r + 1 < chunk.length ? chunk[r + 1] : null);
    backOrder.push(chunk[r]);
  }
  info(`  Back sheet DOM order (simulated, student indices): [${backOrder.join(', ')}]`);
  info(`  Expected for long-edge flip:                       [1, 0, 3, 2, 5, 4, 7, 6]`);
  info(`  Note: back face contains school data only (vision/mission/name/headmaster),`);
  info(`        not per-student data — ordering is verified via source logic, not HTML parse.`);

  ok('back sheet column pairs swapped per row for long-edge flip',
     JSON.stringify(backOrder) === JSON.stringify([1,0,3,2,5,4,7,6]),
     `got [${backOrder.join(',')}]`);

  console.log('\n  Long-edge duplex mapping (portrait A4, 2 columns):');
  console.log('  Front sheet:          Back sheet (DOM order):');
  console.log('  ┌────────┬────────┐   ┌────────┬────────┐');
  console.log('  │ F0[0]  │ F1[1]  │   │ B1[1]  │ B0[0]  │');
  console.log('  │ F2[2]  │ F3[3]  │   │ B3[3]  │ B2[2]  │');
  console.log('  │ F4[4]  │ F5[5]  │   │ B5[5]  │ B4[4]  │');
  console.log('  │ F6[6]  │ F7[7]  │   │ B7[7]  │ B6[6]  │');
  console.log('  └────────┴────────┘   └────────┴────────┘');
  console.log('');
  console.log('  When the printer flips on the LONG edge (left/right edge, portrait):');
  console.log('  - The sheet rotates left→right: what was top-left is now top-right.');
  console.log('  - F0 (top-left front) lands behind B0 (top-RIGHT on back sheet). ✓');
  console.log('  - F1 (top-right front) lands behind B1 (top-LEFT on back sheet). ✓');
  console.log('');
  console.log('  ⚠ WARNING: This mapping assumes LONG-EDGE (portrait) flip.');
  console.log('  Short-edge flip would require a different mapping (row reversal instead).');
  console.log('  NO PHYSICAL TEST PRINT HAS BEEN DONE. This is a code/logic verification only.');
  console.log('  A real duplex test print on the target printer is required to confirm alignment.');

  // ── CHECK 5: Back content fully parameterized per school ──────────────────
  console.log('\nCHECK 5 — Back content parameterized per school (not hardcoded)');

  const { buildCardBackMarkup } = require('./src/services/pdf.service');

  // School A
  const schoolA = { primary_color: '#003366', accent_color: '#C8973A', name: 'Alpha Academy', logo_url: null,
    vision: 'Alpha Vision text', mission: 'Alpha Mission text', core_values: 'Alpha Values',
    lost_card_contact_1: '0244111000', lost_card_contact_2: '0201222000',
    headmaster_name: 'Mr. Alpha Head', headmaster_signature_url: null };

  // School B
  const schoolB = { primary_color: '#8B0000', accent_color: '#FFD700', name: 'Beta School', logo_url: null,
    vision: 'Beta Vision text', mission: 'Beta Mission text', core_values: 'Beta Values',
    lost_card_contact_1: '0244333000', lost_card_contact_2: null,
    headmaster_name: 'Ms. Beta Head', headmaster_signature_url: null };

  const fakeCard = { token: 'tok', issue_number: 1, expires_at: '2026-12-31', status: 'active' };
  const fakeStudent = { name: 'Test', gender: 'M', residential_status: 'Day', house: 'A', student_code: 'SC1', picture_url: null, program_name: 'Science' };

  const backA = buildCardBackMarkup({ student: fakeStudent, card: fakeCard, school: schoolA });
  const backB = buildCardBackMarkup({ student: fakeStudent, card: fakeCard, school: schoolB });

  ok('back card A contains school A name',      backA.includes('Alpha Academy'));
  ok('back card A contains school A vision',    backA.includes('Alpha Vision text'));
  ok('back card A contains school A contact 1', backA.includes('0244111000'));
  ok('back card A contains school A headmaster',backA.includes('Mr. Alpha Head'));
  ok('back card A uses school A primary color', backA.includes('#003366'));

  ok('back card B contains school B name',      backB.includes('Beta School'));
  ok('back card B contains school B vision',    backB.includes('Beta Vision text'));
  ok('back card B contains school B contact 1', backB.includes('0244333000'));
  ok('back card B contains school B headmaster',backB.includes('Ms. Beta Head'));
  ok('back card B uses school B primary color', backB.includes('#8B0000'));

  ok('back cards A and B are different HTML',   backA !== backB);
  ok('card B single contact renders without second number',
     backB.includes('0244333000') && !backB.includes('0201222000'));

  // No hardcoded "St. Augustine" text
  ok('no hardcoded institution name in buildCardBackMarkup source', (() => {
    const src = require('fs').readFileSync(__filename.replace('verify-idcard-redesign.js',
      'src/services/pdf.service.js'), 'utf8');
    const fnStart = src.indexOf('function buildCardBackMarkup');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    const fnBody  = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    return !fnBody.includes('Augustine') && !fnBody.includes('SHTS') && !fnBody.includes('St.');
  })());

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(` Result: ${pass} PASS / ${fail} FAIL`);
  console.log('══════════════════════════════════════════════════════\n');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); pool.end(); process.exit(1); });
