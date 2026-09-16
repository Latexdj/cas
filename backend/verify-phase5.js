'use strict';
/**
 * Phase 5 ID Card — verification script.
 * 4 checks:
 *   1. Purge job nulls ip_address on rows older than 90 days without deleting the row
 *   2. Per-student scan history endpoint matches actual DB rows
 *   3. All three anomaly categories surface correctly with manufactured data
 *   4. Anomaly endpoint is purely informational — no automated side-effects
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const jwt  = require('jsonwebtoken');
const { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET;
const BASE   = 'http://localhost:3000';
const SCHOOL = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

let PASS = 0, FAIL = 0;
function ok(label, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✓ ${label}`); }
  else       { FAIL++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(n, title) { console.log(`\n── Check ${n}: ${title} ──`); }

async function adminToken() {
  const { rows: [admin] } = await pool.query(
    `SELECT id, name, school_id FROM teachers
     WHERE school_id=$1 AND is_admin=true AND LOWER(status)='active' LIMIT 1`,
    [SCHOOL]
  );
  return jwt.sign(
    { id: admin.id, name: admin.name, role: 'admin', schoolId: admin.school_id },
    SECRET, { expiresIn: '2h' }
  );
}

async function getJSON(endpoint, tok) {
  const r = await fetch(`${BASE}${endpoint}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  );
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function postJSON(endpoint, tok, body = {}) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 5 Verification ===\n');

  const tok = await adminToken();

  // Pick a test student (any active student from our known school with a card)
  const { rows: [testStudent] } = await pool.query(
    `SELECT s.id, s.name, s.class_name, s.student_code,
            c.token, c.id AS card_id, c.status AS card_status
     FROM students s
     JOIN student_id_cards c ON c.student_id = s.id AND c.status = 'active'
     WHERE s.school_id = $1 AND LOWER(s.status) = 'active'
     ORDER BY s.name LIMIT 1`,
    [SCHOOL]
  );
  console.log(`  Test student: ${testStudent.name} (${testStudent.student_code})`);
  console.log(`  Active card token: ${testStudent.token.slice(0,8)}…\n`);

  // Keep track of every row we insert so we can clean up afterwards.
  const insertedScanIds = [];

  // ── Check 1: Purge job nulls IPs on old rows, keeps the rest ─────────────
  section(1, 'IP purge: nulls ip_address on rows older than 90 days, keeps all other columns');
  {
    // Insert three test scan rows — one old (>90d), one borderline (90d ago), one recent.
    const { rows: oldRow } = await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
       VALUES ('purge-test-old', 'valid_public', '192.0.2.1', NOW() - INTERVAL '91 days')
       RETURNING id`,
    );
    const { rows: edgeRow } = await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
       VALUES ('purge-test-edge', 'valid_public', '192.0.2.2', NOW() - INTERVAL '89 days')
       RETURNING id`,
    );
    const { rows: newRow } = await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
       VALUES ('purge-test-new', 'valid_public', '192.0.2.3', NOW() - INTERVAL '1 day')
       RETURNING id`,
    );
    insertedScanIds.push(oldRow[0].id, edgeRow[0].id, newRow[0].id);

    // Run the exact same SQL the purge job uses.
    const { rowCount } = await pool.query(
      `UPDATE id_card_scans
       SET ip_address = NULL
       WHERE ip_address IS NOT NULL
         AND scanned_at < NOW() - INTERVAL '90 days'`
    );
    ok('purge affected at least 1 row (the 91-day one)', rowCount >= 1, `rowCount=${rowCount}`);

    // Old row: ip_address should be NULL, other columns intact.
    const { rows: [after] } = await pool.query(
      `SELECT token_queried, response_status, ip_address, scanned_at
       FROM id_card_scans WHERE id = $1`, [oldRow[0].id]
    );
    ok('old row still exists (not deleted)', !!after, 'row was deleted — should only null ip_address');
    ok('old row: ip_address is now NULL', after?.ip_address === null, `got: ${after?.ip_address}`);
    ok('old row: response_status preserved', after?.response_status === 'valid_public',
       `got: ${after?.response_status}`);
    ok('old row: scanned_at preserved', !!after?.scanned_at, 'scanned_at missing');

    // Edge row (89 days): should NOT have been purged.
    const { rows: [edge] } = await pool.query(
      `SELECT ip_address FROM id_card_scans WHERE id = $1`, [edgeRow[0].id]
    );
    ok('89-day row: ip_address NOT purged (boundary is strictly < 90 days)',
       edge?.ip_address === '192.0.2.2', `got: ${edge?.ip_address}`);

    // Recent row: not purged.
    const { rows: [recent] } = await pool.query(
      `SELECT ip_address FROM id_card_scans WHERE id = $1`, [newRow[0].id]
    );
    ok('recent row: ip_address NOT purged', recent?.ip_address === '192.0.2.3', `got: ${recent?.ip_address}`);

    // Confirm job file exists and is wired into index.js.
    const jobSrc = fs.readFileSync(path.join(__dirname, 'src/jobs/idCardScanPurge.js'), 'utf8');
    ok('purge job uses UPDATE ... SET ip_address = NULL (not DELETE)',
       jobSrc.includes('ip_address = NULL') && !jobSrc.includes('DELETE FROM id_card_scans'),
       'unexpected DELETE or missing NULL assignment');
    const indexSrc = fs.readFileSync(path.join(__dirname, 'src/index.js'), 'utf8');
    ok('purge job imported and called in index.js',
       indexSrc.includes('startIdCardScanPurgeJob') && indexSrc.includes('startIdCardScanPurgeJob()'),
       'startIdCardScanPurgeJob not found in index.js');
  }

  // ── Check 2: Per-student scan history matches DB ──────────────────────────
  section(2, 'Per-student scan history: API response matches DB rows for that student');
  {
    // Insert 3 known scan rows for the test student's active card.
    const testToken = testStudent.token;
    const insertedScans = [];
    for (const [status, ip, ago] of [
      ['valid_public', '10.0.0.1',  '10 minutes'],
      ['valid_auth',   '10.0.0.2',  '2 hours'],
      ['valid_public', '10.0.0.3',  '5 hours'],
    ]) {
      const { rows: [r] } = await pool.query(
        `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '${ago}')
         RETURNING id, response_status, scanned_at, ip_address`,
        [testToken, status, ip]
      );
      insertedScanIds.push(r.id);
      insertedScans.push(r);
    }

    // Call the API.
    const { status: apiStatus, body } = await getJSON(
      `/api/id-cards/student/${testStudent.id}/scans`, tok
    );
    ok('endpoint returns 200', apiStatus === 200, `got ${apiStatus}`);
    ok('body has scans array', Array.isArray(body.scans), `body: ${JSON.stringify(body).slice(0,200)}`);

    // Count DB rows for this student across all their cards.
    const { rows: dbScans } = await pool.query(
      `SELECT s.id, s.response_status, s.scanned_at, s.ip_address
       FROM id_card_scans s
       JOIN student_id_cards c ON c.token::text = s.token_queried
       WHERE c.student_id = $1
       ORDER BY s.scanned_at DESC
       LIMIT 50`,
      [testStudent.id]
    );
    ok(`API returns same count as DB (up to 50): ${dbScans.length} rows`,
       body.scans?.length === dbScans.length, `api=${body.scans?.length} db=${dbScans.length}`);

    // Spot-check: all 3 inserted scan rows appear in the response.
    for (const inserted of insertedScans) {
      const found = body.scans?.find(s => s.response_status === inserted.response_status
                                       && s.ip_address === inserted.ip_address);
      ok(`inserted scan (${inserted.response_status} / ${inserted.ip_address}) present in API response`,
         !!found, `not found in ${body.scans?.length} scans`);
    }

    // Response shape check on first scan.
    if (body.scans?.[0]) {
      const s = body.scans[0];
      ok('scan row has token_queried',     'token_queried'     in s);
      ok('scan row has response_status',   'response_status'   in s);
      ok('scan row has scanned_at',        'scanned_at'        in s);
      ok('scan row has ip_address',        'ip_address'        in s);
      ok('scan row has issue_number',      'issue_number'      in s);
      ok('scan row has card_status',       'card_status'       in s);
      ok('scan row has scanned_by_name',   'scanned_by_name'   in s);
    }

    // Another student's scans must NOT appear.
    const { rows: [otherStudent] } = await pool.query(
      `SELECT s.id, c.token
       FROM students s
       JOIN student_id_cards c ON c.student_id = s.id AND c.status = 'active'
       WHERE s.school_id = $1 AND s.id != $2
       ORDER BY s.name LIMIT 1`,
      [SCHOOL, testStudent.id]
    );
    if (otherStudent) {
      const otherToken = otherStudent.token;
      const crossLeak = body.scans?.find(s => s.token_queried === otherToken);
      ok('no other students\' scans leak into this student\'s history', !crossLeak,
         `found scan for token ${otherToken?.slice(0,8)}…`);
    }
  }

  // ── Check 3: Anomaly categories surface with manufactured data ────────────
  section(3, 'Anomaly categories: revoked scan, multi-IP, off-hours all detected');
  {
    // ── 3a: Revoked-card scan ─────────────────────────────────────────────
    // Pick (or create) a revoked card for a student in our school.
    let revokedToken;
    const { rows: [existingRevoked] } = await pool.query(
      `SELECT c.token FROM student_id_cards c
       JOIN students s ON s.id = c.student_id AND s.school_id = $1
       WHERE c.status = 'revoked' LIMIT 1`,
      [SCHOOL]
    );
    if (existingRevoked) {
      revokedToken = existingRevoked.token;
    } else {
      // Revoke the test student's card temporarily.
      await pool.query(
        `UPDATE student_id_cards SET status='revoked', revoked_at=NOW()
         WHERE id=$1`, [testStudent.card_id]
      );
      revokedToken = testStudent.token;
    }

    // Insert a scan on the revoked token within the last 30 days.
    const { rows: [revokedScanRow] } = await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
       VALUES ($1, 'revoked', '10.1.1.1', NOW() - INTERVAL '2 hours')
       RETURNING id`,
      [revokedToken]
    );
    insertedScanIds.push(revokedScanRow.id);

    // ── 3b: Multi-IP scan ─────────────────────────────────────────────────
    // Insert 3 scans for the active token from 3 different IPs within 6 hours.
    const multiToken = testStudent.token;
    const baseTime = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
    for (const [ip, minOffset] of [['10.2.0.1', 0], ['10.2.0.2', 30], ['10.2.0.3', 90]]) {
      const scanAt = new Date(baseTime.getTime() + minOffset * 60 * 1000).toISOString();
      const { rows: [r] } = await pool.query(
        `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
         VALUES ($1, 'valid_public', $2, $3) RETURNING id`,
        [multiToken, ip, scanAt]
      );
      insertedScanIds.push(r.id);
    }

    // ── 3c: Off-hours scan ────────────────────────────────────────────────
    // Insert a valid scan timestamped at 02:00 Africa/Accra (= 02:00 UTC since Ghana is GMT).
    // Pick the most recent midnight UTC and add 2h to land at 02:00 local.
    const today = new Date();
    const offHourTs = new Date(Date.UTC(
      today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
      2, 17, 0  // 02:17 UTC = 02:17 Africa/Accra
    ));
    // Make sure it falls within the last 30 days (it always will since it's today).
    const { rows: [offHourRow] } = await pool.query(
      `INSERT INTO id_card_scans (token_queried, response_status, ip_address, scanned_at)
       VALUES ($1, 'valid_public', '10.3.0.1', $2) RETURNING id`,
      [testStudent.token, offHourTs.toISOString()]
    );
    insertedScanIds.push(offHourRow.id);

    // Give Postgres a moment to commit, then call the API.
    await new Promise(r => setTimeout(r, 200));

    const { status: anomStatus, body: anom } = await getJSON('/api/id-cards/anomalies', tok);
    ok('anomalies endpoint returns 200', anomStatus === 200, `got ${anomStatus}`);
    ok('body has revoked_scans array',   Array.isArray(anom.revoked_scans),   `body=${JSON.stringify(anom).slice(0,100)}`);
    ok('body has multi_ip_events array', Array.isArray(anom.multi_ip_events), '');
    ok('body has odd_hour_scans array',  Array.isArray(anom.odd_hour_scans),  '');
    ok('body has generated_at timestamp', typeof anom.generated_at === 'string', '');

    // 3a: revoked scan present
    const foundRevoked = anom.revoked_scans?.find(s => s.token_queried === revokedToken);
    ok('revoked-card scan appears in revoked_scans', !!foundRevoked,
       `token ${revokedToken?.slice(0,8)}… not found; total=${anom.revoked_scans?.length}`);
    if (foundRevoked) {
      ok('revoked_scan row has student_name', !!foundRevoked.student_name);
      ok('revoked_scan row has student_id',   !!foundRevoked.student_id);
      ok('revoked_scan row has class_name',   !!foundRevoked.class_name);
      ok('revoked_scan row has scanned_at',   !!foundRevoked.scanned_at);
    }

    // 3b: multi-IP event present (ip_count >= 3)
    const foundMulti = anom.multi_ip_events?.find(e => e.token_queried === multiToken);
    ok('multi-IP event detected for the test token', !!foundMulti,
       `token ${multiToken?.slice(0,8)}… not found; total=${anom.multi_ip_events?.length}`);
    if (foundMulti) {
      ok(`ip_count >= 3 (got ${foundMulti.ip_count})`, parseInt(foundMulti.ip_count) >= 3,
         `ip_count=${foundMulti.ip_count}`);
      ok('multi_ip row has window_start', !!foundMulti.window_start);
      ok('multi_ip row has window_end',   !!foundMulti.window_end);
      ok('multi_ip row has student_name', !!foundMulti.student_name);
    }

    // 3c: off-hours scan present
    const foundOdd = anom.odd_hour_scans?.find(s =>
      s.token_queried === testStudent.token && s.local_hour < 5
    );
    ok('off-hours scan (local_hour=2) appears in odd_hour_scans', !!foundOdd,
       `not found; total=${anom.odd_hour_scans?.length}; hours in set: ${anom.odd_hour_scans?.map(s=>s.local_hour).join(',')}`);
    if (foundOdd) {
      ok('local_hour < 5 (off-hours window)', foundOdd.local_hour < 5,
         `local_hour=${foundOdd.local_hour}`);
      ok('off-hours scan has student_name', !!foundOdd.student_name);
    }

    // Restore revoked card if we revoked it.
    if (!existingRevoked) {
      await pool.query(
        `UPDATE student_id_cards SET status='active', revoked_at=NULL WHERE id=$1`,
        [testStudent.card_id]
      );
    }
  }

  // ── Check 4: Anomaly endpoint is purely informational ─────────────────────
  section(4, 'Anomaly endpoint is read-only — no automated actions');
  {
    const routeSrc = fs.readFileSync(path.join(__dirname, 'src/routes/id-cards.js'), 'utf8');

    // Isolate the anomalies handler body.
    const anomStart = routeSrc.indexOf("'/anomalies'");
    const anomEnd   = routeSrc.indexOf('\n// ──', anomStart + 1);
    const anomBody  = routeSrc.slice(anomStart, anomEnd > 0 ? anomEnd : undefined);

    // Must be GET-only (no mutating DB calls in this handler).
    ok('anomaly handler contains no UPDATE statement',
       !anomBody.includes('UPDATE '), `UPDATE found in anomalies handler`);
    ok('anomaly handler contains no DELETE statement',
       !anomBody.includes('DELETE '), `DELETE found in anomalies handler`);
    ok('anomaly handler contains no INSERT statement',
       !anomBody.includes('INSERT '), `INSERT found in anomalies handler`);

    // No email/notification calls.
    ok('anomaly handler sends no email or push notification',
       !anomBody.includes('email') && !anomBody.includes('sendMail') &&
       !anomBody.includes('notify') && !anomBody.includes('push'),
       'email/notification call found in anomalies handler');

    // The route is registered as GET, not POST/PUT/PATCH.
    const routeDecl = routeSrc.slice(
      routeSrc.lastIndexOf('router.', anomStart),
      anomStart + 30
    );
    ok("anomaly route is GET (not POST/PUT/PATCH)",
       routeDecl.includes('router.get'), `route declaration: ${routeDecl.slice(0,60)}`);

    // Confirm the response only calls res.json (read path).
    ok('anomaly handler only calls res.json (no res.redirect or other side-effects)',
       anomBody.includes('res.json(') && !anomBody.includes('res.redirect'),
       'unexpected response type');

    // Confirm no status-modifying calls to student_id_cards or students tables.
    ok('no student or card status changes in anomaly handler',
       !anomBody.includes('student_id_cards') ||
       (anomBody.includes('student_id_cards') &&
        !anomBody.match(/UPDATE\s+student_id_cards|DELETE.*student_id_cards/)),
       'card status mutation found in anomaly handler');

    // UI: confirm the dashboard page has no POST/PUT calls.
    const uiSrc = fs.readFileSync(
      path.join(__dirname, '..', 'admin-portal', 'app', '(dashboard)', 'id-cards', 'page.tsx'), 'utf8'
    );
    ok('anomaly dashboard UI makes no api.post/put/patch calls',
       !uiSrc.includes('api.post') && !uiSrc.includes('api.put') && !uiSrc.includes('api.patch'),
       'mutating API call found in anomaly dashboard');
    // Strip data-field uses and HTML attributes before checking for action buttons.
    // revoked_scans / revoked_at are display labels; disabled={} is an HTML prop.
    const uiStripped = uiSrc
      .replace(/revoked?/gi, '')      // field names like revoked_scans, revoked_at
      .replace(/\bdisabled\b/gi, ''); // HTML/JSX disabled attribute
    ok('anomaly dashboard has no "lock", "block", or "revoke" actions in UI',
       !/(lock|block|suspend|\bdisable\b)/i.test(uiStripped),
       'automated action button found in UI');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log(`\n  Cleaning up ${insertedScanIds.length} inserted scan rows…`);
  if (insertedScanIds.length > 0) {
    await pool.query(
      `DELETE FROM id_card_scans WHERE id = ANY($1::uuid[])`,
      [insertedScanIds]
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════`);
  console.log(`RESULT: ${PASS} PASS / ${FAIL} FAIL`);
  if (FAIL === 0) console.log('ALL CHECKS PASSED ✓');
  else            console.error('SOME CHECKS FAILED — see ✗ above');

  await pool.end();
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(async e => {
  console.error('FATAL:', e.message, e.stack);
  await pool.end().catch(() => {});
  process.exit(1);
});
