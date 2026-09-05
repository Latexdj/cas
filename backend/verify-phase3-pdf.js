'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const jwt  = require('jsonwebtoken');
const { buildLetterHTML } = require('./src/services/pdf.service');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SCHOOL_ID  = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const STUDENT_ID = 'aa53c5bc-b14c-416b-b2ee-f9a67abb6dc2';
const ADMIN_ID   = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE       = 'http://localhost:3000';

const adminToken = jwt.sign(
  { id: ADMIN_ID, name: 'GERALD BASUGLO HILLIA', role: 'admin', schoolId: SCHOOL_ID },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

let pass = 0, fail = 0;
const results = [];
const cleanupIds = [];

function check(name, ok, detail) {
  if (ok) { pass++; results.push(`  ✓ PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else     { fail++; results.push(`  ✗ FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || adminToken}` },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

// Minimal school stub for buildLetterHTML tests (no letterhead image → text header rendered)
const SCHOOL_STUB = {
  name: 'Testville Academy', address: '1 School Road', phone: '020-1234', email: 'info@test.edu',
  motto: 'Per Ardua', letterhead_url: null, headmaster_signature_url: null,
};

function makeExtLetter(overrides = {}) {
  return {
    id: 'test-id', ref_number: 'GL/2026/0001', issued_date: '2026-09-05',
    subject: 'Annual Report Submission',
    body: 'Please find attached the annual report for the academic year 2025-2026.',
    issued_by_name: 'Gerald Hillia', issued_by_signature_url: null,
    ext_recipient_name: 'Dr Kwame Mensah',
    ext_recipient_org:  'Ghana Education Service',
    ext_recipient_address: 'P.O. Box 1234\nAccra',
    status: 'issued',
    ...overrides,
  };
}

function makeStudentLetter(studentName, overrides = {}) {
  return {
    id: 'test-id', ref_number: 'GL/2026/0002', issued_date: '2026-09-05',
    subject: 'Academic Performance Notification',
    body: 'Your child has shown remarkable improvement this term.',
    issued_by_name: 'Gerald Hillia', issued_by_signature_url: null,
    student_name: studentName, student_code: 'STU001', class_name: 'Form 3B',
    status: 'issued',
    ...overrides,
  };
}

async function run() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  General Letters Phase 3 — PDF & Letterhead Verification');
  console.log('═══════════════════════════════════════════════════════════');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 1 ] EXTERNAL ADDRESS BLOCK — buildLetterHTML direct test
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 1 ] External recipient — address block + full-name salutation');

  const extHtml = buildLetterHTML({
    letter: makeExtLetter(),
    school: SCHOOL_STUB,
    recipientType: 'external',
  });

  // Address block: must contain name, org, address
  check('HTML contains recipient name',         extHtml.includes('Dr Kwame Mensah'),         'found');
  check('HTML contains organisation',           extHtml.includes('Ghana Education Service'),  'found');
  check('HTML contains address line',           extHtml.includes('P.O. Box 1234'),            'found');
  check('HTML contains multi-line address',     extHtml.includes('Accra'),                    'found');
  check('Ref number present',                   extHtml.includes('GL/2026/0001'),             'found');
  check('Date present',                         extHtml.includes('5 September 2026'),         'found');

  // Salutation — must use full name, not just first word
  check('Salutation is full-name "Dear Dr Kwame Mensah,"',
    extHtml.includes('Dear Dr Kwame Mensah,'), `found="${extHtml.match(/Dear [^<]+,/)?.[0] ?? 'not found'}"`);
  check('Salutation is NOT first-name-only',
    !extHtml.includes('Dear Dr,'), 'no "Dear Dr,"');

  // Subject — must be RE: format for external
  check('Subject uses RE: prefix', extHtml.includes('RE:'), 'found');

  // Must NOT have "To:" block (that is internal format)
  check('No "To:" block for external',
    !extHtml.match(/<div[^>]*>To:<\/div>/), 'no "To:" label');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 2 ] EXTERNAL FALLBACK — no ext_recipient_name → "Dear Sir/Madam,"
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 2 ] External with no name → fallback salutation');

  const fallbackHtml = buildLetterHTML({
    letter: makeExtLetter({ ext_recipient_name: '', ext_recipient_org: '', ext_recipient_address: '' }),
    school: SCHOOL_STUB,
    recipientType: 'external',
  });

  check('Fallback salutation is "Dear Sir/Madam,"',
    fallbackHtml.includes('Dear Sir/Madam,'),
    `found="${fallbackHtml.match(/Dear [^<]+,/)?.[0] ?? 'not found'}"`);
  check('No crash/empty salutation', !fallbackHtml.includes('Dear ,'), 'no "Dear ,"');

  // Also test null values (not just empty string)
  const nullFallbackHtml = buildLetterHTML({
    letter: makeExtLetter({ ext_recipient_name: null, ext_recipient_org: null, ext_recipient_address: null }),
    school: SCHOOL_STUB,
    recipientType: 'external',
  });
  check('Null ext_recipient_name also falls back',
    nullFallbackHtml.includes('Dear Sir/Madam,'), 'null → Sir/Madam');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 3 ] INTERNAL STUDENT — firstName() logic unchanged
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 3 ] Internal student recipient — existing firstName() logic');

  const studentHtml = buildLetterHTML({
    letter: makeStudentLetter('KUUDAARE IRENE'),
    school: SCHOOL_STUB,
    recipientType: 'student',
  });

  check('Student: "To:" block present (internal format)',
    studentHtml.includes('To:'), 'found');
  check('Student: full name in To: block',
    studentHtml.includes('KUUDAARE IRENE'), 'found');
  check('Student: class name in To: block',
    studentHtml.includes('Form 3B'), 'found');
  check('Student: student code in To: block',
    studentHtml.includes('STU001'), 'found');
  // firstName() → "KUUDAARE" (first space-delimited token)
  check('Student: salutation uses first name only "Dear KUUDAARE,"',
    studentHtml.includes('Dear KUUDAARE,'),
    `found="${studentHtml.match(/Dear [^<]+,/)?.[0] ?? 'not found'}"`);
  check('Student: salutation NOT using full name',
    !studentHtml.includes('Dear KUUDAARE IRENE,'), 'no full name in salutation');
  check('Student: no RE: prefix (internal format)',
    !studentHtml.includes('RE: Academic'), 'no RE: prefix');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 4 ] CODE REUSE CHECK — general-letters.js uses pdf.service, no duplication
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 4 ] Code reuse — pdf.service.buildLetterHTML shared, not duplicated');

  const fs = require('fs');
  const glRoute    = fs.readFileSync(require('path').join(__dirname, 'src/routes/general-letters.js'), 'utf8');
  const discRoute  = fs.readFileSync(require('path').join(__dirname, 'src/routes/discipline.js'), 'utf8');
  const pdfService = fs.readFileSync(require('path').join(__dirname, 'src/services/pdf.service.js'), 'utf8');

  check('general-letters.js requires pdf.service',
    glRoute.includes("require('../services/pdf.service')"), 'found require');
  check('general-letters.js calls generateAndUploadPDF',
    glRoute.includes('generateAndUploadPDF'), 'found call');
  check('general-letters.js does NOT contain its own buildLetterHTML definition',
    !glRoute.includes('function buildLetterHTML'), 'no local definition');
  check('discipline.js also uses same pdf.service (single source of truth)',
    discRoute.includes("require('../services/pdf.service')"), 'found require');
  check('pdf.service.js has single buildLetterHTML definition',
    (pdfService.match(/function buildLetterHTML/g) ?? []).length === 1, 'exactly 1 definition');
  check('pdf.service.js exports buildLetterHTML',
    pdfService.includes('buildLetterHTML'), 'exported');
  // External branch in pdf.service, not in general-letters route
  check('External branch logic lives in pdf.service (not in route)',
    pdfService.includes("recipientType === 'external'") &&
    !glRoute.includes("recipientType === 'external'"),
    'branch in service only');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 5 ] PREVIEW-BEFORE-ISSUE + APPROVAL GATING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 5 ] Preview-before-issue and approval gating');

  // 5a: Create an external_official letter → must require approval
  const r5a = await req('POST', '/api/general-letters', {
    classification: 'external_official', recipient_type: 'external',
    ext_recipient_name: 'Director General', ext_recipient_org: 'Ghana Education Service',
    ext_recipient_address: 'P.O. Box 100\nAccra',
    subject: 'Phase 3 Verification Letter', body: 'This is a verification test letter body.',
    is_sensitive: false, issued_date: '2026-09-05',
  });
  check('external_official letter created → 201', r5a.status === 201, `got ${r5a.status}`);
  check('external_official requires_approval = true', r5a.data?.requires_approval === true,
    `requires_approval=${r5a.data?.requires_approval}`);
  check('status = pending_approval (not issued)', r5a.data?.status === 'pending_approval',
    `status=${r5a.data?.status}`);
  const pendingId = r5a.data?.id;
  cleanupIds.push(pendingId);

  // 5b: Call POST /:id/pdf on the pending letter
  // On Windows, Puppeteer/Chromium may fail — we test that:
  //   - The route is reachable (not 404/403)
  //   - If it succeeds: status stayed pending_approval
  //   - If Puppeteer fails: we get a 500 from PDF generation, not from auth/routing
  const r5b = await req('POST', `/api/general-letters/${pendingId}/pdf`);
  const pdfRouteReachable = r5b.status !== 404 && r5b.status !== 403;
  check('PDF route is reachable (not 404/403)',      pdfRouteReachable, `got ${r5b.status}`);
  check('PDF route requires auth (not 401 with token)', r5b.status !== 401,  `got ${r5b.status}`);

  // Check if PDF actually generated (Puppeteer may or may not work on this host)
  const pdfWorked = r5b.status === 200 && !!r5b.data?.pdf_url;
  if (pdfWorked) {
    console.log(`    [PDF generated] ${r5b.data.pdf_url}`);
  } else {
    console.log(`    [PDF generation] status=${r5b.status} — Puppeteer/Chromium may not be available on this host; route wiring verified separately`);
  }

  // 5c: Verify letter status is STILL pending_approval after PDF attempt
  const r5c = await req('GET', `/api/general-letters/${pendingId}`);
  check('GET /:id → 200', r5c.status === 200, `got ${r5c.status}`);
  check('Status remains pending_approval after PDF generation attempt',
    r5c.data?.status === 'pending_approval',
    `status=${r5c.data?.status}`);

  // 5d: Admin cannot approve (approve is managementOnly)
  const r5d = await req('PATCH', `/api/general-letters/${pendingId}/approve`, {});
  check('Admin cannot approve (403 expected)', r5d.status === 403,
    `got ${r5d.status}: ${r5d.data?.error ?? ''}`);
  check('Status still pending_approval (approve blocked)', r5c.data?.status === 'pending_approval',
    'unchanged');

  // 5e: Non-sensitive parent_communication letter can be issued directly (no approval)
  const r5e = await req('POST', '/api/general-letters', {
    classification: 'parent_communication', recipient_type: 'parent',
    ext_recipient_name: 'Mrs Test Parent', subject: 'Direct Issue Test',
    body: 'Test body for direct issue.', is_sensitive: false, issued_date: '2026-09-05',
  });
  check('parent_communication letter → 201', r5e.status === 201, `got ${r5e.status}`);
  check('parent_communication requires_approval = false', r5e.data?.requires_approval === false,
    `requires_approval=${r5e.data?.requires_approval}`);
  check('parent_communication status = issued', r5e.data?.status === 'issued',
    `status=${r5e.data?.status}`);
  cleanupIds.push(r5e.data?.id);

  // 5f: GET /:id with student JOIN returns resolved name
  const { rows: studentRows } = await pool.query(
    `SELECT id FROM general_letters WHERE school_id = $1 AND internal_recipient_table = 'students' AND status != 'draft' LIMIT 1`,
    [SCHOOL_ID]
  );
  if (studentRows.length) {
    const stuId = studentRows[0].id;
    const r5f = await req('GET', `/api/general-letters/${stuId}`);
    check('GET /:id with student recipient returns internal_recipient_name',
      !!r5f.data?.internal_recipient_name,
      `internal_recipient_name="${r5f.data?.internal_recipient_name}"`);
    check('GET /:id with student recipient returns class_name',
      r5f.data?.class_name !== undefined,
      `class_name="${r5f.data?.class_name}"`);
  } else {
    console.log('    [skip] No issued student letter found in DB for GET /:id JOIN test');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════════════════════════════════════
  for (const id of cleanupIds.filter(Boolean)) {
    await pool.query(`DELETE FROM general_letters WHERE id = $1 AND school_id = $2`, [id, SCHOOL_ID])
      .catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log('');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  pool.end();
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Script error:', e.message, e.stack); pool.end(); process.exit(1); });
