// Records every UI scene of the Clearance advert from the running app
// (admin portal on :3001, API on :4000), timed against
// build/vo/timeline.json. Each persona (admin, librarian, dining hall
// staff, student, principal) gets its own browser context, the way they'd
// each be on their own device. The student scene is recorded at phone size.
//
// Usage: node capture.js
// Resets the demo data first (demo-data/seed.py base); between the
// "initiate" and "office" scenes the offices' earlier work is simulated
// through the real API (seed.py progress).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { Recorder, sleep, K, DILATE_SCRIPT } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'capture');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'vo', 'timeline.json'), 'utf8'));
const APP = 'http://localhost:3001';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LEAD = 0.6;
const REFUSED = 'AKW22102';   // refused by the Library on camera, then seen in the student portal
const CLEARED = 'AKW22101';   // cleared by the Library on camera

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
const seed = step => execSync(`python3 seed.py ${step}`, { cwd: path.join(ROOT, 'demo-data'), stdio: 'inherit' });

async function settle(page, ms = 1000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(ms * K);
}

async function persona(browser, viewport, loginPath, fill) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 4 : 2, acceptDownloads: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('cas_school_code', 'AKW001');
    localStorage.setItem('cas_s_school_code', 'AKW001');
  });
  await ctx.addInitScript(DILATE_SCRIPT);
  const page = await ctx.newPage();
  await page.goto(APP + loginPath);
  await fill(page);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 30000 });
  await settle(page);
  return page;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  seed('base');
  const desk = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=2'] });
  const phone = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=4'] });
  const D = { width: 864, height: 1536 };

  const admin = await persona(desk, D, '/login', async p => {
    await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
    await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  let r = new Recorder(admin, OUT);

  // ── intro: the admin sidebar, Clearance group ────────────────────────
  console.log('scene intro');
  await admin.goto(`${APP}/dashboard`);
  await settle(admin);
  r.cursor = { x: 560, y: 980 };
  await admin.mouse.move(r.cursor.x, r.cursor.y);
  await r.start('intro', { lead: LEAD });
  r.cam({ x: 236, y: 330, zoom: 1.85 }, 0);
  r.cam({ x: 250, y: 400, zoom: 1.7 }, dur('intro') + 0.6);
  await r.at(0.6);
  await r.click('aside >> text=Clearance');
  await r.stop();

  // ── setup: offices, a new office, an assignment, staff accounts ──────
  console.log('scene setup');
  await r.start('setup', { lead: LEAD });
  await r.at(0.05);
  await r.click('aside >> text=Offices & Staff');
  await admin.waitForSelector('text=Library');
  await settle(admin, 300);
  r.cam({ x: 540, y: 520, zoom: 1.35 }, 1.0);
  await r.at(W('setup', 0, 'library') - 0.2);
  await r.moveTo('p:text-is("Library")', { offset: { x: 0.6, y: 0.5 } });
  await r.at(W('setup', 0, 'heads') - 0.4);
  await r.scroll(null, { dy: 520, dur: 1.6 });
  r.cam({ x: 540, y: 820, zoom: 1.35 }, 1.4);
  await r.moveTo('p:text-is("HOD — General Science")', { offset: { x: 0.6, y: 0.5 } });
  // L1: new office.
  await r.at(W('setup', 1, 'Add') - 0.3);
  await r.scroll(null, { dy: -520, dur: 0.5 });
  await r.camOn('button:has-text("+ New Office")', 1.7, 0.6, { dx: -120, dy: 60 });
  await r.click('button:has-text("+ New Office")');
  const nameInput = 'input[placeholder="e.g. Library, Accounts Office"]';
  await admin.waitForSelector(nameInput);
  const b = await r.box(nameInput);
  await r.scroll(null, { dy: b.y - 420, dur: 0.8 });
  await r.camOn(nameInput, 1.55, 0.7, { dy: 120 });
  await r.click(nameInput, { offset: { x: 0.2, y: 0.5 } });
  await r.type('ICT Laboratory', { min: 0.045, max: 0.09 });
  await r.click('button:has-text("Save Office")');
  r.log({ type: 'mark', name: 'office-saved' });
  await admin.waitForSelector('p:text-is("ICT Laboratory")');
  // L2: assign Prince Agyeman.
  await r.at(W('setup', 2, 'Then') - 0.2);
  await r.camOn('p:text-is("ICT Laboratory")', 1.5, 0.6, { dy: 140 });
  await r.click('p:text-is("ICT Laboratory")');
  const search = 'input[placeholder="Search teachers or clearance staff…"]';
  await admin.waitForSelector(search);
  const sb = await r.box(search);
  if (sb.y > 1100) await r.scroll(null, { dy: sb.y - 700, dur: 0.6 });
  await r.camOn(search, 1.55, 0.6, { dy: 120 });
  await r.click(search, { offset: { x: 0.2, y: 0.5 } });
  await r.type('Prince', { min: 0.05, max: 0.09 });
  await r.click('button:has-text("Prince Agyeman")');
  r.log({ type: 'mark', name: 'assigned' });
  await admin.waitForSelector('text=Remove');
  // L3: non-teaching staff accounts.
  await r.at(W('setup', 3, 'Non-teaching') - 0.3);
  await r.click('p:has-text("ICT Laboratory — Staff") + button');
  await admin.waitForSelector('text=Comfort Adjei');
  await r.camOn('text=Non-Teaching Clearance Staff', 1.6, 0.8, { dx: 140, dy: 100 });
  await r.moveTo('p:text-is("Comfort Adjei")', { offset: { x: 0.5, y: 0.6 } });
  await r.at(W('setup', 3, 'accounts') - 0.2);
  await r.moveTo('button:has-text("+ Add Staff Account")', {});
  await r.at(dur('setup'));
  await r.stop();

  // ── initiate: batch clearance for the final-year classes ─────────────
  console.log('scene initiate');
  await admin.evaluate(() => document.querySelector('main').scrollTo(0, 0));
  await r.start('initiate', { lead: LEAD });
  r.cam({ x: 300, y: 330, zoom: 1.6 }, 0.6);
  await r.at(0.05);
  await r.click('aside >> text=Student Clearance');
  await admin.waitForSelector('button:has-text("Initiate Batch Clearance")');
  r.cam({ x: 520, y: 400, zoom: 1.35 }, 0.9);
  await r.at(W('initiate', 0, 'initiate') - 0.35);
  await r.click('button:has-text("Initiate Batch Clearance")');
  await admin.waitForSelector('label:has-text("3 Arts 1")');
  await r.camOn('text=Initiate Batch Clearance >> nth=1', 1.6, 0.7, { dy: 230 });
  await r.at(W('initiate', 1, 'Pick') - 0.4);
  for (const cls of ['3 Arts 1', '3 Home Econ', '3 Science']) {
    await r.click(`label:has-text("${cls}")`, { offset: { x: 0.12, y: 0.5 }, dur: 0.35 });
  }
  await r.click('button:has-text("Initiate for 3 classes")');
  await admin.waitForSelector('text=Already-initiated students were skipped');
  r.log({ type: 'mark', name: 'initiated' });
  await r.camOn('text=Already-initiated students were skipped', 1.75, 0.6, { dy: -60 });
  await r.at(W('initiate', 2, 'each') - 0.2);
  await r.click('button:text-is("Done")');
  await settle(admin, 200);
  r.cam({ x: 520, y: 700, zoom: 1.3 }, 1.0);
  await r.at(dur('initiate'));
  await r.stop();

  // Off camera: the offices work through their lists.
  seed('progress');

  // ── office: the Library, in the teacher portal ───────────────────────
  console.log('scene office');
  const librarian = await persona(desk, D, '/teacher/login', async p => {
    await p.fill('input[placeholder="Your teacher ID"]', 'T014');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  await librarian.goto(`${APP}/teacher/clearance`);
  await librarian.waitForSelector('button:has-text("Pending (")');
  await settle(librarian);
  r = new Recorder(librarian, OUT);
  r.cursor = { x: 640, y: 700 };
  await librarian.mouse.move(640, 700);
  await r.start('office', { lead: LEAD });
  await r.camOn('button:has-text("Pending (")', 1.45, 0, { dx: 170, dy: 330 });
  await r.at(0.3);
  await r.moveTo('button:has-text("Pending (")');
  await r.at(W('office', 0, 'waiting') - 0.6);
  // Pan the camera down the queue rather than scrolling this heavy page.
  r.cam({ x: 560, y: 1050, zoom: 1.45 }, 1.6);
  await r.moveTo({ x: 640, y: 1150 }, { dur: 1.0 });
  // L1-L2: look up, then clear.
  await r.at(W('office', 1, 'Look') - 0.5);
  await r.camOn('button:has-text("Student Lookup")', 1.5, 0.6, { dx: 60, dy: 230 });
  await r.click('button:has-text("Student Lookup")', { dur: 0.45 });
  const idInput = 'input[placeholder="Enter Student ID…"]';
  await librarian.waitForSelector(idInput);
  await r.click(idInput, { offset: { x: 0.2, y: 0.5 }, dur: 0.4 });
  await r.type(CLEARED, { min: 0.05, max: 0.08 });
  await r.click('button:has-text("Search")', { dur: 0.45 });
  await librarian.waitForSelector('button:text-is("Action")');
  await r.at(W('office', 2, 'and') - 0.45);
  await r.click('button:text-is("Action")', { dur: 0.45 });
  await librarian.waitForSelector('button:text-is("Confirm")');
  await r.camOn('p:text-is("Clearance Action")', 1.55, 0.5, { dy: 160 });
  await r.at(W('office', 2, 'one') - 0.35);
  await r.click('button:text-is("Cleared")', { dur: 0.4 });
  await r.at(W('office', 2, 'tap') - 0.1);
  await r.click('button:text-is("Confirm")', { dur: 0.4 });
  r.log({ type: 'mark', name: 'cleared' });
  await librarian.waitForSelector('button:text-is("Confirm")', { state: 'detached' });
  await r.camOn(idInput, 1.5, 0.6, { dx: 60, dy: 230 });
  // L3-L4: the next student still owes the library.
  await r.at(W('office', 3, 'Still') - 0.2);
  await r.click(idInput, { offset: { x: 0.5, y: 0.5 }, dur: 0.4 });
  await librarian.keyboard.press('Control+A');
  await r.type(REFUSED, { min: 0.05, max: 0.08 });
  await r.click('button:has-text("Search")', { dur: 0.45 });
  await librarian.waitForSelector('button:text-is("Action")');
  await r.click('button:text-is("Action")', { dur: 0.45 });
  await librarian.waitForSelector('button:text-is("Confirm")');
  await r.camOn('p:text-is("Clearance Action")', 1.55, 0.5, { dy: 160 });
  await r.at(W('office', 4, 'not') - 0.3);
  await r.click('button:text-is("Not Cleared")', { dur: 0.4 });
  await r.click('textarea', { offset: { x: 0.2, y: 0.4 }, dur: 0.4 });
  await r.type('2 library books not returned', { min: 0.035, max: 0.06 });
  await r.click('button:text-is("Confirm")', { dur: 0.45 });
  r.log({ type: 'mark', name: 'refused' });
  await librarian.waitForSelector('button:text-is("Confirm")', { state: 'detached' });
  await r.camOn(idInput, 1.4, 0.8, { dx: 60, dy: 300 });
  await r.at(dur('office'));
  await r.stop();

  // ── staff: Dining Hall, in the staff portal ──────────────────────────
  console.log('scene staff');
  const dining = await persona(desk, D, '/staff-portal/login', async p => {
    await p.fill('input[placeholder="e.g. ABC123"]', 'AKW001');
    await p.fill('input[placeholder="your@email.com"]', 'comfort.adjei@akwaabashs.edu.gh');
    await p.fill('input[placeholder="Your password"]', 'clearance1');
  });
  await dining.waitForSelector('button:has-text("Action")');
  await settle(dining);
  r = new Recorder(dining, OUT);
  r.cursor = { x: 600, y: 900 };
  await dining.mouse.move(600, 900);
  await r.start('staff', { lead: LEAD });
  await r.camOn('text=Comfort Adjei', 1.55, 0, { dx: 200, dy: 240 });
  await r.at(W('staff', 0, 'same') - 0.3);
  await r.click('button:has-text("Action") >> nth=0');
  await dining.waitForSelector('button:text-is("Confirm")');
  await r.camOn('p:text-is("Clearance Action")', 1.55, 0.6, { dy: 160 });
  await r.click('button:text-is("Cleared")');
  await r.click('button:text-is("Confirm")');
  r.log({ type: 'mark', name: 'cleared' });
  await r.at(dur('staff'));
  await r.stop();

  // ── student: their own checklist, on a phone ─────────────────────────
  console.log('scene student');
  const student = await persona(phone, { width: 432, height: 768 }, '/student/login', async p => {
    await p.fill('input[placeholder="Your student ID"]', REFUSED);
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  await student.goto(`${APP}/student/clearance`);
  await student.waitForSelector('text=Clearance Checklist');
  await settle(student);
  r = new Recorder(student, OUT);
  r.cursor = { x: 300, y: 600 };
  await student.mouse.move(300, 600);
  await r.start('student', { lead: LEAD });
  r.cam({ x: 216, y: 384, zoom: 1 }, 0);
  await r.at(0.6);
  r.cam({ x: 216, y: 384, zoom: 1.06 }, 1.0);
  await r.at(W('student', 1, 'They') - 0.3);
  const lib = await r.box('p:text-is("Library") >> nth=-1');
  await r.scroll(null, { dy: lib.y - 200, dur: 1.2 });
  r.cam({ x: 216, y: 384, zoom: 1.06 }, 1.0);
  await r.moveTo('text=2 library books not returned', { offset: { x: 0.3, y: 0.5 } });
  await r.at(W('student', 2, 'Unpaid') - 0.3);
  await r.scroll(null, { dy: -(lib.y - 200), dur: 1.0 });
  r.cam({ x: 216, y: 384, zoom: 1.06 }, 0.8);
  await r.moveTo('text=Outstanding balance', { offset: { x: 0.6, y: 0.5 } });
  await r.at(dur('student'));
  await r.stop();

  // ── admin: live overview, detail drawer, override ────────────────────
  console.log('scene admin');
  await admin.goto(`${APP}/clearance`);
  await admin.waitForSelector('tbody tr');
  await settle(admin);
  r = new Recorder(admin, OUT);
  r.cursor = { x: 600, y: 700 };
  await admin.mouse.move(600, 700);
  await r.start('admin', { lead: LEAD });
  r.cam({ x: 540, y: 420, zoom: 1.4 }, 0);
  const classSel = 'select >> nth=0', statusSel = 'select >> nth=1';
  await r.at(W('admin', 0, 'every') - 0.4);
  await r.click(classSel);
  await admin.selectOption(classSel, '3 Science');
  r.log({ type: 'select', value: '3 Science' });
  await settle(admin, 300);
  await r.camOn('tbody tr >> nth=1', 1.3, 0.9, { dx: 0, dy: 170 });
  await r.moveTo('tbody tr >> nth=2', { offset: { x: 0.55, y: 0.5 } });
  // L1: status filter, then open a student.
  await r.at(W('admin', 1, 'status') - 0.4);
  r.cam({ x: 540, y: 420, zoom: 1.4 }, 0.6);
  await r.click(statusSel);
  await admin.selectOption(statusSel, 'in_progress');
  r.log({ type: 'select', value: 'in_progress' });
  await settle(admin, 300);
  await r.at(W('admin', 1, 'open') - 0.3);
  await r.click('button:has-text("View →") >> nth=0');
  await admin.waitForSelector('button:text-is("Override")');
  await settle(admin, 200);
  r.cam({ x: 620, y: 520, zoom: 1.45 }, 0.8);
  // L2: override a pending office.
  const pendingCard = 'div.rounded-xl:has(span:text-is("Pending")) >> nth=0';
  await r.at(W('admin', 2, 'Override') - 0.4);
  await r.click(`${pendingCard} >> button:text-is("Override")`);
  await admin.waitForSelector('text=Admin Override');
  await r.camOn('text=Admin Override', 1.6, 0.6, { dy: 160 });
  await r.click('button:text-is("cleared")');
  await r.click('textarea', { offset: { x: 0.2, y: 0.4 } });
  await r.type("Cleared on the headmaster's approval", { min: 0.03, max: 0.05 });
  await r.click('button:text-is("Apply")');
  r.log({ type: 'mark', name: 'override' });
  await admin.waitForSelector('text=Admin Override', { state: 'detached' });
  r.cam({ x: 620, y: 520, zoom: 1.45 }, 0.8);
  await r.at(dur('admin'));
  await r.stop();

  // ── principal: totals and the certificate check ──────────────────────
  console.log('scene principal');
  const principal = await persona(desk, D, '/principal/login', async p => {
    await p.fill('input[placeholder="e.g. CAS000"]', 'AKW001');
    await p.fill('input[placeholder="Your Teacher ID"]', 'HM01');
    await p.fill('input[placeholder="Enter your password or PIN"]', '1234');
  });
  await principal.goto(`${APP}/principal/clearance`);
  await principal.waitForSelector('text=Certificate Clearance Check');
  await settle(principal, 1500);
  r = new Recorder(principal, OUT);
  r.cursor = { x: 600, y: 700 };
  await principal.mouse.move(600, 700);
  await r.start('principal', { lead: LEAD });
  await r.camOn('text=Fully Cleared >> nth=0', 1.6, 0, { dx: 160, dy: -40 });
  await r.at(0.4);
  await r.moveTo('text=Fully Cleared >> nth=0', { offset: { x: 0.5, y: 0.5 } });
  await r.at(W('principal', 1, 'before') - 0.4);
  const cert = 'input[placeholder="Student ID or Name…"]';
  await r.camOn(cert, 1.55, 0.7, { dx: 60, dy: 150 });
  await r.click(cert, { offset: { x: 0.2, y: 0.5 } });
  await r.type(REFUSED, { min: 0.05, max: 0.08 });
  await r.click('button:text-is("Check")');
  await principal.waitForSelector('text=PENDING OFFICES');
  r.log({ type: 'mark', name: 'checked' });
  await r.camOn('text=PENDING OFFICES', 1.5, 0.8, { dy: 20 });
  await r.at(dur('principal'));
  await r.stop();

  await desk.close();
  await phone.close();
}

main().catch(e => { console.error(e); process.exit(1); });
