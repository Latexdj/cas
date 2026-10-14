// Records every UI scene of the WAEC Results advert from the running app
// (admin portal on :3001, API on :4000). Each scene is its own clip, timed
// against build/vo/timeline.json so on-screen actions land on the words
// that describe them.
//
// Usage: node capture.js [sceneId ...]   (default: all scenes)
// Before a full run the 2025 batch must not exist yet: it is imported on
// camera in the "import" scene.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Recorder, sleep, K, DILATE_SCRIPT } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'capture');
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'vo', 'timeline.json'), 'utf8'));
const LISTING = fs.readFileSync(path.join(ROOT, 'demo-data', 'listing_2025.txt'), 'utf8');
const APP = 'http://localhost:3001';
const LEAD = 0.6;

const scene = id => TL.scenes.find(s => s.id === id);
// Clip time of line `i` in scene `id`, optionally at the word starting with `word`.
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

async function login(page) {
  await page.goto(`${APP}/login`);
  await page.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
  await page.fill('input[placeholder="e.g. T001"]', 'ADMIN');
  await page.fill('input[placeholder="Your password"]', '1234');
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.goto(`${APP}/principal/login`);
  await page.fill('input[placeholder="e.g. CAS000"]', 'AKW001');
  await page.fill('input[placeholder="Your Teacher ID"]', 'HM01');
  await page.fill('input[placeholder="Enter your password or PIN"]', '1234');
  await page.click('button[type=submit]');
  await page.waitForURL(/principal(?!\/login)/, { timeout: 20000 });
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(ms);
}

const SCENES = {
  async intro(r, page) {
    await page.goto(`${APP}/dashboard`);
    await settle(page);
    r.cursor = { x: 560, y: 980 };
    await page.mouse.move(r.cursor.x, r.cursor.y);
    await r.start('intro', { lead: LEAD });
    r.cam({ x: 236, y: 300, zoom: 1.85 }, 0);
    r.cam({ x: 250, y: 330, zoom: 1.7 }, dur('intro') + 0.6);
    await r.at(0.55);
    await r.click('aside >> text=Analytics');
    await r.stop();
  },

  async import(r, page) {
    await r.start('import', { lead: LEAD });
    // L0: open WAEC Results, then Import New Year.
    await r.at(W('import', 0, 'Open') + 0.1);
    await r.click('aside >> text=WAEC Results');
    await page.waitForSelector('text=Import New Year');
    r.cam({ x: 540, y: 330, zoom: 1.55 }, 0.9);
    await r.at(W('import', 0, 'new') - 0.35);
    await r.click('button:has-text("Import New Year")');
    await page.waitForSelector('text=Upload Excel report');
    // L1: the three ways in.
    await r.camOn('button:has-text("Upload PDF")', 1.9, 0.9, { dx: 120, dy: -30 });
    await r.at(W('import', 1, 'PDF') - 0.2);
    await r.moveTo('button:has-text("Upload PDF")');
    await r.at(W('import', 1, 'paste') - 0.1);
    await r.moveTo('button:has-text("Paste text")');
    await r.at(W('import', 1, 'Excel') - 0.25);
    await r.click('button:has-text("Upload Excel report")');
    await r.camOn('text=For a year with no results listing', 1.75, 0.8, { dx: 40, dy: -20 });
    // L2: paste the listing and parse.
    await r.at(W('import', 2, 'Paste'));
    await r.click('button:has-text("Paste text")');
    await r.camOn('textarea', 1.45, 0.8, { dy: -40 });
    await r.at(W('import', 2, 'straight'));
    await r.click('textarea', { offset: { x: 0.35, y: 0.3 } });
    await r.at(W('import', 2, 'portal') - 0.15);
    await r.paste('textarea', LISTING);
    await r.at(W('import', 2, 'Parse') - 0.45);
    await r.click('button:has-text("Parse")');
    await page.waitForSelector('text=Detected', { timeout: 20000 });
    // L3: what CAS found.
    await r.at(W('import', 3, 'CAS') - 0.2);
    await r.camOn('section:has(h2:text-is("Detected"))', 1.42, 0.9, { dy: 60 });
    await r.moveTo('section:has(h2:text-is("Detected")) p', { offset: { x: 0.55, y: 0.5 } });
    await r.at(W('import', 3, 'every', 2) - 0.1);
    await r.camOn('section:has(h2:text-is("Registered / Absent"))', 1.3, 1.2, { dy: 40 });
    // L4: an absentee in Mathematics.
    const mathsAbsentBoys = 'tr:has(td:text-is("Mathematics")) input >> nth=0';
    await r.at(W('import', 4, 'Enter') - 0.1);
    await r.camOn('tr:has(td:text-is("Mathematics"))', 1.4, 0.8, { dx: 60 });
    await r.click(mathsAbsentBoys);
    await page.keyboard.press('Control+A');
    await r.at(W('import', 4, 'absentees') + 0.25);
    await r.type('1');
    await r.at(W('import', 4, 'registered') - 0.4);
    r.cam({ x: 600, y: r.cursor.y, zoom: 1.4 }, 1.1);
    await r.scroll('tr:has(td:text-is("Mathematics"))', { dx: 400, dur: 1.0 });
    await r.moveTo('tr:has(td:text-is("Mathematics")) td >> nth=7', { offset: { x: 0.5, y: 0.6 } });
    // L5: confirm and save.
    await r.at(W('import', 5, 'Confirm') - 0.75);
    await r.camOn('button:has-text("Confirm & Save")', 1.7, 0.7, { dx: -120 });
    await r.click('button:has-text("Confirm & Save")');
    r.log({ type: 'mark', name: 'saved' });
    await page.waitForSelector('text=Analysis Report', { timeout: 20000 });
    r.log({ type: 'mark', name: 'report-visible' });
    r.camFull(1.0);
    await r.at(dur('import'));
    await r.stop();
  },

  async report(r, page) {
    await r.start('report', { lead: LEAD });
    r.cam({ x: 520, y: 205, zoom: 1.55 }, 0.9);
    await r.at(0.4);
    await r.moveTo('h1:has-text("Analysis Report")', { offset: { x: 0.8, y: 0.6 } });
    // L1: pass rate chart.
    await r.at(W('report', 1, 'Pass') - 0.3);
    await r.camOn('text=Pass Rate by Subject', 1.3, 1.0, { dy: 190, dx: 80 });
    await r.at(W('report', 1, 'colour') - 0.2);
    await r.moveTo('text=Mathematics >> nth=0', { offset: { x: 1.6, y: 0.5 } });
    await r.at(W('report', 1, 'weak'));
    await r.moveTo('text=Integrated Science >> nth=0', { offset: { x: 1.4, y: 0.5 } });
    // L2: grade distribution, scrolled across A1..F9.
    await r.at(W('report', 2, 'The') - 0.4);
    await r.scrollIntoTop('h2:text-is("Grade Distribution")', { top: 80, dur: 0.9 });
    r.cam({ x: 480, y: 330, zoom: 1.55 }, 0.9);
    await r.moveTo({ x: 520, y: 260 });
    await r.at(W('report', 2, 'boys') - 0.2);
    r.cam({ x: 560, y: 330, zoom: 1.55 }, 2.2);
    await Promise.all([
      r.scroll('h3:text-is("Core") + table', { dx: 560, dur: 1.8 }),
      r.scroll('h3:text-is("Electives") + table', { dx: 560, dur: 1.8 }),
    ]);
    // L3: computed summary vs WAEC's printed summary.
    await r.at(W('report', 3, 'And') - 0.4);
    await r.scrollIntoTop('h2:has-text("Summary of Subjects Passed")', { top: 70, dur: 1.0 });
    await r.camOn('h2:has-text("Summary of Subjects Passed")', 1.3, 1.0, { dx: 150, dy: 200 });
    await r.moveTo('h2:has-text("Summary of Subjects Passed")', { offset: { x: 0.5, y: 3.2 } });
    await r.at(W('report', 3, 'printed') - 0.3);
    await r.moveTo('h2:has-text("WAEC\'s Own Printed Summary")', { offset: { x: 0.5, y: 3.2 } });
    await r.at(dur('report'));
    await r.stop();
  },

  async export(r, page, ctx) {
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
    await sleep(500);
    await r.start('export', { lead: LEAD });
    await r.camOn('button:has-text("Export Excel")', 1.9, 0, { dx: 60, dy: 40 });
    await r.at(W('export', 0, 'Excel') - 0.45);
    const xlsx = page.waitForEvent('download');
    await r.click('button:has-text("Export Excel")');
    (await xlsx).saveAs(path.join(OUT, 'downloads', 'WAEC_2025_Analysis_Report.xlsx'));
    await r.at(W('export', 0, 'PDF') - 0.4);
    const pdf = page.waitForEvent('download', { timeout: 60000 });
    await r.click('button:has-text("Export PDF")');
    r.log({ type: 'mark', name: 'pdf-clicked' });
    const d = await pdf;
    r.log({ type: 'mark', name: 'pdf-downloaded' });
    await d.saveAs(path.join(OUT, 'downloads', 'WAEC_2025_Analysis_Report.pdf'));
    await r.at(dur('export'));
    await r.stop();
  },

  async analytics(r, page) {
    await page.goto(`${APP}/waec-results`);
    await settle(page);
    r.cursor = { x: 600, y: 600 };
    await page.mouse.move(600, 600);
    await r.start('analytics', { lead: LEAD });
    await r.camOn('table', 1.55, 0, { dy: -20 });
    await r.at(0.2);
    await r.moveTo('tr:has(td:text-is("2025"))', { offset: { x: 0.15, y: 0.5 } });
    await r.at(W('analytics', 0, 'builds') - 0.3);
    await r.click('button:has-text("View Analytics")');
    await page.waitForSelector('text=Performance trend');
    await r.camOn('text=Performance trend', 1.35, 0.9, { dx: 270, dy: 150 });
    const dots = '.recharts-line-dots circle';
    await page.waitForSelector(dots);
    await r.at(W('analytics', 1, '58%') - 0.35);
    await r.moveTo(`${dots} >> nth=0`);
    await r.at(W('analytics', 1, '80%') - 0.35);
    await r.moveTo(`${dots} >> nth=2`);
    // L2: pick Mathematics.
    await r.at(W('analytics', 2, 'Pick') - 0.2);
    await r.camOn('button:has-text("Subject: All")', 1.75, 0.8, { dx: 120, dy: 170 });
    await r.click('button:has-text("Subject: All")');
    await r.at(W('analytics', 2, 'trend') - 0.3);
    await r.click('label:has-text("Mathematics")');
    // L3: close the panel, read the Mathematics line.
    await r.at(W('analytics', 3, 'Mathematics') - 0.1);
    await r.click('text=Pass-rate trends and subject comparisons', { offset: { x: 0.85, y: 0.5 } });
    await r.camOn('text=Performance trend', 1.35, 0.8, { dx: 270, dy: 150 });
    await r.at(W('analytics', 3, '40%') - 0.3);
    await r.moveTo(`${dots} >> nth=0`);
    await r.at(W('analytics', 3, '68%') - 0.3);
    await r.moveTo(`${dots} >> nth=2`);
    await r.at(W('analytics', 3, '68%') + 0.9);
    await r.scrollIntoTop('h3:has-text("Grade distribution")', { top: 120, dur: 1.0 });
    r.cam({ x: 544, y: 400, zoom: 1.3 }, 1.0);
    await r.at(dur('analytics'));
    await r.stop();
  },

  async rankings(r, page) {
    await page.goto(`${APP}/waec-results/rankings`);
    await page.waitForSelector('tbody tr');
    await settle(page, 800);
    r.cursor = { x: 640, y: 420 };
    await page.mouse.move(640, 420);
    await r.start('rankings', { lead: LEAD });
    await r.camOn('tbody tr >> nth=2', 1.45, 0, { dx: 40, dy: 60 });
    await r.at(0.1);
    await r.moveTo('tbody tr >> nth=0', { offset: { x: 0.3, y: 0.5 } });
    await r.at(W('rankings', 0, 'every') - 0.1);
    await r.moveTo('tbody tr >> nth=4', { offset: { x: 0.8, y: 0.5 }, dur: 0.9 });
    await r.at(W('rankings', 0, 'aggregate') - 0.5);
    await r.scroll('tbody', { dy: 380, dur: 0.9 });
    // L1: filters.
    await r.at(W('rankings', 1, 'Filter') - 0.45);
    await r.scroll('tbody', { dy: -380, dur: 0.45 });
    await r.camOn('label:text-is("Gender")', 1.75, 0.7, { dx: 150, dy: 30 });
    const gender = 'select >> nth=1', subject = 'select >> nth=2';
    await r.at(W('rankings', 1, 'gender') - 0.35);
    await r.click(gender);
    await page.selectOption(gender, 'Female');
    r.log({ type: 'select', value: 'Female' });
    await r.at(W('rankings', 1, 'single') - 0.35);
    await r.click(subject);
    await page.selectOption(subject, 'Mathematics');
    r.log({ type: 'select', value: 'Mathematics' });
    await sleep(150 * K);
    await r.camOn('tbody tr >> nth=1', 1.15, 0.7, { dx: 0, dy: 160 });
    await r.at(dur('rankings'));
    await r.stop();
  },

  async lookup(r, page) {
    await page.goto(`${APP}/waec-results/students`);
    await settle(page, 800);
    r.cursor = { x: 600, y: 520 };
    await page.mouse.move(600, 520);
    await r.start('lookup', { lead: LEAD });
    await r.camOn('input[placeholder^="Search by name"]', 1.4, 0, { dy: 160 });
    await r.at(W('lookup', 0, 'Search') - 0.5);
    await r.click('input[placeholder^="Search by name"]', { offset: { x: 0.2, y: 0.5 } });
    await r.at(W('lookup', 0, 'name') - 0.1);
    await r.type('Antwi');
    await page.waitForSelector('button:has-text("ANTWI EMMANUEL")');
    await r.moveTo('button:has-text("ANTWI EMMANUEL")', { offset: { x: 0.3, y: 0.5 } });
    await r.at(W('lookup', 1, 'Grades') - 0.3);
    await r.click();
    await page.waitForSelector('text=WASSCE 2025');
    await r.camOn('div.bg-white:has(p:has-text("WASSCE 2025"))', 1.4, 0.8, { dy: 80 });
    await r.at(W('lookup', 1, 'aggregate') - 0.2);
    await r.moveTo('p.text-2xl', { offset: { x: 0.2, y: 0.9 } });
    await r.at(dur('lookup'));
    await r.stop();
  },

  async principal(r, page) {
    await page.goto(`${APP}/principal/waec-results`);
    await page.waitForSelector('text=Year Report');
    await settle(page, 1500);
    r.cursor = { x: 500, y: 700 };
    await page.mouse.move(500, 700);
    await r.start('principal', { lead: LEAD });
    r.cam({ x: 236, y: 250, zoom: 1.8 }, 0);
    await r.at(W('principal', 0, 'head') - 0.1);
    r.cam({ x: 432, y: 640, zoom: 1.12 }, 1.4);
    await r.at(W('principal', 0, 'reports') - 0.6);
    await r.click('button:has-text("Analytics Trends")');
    await r.at(dur('principal'));
    await r.stop();
  },
};

(async () => {
  const only = process.argv.slice(2);
  fs.mkdirSync(path.join(OUT, 'downloads'), { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--force-device-scale-factor=2'] });
  const ctx = await browser.newContext({ viewport: { width: 864, height: 1536 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(DILATE_SCRIPT);
  const page = await ctx.newPage();
  await login(page);
  const r = new Recorder(page, OUT);
  for (const [id, fn] of Object.entries(SCENES)) {
    if (only.length && !only.includes(id)) continue;
    console.log(`scene ${id} (${dur(id).toFixed(1)}s)`);
    await fn(r, page, ctx);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
