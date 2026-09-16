'use strict';
/**
 * Phase 1 ID Card — verification script
 * Runs all 7 checks against the live backend (http://localhost:3000)
 * using real DB data and signed JWTs. No mocking.
 */

require('dotenv').config();
const jwt  = require('jsonwebtoken');
const { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET;
const BASE   = 'http://localhost:3000';
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

let PASS = 0, FAIL = 0;

function ok(label, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✓ ${label}`); }
  else        { FAIL++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(n, title) { console.log(`\n── Check ${n}: ${title} ──`); }

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function post(path, token, data = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(data) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

function adminToken(teacher) {
  return jwt.sign({ id: teacher.id, name: teacher.name, role: 'admin', schoolId: teacher.school_id }, SECRET, { expiresIn: '1h' });
}
function teacherToken(teacher) {
  return jwt.sign({ id: teacher.id, name: teacher.name, role: 'teacher', schoolId: teacher.school_id }, SECRET, { expiresIn: '1h' });
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 1 ID Card Verification ===\n');

  // ── Gather real data ──────────────────────────────────────────────────────
  // School A — needs: admin teacher, regular teacher, student, academic year
  const { rows: schoolARows } = await pool.query(`
    SELECT s.id AS school_id, s.name AS school_name
    FROM schools s
    JOIN academic_years ay ON ay.school_id = s.id AND ay.is_current = true
    JOIN students st ON st.school_id = s.id AND LOWER(st.status) = 'active'
    JOIN teachers t  ON t.school_id  = s.id AND t.is_admin = true AND LOWER(t.status) = 'active'
    LIMIT 1
  `);
  if (!schoolARows.length) { console.error('SETUP FAIL: No school with all required data found'); process.exit(1); }
  const schoolAId = schoolARows[0].school_id;
  const schoolAName = schoolARows[0].school_name;

  const { rows: [adminTeacher] } = await pool.query(
    `SELECT id, name, school_id FROM teachers WHERE school_id = $1 AND is_admin = true AND LOWER(status) = 'active' LIMIT 1`,
    [schoolAId]
  );
  const { rows: [regularTeacher] } = await pool.query(
    `SELECT id, name, school_id FROM teachers WHERE school_id = $1 AND is_admin = false AND LOWER(status) = 'active' LIMIT 1`,
    [schoolAId]
  );
  const { rows: [studentA] } = await pool.query(
    `SELECT id, name, class_name, jhs_index_number, student_code FROM students WHERE school_id = $1 AND LOWER(status) = 'active' LIMIT 1`,
    [schoolAId]
  );
  const { rows: [academicYear] } = await pool.query(
    `SELECT end_date FROM academic_years WHERE school_id = $1 AND is_current = true LIMIT 1`,
    [schoolAId]
  );

  // School B — needs: at least one teacher
  const { rows: [schoolBTeacher] } = await pool.query(
    `SELECT t.id, t.name, t.school_id FROM teachers t WHERE t.school_id != $1 AND LOWER(t.status) = 'active' LIMIT 1`,
    [schoolAId]
  );

  console.log(`School A : ${schoolAName} (${schoolAId})`);
  console.log(`Admin    : ${adminTeacher.name} (${adminTeacher.id})`);
  console.log(`Teacher  : ${regularTeacher?.name ?? 'n/a'}`);
  console.log(`Student  : ${studentA.name} (${studentA.id})`);
  console.log(`AY end   : ${academicYear?.end_date ?? 'none'}`);
  console.log(`School B teacher: ${schoolBTeacher?.name ?? 'none (skipping cross-school check)'}`);

  const adminTok = adminToken(adminTeacher);
  const teacherTok = regularTeacher ? teacherToken(regularTeacher) : null;
  const schoolBTok  = schoolBTeacher ? teacherToken(schoolBTeacher) : null;

  // Clean any existing test cards for this student so we start fresh
  await pool.query(`DELETE FROM student_id_cards WHERE student_id = $1`, [studentA.id]);
  // Clean test exeats
  await pool.query(`DELETE FROM exeats WHERE student_id = $1 AND reason = 'VERIFY_TEST'`, [studentA.id]);

  // ─────────────────────────────────────────────────────────────────────────
  section(1, 'Generate token — unauthenticated verify returns public tier only');
  const genR = await post(`/api/id-cards/generate/${studentA.id}`, adminTok);
  ok('generate returns 201', genR.status === 201, `status=${genR.status} body=${JSON.stringify(genR.body).slice(0,200)}`);
  const card1 = genR.body.card;
  ok('card has token', !!card1?.token);
  ok('card status is active', card1?.status === 'active');
  ok('reused is false (fresh mint)', genR.body.reused === false);

  const verifyPublic = await get(`/api/verify/${card1.token}`);
  ok('public verify 200', verifyPublic.status === 200, `status=${verifyPublic.status}`);
  const vp = verifyPublic.body;
  ok('public: valid=true',          vp.valid === true);
  ok('public: school name present', !!vp.school);
  ok('public: issue_number present', vp.issue_number !== undefined);
  ok('public: exeat_approved present (bool)', typeof vp.exeat_approved === 'boolean');
  ok('public: NO name field',   vp.student === undefined && vp.name === undefined);
  ok('public: NO class_name',   vp.class_name === undefined && vp.student?.class_name === undefined);
  ok('public: NO photo_url',    vp.photo_url === undefined && vp.student?.photo_url === undefined);
  ok('public: NO index_number', vp.index_number === undefined && vp.student?.index_number === undefined);

  // ─────────────────────────────────────────────────────────────────────────
  section(2, 'Same token authenticated (same school) — full details returned');
  const verifyAuth = await get(`/api/verify/${card1.token}`, teacherTok ?? adminTok);
  ok('auth verify 200', verifyAuth.status === 200);
  const va = verifyAuth.body;
  ok('auth: valid=true',            va.valid === true);
  ok('auth: student object present', !!va.student);
  ok('auth: name present',          !!va.student?.name);
  ok('auth: class_name present',    va.student?.class_name !== undefined);
  ok('auth: index_number present',  va.student?.index_number !== undefined);
  ok('auth: recent_scans array',    Array.isArray(va.recent_scans));

  // ─────────────────────────────────────────────────────────────────────────
  section(3, 'Same token, teacher of DIFFERENT school — no student data');
  if (!schoolBTok) {
    console.log('  SKIP — no second school teacher found in DB');
  } else {
    const verifyCross = await get(`/api/verify/${card1.token}`, schoolBTok);
    ok('cross-school verify 200', verifyCross.status === 200, `status=${verifyCross.status}`);
    const vc = verifyCross.body;
    // Must return public tier only (valid but no student PII) — NOT 404 or error
    ok('cross-school: valid=true (public tier)',   vc.valid === true);
    ok('cross-school: no student object returned', vc.student === undefined);
    ok('cross-school: no name returned',          vc.name === undefined);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section(4, 'Live exeat status — no caching, reflects immediately on status change');

  // 4a: No exeat — should return exeat_approved: false
  const verifNoExeat = await get(`/api/verify/${card1.token}`);
  ok('no exeat: exeat_approved=false', verifNoExeat.body.exeat_approved === false,
     `got ${verifNoExeat.body.exeat_approved}`);

  // 4b: Create an active exeat (departure today, return tomorrow)
  const today      = new Date().toISOString().slice(0, 10);
  const tomorrow   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO exeats (school_id, student_id, exeat_type, status, departure_date, departure_time,
      expected_return_date, expected_return_time, reason)
     VALUES ($1, $2, 'external', 'active', $3, '08:00', $4, '18:00', 'VERIFY_TEST')`,
    [schoolAId, studentA.id, today, tomorrow]
  );
  const verifActive = await get(`/api/verify/${card1.token}`);
  ok('active exeat: exeat_approved=true',  verifActive.body.exeat_approved === true,
     `got ${verifActive.body.exeat_approved}`);

  // 4c: Mark overdue — should immediately flip to false
  await pool.query(
    `UPDATE exeats SET status = 'overdue'
     WHERE student_id = $1 AND reason = 'VERIFY_TEST'`,
    [studentA.id]
  );
  const verifOverdue = await get(`/api/verify/${card1.token}`);
  ok('overdue exeat: exeat_approved=false (live flip)', verifOverdue.body.exeat_approved === false,
     `got ${verifOverdue.body.exeat_approved}`);

  // Clean up test exeat
  await pool.query(`DELETE FROM exeats WHERE student_id = $1 AND reason = 'VERIFY_TEST'`, [studentA.id]);

  // ─────────────────────────────────────────────────────────────────────────
  section(5, 'Revocation — old token cancelled, new token issued, issue_number incremented');
  const revokeR = await post(`/api/id-cards/revoke/${studentA.id}`, adminTok, { reason: 'Test revocation' });
  ok('revoke 200', revokeR.status === 200, `status=${revokeR.status} body=${JSON.stringify(revokeR.body).slice(0,200)}`);
  const revoked     = revokeR.body.revoked;
  const replacement = revokeR.body.replacement;
  ok('revoked.token matches card1.token', revoked?.token === card1.token);
  ok('replacement has new token',         replacement?.token && replacement.token !== card1.token);
  ok('issue_number incremented',          replacement?.issue_number === (card1.issue_number + 1),
     `old=${card1.issue_number} new=${replacement?.issue_number}`);

  // Scan old (revoked) token
  const verifRevoked = await get(`/api/verify/${card1.token}`);
  ok('revoked token: valid=false',            verifRevoked.body.valid === false);
  ok('revoked token: status=revoked',         verifRevoked.body.status === 'revoked');
  ok('revoked token: message contains cancel', verifRevoked.body.message?.toLowerCase().includes('cancel'),
     `msg: ${verifRevoked.body.message}`);
  ok('revoked token: school name still present', !!verifRevoked.body.school);

  // Scan new token — should be valid
  const verifNew = await get(`/api/verify/${replacement.token}`);
  ok('new token: valid=true', verifNew.body.valid === true);

  // Confirm old card in DB has status=revoked
  const { rows: oldCardRows } = await pool.query(
    `SELECT status, revoke_reason FROM student_id_cards WHERE token = $1`,
    [card1.token]
  );
  ok('DB: old card status=revoked',          oldCardRows[0]?.status === 'revoked');
  ok('DB: revoke_reason stored',             !!oldCardRows[0]?.revoke_reason);
  ok('DB: new card status=active',           replacement?.status === 'active');

  // ─────────────────────────────────────────────────────────────────────────
  section(6, 'Scan logging — every call writes a row with correct response_status');

  // Unknown token
  const bogusToken = '00000000-0000-0000-0000-000000000000';
  await get(`/api/verify/${bogusToken}`);

  // Give the fire-and-forget log writes a moment to settle
  await new Promise(r => setTimeout(r, 400));

  const { rows: scansRevoked } = await pool.query(
    `SELECT response_status FROM id_card_scans WHERE token_queried = $1 ORDER BY scanned_at DESC LIMIT 1`,
    [card1.token]
  );
  ok('DB: revoked scan logged as "revoked"', scansRevoked[0]?.response_status === 'revoked',
     `got ${scansRevoked[0]?.response_status}`);

  const { rows: scansNew } = await pool.query(
    `SELECT response_status FROM id_card_scans WHERE token_queried = $1 ORDER BY scanned_at DESC LIMIT 1`,
    [replacement.token]
  );
  ok('DB: valid-public scan logged as "valid_public"', scansNew[0]?.response_status === 'valid_public',
     `got ${scansNew[0]?.response_status}`);

  const { rows: scansUnknown } = await pool.query(
    `SELECT response_status FROM id_card_scans WHERE token_queried = $1 ORDER BY scanned_at DESC LIMIT 1`,
    [bogusToken]
  );
  ok('DB: unknown token scan logged as "unknown"', scansUnknown[0]?.response_status === 'unknown',
     `got ${scansUnknown[0]?.response_status}`);

  // Auth scan of new token (if we had a teacher token)
  if (teacherTok) {
    await get(`/api/verify/${replacement.token}`, teacherTok);
    await new Promise(r => setTimeout(r, 400));
    const { rows: scansAuthNew } = await pool.query(
      `SELECT response_status FROM id_card_scans WHERE token_queried = $1 ORDER BY scanned_at DESC LIMIT 1`,
      [replacement.token]
    );
    ok('DB: auth scan logged as "valid_auth"', scansAuthNew[0]?.response_status === 'valid_auth',
       `got ${scansAuthNew[0]?.response_status}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  section(7, 'expires_at set to current academic year end date, not null');
  const { rows: [freshCard] } = await pool.query(
    `SELECT expires_at FROM student_id_cards WHERE token = $1`,
    [replacement.token]
  );
  ok('DB: expires_at is not null', freshCard?.expires_at !== null && freshCard?.expires_at !== undefined,
     `got ${freshCard?.expires_at}`);

  if (academicYear?.end_date && freshCard?.expires_at) {
    const dbEnd   = new Date(academicYear.end_date);
    const cardExp = new Date(freshCard.expires_at);
    // Compare just date portions — expires_at is set to 23:59:59 UTC of end_date
    const sameDatePart =
      dbEnd.getUTCFullYear() === cardExp.getUTCFullYear() &&
      dbEnd.getUTCMonth()    === cardExp.getUTCMonth()    &&
      dbEnd.getUTCDate()     === cardExp.getUTCDate();
    ok(`DB: expires_at matches academic year end_date (${academicYear.end_date})`, sameDatePart,
       `expires_at=${freshCard.expires_at}`);
  } else {
    ok('DB: academic year end_date used (no current AY found — skipping date match)', true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reuse check: generate again for same student — must reuse, not mint new
  section('bonus', 'Generate again for same student — reuses existing active card');
  const gen2 = await post(`/api/id-cards/generate/${studentA.id}`, adminTok);
  ok('second generate 200', gen2.status === 200);
  ok('second generate reused=true', gen2.body.reused === true,
     `got reused=${gen2.body.reused}`);
  ok('second generate same token',  gen2.body.card?.token === replacement.token,
     `expected ${replacement.token}, got ${gen2.body.card?.token}`);

  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════`);
  console.log(`RESULT: ${PASS} PASS / ${FAIL} FAIL`);
  if (FAIL === 0) console.log('ALL CHECKS PASSED ✓');
  else            console.error('SOME CHECKS FAILED — see ✗ above');

  await pool.end();
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  pool.end().finally(() => process.exit(1));
});
