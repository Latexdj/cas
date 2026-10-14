const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const shots = '/tmp/claude-0/peek'; require('fs').mkdirSync(shots, { recursive: true });
  for (const [label, vp, dsf] of [['desk', { width: 1440, height: 900 }, 1], ['mob', { width: 430, height: 932 }, 2]]) {
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: dsf });
    await p.goto('http://localhost:3001/login');
    await p.screenshot({ path: `${shots}/${label}-login.png` });
    await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001');
    await p.fill('input[placeholder="e.g. T001"]', 'ADMIN');
    await p.fill('input[placeholder="Your password"]', '1234');
    await p.click('button[type=submit]');
    await p.waitForTimeout(3000);
    for (const path of ['/waec-results', '/waec-results/analytics', '/waec-results/rankings', '/waec-results/import']) {
      await p.goto('http://localhost:3001' + path); await p.waitForTimeout(2500);
      await p.screenshot({ path: `${shots}/${label}${path.replace(/\//g, '_')}.png`, fullPage: label === 'desk' });
    }
  }
  await b.close();
})();
