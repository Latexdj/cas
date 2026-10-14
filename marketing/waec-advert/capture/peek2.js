const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const shots = '/tmp/claude-0/peek2'; require('fs').mkdirSync(shots, { recursive: true });
  const p = await b.newPage({ viewport: { width: 864, height: 1536 }, deviceScaleFactor: 1 });
  await p.goto('http://localhost:3001/login');
  await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
  await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
  await p.fill('input[placeholder="Your password"]', '1234');
  await p.click('button[type=submit]'); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${shots}/dashboard.png` });
  const ids = (await (await p.request.get('http://localhost:3001')).status());
  for (const path of ['/waec-results', '/waec-results/analytics', '/waec-results/rankings', '/waec-results/students']) {
    await p.goto('http://localhost:3001' + path); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${shots}/${path.replace(/\//g, '_')}.png` });
  }
  await p.goto('http://localhost:3001/waec-results'); await p.waitForTimeout(1500);
  await p.click('text=View report'); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${shots}/report.png`, fullPage: true });
  await b.close();
})();
