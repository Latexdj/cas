'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SCHOOL_ID  = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const ADMIN_ID   = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE       = 'http://localhost:3000';

// Admin token (role=admin, no type=management)
const adminToken = jwt.sign(
  { id: ADMIN_ID, name: 'GERALD BASUGLO HILLIA', role: 'admin', schoolId: SCHOOL_ID },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

// Management token (type=management) — uses same teacher id as admin for simplicity
const mgmtToken = jwt.sign(
  { id: ADMIN_ID, schoolId: SCHOOL_ID, type: 'management' },
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

async function run() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  General Letters Phase 4 — Approval Workflow Verification');
  console.log('═══════════════════════════════════════════════════════════');

  // ══════════════════════════════════════════════════════════════════════════
  // [ 1 ] CREATE pending_approval LETTER → confirm appears in management pending list
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 1 ] Create external_official letter → appears in management pending list');

  const r1a = await req('POST', '/api/general-letters', {
    classification: 'external_official', recipient_type: 'external',
    ext_recipient_name: 'Director General Phase4', ext_recipient_org: 'GES',
    ext_recipient_address: 'P.O. Box 1\nAccra',
    subject: 'Phase 4 Verification', body: 'Verification body text for Phase 4 testing.',
    is_sensitive: false, issued_date: '2026-09-05',
  });
  check('POST /api/general-letters → 201', r1a.status === 201, `got ${r1a.status}`);
  check('status = pending_approval', r1a.data?.status === 'pending_approval', `status=${r1a.data?.status}`);
  check('requires_approval = true', r1a.data?.requires_approval === true, `requires_approval=${r1a.data?.requires_approval}`);
  const letterId = r1a.data?.id;
  if (letterId) cleanupIds.push(letterId);

  // Confirm it appears in management pending list
  const r1b = await req('GET', '/api/principal/general-letters', null, mgmtToken);
  check('GET /api/principal/general-letters → 200 with mgmt token', r1b.status === 200, `got ${r1b.status}`);
  check('pending list is an array', Array.isArray(r1b.data), `type=${typeof r1b.data}`);
  const foundInList = Array.isArray(r1b.data) && r1b.data.some(l => l.id === letterId);
  check('Created letter appears in management pending list', foundInList, foundInList ? 'found' : `not found in ${r1b.data?.length ?? 0} rows`);

  // Confirm listing returns expected fields
  const row = Array.isArray(r1b.data) ? r1b.data.find(l => l.id === letterId) : null;
  check('Row has subject field', !!row?.subject, `subject="${row?.subject}"`);
  check('Row has issued_by_name field', !!row?.issued_by_name, `issued_by_name="${row?.issued_by_name}"`);
  check('Row has ext_recipient_name', row?.ext_recipient_name === 'Director General Phase4', `ext_recipient_name="${row?.ext_recipient_name}"`);

  // Admin (non-management) cannot access principal/general-letters endpoint
  const r1c = await req('GET', '/api/principal/general-letters', null, adminToken);
  check('Admin cannot access /api/principal/general-letters (403)', r1c.status === 403, `got ${r1c.status}`);

  // ══════════════════════════════════════════════════════════════════════════
  // [ 2 ] APPROVE via endpoint → status=issued, approved_by_name from DB
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 2 ] Approve via PATCH /:id/approve → status=issued, approved_by_name resolved from DB');

  if (!letterId) {
    check('Cannot test approve — no letter was created', false, 'skipped');
  } else {
    const r2a = await req('PATCH', `/api/general-letters/${letterId}/approve`, {}, mgmtToken);
    check('PATCH /approve with mgmt token → 200', r2a.status === 200, `got ${r2a.status}`);
    check('status = issued after approval', r2a.data?.status === 'issued', `status=${r2a.data?.status}`);
    check('approved_by_name is a non-empty string', typeof r2a.data?.approved_by_name === 'string' && r2a.data?.approved_by_name.length > 0,
      `approved_by_name="${r2a.data?.approved_by_name}"`);
    check('approved_at is set', !!r2a.data?.approved_at, `approved_at=${r2a.data?.approved_at}`);

    // Verify approved_by_name was resolved from DB (teachers table), not from JWT payload (JWT has no name for mgmt)
    const { rows: dbRows } = await pool.query(
      `SELECT status, approved_by_name, approved_at FROM general_letters WHERE id = $1`,
      [letterId]
    );
    check('DB: status = issued', dbRows[0]?.status === 'issued', `db_status=${dbRows[0]?.status}`);
    check('DB: approved_by_name matches response', dbRows[0]?.approved_by_name === r2a.data?.approved_by_name,
      `db="${dbRows[0]?.approved_by_name}" vs response="${r2a.data?.approved_by_name}"`);

    // After approval: letter must NOT appear in pending list anymore
    const r2b = await req('GET', '/api/principal/general-letters', null, mgmtToken);
    const stillPending = Array.isArray(r2b.data) && r2b.data.some(l => l.id === letterId);
    check('Approved letter no longer in pending list', !stillPending, stillPending ? 'still found!' : 'correctly absent');

    // Re-approving an already-issued letter returns 404 (status != pending_approval)
    const r2c = await req('PATCH', `/api/general-letters/${letterId}/approve`, {}, mgmtToken);
    check('Re-approval of issued letter → 404', r2c.status === 404, `got ${r2c.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [ 3 ] ADMIN (non-management) cannot approve
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 3 ] Admin (non-management) cannot see or use approve action');

  // Create a fresh pending_approval letter for admin-403 test
  const r3a = await req('POST', '/api/general-letters', {
    classification: 'external_official', recipient_type: 'external',
    ext_recipient_name: 'Admin403 Test', subject: 'Admin approval test',
    body: 'Test body.', is_sensitive: false, issued_date: '2026-09-05',
  });
  check('Created second pending letter → 201', r3a.status === 201, `got ${r3a.status}`);
  const adminTestId = r3a.data?.id;
  if (adminTestId) cleanupIds.push(adminTestId);

  if (adminTestId) {
    // Admin cannot access management listing
    const r3b = await req('GET', '/api/principal/general-letters', null, adminToken);
    check('Admin: GET /api/principal/general-letters → 403', r3b.status === 403, `got ${r3b.status}`);

    // Admin cannot approve
    const r3c = await req('PATCH', `/api/general-letters/${adminTestId}/approve`, {}, adminToken);
    check('Admin: PATCH /approve → 403', r3c.status === 403, `got ${r3c.status}: ${r3c.data?.error ?? ''}`);

    // Verify the letter is still pending_approval (not changed)
    const r3d = await req('GET', `/api/general-letters/${adminTestId}`);
    check('Letter status unchanged after blocked admin approve', r3d.data?.status === 'pending_approval', `status=${r3d.data?.status}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // [ 4 ] parent_communication never appears in pending queue
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 4 ] parent_communication → requires_approval=false → never in pending list');

  const r4a = await req('POST', '/api/general-letters', {
    classification: 'parent_communication', recipient_type: 'parent',
    ext_recipient_name: 'Mrs Test Parent', subject: 'Phase 4 parent test',
    body: 'Direct issue test.', is_sensitive: false, issued_date: '2026-09-05',
  });
  check('POST parent_communication → 201', r4a.status === 201, `got ${r4a.status}`);
  check('parent_communication requires_approval = false', r4a.data?.requires_approval === false, `requires_approval=${r4a.data?.requires_approval}`);
  check('parent_communication status = issued (not pending)', r4a.data?.status === 'issued', `status=${r4a.data?.status}`);
  const parentId = r4a.data?.id;
  if (parentId) cleanupIds.push(parentId);

  // Must not appear in management pending list
  const r4b = await req('GET', '/api/principal/general-letters', null, mgmtToken);
  const parentInList = Array.isArray(r4b.data) && r4b.data.some(l => l.id === parentId);
  check('parent_communication not in management pending list', !parentInList, parentInList ? 'FOUND — should not be there!' : 'correctly absent');

  // Also test internal_administrative (never requires approval)
  const { rows: teacherRows } = await pool.query(
    `SELECT id FROM teachers WHERE school_id = $1 LIMIT 1`, [SCHOOL_ID]
  );
  if (teacherRows.length) {
    const r4c = await req('POST', '/api/general-letters', {
      classification: 'internal_administrative', recipient_type: 'teacher',
      internal_recipient_id: teacherRows[0].id, internal_recipient_table: 'teachers',
      subject: 'Phase 4 internal test', body: 'Internal memo body.',
      is_sensitive: false, issued_date: '2026-09-05',
    });
    check('POST internal_administrative → 201', r4c.status === 201, `got ${r4c.status}`);
    check('internal_administrative requires_approval = false', r4c.data?.requires_approval === false, `requires_approval=${r4c.data?.requires_approval}`);
    check('internal_administrative status = issued', r4c.data?.status === 'issued', `status=${r4c.data?.status}`);
    if (r4c.data?.id) cleanupIds.push(r4c.data.id);

    const internalInList = Array.isArray(r4b.data) && r4b.data.some(l => l.id === r4c.data?.id);
    check('internal_administrative not in pending list', !internalInList, internalInList ? 'FOUND — should not!' : 'correctly absent');
  } else {
    console.log('    [skip] No teacher found in school — skipping internal_administrative test');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ══════════════════════════════════════════════════════════════════════════
  for (const id of cleanupIds.filter(Boolean)) {
    await pool.query(`DELETE FROM general_letters WHERE id = $1 AND school_id = $2`, [id, SCHOOL_ID]).catch(() => {});
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
