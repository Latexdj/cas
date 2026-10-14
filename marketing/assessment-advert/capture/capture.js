// Records every UI scene of the Assessment advert from the running app
// (admin portal on :3001, API on :4000), timed against
// build/vo/timeline.json. Personas: the admin, the Mathematics teacher
// (Abena Asare, T031), the HOD for General Science (Samuel Addo, T005) and
// a student (on a phone-sized screen), each with their own login.
//
// Usage: node capture.js
// Resets the demo data first (demo-data/seed.py). Off camera, between the
// "approvals" and "student" scenes, the remaining 2 Science subjects are
// approved and published through the real API so the student's report
// card is complete.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const ExcelJS = require('/home/user/cas/backend/node_modules/exceljs');
const { Recorder, sleep, K, DILATE_SCRIPT } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'capture');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'vo', 'timeline.json'), 'utf8'));
const APP = 'http://localhost:3001';
const API = 'http://localhost:4000';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LEAD = 0.6;
const STUDENT = 'AKW23074';
const STUDENT_NAME = 'Kwaku Quaye';
const TYPED = ['16', '14.5', '18', '12'];   // first four Project Work scores, typed on camera

const scene = id => TL.scenes.find(s => s.id === id);
function W(id, i, word, nth = 1) {
  const s = scene(id), l = s.lines[i];
  let t = l.start - s.start;
  if (word) {
    const w = l.words.filter(x => x.word.toLowerCase().startsWith(word.toLowerCase()))[nth - 1];
    if (!w) throw new Error(`no word "${word}" in ${id}[${i}]`);
    t += w.start;
  }
  return t;
}
const dur = id => scene(id).end - scene(id).start;

async function settle(page, ms = 1000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(ms * K);
}

async function api(pathname, { token, method = 'GET', body } = {}) {
  const r = await fetch(API + pathname, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : Buffer.from(await r.arrayBuffer());
}
const login = async (type, username, password) => (await api('/api/auth/login', { method: 'POST', body: { type, username, password, schoolCode: 'AKW001' } })).token;

async function persona(browser, viewport, loginPath, fill) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 4 : 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('cas_school_code', 'AKW001');
    localStorage.setItem('cas_s_school_code', 'AKW001');
    // Printing: keep the exact page the app hands to the printer, so it
    // can be rendered to PDF afterwards (headless Chrome has no printer).
    window.print = () => { window.__printedHtml = document.documentElement.outerHTML; };
  });
  await ctx.addInitScript(DILATE_SCRIPT);
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage();
  await page.goto(APP + loginPath);
  await fill(page);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 30000 });
  await settle(page);
  return page;
}

// The Project Work sheet the teacher uploads: the app's own template for
// this assessment, filled in with the class's marks.
async function filledSheet(assessmentId, token) {
  const buf = await api(`/api/assessments/${assessmentId}/score-template`, { token });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Scores');
  let seed = 41, i = 0;
  ws.eachRow((row, n) => {
    const id = row.getCell(1).value;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return;
    seed = (seed * 16807) % 2147483647;
    const score = i < TYPED.length ? Number(TYPED[i]) : Math.round((9 + (seed % 1000) / 1000 * 10.5) * 2) / 2;
    row.getCell(4).value = score;
    row.getCell(5).value = 'No';
    i++;
  });
  const file = path.join(OUT, 'downloads', 'Project_Work_2_Science_Mathematics.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'downloads'), { recursive: true });
  execSync('python3 seed.py', { cwd: path.join(ROOT, 'demo-data'), stdio: 'inherit' });
  const desk = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=2'] });
  const phone = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=4'] });
  const D = { width: 864, height: 1536 };
  const year = execSync(`psql -h localhost -U cas -d cas -Atc "select id from academic_years where is_current"`, { env: { ...process.env, PGPASSWORD: 'cas' } }).toString().trim();

  const admin = await persona(desk, D, '/login', async p => {
    await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
    await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  let r = new Recorder(admin, OUT);

  // ── intro: the admin sidebar, Assessment group ────────────────────────
  console.log('scene intro');
  await admin.goto(`${APP}/dashboard`);
  await settle(admin);
  r.cursor = { x: 560, y: 980 };
  await admin.mouse.move(r.cursor.x, r.cursor.y);
  await r.start('intro', { lead: LEAD });
  r.cam({ x: 236, y: 360, zoom: 1.85 }, 0);
  r.cam({ x: 250, y: 470, zoom: 1.65 }, dur('intro') + 0.6);
  await r.at(0.8);
  await r.click('aside >> text="Assessment"');
  await r.at(dur('intro'));
  await r.stop();

  // ── setup: CA modes and their weights ─────────────────────────────────
  console.log('scene setup');
  await admin.goto(`${APP}/curriculum?tab=assessment-modes`);
  await admin.waitForSelector('text=Project Work');
  await settle(admin);
  r.cursor = { x: 600, y: 700 };
  await admin.mouse.move(600, 700);
  await r.start('setup', { lead: LEAD });
  await r.camOn('text=Class Test >> nth=-1', 1.55, 0, { dx: 160, dy: 60 });
  for (const [w, mode] of [['class', 'Class Test'], ['assignments', 'Assignment'], ['project', 'Project Work']]) {
    await r.at(W('setup', 0, w) - 0.3);
    await r.moveTo(`text=${mode} >> nth=-1`, { offset: { x: 0.5, y: 0.5 } });
  }
  await r.at(W('setup', 0, 'weight') - 0.4);
  await r.moveTo('text=Project Work >> nth=-1', { offset: { x: 6, y: 0.5 } });
  await r.at(dur('setup'));
  await r.stop();

  // ── teacher: missing project work, add it, enter and upload scores ────
  console.log('scene teacher');
  const teacher = await persona(desk, D, '/teacher/login', async p => {
    await p.fill('input[placeholder="Your teacher ID"]', 'T031');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  const teacherToken = await teacher.evaluate(() => localStorage.getItem('cas_t_token'));
  await teacher.goto(`${APP}/teacher/assessments`);
  await teacher.waitForSelector('button:has-text("2 Science")');
  await settle(teacher);
  r = new Recorder(teacher, OUT);
  r.cursor = { x: 600, y: 700 };
  await teacher.mouse.move(600, 700);
  await r.start('teacher', { lead: LEAD });
  await r.camOn('button:has-text("2 Science")', 1.5, 0, { dx: 120, dy: 40 });
  await r.at(0.4);
  await r.moveTo('button:has-text("2 Arts 1")', { offset: { x: 0.3, y: 0.5 } });
  await r.at(W('teacher', 0, 'classes') - 0.3);
  await r.click('button:has-text("2 Science")', { offset: { x: 0.3, y: 0.5 } });
  await teacher.waitForSelector('button:has-text("Submit for Review")');
  await settle(teacher, 300);
  // L1: submit too early.
  await r.at(W('teacher', 1, 'Try') - 0.2);
  r.cam({ x: 560, y: 330, zoom: 1.5 }, 0.7);
  await r.click('button:has-text("Submit for Review")');
  await teacher.waitForSelector('text=Cannot Submit Yet');
  r.log({ type: 'mark', name: 'blocked' });
  await r.camOn('text=no assessment created yet', 1.6, 0.7, { dy: 40 });
  await r.at(W('teacher', 1, 'missing') - 0.3);
  await r.moveTo('text=no assessment created yet', { offset: { x: 0.4, y: 0.5 } });
  await r.at(W('teacher', 2, 'Here') - 0.5);
  await r.click('h2:text-is("Submit for HOD Review") + button');
  // L2: the red chip.
  await r.camOn('text=Project Work (0)', 1.7, 0.7, { dx: -120 });
  await r.moveTo('text=Project Work (0)', { offset: { x: 0.5, y: 0.5 } });
  // L3: add it.
  await r.at(W('teacher', 3, 'Add') - 0.3);
  r.cam({ x: 560, y: 1150, zoom: 1.35 }, 0.7);
  await r.click('button.fixed:text-is("+")', { dur: 0.6 });
  await teacher.waitForSelector('h2:text-is("New Assessment")');
  await r.camOn('h2:text-is("New Assessment")', 1.55, 0.6, { dy: 190 });
  await r.click('button:has-text("Project Work (0)")', { dur: 0.45 });
  const maxInput = 'input[placeholder="e.g. 50"]';
  await r.click(maxInput, { offset: { x: 0.2, y: 0.5 }, dur: 0.45 });
  await r.type('20', { min: 0.08, max: 0.12 });
  await r.click('button:text-is("Create")', { dur: 0.45 });
  await teacher.waitForSelector('text=Project Work >> nth=1');
  await settle(teacher, 200);
  await r.camOn('text=Max: 20.00 | 0/40', 1.5, 0.6, { dy: 40 });
  await r.click('text=Max: 20.00 | 0/40', { dur: 0.5 });
  await teacher.waitForSelector('input[type=number][placeholder^="/"]');
  await settle(teacher, 200);
  // L4: type the first few.
  await r.at(W('teacher', 4, 'Type') - 0.3);
  await r.camOn('input[type=number][placeholder^="/"] >> nth=1', 1.6, 0.6, { dx: -200, dy: 40 });
  for (let i = 0; i < TYPED.length; i++) {
    await r.click(`input[type=number][placeholder^="/"] >> nth=${i}`, { offset: { x: 0.5, y: 0.5 }, dur: i ? 0.25 : 0.45 });
    await r.type(TYPED[i], { min: 0.06, max: 0.1 });
  }
  // L5: upload the rest from Excel.
  const assessmentId = new URL(teacher.url()).searchParams.get('assessment_id');
  const sheet = await filledSheet(assessmentId, teacherToken);
  await r.at(W('teacher', 5, 'upload') - 0.5);
  await r.camOn('button[title="Upload filled scores"]', 1.6, 0.6, { dx: -180, dy: 120 });
  await r.click('button[title="Upload filled scores"]');
  r.log({ type: 'file', name: path.basename(sheet) });
  await teacher.setInputFiles('input[type=file][accept=".xlsx"]', sheet);
  await teacher.waitForFunction(() => document.querySelectorAll('input[type=number][placeholder^="/"]').length &&
    [...document.querySelectorAll('input[type=number][placeholder^="/"]')].every(i => i.value !== ''), null, { timeout: 30000 }).catch(() => {});
  r.log({ type: 'mark', name: 'uploaded' });
  await r.camOn('input[type=number][placeholder^="/"] >> nth=6', 1.3, 0.8, { dx: -120, dy: 60 });
  await r.at(dur('teacher'));
  await r.stop();

  // ── submit: every check passes ────────────────────────────────────────
  console.log('scene submit');
  await teacher.goBack();
  await teacher.waitForSelector('button:has-text("Submit for Review")');
  await settle(teacher);
  await r.start('submit', { lead: LEAD });
  r.cam({ x: 560, y: 330, zoom: 1.5 }, 0);
  await r.at(0.05);
  await r.click('button:has-text("Submit for Review")');
  await teacher.waitForSelector('text=All checks passed');
  await r.camOn('text=All checks passed', 1.55, 0.7, { dy: -60 });
  await r.moveTo('text=All checks passed', { offset: { x: 0.4, y: 0.5 } });
  await r.at(W('submit', 1, 'Submit') - 0.3);
  await r.click('button:has-text("Confirm & Submit")');
  r.log({ type: 'mark', name: 'submitted' });
  await teacher.waitForSelector('button:has-text("Confirm & Submit")', { state: 'detached' }).catch(() => {});
  r.cam({ x: 560, y: 330, zoom: 1.6 }, 0.7);
  await r.at(dur('submit'));
  await r.stop();

  // ── hod: review and approve Mathematics ───────────────────────────────
  console.log('scene hod');
  const hod = await persona(desk, D, '/teacher/login', async p => {
    await p.fill('input[placeholder="Your teacher ID"]', 'T005');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  await hod.goto(`${APP}/teacher/hod`);
  await hod.waitForSelector('button:has-text("Approvals")');
  await hod.click('button:has-text("Approvals")');
  await hod.waitForSelector('text=Pending Review');
  await settle(hod);
  r = new Recorder(hod, OUT);
  r.cursor = { x: 600, y: 700 };
  await hod.mouse.move(600, 700);
  await r.start('hod', { lead: LEAD });
  await r.camOn('text=Pending Review', 1.45, 0, { dx: 260, dy: 200 });
  const mathsCard = 'div:has(> div > p:text-is("Mathematics"))';
  await r.at(0.6);
  await r.moveTo('p:text-is("Mathematics")', { offset: { x: 0.5, y: 0.5 } });
  await r.at(W('hod', 1, 'Check') - 0.5);
  await r.click(`${mathsCard} >> button:has-text("Review")`).catch(async () => r.click('button:has-text("Review") >> nth=-1'));
  await hod.waitForSelector('button:text-is("Approve")');
  await settle(hod, 200);
  await r.camOn('button:text-is("Approve")', 1.35, 0.8, { dx: -150, dy: -380 });
  await r.at(W('hod', 1, 'approve') - 0.5);
  await r.camOn('button:text-is("Approve")', 1.55, 0.6, { dx: -120, dy: -60 });
  await r.click('button:text-is("Approve")');
  r.log({ type: 'mark', name: 'hod-approved' });
  await sleep(300 * K);
  r.cam({ x: 560, y: 330, zoom: 1.4 }, 0.8);
  await r.at(dur('hod'));
  await r.stop();

  // ── approvals: final approval, publish ────────────────────────────────
  console.log('scene approvals');
  await admin.goto(`${APP}/result-approvals`);
  await admin.waitForSelector('text=Final Approve');
  await settle(admin);
  r = new Recorder(admin, OUT);
  r.cursor = { x: 600, y: 700 };
  await admin.mouse.move(600, 700);
  await r.start('approvals', { lead: LEAD });
  const mathsRow = 'tr:has(td:text-is("Mathematics")):has(td:text-is("2 Science"))';
  await r.camOn(mathsRow, 1.35, 0, { dx: 40 });
  await r.at(0.3);
  await r.click(`${mathsRow} >> button:has-text("Final Approve")`);
  await admin.waitForSelector('button:text-is("Final Approve") >> nth=-1');
  await r.camOn('button:text-is("Final Approve") >> nth=-1', 1.5, 0.6, { dx: -120, dy: -150 });
  await r.click('button:text-is("Final Approve") >> nth=-1');
  r.log({ type: 'mark', name: 'final-approved' });
  await settle(admin, 300);
  await r.at(W('approvals', 1, 'publishes') - 0.6);
  await r.camOn('button:has-text("Publish All Final-Approved")', 1.45, 0.6, { dx: -200, dy: 330 });
  await r.click('button:has-text("Publish All Final-Approved")');
  r.log({ type: 'mark', name: 'published' });
  await settle(admin, 300);
  await r.at(dur('approvals'));
  await r.stop();

  // Off camera: the rest of 2 Science goes through review and is published.
  const hodToken = await login('teacher', 'T005', '1234');
  const adminToken = await login('admin', 'ADMIN', '1234');
  for (const q of await api(`/api/result-submissions/hod-queue?academic_year_id=${year}&semester=1`, { token: hodToken })) {
    if (q.class_name === '2 Science') await api('/api/result-submissions/hod-review', { token: hodToken, method: 'POST', body: { submission_id: q.id, action: 'approve' } });
  }
  for (const q of await api(`/api/result-submissions/final-queue?academic_year_id=${year}&semester=1`, { token: adminToken })) {
    if (q.class_name === '2 Science' && q.status === 'hod_approved') await api('/api/result-submissions/final-review', { token: adminToken, method: 'POST', body: { submission_id: q.id, action: 'approve' } });
  }
  await api('/api/result-submissions/publish', { token: adminToken, method: 'POST', body: { academic_year_id: year, semester: 1 } });

  // ── tracker: progress, then who is behind ─────────────────────────────
  console.log('scene tracker');
  await admin.goto(`${APP}/assessment-tracker`);
  await admin.waitForSelector('text=Abena Asare >> visible=true').catch(async e => {
    await admin.screenshot({ path: '/tmp/claude-0/tracker_fail.png' });
    console.log('URL', admin.url(), (await admin.innerText('body')).slice(0, 600));
    throw e;
  });
  await settle(admin);
  r = new Recorder(admin, OUT);
  r.cursor = { x: 600, y: 700 };
  await admin.mouse.move(600, 700);
  await r.start('tracker', { lead: LEAD });
  r.cam({ x: 520, y: 330, zoom: 1.45 }, 0);
  await r.at(W('tracker', 0, 'every') - 0.5);
  r.cam({ x: 520, y: 640, zoom: 1.4 }, 1.4);
  await r.moveTo('text=Abena Asare >> visible=true', { offset: { x: 2.4, y: 0.6 } });
  await r.at(W('tracker', 1, 'Outstanding') - 0.6);
  await r.click('aside >> text=Outstanding Submissions');
  await admin.waitForSelector('text=Not Submitted');
  await settle(admin, 300);
  await r.camOn('text=Not Submitted >> nth=0', 1.35, 0.8, { dx: -260, dy: 160 });
  await r.moveTo('text=Not Submitted >> nth=1', { offset: { x: -3, y: 0.5 } });
  await r.at(dur('tracker'));
  await r.stop();

  // ── results: class ranking, a student's card, print the class ─────────
  console.log('scene results');
  await admin.goto(`${APP}/results`);
  await admin.waitForSelector('select >> nth=2');
  await settle(admin, 600);
  await admin.selectOption('select >> nth=2', '2 Science');
  await admin.waitForSelector('button:has-text("View →")');
  await settle(admin);
  r = new Recorder(admin, OUT);
  r.cursor = { x: 600, y: 900 };
  await admin.mouse.move(600, 900);
  await r.start('results', { lead: LEAD });
  await r.camOn('tbody tr >> nth=1', 1.35, 0, { dx: 40, dy: 120 });
  await r.at(0.5);
  await r.click('button:has-text("View →") >> nth=0');
  await admin.waitForSelector('button:has-text("Print Card")');
  await settle(admin, 300);
  r.cam({ x: 520, y: 420, zoom: 1.26 }, 0.8);
  await r.at(W('results', 0, 'grade') - 0.4);
  r.cam({ x: 520, y: 600, zoom: 1.26 }, 1.2);
  await r.at(W('results', 1, 'remarks') - 0.6);
  r.cam({ x: 520, y: 820, zoom: 1.26 }, 0.8);
  await r.moveTo('text=Form Teacher', { offset: { x: 0.5, y: 2.5 } });
  await r.at(W('results', 1, 'print') - 0.7);
  await r.click('div.sticky > button.text-slate-400', { dur: 0.5 });
  await admin.waitForSelector('button:has-text("Print Card")', { state: 'detached' });
  r.cam({ x: 600, y: 280, zoom: 1.5 }, 0.6);
  await r.click('button:has-text("Print All")');
  r.log({ type: 'mark', name: 'printed' });
  await admin.waitForFunction(() => !!window.__printedHtml, null, { timeout: 30000 });
  const printed = await admin.evaluate(() => window.__printedHtml);
  await r.at(dur('results'));
  await r.stop();
  // Render what went to the printer, the way the browser's print would.
  const pdfPage = await (await desk.newContext()).newPage();
  // A static snapshot: drop the app's scripts so nothing re-renders it.
  const snapshot = printed.replace(/<script[\s\S]*?<\/script>/gi, '').replace('<head>', `<head><base href="${APP}/">`);
  fs.writeFileSync(path.join(OUT, 'downloads', 'printed_report_cards.html'), snapshot);
  await pdfPage.setContent(snapshot, { waitUntil: 'networkidle' });
  await pdfPage.emulateMedia({ media: 'print' });
  await pdfPage.pdf({ path: path.join(OUT, 'downloads', 'Report_Cards_2_Science.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await pdfPage.close();

  // ── student: their report card, on a phone ────────────────────────────
  console.log('scene student');
  const student = await persona(phone, { width: 432, height: 768 }, '/student/login', async p => {
    await p.fill('input[placeholder="Your student ID"]', STUDENT);
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  await student.goto(`${APP}/student/results`);
  await student.waitForSelector('text=Average');
  await settle(student, 1500);
  r = new Recorder(student, OUT);
  r.cursor = { x: 300, y: 600 };
  await student.mouse.move(300, 600);
  await r.start('student', { lead: LEAD });
  r.cam({ x: 216, y: 384, zoom: 1 }, 0);
  await r.at(W('student', 0, 'published') - 0.2);
  await r.scroll(null, { dy: 420, dur: 1.4 });
  await r.at(W('student', 1, 'class') - 0.2);
  await r.scroll(null, { dy: 260, dur: 1.2 });
  await r.at(dur('student'));
  await r.stop();

  // ── transcript ────────────────────────────────────────────────────────
  console.log('scene transcript');
  await admin.goto(`${APP}/transcript`);
  await admin.waitForSelector('input');
  await settle(admin);
  r = new Recorder(admin, OUT);
  r.cursor = { x: 600, y: 600 };
  await admin.mouse.move(600, 600);
  await r.start('transcript', { lead: LEAD });
  await r.camOn('input >> nth=0', 1.45, 0, { dy: 260 });
  await r.click('input >> nth=0', { offset: { x: 0.2, y: 0.5 } });
  await r.type('Kwaku Q', { min: 0.05, max: 0.08 });
  await admin.waitForSelector(`text=${STUDENT_NAME} >> nth=0`);
  await r.click(`text=${STUDENT_NAME} >> nth=0`);
  await admin.waitForSelector('text=Print Transcript');
  await settle(admin, 300);
  await r.camOn('text=Print Transcript', 1.3, 0.9, { dx: -280, dy: 420 });
  await r.at(dur('transcript'));
  await r.stop();

  await desk.close();
  await phone.close();
}

main().catch(e => { console.error(e); process.exit(1); });
