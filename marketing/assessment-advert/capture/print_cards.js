// Re-renders the class report cards exactly as "Print All" sends them to
// the printer, for the current data. capture.js does the same during the
// results scene; this is for regenerating the PDF on its own.
// Usage: node print_cards.js "2 Science"
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const cls = process.argv[2] || '2 Science';
  const APP = 'http://localhost:3001';
  const out = path.resolve(__dirname, '..', 'build', 'capture', 'downloads');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.print = () => { window.__printedHtml = document.documentElement.outerHTML; }; });
  const p = await ctx.newPage();
  await p.goto(APP + '/login');
  await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
  await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
  await p.fill('input[placeholder="Your password"]', '1234');
  await p.click('button[type=submit]');
  await p.waitForURL(/dashboard/);
  await p.goto(APP + '/results');
  await p.waitForSelector('select >> nth=2');
  await p.waitForTimeout(1500);
  await p.selectOption('select >> nth=2', cls);
  await p.waitForSelector('button:has-text("Print All")');
  await p.click('button:has-text("Print All")');
  await p.waitForFunction(() => !!window.__printedHtml, null, { timeout: 60000 });
  const html = (await p.evaluate(() => window.__printedHtml))
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace('<head>', `<head><base href="${APP}/">`);
  fs.writeFileSync(path.join(out, 'printed_report_cards.html'), html);
  const pdf = await (await b.newContext()).newPage();
  await pdf.setContent(html, { waitUntil: 'networkidle' });
  await pdf.emulateMedia({ media: 'print' });
  await pdf.pdf({ path: path.join(out, `Report_Cards_${cls.replace(/ /g, '_')}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
