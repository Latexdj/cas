const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 864, height: 1536 } });
  await p.goto('http://localhost:3001/login');
  await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001'); await p.fill('input[placeholder="e.g. T001"]', 'ADMIN'); await p.fill('input[placeholder="Your password"]', '1234');
  await p.click('button[type=submit]'); await p.waitForTimeout(2500);
  await p.goto('http://localhost:3001/waec-results/analytics'); await p.waitForTimeout(1500);
  console.log(await p.evaluate(() => { const r = []; document.querySelectorAll('*').forEach(e => { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 5) r.push(e.tagName + '.' + e.className.toString().slice(0, 60) + ' ' + e.scrollHeight + '/' + e.clientHeight); }); return { doc: document.scrollingElement.scrollHeight + '/' + innerHeight, r }; }));
  await p.goto('http://localhost:3001/principal/login'); await p.waitForTimeout(1500);
  await p.fill('input[placeholder="e.g. CAS000"]', 'AKW001'); await p.fill('input[placeholder="Your Teacher ID"]', 'HM01'); await p.fill('input[placeholder="Enter your password or PIN"]', '1234');
  await p.click('button[type=submit]'); await p.waitForTimeout(3000);
  console.log('after principal login', p.url());
  await p.goto('http://localhost:3001/principal/waec-results'); await p.waitForTimeout(3000);
  await p.screenshot({ path: '/tmp/claude-0/peek2/principal.png' });
  await b.close();
})();
