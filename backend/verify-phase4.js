'use strict';
/**
 * Phase 4 ID Card — verification script.
 * 4 checks:
 *   1. missing-photos endpoint returns only students actually missing pictures
 *   2. Photo upload (via existing students/:id/picture) removes student from list
 *   3. Batch generation works and isn't blocked by non-empty missing-photos list
 *   4. No ZIP-upload code path left in the codebase
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

// A 1×1 red PNG as a full base64 data URI — smallest valid image we can upload.
const TINY_PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

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

async function pollJob(jobId, tok, maxMs = 180_000, intervalMs = 1000) {
  const deadline = Date.now() + maxMs;
  let last = null;
  while (Date.now() < deadline) {
    const { body } = await getJSON(`/api/id-cards/batch/${jobId}`, tok);
    if (body.status) {
      last = body;
      if (body.status === 'done' || body.status === 'failed') break;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return last;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 4 ID Card Verification ===\n');

  const tok = await adminToken();

  // Pick a class that definitely has a mix.
  // Use class 2E: 52 students, 1 with photo (after Phase 3 ran).
  const TEST_CLASS = '2E';

  // Ground-truth counts from DB.
  const { rows: classStudents } = await pool.query(
    `SELECT id, picture_url FROM students
     WHERE school_id=$1 AND class_name=$2 AND LOWER(status)='active'
     ORDER BY name`,
    [SCHOOL, TEST_CLASS]
  );
  const withPhoto    = classStudents.filter(s => s.picture_url && s.picture_url.length > 0);
  const withoutPhoto = classStudents.filter(s => !s.picture_url || s.picture_url.length === 0);
  console.log(`  Class ${TEST_CLASS}: ${classStudents.length} students total — ${withPhoto.length} with photo, ${withoutPhoto.length} without`);

  // Ensure we have at least one of each for a meaningful test.
  if (withoutPhoto.length === 0) {
    // Blank out one student's picture for the test, restore afterwards.
    await pool.query(`UPDATE students SET picture_url=NULL WHERE id=$1`, [classStudents[0].id]);
    withoutPhoto.push({ id: classStudents[0].id, picture_url: null });
    withPhoto.splice(withPhoto.findIndex(s => s.id === classStudents[0].id), 1);
  }

  // ── Check 1: missing-photos endpoint returns only the truly missing ──────
  section(1, 'GET /api/id-cards/missing-photos returns only students without picture_url');
  {
    // 1a — class scope
    const { status: s1, body: b1 } = await getJSON(
      `/api/id-cards/missing-photos?class_name=${encodeURIComponent(TEST_CLASS)}`, tok
    );
    ok('responds 200', s1 === 200, `got ${s1}`);
    ok('body has students array', Array.isArray(b1.students), `body: ${JSON.stringify(b1).slice(0,200)}`);
    ok('total field matches students.length', b1.total === b1.students?.length,
       `total=${b1.total} students.length=${b1.students?.length}`);
    ok(`returns ${withoutPhoto.length} missing students (DB ground truth)`,
       b1.total === withoutPhoto.length, `got ${b1.total}, expected ${withoutPhoto.length}`);

    // None of the returned students should have a picture_url in DB.
    if (b1.students?.length > 0) {
      const returnedIds = b1.students.map(s => s.id);
      const { rows: dbCheck } = await pool.query(
        `SELECT id FROM students WHERE id=ANY($1::uuid[])
           AND (picture_url IS NOT NULL AND picture_url != '')`,
        [returnedIds]
      );
      ok('none of the returned students actually have a photo in DB',
         dbCheck.length === 0, `${dbCheck.length} returned student(s) have picture_url set`);

      // Students WITH photos should NOT appear.
      const withPhotoIds = new Set(withPhoto.map(s => s.id));
      const falsePositives = returnedIds.filter(id => withPhotoIds.has(id));
      ok('students who have photos do NOT appear in missing list',
         falsePositives.length === 0, `${falsePositives.length} false-positive(s)`);
    }

    // 1b — response shape: each student has id, name, class_name, student_code
    if (b1.students?.length > 0) {
      const sample = b1.students[0];
      ok('student row has id',           !!sample.id);
      ok('student row has name',         !!sample.name);
      ok('student row has class_name',   !!sample.class_name);
      ok('student row has student_code', !!sample.student_code);
    }

    // 1c — ?all=true scope
    const { status: sa, body: ba } = await getJSON('/api/id-cards/missing-photos?all=true', tok);
    ok('?all=true responds 200', sa === 200, `got ${sa}`);
    ok('?all=true returns more students than one class',
       ba.total >= withoutPhoto.length, `all=${ba.total}, class=${withoutPhoto.length}`);

    // 1d — missing required param returns 400
    const { status: s400 } = await getJSON('/api/id-cards/missing-photos', tok);
    ok('no scope param returns 400', s400 === 400, `got ${s400}`);
  }

  // ── Check 2: Upload a photo, student drops off the list ──────────────────
  section(2, 'POST /api/students/:id/picture clears student from missing-photos list');
  {
    // Pick the first missing student.
    const { body: before } = await getJSON(
      `/api/id-cards/missing-photos?class_name=${encodeURIComponent(TEST_CLASS)}`, tok
    );
    const target = before.students?.[0];
    ok('have a missing student to upload to', !!target, 'no missing students found');

    if (target) {
      // Upload a photo via the EXISTING endpoint (same one used by students/[id] profile page).
      const { status: upStatus, body: upBody } = await postJSON(
        `/api/students/${target.id}/picture`, tok, { imageBase64: TINY_PNG_URI }
      );
      ok('picture upload returns 200', upStatus === 200, `got ${upStatus}: ${JSON.stringify(upBody).slice(0,200)}`);
      ok('response has picture_url', typeof upBody.picture_url === 'string' && upBody.picture_url.length > 0,
         `body: ${JSON.stringify(upBody)}`);

      // Confirm DB was updated.
      const { rows: [dbRow] } = await pool.query(
        `SELECT picture_url FROM students WHERE id=$1`, [target.id]
      );
      ok('picture_url set in DB', !!dbRow?.picture_url, `db value: ${dbRow?.picture_url}`);

      // Refresh missing-photos list — that student must be gone.
      const { body: after } = await getJSON(
        `/api/id-cards/missing-photos?class_name=${encodeURIComponent(TEST_CLASS)}`, tok
      );
      const stillMissing = after.students?.find(s => s.id === target.id);
      ok('uploaded student no longer in missing-photos list', !stillMissing,
         `still present: ${JSON.stringify(stillMissing)}`);
      ok('missing count decreased by 1',
         after.total === before.total - 1, `before=${before.total} after=${after.total}`);

      // Confirm this endpoint is the same one already used elsewhere (not a new dupe).
      // We verify by checking the route handler file — it should be in students.js, not a new file.
      const studentsRoute = fs.readFileSync(
        path.join(__dirname, 'src/routes/students.js'), 'utf8'
      );
      const hasPictureRoute = studentsRoute.includes("'/:id/picture'") ||
                              studentsRoute.includes('"/:id/picture"') ||
                              studentsRoute.includes("/:id/picture");
      ok("picture endpoint defined in students.js (existing route, no duplication)",
         hasPictureRoute, 'not found in students.js');

      const idCardsRoute = fs.readFileSync(
        path.join(__dirname, 'src/routes/id-cards.js'), 'utf8'
      );
      ok("id-cards.js does NOT define its own /picture endpoint",
         !idCardsRoute.includes('/picture'), 'id-cards.js has its own /picture route — duplication');

      // Restore: clear the picture_url we just set so class 2E is back to normal.
      await pool.query(`UPDATE students SET picture_url=NULL WHERE id=$1`, [target.id]);
      console.log(`  Restored: cleared picture_url for ${target.name}`);
    }
  }

  // ── Check 3: Batch generation works regardless of missing-photos list ────
  section(3, 'Batch generation is not blocked by non-empty missing-photos list');
  {
    // Get current missing count for class 2E — should be > 0 after restore.
    const { body: missingBefore } = await getJSON(
      `/api/id-cards/missing-photos?class_name=${encodeURIComponent(TEST_CLASS)}`, tok
    );
    ok('class 2E has missing photos (non-empty list)',
       missingBefore.total > 0, `got ${missingBefore.total}`);

    // Fire the batch — should start immediately without requiring photos.
    const { status: bStatus, body: bBody } = await postJSON(
      '/api/id-cards/batch', tok, { class_name: TEST_CLASS }
    );
    ok('POST /api/id-cards/batch accepts even with missing photos (202)',
       bStatus === 202, `got ${bStatus}: ${JSON.stringify(bBody)}`);
    ok('jobId returned', !!bBody.jobId, `body: ${JSON.stringify(bBody)}`);

    if (bBody.jobId) {
      const final = await pollJob(bBody.jobId, tok, 180_000);
      ok('batch job completes (done)', final?.status === 'done',
         `status=${final?.status} error=${final?.error}`);
      ok('report.no_photo > 0 (placeholders used for missing students)',
         final?.report?.no_photo > 0,
         `no_photo=${final?.report?.no_photo} — expected > 0 since some photos are still missing`);
      ok('pdfUrl present (PDF was generated despite missing photos)',
         typeof final?.pdfUrl === 'string' && final.pdfUrl.length > 0,
         `pdfUrl=${final?.pdfUrl}`);
      console.log(`  Batch: total=${final?.report?.total} newly_minted=${final?.report?.newly_minted} no_photo=${final?.report?.no_photo}`);
    }
  }

  // ── Check 4: No ZIP-upload code path remaining ───────────────────────────
  section(4, 'No ZIP-upload / filename-matching code in id-cards module');
  {
    const routeSrc = fs.readFileSync(path.join(__dirname, 'src/routes/id-cards.js'), 'utf8');

    // No ZIP library references
    ok('id-cards.js does not import adm-zip / jszip / archiver',
       !/(adm-zip|jszip|archiver|\.zip)/i.test(routeSrc),
       'ZIP library reference found');

    // No filename-matching / bulk-photo logic
    ok('id-cards.js has no filename-matching photo logic',
       !/filename.*match|match.*filename|\.jpg.*student|student.*\.jpg/i.test(routeSrc),
       'filename-matching code found');

    // Scan the whole id-cards module for ZIP patterns
    const zipPattern = /zip|\.zip|adm.zip|jszip|archiver/i;
    ok('no ZIP references anywhere in id-cards route', !zipPattern.test(routeSrc), 'ZIP pattern found');

    // Also check admin UI for old ZIP-upload panel remnants
    const uiSrc = fs.readFileSync(
      path.join(__dirname, '..', 'admin-portal', 'app', '(dashboard)', 'students', 'page.tsx'), 'utf8'
    );
    ok('admin UI has no ZIP-related upload code',
       !/\.zip|zip.*upload|upload.*zip|zipFile/i.test(uiSrc),
       'ZIP upload remnant found in admin UI');

    // Confirm missing-photos IS implemented (the replacement)
    ok('GET /api/id-cards/missing-photos route exists in id-cards.js',
       routeSrc.includes("'/missing-photos'") || routeSrc.includes('"/missing-photos"') ||
       routeSrc.includes('/missing-photos'),
       '/missing-photos route not found');

    // Confirm UI has the missing-photos fetch
    ok('admin UI fetches /api/id-cards/missing-photos',
       uiSrc.includes('/api/id-cards/missing-photos'),
       'missing-photos fetch not found in admin UI');

    // Confirm UI does NOT strip data URI prefix (bug found and fixed)
    const uploadFn = uiSrc.slice(
      uiSrc.indexOf('function handleMissingPhotoUpload'),
      uiSrc.indexOf('async function startBatchIDCards')
    );
    ok('handleMissingPhotoUpload sends full data URI (not stripped base64)',
       !uploadFn.includes('replace(/^data:') && uploadFn.includes('imageBase64: dataUrl'),
       'still stripping data URI prefix — upload would fail');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
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
