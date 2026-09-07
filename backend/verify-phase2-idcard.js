'use strict';
/**
 * Phase 2 ID Card — verification script.
 * Checks 1-4 as specified. Uses live backend (http://localhost:3000)
 * and direct DB queries. No mocking.
 *
 * QR decoding: jsqr (pure JS) + pngjs (PNG pixel decoder).
 * Both installed with --no-save; safe to remove after.
 */

require('dotenv').config();
const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');
const jsQR   = require('jsqr');
const { PNG } = require('pngjs');
const { buildCardMarkup, buildCardHTML, generateCardBuffer } = require('./src/services/pdf.service');

const SECRET = process.env.JWT_SECRET;
const BASE   = 'http://localhost:3000';
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

let PASS = 0, FAIL = 0;

function ok(label, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✓ ${label}`); }
  else       { FAIL++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(n, title) { console.log(`\n── Check ${n}: ${title} ──`); }

async function postPDF(endpoint, adminTok) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return { status: r.status, contentType: r.headers.get('content-type') ?? '', buffer: Buffer.from(await r.arrayBuffer()) };
}

async function getJSON(endpoint, tok) {
  const r = await fetch(`${BASE}${endpoint}`, tok ? { headers: { Authorization: `Bearer ${tok}` } } : {});
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Decode a QR code from a base64 PNG data URL using jsqr + pngjs.
async function decodeQRDataUrl(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const pngBuf = Buffer.from(base64, 'base64');

  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(pngBuf, (err, data) => {
      if (err) return reject(err);
      const code = jsQR(new Uint8ClampedArray(data.data), data.width, data.height);
      resolve(code?.data ?? null);
    });
  });
}

// Extract the QR data URL from card HTML.
function extractQRDataUrl(html) {
  const m = html.match(/src="(data:image\/png;base64,[^"]+)"/);
  return m ? m[1] : null;
}

async function main() {
  console.log('=== Phase 2 ID Card Verification ===\n');

  const SCHOOL_A = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';

  // Admin token
  const { rows: [admin] } = await pool.query(
    `SELECT id, name, school_id FROM teachers WHERE school_id=$1 AND is_admin=true AND LOWER(status)='active' LIMIT 1`,
    [SCHOOL_A]
  );
  const adminTok = jwt.sign({ id: admin.id, name: admin.name, role: 'admin', schoolId: admin.school_id }, SECRET, { expiresIn: '1h' });

  // Student WITH photo
  const { rows: [withPhoto] } = await pool.query(
    `SELECT id, name, class_name, jhs_index_number, student_code, picture_url
     FROM students WHERE school_id=$1 AND picture_url IS NOT NULL AND picture_url!='' AND LOWER(status)='active' LIMIT 1`,
    [SCHOOL_A]
  );
  // Student WITHOUT photo
  const { rows: [noPhoto] } = await pool.query(
    `SELECT id, name, class_name, jhs_index_number, student_code, picture_url
     FROM students WHERE school_id=$1 AND (picture_url IS NULL OR picture_url='') AND LOWER(status)='active' LIMIT 1`,
    [SCHOOL_A]
  );
  // School
  const { rows: [school] } = await pool.query(`SELECT name, logo_url FROM schools WHERE id=$1`, [SCHOOL_A]);

  console.log(`Admin:       ${admin.name}`);
  console.log(`With photo:  ${withPhoto?.name ?? 'NONE'} (${withPhoto?.id})`);
  console.log(`No photo:    ${noPhoto?.name ?? 'NONE'} (${noPhoto?.id})`);
  console.log(`School:      ${school.name}`);

  // ── Pre-clean: remove existing test cards for both students ──────────────
  if (withPhoto) await pool.query(`DELETE FROM student_id_cards WHERE student_id=$1`, [withPhoto.id]);
  if (noPhoto)   await pool.query(`DELETE FROM student_id_cards WHERE student_id=$1`, [noPhoto.id]);

  // ─────────────────────────────────────────────────────────────────────────
  section(1, 'PDF generation — layout elements + QR decodes to correct token');

  if (!withPhoto) { console.log('  SKIP — no student with photo found'); }
  else {
    // Generate via HTTP endpoint (full stack: route → generateCardBuffer → PDF)
    const r = await postPDF(`/api/id-cards/pdf/${withPhoto.id}`, adminTok);
    ok('endpoint returns 200', r.status === 200, `status=${r.status}`);
    ok('content-type is application/pdf', r.contentType.includes('application/pdf'), `got: ${r.contentType}`);
    ok('response is a non-empty buffer', r.buffer.length > 0);
    ok('PDF magic bytes (%PDF)', r.buffer.slice(0, 4).toString() === '%PDF', `first 4: ${r.buffer.slice(0,4).toString()}`);

    // Fetch the newly created card from DB for token verification
    const { rows: [dbCard] } = await pool.query(
      `SELECT * FROM student_id_cards WHERE student_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
      [withPhoto.id]
    );
    ok('DB: active card created', !!dbCard);

    // Build card HTML directly (service-level) and inspect layout
    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(dbCard.token, { errorCorrectionLevel: 'M', width: 200, margin: 1 });
    const html = buildCardHTML({ student: withPhoto, card: dbCard, school, qrDataUrl });

    // Layout element checks
    ok('HTML: school name present',   html.includes(school.name));
    ok('HTML: "CAS" badge present',   html.includes('>CAS<'));
    ok('HTML: student name present',  html.includes(withPhoto.name));
    ok('HTML: class_name present',    html.includes(withPhoto.class_name));
    ok('HTML: jhs_index_number present', html.includes(withPhoto.jhs_index_number));
    ok('HTML: student_code present',  html.includes(withPhoto.student_code));
    ok('HTML: issue number present',  html.includes(`#${dbCard.issue_number}`));
    ok('HTML: "Valid to" in footer',  html.includes('Valid to'));
    ok('HTML: QR <img> present',      html.includes('data:image/png;base64,'));
    ok('HTML: photo <img> present',   html.includes(withPhoto.picture_url));

    // Decode the QR from the data URL
    const qrExtracted = extractQRDataUrl(html);
    ok('QR data URL extractable from HTML', !!qrExtracted);
    let decoded = null;
    if (qrExtracted) {
      decoded = await decodeQRDataUrl(qrExtracted);
    }
    ok(`QR decodes to card token (${dbCard.token?.slice(0,8)}…)`,
       decoded === dbCard.token,
       `decoded="${decoded}" expected="${dbCard.token}"`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section(2, 'No photo — placeholder silhouette, generation succeeds');

  if (!noPhoto) { console.log('  SKIP — no student without photo found'); }
  else {
    const r = await postPDF(`/api/id-cards/pdf/${noPhoto.id}`, adminTok);
    ok('endpoint returns 200 (no photo)',      r.status === 200, `status=${r.status}`);
    ok('content-type is application/pdf',      r.contentType.includes('application/pdf'));
    ok('PDF magic bytes (%PDF)',               r.buffer.slice(0, 4).toString() === '%PDF');

    // Inspect HTML for placeholder (no picture_url → SVG silhouette)
    const { rows: [dbCard2] } = await pool.query(
      `SELECT * FROM student_id_cards WHERE student_id=$1 AND status='active' LIMIT 1`,
      [noPhoto.id]
    );
    const QRCode = require('qrcode');
    const qrDataUrl2 = await QRCode.toDataURL(dbCard2.token, { errorCorrectionLevel: 'M', width: 200, margin: 1 });
    const html2 = buildCardMarkup({ student: noPhoto, card: dbCard2, school, qrDataUrl: qrDataUrl2 });

    ok('HTML: SVG placeholder present (no picture_url)', html2.includes('<svg'));
    ok('HTML: no broken <img> with empty src',          !html2.includes('src=""') && !html2.includes("src=''"));
    ok('HTML: student name still renders',              html2.includes(noPhoto.name));
  }

  // ─────────────────────────────────────────────────────────────────────────
  section(3, 'Reissue — old token revoked, new token incremented, old QR shows cancelled');

  // Use withPhoto student (has an active card from Check 1)
  if (!withPhoto) { console.log('  SKIP — no student with photo found'); }
  else {
    // Get the old card before reissue
    const { rows: [oldCard] } = await pool.query(
      `SELECT * FROM student_id_cards WHERE student_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
      [withPhoto.id]
    );
    ok('old card exists before reissue', !!oldCard);
    const oldToken     = oldCard?.token;
    const oldIssueNum  = oldCard?.issue_number;

    const r = await postPDF(`/api/id-cards/reissue-pdf/${withPhoto.id}`, adminTok);
    ok('reissue endpoint returns 200',    r.status === 200, `status=${r.status}`);
    ok('content-type is application/pdf', r.contentType.includes('application/pdf'));
    ok('PDF magic bytes (%PDF)',          r.buffer.slice(0, 4).toString() === '%PDF');

    // Verify DB state
    const { rows: [revokedRow] } = await pool.query(
      `SELECT status, revoke_reason FROM student_id_cards WHERE token=$1`, [oldToken]
    );
    ok('DB: old card status = revoked', revokedRow?.status === 'revoked', `got ${revokedRow?.status}`);

    const { rows: [newCard] } = await pool.query(
      `SELECT * FROM student_id_cards WHERE student_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
      [withPhoto.id]
    );
    ok('DB: new card exists (status=active)',   !!newCard);
    ok('DB: new token differs from old token',  newCard?.token !== oldToken, `old=${oldToken} new=${newCard?.token}`);
    ok('DB: issue_number incremented',
       newCard?.issue_number === (oldIssueNum + 1),
       `old=${oldIssueNum} new=${newCard?.issue_number}`);

    // Scan old token via verify endpoint — should be "cancelled"
    const verifyOld = await getJSON(`/api/verify/${oldToken}`);
    ok('old token verify: valid=false',            verifyOld.body.valid === false, `valid=${verifyOld.body.valid}`);
    ok('old token verify: status=revoked',         verifyOld.body.status === 'revoked', `status=${verifyOld.body.status}`);
    ok('old token verify: message contains cancel', verifyOld.body.message?.toLowerCase().includes('cancel'),
       `msg: ${verifyOld.body.message}`);

    // Scan new token — should be valid
    const verifyNew = await getJSON(`/api/verify/${newCard.token}`);
    ok('new token verify: valid=true', verifyNew.body.valid === true, `valid=${verifyNew.body.valid}`);
    ok('new token verify: issue_number matches new card', verifyNew.body.issue_number === newCard.issue_number,
       `verify=${verifyNew.body.issue_number} db=${newCard.issue_number}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section(4, 'Code structure — buildCardHTML in pdf.service.js, no duplication');

  const fs   = require('fs');
  const path = require('path');
  const svc  = fs.readFileSync(path.join(__dirname, 'src/services/pdf.service.js'), 'utf8');

  ok('buildCardHTML defined in pdf.service.js',    svc.includes('function buildCardHTML'));
  ok('buildCardMarkup defined in pdf.service.js',  svc.includes('function buildCardMarkup'));
  ok('generateCardBuffer defined in pdf.service.js', svc.includes('async function generateCardBuffer'));
  ok('buildLetterHTML still present (not removed)', svc.includes('function buildLetterHTML'));

  // Card functions must NOT duplicate the letter pipeline patterns
  // (buildLetterHTML's internal logic: school.letterhead_url, sigHtml, pageHead, @page { margin: 22mm })
  // Card HTML uses its own @page (85.6mm×54mm, margin:0). Check they're separate.
  const cardSection  = svc.slice(svc.indexOf('function buildCardMarkup'));
  const letterSection = svc.slice(svc.indexOf('function buildLetterHTML'), svc.indexOf('function buildCardMarkup'));

  ok('card functions use CR80 page size (85.6mm)', cardSection.includes('85.6mm'));
  ok('letter function uses A4 margin (22mm)',       letterSection.includes('22mm'));
  ok('card functions do NOT use letterhead_url logic', !cardSection.includes('letterhead_url'));
  ok('card functions do NOT use sigHtml pattern',  !cardSection.includes('sigHtml'));

  // generateCardBuffer should be a NEW Puppeteer launch, not calling generateAndUploadPDF
  ok('generateCardBuffer does NOT call generateAndUploadPDF (no Supabase upload)',
     !svc.slice(svc.indexOf('async function generateCardBuffer')).split('module.exports')[0].includes('generateAndUploadPDF'));

  // Exports include both old and new functions
  const exportLine = svc.slice(svc.lastIndexOf('module.exports'));
  ok('module.exports includes buildCardHTML',    exportLine.includes('buildCardHTML'));
  ok('module.exports includes generateCardBuffer', exportLine.includes('generateCardBuffer'));
  ok('module.exports still includes buildLetterHTML', exportLine.includes('buildLetterHTML'));
  ok('module.exports still includes generateAndUploadPDF', exportLine.includes('generateAndUploadPDF'));

  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════`);
  console.log(`RESULT: ${PASS} PASS / ${FAIL} FAIL`);
  if (FAIL === 0) console.log('ALL CHECKS PASSED ✓');
  else            console.error('SOME CHECKS FAILED — see ✗ above');

  await pool.end();
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message, e.stack);
  pool.end().finally(() => process.exit(1));
});
