// Records every UI scene of the Primary School Portal advert from the
// running app (admin portal on :3001, API on :4000), timed against
// build/vo/timeline.json. Personas: the headteacher (admin, desktop) and
// the Basic 4 class teacher (Akosua Boateng, T106, on a phone-sized
// screen), each with their own login.
//
// Usage: node capture.js [scene ...]
// Resets the demo data first (demo-data/seed.py) when run in full. Scenes
// are recorded in story order, so state carries forward: the teacher's
// clock-in shows up in the office log, her submitted report card is the one
// the headteacher approves, and the year-end promotion runs last.
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
const SCHOOL = { latitude: 5.65127, longitude: -0.18684, accuracy: 9 };
const SCORES = ['15', '17.5', '12', '19'];   // Class Test 1, typed on camera
const REMARK = 'Aba reads well and helps her classmates. Keep it up!';
const HEAD_REMARK = 'A lovely term, Aba. Well done.';

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

async function persona(browser, viewport, loginPath, fill, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 4 : 2, timezoneId: 'Africa/Accra', locale: 'en-GB', ...extra });
  await ctx.addInitScript(() => { localStorage.setItem('cas_school_code', 'AKP001'); });
  await ctx.addInitScript(DILATE_SCRIPT);
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(APP + loginPath);
  await fill(page);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 30000 });
  await settle(page);
  return page;
}

// The photo the teacher's phone takes at clock-in (rear camera): the school
// signboard. Drawn here, since the school is made up.
async function signboard(browser) {
  const file = path.join(OUT, 'downloads', 'signboard.jpg');
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;width:640px;height:480px;overflow:hidden;font-family:Georgia,serif">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#9cc4e4 0%,#cfe3f1 34%,#e9dcc0 34.5%,#d9c7a1 100%)"></div>
    <div style="position:absolute;left:-40px;right:-40px;top:300px;height:200px;background:linear-gradient(180deg,#b9a57d,#8f7b55)"></div>
    <div style="position:absolute;left:70px;top:248px;width:14px;height:240px;background:linear-gradient(90deg,#3d3d3d,#777,#3d3d3d)"></div>
    <div style="position:absolute;left:556px;top:248px;width:14px;height:240px;background:linear-gradient(90deg,#3d3d3d,#777,#3d3d3d)"></div>
    <div style="position:absolute;left:40px;top:70px;width:560px;height:200px;transform:perspective(900px) rotateY(-9deg) rotateZ(-1deg);
      background:linear-gradient(160deg,#145C44,#0B3D2E);border:8px solid #f1ead8;border-radius:6px;box-shadow:0 14px 30px rgba(0,0,0,.35);
      color:#F5F0E8;text-align:center;padding-top:26px;box-sizing:border-box">
      <div style="font-size:15px;letter-spacing:4px;color:#C8973A">WELCOME TO</div>
      <div style="font-size:40px;font-weight:bold;line-height:1.1;margin-top:6px">AKWAABA<br>PREPARATORY SCHOOL</div>
      <div style="font-size:16px;font-style:italic;color:#C8973A;margin-top:8px">Learn, Love, Lead</div>
      <div style="font-size:12px;letter-spacing:2px;margin-top:4px;opacity:.8">DZORWULU, ACCRA</div>
    </div>
    <div style="position:absolute;left:-60px;top:330px;width:260px;height:180px;border-radius:50%;background:radial-gradient(#3f7a3a,#2c5a2a);filter:blur(2px)"></div>
    <div style="position:absolute;right:-50px;top:340px;width:240px;height:170px;border-radius:50%;background:radial-gradient(#4b8644,#2f5f2d);filter:blur(2px)"></div>
    <svg style="position:absolute;inset:0;opacity:.22;mix-blend-mode:multiply" width="640" height="480">
      <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter>
      <rect width="640" height="480" filter="url(#n)"/></svg>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 55%,rgba(0,0,0,.35))"></div>
  </body></html>`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  await page.close();
  return file;
}

async function main() {
  const only = process.argv.slice(2);
  const want = id => !only.length || only.includes(id);
  fs.mkdirSync(path.join(OUT, 'downloads'), { recursive: true });
  if (!only.length) execSync('python3 seed.py', { cwd: path.join(ROOT, 'demo-data'), stdio: 'inherit' });
  const desk = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=2'] });
  const phone = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=4'] });
  const D = { width: 864, height: 1536 };
  const P = { width: 432, height: 768 };
  const photo = await signboard(desk);

  const admin = await persona(desk, D, '/login', async p => {
    await p.fill('input[placeholder="e.g. CAS001"]', 'AKP001');
    await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
    await p.fill('input[placeholder="Your password"]', '1234');
  });
  const teacher = await persona(phone, P, '/teacher/login', async p => {
    await p.fill('input[placeholder="Your teacher ID"]', 'T106');
    await p.fill('input[placeholder="Your password"]', '1234');
  }, { geolocation: SCHOOL, permissions: ['geolocation'] });
  const ra = new Recorder(admin, OUT);
  const rt = new Recorder(teacher, OUT);
  process.on('unhandledRejection', () => {});
  global.__debugShots = async () => {
    await admin.screenshot({ path: path.join(OUT, 'debug_admin.png') }).catch(() => {});
    await teacher.screenshot({ path: path.join(OUT, 'debug_teacher.png') }).catch(() => {});
  };
  const nav = async (page, url, ready) => {
    await page.goto(APP + url);
    if (ready) await page.waitForSelector(ready);
    await settle(page);
  };
  const park = async (r, x, y) => { r.cursor = { x, y }; await r.page.mouse.move(x, y); };

  // ── intro: signing in with the school code lands on the Primary Portal ─
  if (want('intro')) {
    console.log('scene intro');
    const ctx = await desk.newContext({ viewport: D, deviceScaleFactor: 2, timezoneId: 'Africa/Accra', locale: 'en-GB' });
    await ctx.addInitScript(DILATE_SCRIPT);
    ctx.setDefaultTimeout(90000);
    const page = await ctx.newPage();
    await page.goto(APP + '/login');
    await page.waitForSelector('input[placeholder="e.g. CAS001"]');
    await settle(page);
    const r = new Recorder(page, OUT);
    await park(r, 600, 1100);
    await r.start('intro', { lead: LEAD });
    await r.camOn('input[placeholder="e.g. CAS001"]', 1.45, 0, { dy: 120 });
    await r.at(0.1);
    await r.click('input[placeholder="e.g. CAS001"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.5 });
    await r.type('AKP001', { min: 0.06, max: 0.09 });
    await r.click('input[placeholder="e.g. T001"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.35 });
    await r.type('ADMIN', { min: 0.06, max: 0.09 });
    await r.click('input[placeholder="Your password"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.35 });
    await r.type('1234', { min: 0.06, max: 0.09 });
    await r.click('button[type=submit]', { dur: 0.4 });
    await page.waitForSelector('text=Active Students');
    r.log({ type: 'mark', name: 'signed-in' });
    await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0));
    r.camFull(0.8);
    await r.at(dur('intro'));
    await r.stop();
    await ctx.close();
  }

  // ── dashboard: the headteacher's view ─────────────────────────────────
  if (want('dashboard')) {
    console.log('scene dashboard');
    const r = ra;
    await nav(admin, '/primary/admin/dashboard', 'text=Active Students');
    await park(r, 640, 900);
    await r.start('dashboard', { lead: LEAD });
    r.cam({ x: 520, y: 300, zoom: 1.32 }, 0);
    await r.at(W('dashboard', 0, 'pupils') - 0.35);
    await r.moveTo('text=Active Students', { offset: { x: 0.3, y: -0.6 } });
    await r.at(W('dashboard', 0, 'classes') - 0.3);
    await r.moveTo('p:text-is("Classes")', { offset: { x: 0.5, y: -0.6 } });
    await r.at(W('dashboard', 0, 'today') - 0.4);
    await r.camOn('text=Today\'s Attendance', 1.32, 0.9, { dx: 250, dy: 70 });
    await r.moveTo('text=Not yet marked / Absent', { offset: { x: 0.5, y: -1.5 } });
    await r.at(dur('dashboard'));
    await r.stop();
  }

  // ── setup: classes, subjects, grading scale, assessment modes ─────────
  if (want('setup')) {
    console.log('scene setup');
    const r = ra;
    await nav(admin, '/primary/admin/classes', 'text=Basic 4');
    await park(r, 520, 700);
    await r.start('setup', { lead: LEAD });
    r.cam({ x: 330, y: 420, zoom: 1.45 }, 0);
    await r.at(W('setup', 1, 'Each') - 0.4);
    await r.click('p:text-is("Basic 4")', { offset: { x: 0.3, y: 0.5 } });
    await admin.waitForSelector('text=Change Teacher');
    await r.camOn('text=Change Teacher', 1.6, 0.8, { dx: -110, dy: 30 });
    await r.moveTo('text=Akosua Boateng >> nth=-1', { offset: { x: 0.5, y: 0.5 } });
    // L2: subjects for the class.
    await r.at(W('setup', 2, 'the') - 0.6);
    r.cam({ x: 300, y: 500, zoom: 1.4 }, 0.6);
    await r.click('aside >> text="Subjects"');
    await admin.waitForSelector('text=Assign Subjects to a Class');
    await settle(admin, 250);
    const sel = 'select:near(:text("Assign Subjects to a Class"))';
    await r.camOn(sel, 1.35, 0.6, { dx: 120 });
    await r.click(sel, { offset: { x: 0.3, y: 0.5 }, dur: 0.5 });
    await admin.selectOption(sel, 'Basic 4');
    r.log({ type: 'select', value: 'Basic 4' });
    await admin.waitForSelector('text=Basic 4 — Subject Checklist');
    await settle(admin, 200);
    await r.scrollIntoTop('text=Basic 4 — Subject Checklist', { top: 330, dur: 0.9 });
    r.cam({ x: 540, y: 900, zoom: 1.3 }, 0.8);
    await r.moveTo('text=English Language >> nth=-1', { offset: { x: 0.5, y: 0.5 } });
    // L3: grading scale.
    await r.at(W('setup', 3, 'the') - 0.6);
    r.cam({ x: 300, y: 500, zoom: 1.4 }, 0.6);
    await r.click('aside >> text="Grade Scale"');
    await admin.waitForSelector('text=Configure your school');
    await settle(admin, 150);
    r.cam({ x: 560, y: 420, zoom: 1.45 }, 0.8);
    await r.moveTo('td:text-is("A1")', { offset: { x: 0.5, y: 0.5 } });
    // L4: assessment modes and weights.
    await r.at(W('setup', 4, 'and') - 0.8);
    r.cam({ x: 300, y: 600, zoom: 1.4 }, 0.6);
    await r.click('aside >> text="Setup"');
    await r.click('aside >> text=School Settings', { dur: 0.45 });
    await admin.waitForSelector('text=Assessment Modes');
    await settle(admin, 250);
    await r.scrollIntoTop('h2:text-is("Assessment Modes")', { top: 380, dur: 0.9 });
    await r.camOn('h2:text-is("Assessment Modes")', 1.5, 0.8, { dx: 230, dy: 190 });
    await r.moveTo('td:text-is("70.00%")', { offset: { x: 0.5, y: 0.5 } }).catch(() => {});
    await r.at(dur('setup'));
    await r.stop();
  }

  // ── pupils: one pupil's record ─────────────────────────────────────────
  if (want('pupils')) {
    console.log('scene pupils');
    const r = ra;
    await nav(admin, '/primary/admin/students', 'text=Import Students');
    await park(r, 600, 760);
    await r.start('pupils', { lead: LEAD });
    r.cam({ x: 560, y: 500, zoom: 1.3 }, 0);
    await r.at(0.1);
    await r.scroll('table', { dx: 300, dur: 0.5 });
    await r.click('button:text-is("Edit") >> nth=3', { dur: 0.5 });
    await admin.waitForSelector('text=Edit Student');
    await settle(admin, 150);
    await r.camOn('text=Personal Information', 1.5, 0.7, { dx: 150, dy: 150 });
    await r.at(W('pupils', 1, 'admission') - 0.4);
    await r.camOn('label:text-is("Date of Admission")', 1.5, 0.7, { dx: 150, dy: -40 });
    await r.moveTo('label:text-is("Date of Admission")', { offset: { x: 0.6, y: 2.2 } });
    await r.at(W('pupils', 1, 'NHIS') - 0.35);
    await r.camOn('label:text-is("NHIS Number")', 1.55, 0.7, { dx: 150, dy: 20 });
    await r.moveTo('label:text-is("Blood Group")', { offset: { x: 0.5, y: 2.2 } });
    await r.at(W('pupils', 1, 'parents') - 0.4);
    await r.camOn('label:text-is("Father\'s Name")', 1.45, 0.8, { dx: 150, dy: 90 });
    await r.moveTo('label:text-is("Mother\'s Phone")', { offset: { x: 0.6, y: 2.2 } });
    await r.at(dur('pupils'));
    await r.stop();
    await admin.click('button:text-is("Cancel")');
  }

  // ── clockin: the teacher clocks in with photo and GPS ─────────────────
  if (want('clockin')) {
    console.log('scene clockin');
    const r = rt;
    await nav(teacher, '/primary/teacher/my-attendance', 'button:text-is("Clock In")');
    await park(r, 300, 640);
    await r.start('clockin', { lead: LEAD });
    r.cam({ x: 216, y: 330, zoom: 1.0 }, 0);
    await r.at(W('clockin', 0, 'clock') - 0.3);
    const chooser = teacher.waitForEvent('filechooser');
    await r.click('button:text-is("Clock In")');
    (await chooser).setFiles(photo);
    r.log({ type: 'file', name: 'camera' });
    await teacher.waitForSelector('button:has-text("Submit Clock In")');
    await settle(teacher, 150);
    await r.camOn('img[alt="Preview"]', 1.25, 0.7, { dy: -10 });
    await r.at(W('clockin', 1, 'GPS') - 0.3);
    await r.moveTo('text=Location acquired', { offset: { x: 0.4, y: 0.5 } });
    await r.at(W('clockin', 1, 'grounds') - 0.2);
    await r.click('button:has-text("Submit Clock In")');
    await teacher.waitForSelector('text=GPS verified');
    r.log({ type: 'mark', name: 'clocked-in' });
    await r.camOn('text=GPS verified', 1.3, 0.7, { dx: 80, dy: -30 });
    await r.at(dur('clockin'));
    await r.stop();
  }

  // ── register: the class register ──────────────────────────────────────
  if (want('register')) {
    console.log('scene register');
    const r = rt;
    await nav(teacher, '/primary/teacher/attendance', 'button:has-text("Save Attendance")');
    await park(r, 300, 640);
    await r.start('register', { lead: LEAD });
    r.cam({ x: 216, y: 384, zoom: 1.0 }, 0);
    await r.at(W('register', 1, 'Mark') - 0.4);
    await r.click('button:text-is("present") >> nth=0');
    await r.scroll(null, { dy: 260, dur: 0.6 });
    await r.click('tr:nth-child(3) button:text-is("absent")', { dur: 0.5 });
    await r.click('tr:nth-child(6) button:text-is("late")', { dur: 0.5 });
    await r.at(W('register', 1, 'save') - 0.7);
    await r.scroll(null, { dy: -260, dur: 0.5 });
    await r.click('button:has-text("Save Attendance")', { dur: 0.45 });
    await teacher.waitForSelector('text=Attendance already submitted');
    r.log({ type: 'mark', name: 'saved' });
    await r.camOn('text=Attendance already submitted', 1.15, 0.6, { dy: 200 });
    await r.at(dur('register'));
    await r.stop();
  }

  // ── assess: a new class test, marks typed in ──────────────────────────
  if (want('assess')) {
    console.log('scene assess');
    const r = rt;
    await nav(teacher, '/primary/teacher/assessments', 'text=New Assessment');
    await teacher.selectOption('select >> nth=1', { label: 'Science' });
    await settle(teacher, 400);
    await park(r, 300, 640);
    await r.start('assess', { lead: LEAD });
    r.cam({ x: 216, y: 384, zoom: 1.0 }, 0);
    await r.at(0.3);
    const modeSel = 'select:near(:text("Mode"))';
    await r.click(modeSel, { offset: { x: 0.4, y: 0.5 } });
    const modeVal = await teacher.locator(modeSel).evaluate(s => [...s.options].find(o => o.text.startsWith('Class Test')).value);
    await teacher.selectOption(modeSel, modeVal);
    r.log({ type: 'select', value: 'Class Test' });
    await r.click('input[placeholder="e.g. Class Test 1"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.45 });
    await r.type('Class Test 1', { min: 0.05, max: 0.09 });
    await r.click('input[placeholder="e.g. 20"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.4 });
    await r.type('20', { min: 0.08, max: 0.12 });
    await r.click('button:has-text("Create & Enter Scores")', { dur: 0.45 });
    await teacher.waitForSelector('text=0/24 entered');
    await settle(teacher, 150);
    // L1: type the marks.
    await r.at(W('assess', 1, 'Type') - 0.6);
    await r.scrollIntoTop('text=0/24 entered', { top: 70, dur: 0.8 });
    const inp = i => `input[type=number][step="0.5"] >> nth=${i}`;
    for (let i = 0; i < SCORES.length; i++) {
      await r.click(inp(i), { offset: { x: 0.5, y: 0.5 }, dur: i ? 0.28 : 0.45 });
      await r.type(SCORES[i], { min: 0.06, max: 0.1 });
    }
    // The rest of the class, as the teacher would carry on typing.
    await teacher.evaluate(() => {
      const marks = [13, 18, 11.5, 16.5, 15, 17, 9.5, 14, 18.5, 12.5, 15.5, 16, 13.5, 19.5, 14, 12, 17.5, 15];
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      [...document.querySelectorAll('input[type=number][step="0.5"]')].slice(4).forEach((el, i) => {
        set.call(el, String(marks[i % marks.length]));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    // L2: save; class scores recalculated.
    await r.at(W('assess', 2, 'and') - 0.6);
    await r.scrollIntoTop('button:has-text("Save Scores")', { top: 520, dur: 0.9 });
    await r.click('button:has-text("Save Scores")', { dur: 0.45 });
    await teacher.waitForSelector('text=class scores recalculated');
    r.log({ type: 'mark', name: 'saved' });
    await r.scrollIntoTop('text=class scores recalculated', { top: 260, dur: 0.8 });
    await r.camOn('text=class scores recalculated', 1.3, 0.7);
    await r.at(dur('assess'));
    await r.stop();
  }

  // ── scores: totals, grades and positions (admin view) ─────────────────
  if (want('scores')) {
    console.log('scene scores');
    const r = ra;
    await nav(admin, '/primary/admin/scores', 'h1:text-is("Score Entry")');
    await admin.selectOption('select >> nth=1', 'Basic 4');
    await settle(admin, 300);
    await admin.selectOption('select >> nth=2', { label: 'Science' });
    await settle(admin, 400);
    await park(r, 640, 900);
    await r.start('scores', { lead: LEAD });
    r.cam({ x: 560, y: 520, zoom: 1.4 }, 0);
    r.cam({ x: 600, y: 640, zoom: 1.45 }, dur('scores') + 0.6);
    await r.at(W('scores', 0, 'Totals') - 0.2);
    await r.moveTo('th:has-text("Total")', { offset: { x: 0.5, y: 3 } });
    await r.at(W('scores', 0, 'grades') - 0.25);
    await r.moveTo('th:has-text("Grade")', { offset: { x: 0.5, y: 3 } });
    await r.at(W('scores', 0, 'positions') - 0.25);
    await r.moveTo('th:has-text("Pos")', { offset: { x: 0.5, y: 3 } });
    await r.at(dur('scores'));
    await r.stop();
  }

  // ── reports: the report card, ratings, remark, submit ─────────────────
  if (want('reports')) {
    console.log('scene reports');
    const r = rt;
    await nav(teacher, '/primary/teacher/reports', 'text=Adjei Aba Ayisha');
    await park(r, 300, 640);
    await r.start('reports', { lead: LEAD });
    r.cam({ x: 216, y: 384, zoom: 1.0 }, 0);
    await r.at(0.2);
    await r.click('text=Adjei Aba Ayisha', { offset: { x: 0.3, y: 0.5 } });
    await teacher.waitForSelector('text=Academic Performance');
    await settle(teacher, 150);
    await r.scrollIntoTop('text=Academic Performance', { top: 110, dur: 0.9 });
    await r.at(W('reports', 1, 'attendance') - 0.6);
    await r.scrollIntoTop('p:text-is("Attendance")', { top: 300, dur: 0.9 });
    // L2: affective ratings.
    await r.at(W('reports', 2, 'Rate') - 0.6);
    await r.scrollIntoTop('text=Affective Domain', { top: 90, dur: 0.7 });
    const rate = async (trait, n) => r.click(`span:text-is("${trait}") + div button:text-is("${n}")`, { dur: 0.3 });
    for (const [trait, n] of [['Punctuality', 5], ['Neatness', 4], ['Attentiveness', 5], ['Participation', 4], ['Conduct', 5], ['Honesty', 5], ['Leadership', 4]]) await rate(trait, n);
    // L3: remark.
    await r.at(W('reports', 3, 'add') - 0.6);
    await r.scrollIntoTop('textarea', { top: 250, dur: 0.6 });
    await r.click('textarea', { offset: { x: 0.3, y: 0.4 }, dur: 0.4 });
    await r.type(REMARK, { min: 0.025, max: 0.05 });
    // L4: submit.
    await r.at(W('reports', 4, 'submit') - 0.4);
    await r.click('button:has-text("Submit for Approval")', { dur: 0.45 });
    await teacher.waitForSelector('span:text-is("submitted")');
    r.log({ type: 'mark', name: 'submitted' });
    await r.scroll(null, { dy: -2000, dur: 0.9 });
    await r.at(dur('reports'));
    await r.stop();
  }

  // ── approve: the headteacher approves the report card ─────────────────
  if (want('approve')) {
    console.log('scene approve');
    const r = ra;
    await nav(admin, '/primary/admin/reports', 'text=Basic 4');
    await park(r, 640, 900);
    await r.start('approve', { lead: LEAD });
    r.cam({ x: 600, y: 560, zoom: 1.25 }, 0);
    await r.at(W('approve', 0, 'progress') - 0.4);
    await r.moveTo('button:has-text("KG 1")', { offset: { x: 0.5, y: 0.85 } });
    await r.moveTo('button:has-text("Basic 4")', { offset: { x: 0.5, y: 0.85 }, dur: 0.6 });
    await r.click('button:has-text("Basic 4")', { offset: { x: 0.3, y: 0.2 } });
    await admin.waitForSelector('button:text-is("Approve")');
    await settle(admin, 150);
    await r.camOn('button:text-is("Approve")', 1.5, 0.6, { dx: -200, dy: 60 });
    await r.click('button:text-is("Approve")', { dur: 0.45 });
    await admin.waitForSelector('textarea');
    await r.camOn('textarea', 1.6, 0.6, { dy: 40 });
    await r.click('textarea', { offset: { x: 0.3, y: 0.4 }, dur: 0.4 });
    await r.type(HEAD_REMARK, { min: 0.03, max: 0.06 });
    await r.at(W('approve', 1, 'approves') - 0.2);
    await r.click('div.fixed button:text-is("Approve")', { dur: 0.4 });
    await admin.waitForSelector('textarea', { state: 'detached' });
    await settle(admin, 200);
    r.log({ type: 'mark', name: 'approved' });
    await r.camOn('button:has-text("Basic 4")', 1.6, 0.7);
    await r.moveTo('button:has-text("Basic 4") >> text=Approved', { offset: { x: 0.5, y: -0.4 } });
    await r.at(dur('approve'));
    await r.stop();
  }

  // ── staff: clock-ins in the office; a leave request approved ──────────
  if (want('staff')) {
    console.log('scene staff');
    const r = ra;
    await nav(admin, '/primary/admin/teacher-attendance', 'text=Akosua Boateng');
    await park(r, 640, 900);
    await r.start('staff', { lead: LEAD });
    r.cam({ x: 560, y: 560, zoom: 1.3 }, 0);
    await r.at(W('staff', 0, 'GPS') - 0.5);
    await r.camOn('text=Akosua Boateng', 1.55, 0.8, { dx: 300 });
    await r.moveTo('text=Akosua Boateng', { offset: { x: 5.2, y: 0.5 } });
    await r.at(W('staff', 1, 'Leave') - 0.7);
    r.cam({ x: 400, y: 560, zoom: 1.3 }, 0.6);
    await r.click('aside >> text=Leave Requests');
    await admin.waitForSelector('text=Kofi Larbi');
    await settle(admin, 200);
    r.cam({ x: 560, y: 380, zoom: 1.35 }, 0.7);
    await r.scroll('table', { dx: 400, dur: 0.8 });
    await r.click('tr:has-text("Kofi Larbi") button:text-is("Approve")', { dur: 0.5 });
    await admin.waitForSelector('tr:has-text("Kofi Larbi") >> text=Approved');
    r.log({ type: 'mark', name: 'approved' });
    await r.at(dur('staff'));
    await r.stop();
  }

  // ── cashbook: a payment recorded, balance updated ─────────────────────
  if (want('cashbook')) {
    console.log('scene cashbook');
    const r = ra;
    await nav(admin, '/primary/admin/cashbook', 'text=Closing Balance');
    await park(r, 640, 900);
    await r.start('cashbook', { lead: LEAD });
    r.cam({ x: 560, y: 520, zoom: 1.3 }, 0);
    await r.at(W('cashbook', 0, 'receipt') - 0.4);
    await r.moveTo('text=Total Receipts', { offset: { x: 0.5, y: 1.5 } });
    await r.at(W('cashbook', 0, 'payment') - 0.3);
    await r.moveTo('text=Total Payments', { offset: { x: 0.5, y: 1.5 } });
    // L1: add a payment under its expenditure head.
    await r.at(W('cashbook', 1, 'by') - 0.6);
    await r.click('button:has-text("+ Add")', { dur: 0.5 });
    await admin.waitForSelector('text=Add Entry >> nth=0');
    const modal = await admin.locator('input[placeholder="0.00"]').evaluate(el => {
      const b = el.closest('.shadow-2xl').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height };
    });
    r.cam({ x: modal.x, y: modal.y, zoom: Math.min(1.5, 1536 / (modal.h + 120)) }, 0.6);
    await r.click('button:has-text("Payment")', { dur: 0.4 });
    await r.click('input[placeholder="0.00"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.4 });
    await r.type('250', { min: 0.07, max: 0.1 });
    const part = 'input[placeholder^="e.g."]:near(:text("Particulars"))';
    await r.click(part, { offset: { x: 0.3, y: 0.5 }, dur: 0.4 });
    await r.type('Footballs and netballs for PE', { min: 0.025, max: 0.05 });
    const head = 'select:near(:text("GES Expenditure Head"))';
    await r.click(head, { offset: { x: 0.3, y: 0.5 }, dur: 0.4 });
    await admin.selectOption(head, 'Sports & Cultural Activities');
    r.log({ type: 'select', value: 'Sports & Cultural Activities' });
    await r.click('input[placeholder="e.g. PV-001 or CHQ-00456"]', { offset: { x: 0.3, y: 0.5 }, dur: 0.4 });
    await r.type('PV 007', { min: 0.05, max: 0.08 });
    await r.click('button:text-is("Add Entry")', { dur: 0.45 });
    await admin.waitForSelector('button:text-is("Add Entry")', { state: 'detached' });
    await settle(admin, 200);
    r.log({ type: 'mark', name: 'added' });
    // L2: the balance.
    r.cam({ x: 560, y: 380, zoom: 1.45 }, 0.8);
    await r.at(W('cashbook', 2, 'balance') - 0.3);
    await r.moveTo('text=Closing Balance', { offset: { x: 0.5, y: 1.6 } });
    await r.at(dur('cashbook'));
    await r.stop();
  }

  // ── yearend: promote every class, graduate Basic 6 ────────────────────
  if (want('yearend')) {
    console.log('scene yearend');
    const r = ra;
    await nav(admin, '/primary/admin/promotions', 'text=End-of-Year Wizard');
    await admin.click('text=End-of-Year Wizard');
    await admin.waitForSelector('button:has-text("Run End-of-Year Promotion")');
    await settle(admin, 300);
    await park(r, 640, 900);
    await r.start('yearend', { lead: LEAD });
    r.cam({ x: 600, y: 520, zoom: 1.4 }, 0);
    await r.at(W('yearend', 0, 'promote') - 0.4);
    await r.moveTo('td:text-is("KG 1")', { offset: { x: 3.5, y: 0.5 } });
    await r.moveTo('td:text-is("Basic 5")', { offset: { x: 3.5, y: 0.5 }, dur: 0.8 });
    await r.at(W('yearend', 0, 'graduate') - 0.3);
    await r.moveTo('text=Graduated >> nth=-1', { offset: { x: 0.5, y: 0.5 } });
    await r.at(W('yearend', 0, 'one') - 0.5);
    await r.click('button:has-text("Run End-of-Year Promotion")', { dur: 0.5 });
    await admin.waitForSelector('text=graduated');
    r.log({ type: 'mark', name: 'promoted' });
    await r.camOn('text=Result', 1.5, 0.7, { dx: 150, dy: 70 });
    await r.at(dur('yearend'));
    await r.stop();
  }

  await desk.close();
  await phone.close();
}

main().catch(async e => { console.error(e); if (global.__debugShots) await global.__debugShots(); process.exit(1); });
