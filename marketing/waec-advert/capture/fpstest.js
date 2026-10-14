const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 864, height: 1536 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:3001/login');
  await p.fill('input[placeholder="e.g. CAS001"]', 'AKW001'); await p.fill('input[placeholder="e.g. T001"]', 'ADMIN'); await p.fill('input[placeholder="Your password"]', '1234');
  await p.click('button[type=submit]'); await p.waitForTimeout(2500);
  await p.goto('http://localhost:3001/waec-results/analytics'); await p.waitForTimeout(500);
  const cdp = await p.context().newCDPSession(p);
  let n = 0, sizes = [];
  cdp.on('Page.screencastFrame', async f => { n++; sizes.push(f.data.length); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1728, maxHeight: 3072 });
  const t = Date.now();
  for (let i = 0; i < 120; i++) { await p.mouse.move(300 + i * 3, 400 + i * 4); await p.waitForTimeout(16); }
  await p.mouse.wheel(0, 600); await p.waitForTimeout(1000);
  await cdp.send('Page.stopScreencast');
  const s = (Date.now() - t) / 1000;
  console.log('frames', n, 'secs', s.toFixed(2), 'fps', (n / s).toFixed(1), 'avg KB', (sizes.reduce((a, b) => a + b, 0) / n / 1024 * 0.75).toFixed(0));
  await b.close();
})();
