'use strict';
/**
 * Phase 3 ID Card — verification script.
 * 6 checks: HTML tiling, batch report, progress observation,
 * Supabase upload, code structure, sequential processing.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const jwt  = require('jsonwebtoken');
const { Pool } = require('pg');
const { buildBatchHTML, buildCardMarkup } = require('./src/services/pdf.service');

const SECRET = process.env.JWT_SECRET;
const BASE   = 'http://localhost:3000';
const SCHOOL = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

// Class with a good mix: 2E has 52 students (1 photo, 51 no-photo).
const TEST_CLASS = '2E';

let PASS = 0, FAIL = 0;
function ok(label, cond, detail = '') {
  if (cond) { PASS++; console.log(`  ✓ ${label}`); }
  else       { FAIL++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function section(n, title) { console.log(`\n── Check ${n}: ${title} ──`); }

// Rough PDF page count — counts /Type /Page dicts (Chromium always emits these).
function pdfPageCount(buf) {
  const s = buf.toString('latin1');
  return (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

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

async function postJSON(endpoint, tok, body = {}) {
  const r = await fetch(`${BASE}${endpoint}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}

async function getJSON(endpoint, tok) {
  const r = await fetch(`${BASE}${endpoint}`,
    { headers: { Authorization: `Bearer ${tok}` } }
  );
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// Poll job until done|failed; timeout after maxMs.
// Only snapshots that have a valid status field (i.e. actual job bodies, not
// Express error responses) are included in the returned array.
async function pollJob(jobId, tok, maxMs = 180_000, intervalMs = 1000) {
  const snapshots = [];
  const deadline  = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { body } = await getJSON(`/api/id-cards/batch/${jobId}`, tok);
    // Only keep snapshots that look like real job objects (have a status field).
    if (body.status) {
      snapshots.push({ ...body, at: Date.now() });
      if (body.status === 'done' || body.status === 'failed') break;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return snapshots;
}

// Fetch a URL and return buffer + headers.
async function fetchBinary(url) {
  const r = await fetch(url);
  return { status: r.status, ct: r.headers.get('content-type') ?? '', buf: Buffer.from(await r.arrayBuffer()) };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 3 ID Card Verification ===\n');

  const tok = await adminToken();

  // ── Check 1: buildBatchHTML tiling structure ─────────────────────────────
  section(1, 'buildBatchHTML: 8-per-sheet tiling, crop marks, correct content, placeholders');
  {
    // Build synthetic entries: 9 cards (2 sheets: 8 + 1)
    const school = { name: 'Test School', logo_url: null };
    const entries = Array.from({ length: 9 }, (_, i) => {
      const hasPhoto = i === 0; // only index 0 has a photo
      return {
        student: { name: `STUDENT ${i + 1}`, class_name: 'Form 1', jhs_index_number: `IDX${i}`,
                   student_code: `SC${i}`, picture_url: hasPhoto ? 'https://example.com/photo.jpg' : null },
        card:    { token: `tok-${i}`, issue_number: 1, expires_at: '2026-12-31T23:59:59.000Z' },
        school,
        qrDataUrl: 'data:image/png;base64,iVBORw0KGgo=', // stub — layout check only
      };
    });

    const html = buildBatchHTML(entries);

    // Sheet count: 2 sheets for 9 cards
    const sheetMatches = (html.match(/class="sheet"/g) || []).length;
    ok('2 sheets for 9 entries (ceil(9/8)=2)', sheetMatches === 2, `got ${sheetMatches}`);

    // Crop slots per sheet: sheet 1 has 8, sheet 2 has 1
    const slotMatches = (html.match(/class="crop-slot"/g) || []).length;
    ok('9 total crop-slot divs', slotMatches === 9, `got ${slotMatches}`);

    // A4 page structure
    ok('@page size A4 declared', html.includes('size: A4') || html.includes('size:A4') || html.includes('size: A4 portrait'), `head: ${html.slice(0, 500)}`);
    ok('2-column grid (85.6mm)', html.includes('85.6mm'), `missing CR80 width`);
    ok('4-row grid (54mm rows)', html.includes('54mm'), `missing CR80 height`);
    ok('page-break-after on sheet', html.includes('page-break-after'));

    // Crop guide — box-shadow or outline on slots
    ok('crop guide style present (box-shadow or outline)',
       html.includes('box-shadow') || html.includes('outline'));

    // Card content: each entry uses buildCardMarkup (school name, student name, issue#)
    ok('school name in batch HTML',  html.includes('Test School'));
    ok('student names in batch HTML', html.includes('STUDENT 1') && html.includes('STUDENT 9'));
    ok('issue number in batch HTML',  html.includes('#1'));

    // Photo vs placeholder
    ok('photo img present for entry with picture_url', html.includes('https://example.com/photo.jpg'));
    const svgCount = (html.match(/<svg/g) || []).length;
    ok('SVG placeholders for 8 no-photo entries', svgCount === 8, `got ${svgCount} SVGs`);

    // Verify it uses buildCardMarkup (not a separate renderer): check for the
    // exact CAS badge text that only buildCardMarkup produces.
    ok('CAS badge present in batch HTML (from buildCardMarkup)', html.includes('>CAS<'));
    ok('forest green #1B5635 in batch HTML', html.includes('#1B5635'));

    // No doctype in the sheet fragments — only one at the top of the doc
    const doctypeCount = (html.match(/<!DOCTYPE/gi) || []).length;
    ok('single DOCTYPE (not one per card)', doctypeCount === 1, `got ${doctypeCount}`);
  }

  // ── Check 2: Batch report — newly-minted vs reused, no_photo count ──────
  section(2, 'Batch report: newly-minted vs reused, no_photo count');
  {
    // Load class 2E student data for ground-truth counts.
    const { rows: classStudents } = await pool.query(
      `SELECT id, picture_url FROM students
       WHERE school_id=$1 AND class_name=$2 AND LOWER(status)='active'`,
      [SCHOOL, TEST_CLASS]
    );
    const expectedNoPhoto = classStudents.filter(s => !s.picture_url).length;

    // Clear all active cards for class 2E so we get freshly minted tokens.
    await pool.query(
      `DELETE FROM student_id_cards
       WHERE student_id = ANY(
         SELECT id FROM students WHERE school_id=$1 AND class_name=$2 AND LOWER(status)='active'
       )`,
      [SCHOOL, TEST_CLASS]
    );
    console.log(`  Pre-clean: removed existing cards for ${classStudents.length} students in ${TEST_CLASS}`);

    // Start batch for class 2E.
    const { status: s1, body: b1 } = await postJSON('/api/id-cards/batch', tok, { class_name: TEST_CLASS });
    ok('batch POST returns 202', s1 === 202, `got ${s1}`);
    ok('jobId returned', !!b1.jobId, `body: ${JSON.stringify(b1)}`);
    const jobId = b1.jobId;

    // Poll to completion.
    const snapshots = await pollJob(jobId, tok, 180_000, 1000);
    const final = snapshots[snapshots.length - 1];

    ok('job reaches done status', final.status === 'done', `status=${final.status} error=${final.error}`);

    const rpt = final.report;
    ok('report present', !!rpt, 'report is null');
    ok(`report.total = ${classStudents.length}`, rpt?.total === classStudents.length,
       `got ${rpt?.total}`);
    ok('newly_minted + reused = total',
       rpt && (rpt.newly_minted + rpt.reused) === rpt.total,
       `newly_minted=${rpt?.newly_minted} reused=${rpt?.reused} total=${rpt?.total}`);
    // All cards were deleted → all should be newly minted
    ok(`all ${classStudents.length} newly minted (none pre-existed)`,
       rpt?.newly_minted === classStudents.length,
       `got newly_minted=${rpt?.newly_minted}`);
    ok(`no_photo = ${expectedNoPhoto} (students without picture_url)`,
       rpt?.no_photo === expectedNoPhoto,
       `got ${rpt?.no_photo}, expected ${expectedNoPhoto}`);

    // Re-run the same class — now all tokens should be reused.
    const { body: b2 } = await postJSON('/api/id-cards/batch', tok, { class_name: TEST_CLASS });
    const snaps2 = await pollJob(b2.jobId, tok, 180_000, 1000);
    const final2 = snaps2[snaps2.length - 1];
    ok('second run: all reused', final2.report?.reused === classStudents.length,
       `reused=${final2.report?.reused} newly=${final2.report?.newly_minted}`);
    ok('second run: newly_minted = 0', final2.report?.newly_minted === 0,
       `got ${final2.report?.newly_minted}`);

    // Save pdfUrl for Check 4 fallback (class-batch PDF is guaranteed small & fast)
    global._classPdfUrl = final.pdfUrl ?? final2.pdfUrl ?? null;
    console.log(`  Class batch pdfUrl: ${global._classPdfUrl?.slice(0, 70)}…`);
  }

  // ── Check 3: Progress is observed (not just queued→done) ─────────────────
  section(3, 'Progress observable during large batch');
  {
    // Use whole school (694 students) so the loop is long enough to observe.
    const { body: b3 } = await postJSON('/api/id-cards/batch', tok, { all: true });
    ok('whole-school batch POST accepted', !!b3.jobId, `body: ${JSON.stringify(b3)}`);

    // 8-minute ceiling — allows ~24s student loop + up to 7 min Puppeteer render.
    const snapshots3 = await pollJob(b3.jobId, tok, 480_000, 500);
    const final3     = snapshots3[snapshots3.length - 1];

    // Look for at least one snapshot where 0 < done < total (mid-flight).
    const midFlight = snapshots3.filter(
      s => s.progress && s.progress.done > 0 && s.progress.total > 0 && s.progress.done < s.progress.total
    );
    ok('at least one mid-flight snapshot (done > 0 and done < total)',
       midFlight.length > 0,
       `${snapshots3.length} snapshots, none mid-flight. Last: ${JSON.stringify(snapshots3[snapshots3.length-1]?.progress)}`);

    // Progress increases monotonically
    let monotonic = true;
    for (let i = 1; i < snapshots3.length; i++) {
      if ((snapshots3[i].progress?.done ?? 0) < (snapshots3[i-1].progress?.done ?? 0)) {
        monotonic = false; break;
      }
    }
    ok('progress.done is monotonically non-decreasing', monotonic);

    ok('whole-school job completes successfully', final3.status === 'done',
       `status=${final3.status} error=${final3.error}`);
    ok('report.total matches school active count (around 694)',
       final3.report?.total >= 600 && final3.report?.total <= 800,
       `got ${final3.report?.total}`);

    // Save the pdfUrl for Check 4.
    global._wholePdfUrl  = final3.pdfUrl;
    global._wholeJobDone = final3;
    console.log(`  Observed ${snapshots3.length} snapshots, ${midFlight.length} mid-flight`);
  }

  // ── Check 4: Supabase upload + valid download link ────────────────────────
  section(4, 'Batch PDF: uploaded to Supabase, download link works');
  {
    // Prefer whole-school URL; fall back to the class-2E URL verified in Check 2.
    const pdfUrl = global._wholePdfUrl ?? global._classPdfUrl;
    const urlSource = global._wholePdfUrl ? 'whole-school batch' : 'class batch (fallback)';
    console.log(`  Using ${urlSource} pdfUrl`);
    ok('pdfUrl is present', !!pdfUrl, 'pdfUrl is null/undefined');
    ok('pdfUrl looks like a Supabase URL',
       typeof pdfUrl === 'string' && (pdfUrl.startsWith('https://') || pdfUrl.startsWith('http://')),
       `pdfUrl=${pdfUrl}`);
    ok('pdfUrl contains id-cards path', pdfUrl?.includes('id-cards'), `url=${pdfUrl}`);

    if (pdfUrl) {
      const { status, ct, buf } = await fetchBinary(pdfUrl);
      ok('download returns 200', status === 200, `status=${status}`);
      ok('content-type is application/pdf or octet-stream',
         ct.includes('application/pdf') || ct.includes('octet-stream'),
         `ct=${ct}`);
      ok('PDF magic bytes (%PDF)', buf.length > 0 && buf.slice(0, 4).toString() === '%PDF',
         `first 4: ${buf.slice(0, 4).toString()}`);

      // Page count check: 694 students ÷ 8 per sheet = ceil(694/8) = 87 pages minimum
      const total = global._wholeJobDone?.report?.total ?? 694;
      const expectedPages = Math.ceil(total / 8);
      const pageCount = pdfPageCount(buf);
      ok(`PDF has ~${expectedPages} A4 pages (ceil(${total}/8))`,
         pageCount >= expectedPages - 2 && pageCount <= expectedPages + 2,
         `detected ${pageCount} pages, expected ~${expectedPages}`);
    }
  }

  // ── Check 5: Code structure — no duplication of card template ────────────
  section(5, 'Code: batch uses buildCardMarkup, no separate card renderer');
  {
    const svc = fs.readFileSync(path.join(__dirname, 'src/services/pdf.service.js'), 'utf8');

    // buildBatchHTML must call buildCardMarkup
    const batchFnStart = svc.indexOf('function buildBatchHTML');
    const batchFnEnd   = svc.indexOf('\nfunction ', batchFnStart + 1);
    const batchBody    = svc.slice(batchFnStart, batchFnEnd > 0 ? batchFnEnd : undefined);

    ok('buildBatchHTML calls buildCardMarkup',
       batchBody.includes('buildCardMarkup'),
       'buildCardMarkup not referenced in buildBatchHTML body');

    // buildBatchHTML must NOT contain inline card style (the green colour,
    // or the top-band height — those belong in buildCardMarkup only).
    ok('buildBatchHTML does NOT contain #1B5635 (card styles stay in buildCardMarkup)',
       !batchBody.includes('#1B5635'),
       'Forest green found in batch-specific code — card template is duplicated');

    ok('buildBatchHTML does NOT contain picture_url img logic',
       !batchBody.includes('picture_url') && !batchBody.includes('object-fit'),
       'Photo logic found in batch HTML builder — should be in buildCardMarkup only');

    // generateBatchAndUpload must call buildBatchHTML (not inline card tiling)
    const genBatchStart = svc.indexOf('async function generateBatchAndUpload');
    const genBatchEnd   = svc.indexOf('\nfunction ', genBatchStart + 1);
    const genBatchBody  = svc.slice(genBatchStart, genBatchEnd > 0 ? genBatchEnd : undefined);

    ok('generateBatchAndUpload calls buildBatchHTML',
       genBatchBody.includes('buildBatchHTML'),
       'buildBatchHTML not referenced in generateBatchAndUpload');

    // Both card functions still exported
    const exportLine = svc.slice(svc.lastIndexOf('module.exports'));
    ok('buildCardMarkup still exported', exportLine.includes('buildCardMarkup'));
    ok('buildBatchHTML exported',        exportLine.includes('buildBatchHTML'));
    ok('generateBatchAndUpload exported', exportLine.includes('generateBatchAndUpload'));
  }

  // ── Check 6: Sequential processing — no concurrent Puppeteer ────────────
  section(6, 'Sequential processing: for-loop mint, single Puppeteer, QR per iteration');
  {
    const routeSrc = fs.readFileSync(path.join(__dirname, 'src/routes/id-cards.js'), 'utf8');
    const svcSrc   = fs.readFileSync(path.join(__dirname, 'src/services/pdf.service.js'), 'utf8');

    // processBatchJob must use for...of (sequential) not Promise.all or map+Promise
    const processFnStart = routeSrc.indexOf('async function processBatchJob');
    const processFnEnd   = routeSrc.indexOf('\n// ──', processFnStart + 1);
    const processBody    = routeSrc.slice(processFnStart, processFnEnd > 0 ? processFnEnd : undefined);

    ok('processBatchJob uses for...of loop (sequential)',
       processBody.includes('for (const') || processBody.includes('for(const'),
       'No for...of found — might be using Promise.all');
    ok('processBatchJob does NOT use Promise.all or Promise.allSettled',
       !processBody.includes('Promise.all'),
       'Promise.all found — tokens and QR codes would be generated concurrently');
    ok('processBatchJob does NOT call map() with async (concurrent pattern)',
       !processBody.includes('.map(async'),
       '.map(async found — concurrent processing detected');

    // generateBatchAndUpload has exactly ONE puppeteer.launch — not in a per-card loop
    const genBatch = svcSrc.slice(svcSrc.indexOf('async function generateBatchAndUpload'));
    const launchCount = (genBatch.match(/puppeteer\.launch/g) || []).length;
    ok(`generateBatchAndUpload has exactly 1 puppeteer.launch (got ${launchCount})`,
       launchCount === 1, `found ${launchCount}`);

    // processJob calls generateBatchAndUpload ONCE, after the loop
    // (not inside the for loop)
    const loopStart = processBody.indexOf('for (const');
    const loopEnd   = processBody.indexOf('\n    }', loopStart) + 1;
    const loopBody  = processBody.slice(loopStart, loopEnd);
    ok('generateBatchAndUpload NOT called inside the student loop',
       !loopBody.includes('generateBatchAndUpload'),
       'generateBatchAndUpload appears inside the for loop — separate render per student');

    // QR generation IS inside the loop (one per student)
    ok('QRCode.toDataURL called inside the student loop',
       loopBody.includes('QRCode.toDataURL'),
       'QR generation not found inside the for loop');

    // Single Puppeteer instance for the whole batch
    const routeLaunchCount = (routeSrc.match(/puppeteer\.launch/g) || []).length;
    ok('id-cards.js does NOT call puppeteer.launch directly (batch PDF delegated to pdf.service)',
       routeLaunchCount === 0,
       `found ${routeLaunchCount} puppeteer.launch in id-cards.js`);
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
