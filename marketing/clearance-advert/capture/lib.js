// Capture helpers: records the real app through Chrome's screencast while
// driving a real mouse, and logs everything the composition needs to
// re-create the shot (cursor path, clicks, key presses, camera cues), all
// on the same clock as the frames.
const fs = require('fs');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now() / 1000;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Deterministic jitter so re-captures produce the same paths.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// The page's own clock is slowed by K (see DILATE_SCRIPT) and the
// recorder works in "clip time" = real time / K, so the screencast gets K
// times as many frames per second of on-screen motion.
const K = 3;
const DILATE_SCRIPT = `(() => {
  const K = ${K};
  const pNow = performance.now.bind(performance), dNow = Date.now, t0 = pNow(), d0 = dNow();
  performance.now = () => t0 + (pNow() - t0) / K;
  Date.now = () => d0 + (dNow() - d0) / K;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  window.setTimeout = (f, ms, ...a) => st(f, (ms || 0) * K, ...a);
  window.setInterval = (f, ms, ...a) => si(f, (ms || 0) * K, ...a);
})();`;

class Recorder {
  constructor(page, outDir) {
    this.page = page;
    this.outDir = outDir;
    this.cursor = { x: 640, y: 760 };
    this.clip = null;
  }

  async start(name, { lead = 0 } = {}) {
    const dir = path.join(this.outDir, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    // Clip time 0 = scene start; recording begins `lead` seconds earlier so
    // the composition has material for the transition into the scene.
    this.clip = { name, dir, t0: Infinity, frames: [], events: [], warnings: [] };
    await this.cdp.send('Animation.enable');
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / K });
    const clip = this.clip;
    this.cdp.on('Page.screencastFrame', f => {
      const file = `f${String(clip.frames.length).padStart(5, '0')}.jpg`;
      fs.writeFileSync(path.join(dir, 'frames', file), Buffer.from(f.data, 'base64'));
      clip.frames.push({ file, t: +((f.metadata.timestamp - (isFinite(clip.t0) ? clip.t0 : now() + 1)) / K).toFixed(4) });
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1728, maxHeight: 3072 });
    clip.t0 = now() + lead * K;
    this.log({ type: 'move', x: this.cursor.x, y: this.cursor.y });
    // Nudge a repaint so the first frame arrives even on a static page.
    await this.page.evaluate(() => { document.body.style.outline = '0px solid transparent'; });
  }

  async stop(tail = 0.6) {
    await sleep(tail * K * 1000);
    await this.cdp.send('Page.stopScreencast');
    await sleep(150);
    const c = this.clip;
    fs.writeFileSync(path.join(c.dir, 'clip.json'), JSON.stringify({
      name: c.name, viewport: this.page.viewportSize(), frames: c.frames, events: c.events, warnings: c.warnings,
      end: +((now() - c.t0) / K).toFixed(3),
    }, null, 1));
    console.log(`  ${c.name}: ${c.frames.length} frames, ${((now() - c.t0) / K).toFixed(1)}s` + (c.warnings.length ? `, ${c.warnings.length} timing warnings` : ''));
    c.warnings.forEach(w => console.log('    ! ' + w));
    this.clip = null;
  }

  t() { return (now() - this.clip.t0) / K; }
  log(e) { if (this.clip) this.clip.events.push({ t: +this.t().toFixed(4), ...e }); }

  // Wait until clip time `sec`.
  async at(sec, label = '') {
    const d = sec - this.t();
    if (d < -0.25) this.clip.warnings.push(`late by ${(-d).toFixed(2)}s at ${sec.toFixed(2)} ${label}`);
    if (d > 0) await sleep(d * K * 1000);
  }

  async box(target) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    return loc.boundingBox();
  }

  async moveTo(target, { dur, offset = { x: 0.5, y: 0.5 } } = {}) {
    let x, y;
    if (typeof target === 'object' && 'x' in target && !('locator' in target)) ({ x, y } = target);
    else {
      const b = await this.box(target);
      x = b.x + b.width * offset.x + (rand() - 0.5) * Math.min(10, b.width * 0.1);
      y = b.y + b.height * offset.y + (rand() - 0.5) * Math.min(4, b.height * 0.1);
    }
    const from = { ...this.cursor };
    const dist = Math.hypot(x - from.x, y - from.y);
    dur = dur ?? Math.min(1.1, 0.32 + dist / 1500);
    // Curved path: control points pushed sideways from the straight line,
    // like a wrist arc, with a little overshoot that settles on target.
    const nx = -(y - from.y) / (dist || 1), ny = (x - from.x) / (dist || 1);
    const bend = (rand() - 0.5) * dist * 0.25;
    const c1 = { x: from.x + (x - from.x) * 0.3 + nx * bend, y: from.y + (y - from.y) * 0.3 + ny * bend };
    const c2 = { x: from.x + (x - from.x) * 0.75 + nx * bend * 0.4, y: from.y + (y - from.y) * 0.75 + ny * bend * 0.4 };
    const over = { x: x + (x - from.x) * 0.012, y: y + (y - from.y) * 0.012 };
    const start = now();
    for (;;) {
      const p = Math.min(1, (now() - start) / (dur * K));
      const e = ease(p);
      const u = 1 - e;
      let px = u * u * u * from.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e * e * e * over.x;
      let py = u * u * u * from.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e * e * e * over.y;
      if (p >= 1) { px = x; py = y; }
      await this.page.mouse.move(px, py);
      this.cursor = { x: px, y: py };
      this.log({ type: 'move', x: +px.toFixed(1), y: +py.toFixed(1) });
      if (p >= 1) break;
      await sleep(14);
    }
  }

  async click(target, opts = {}) {
    if (target) await this.moveTo(target, opts);
    await sleep((90 + rand() * 60) * K);
    this.log({ type: 'down', x: this.cursor.x, y: this.cursor.y });
    await this.page.mouse.down();
    await sleep(85 * K);
    await this.page.mouse.up();
    this.log({ type: 'up', x: this.cursor.x, y: this.cursor.y });
  }

  async type(text, { min = 0.06, max = 0.14 } = {}) {
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      this.log({ type: 'key', key: ch });
      await sleep((min + rand() * (max - min)) * K * 1000);
    }
  }

  // Camera cue: centre (CSS px of the viewport) and zoom, reached over `dur` s.
  cam(spec, dur = 0.9) { this.log({ type: 'cam', dur, ...spec }); }
  async camOn(target, zoom, dur = 0.9, { dy = 0, dx = 0 } = {}) {
    const b = await this.box(target);
    this.cam({ x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy, zoom }, dur);
  }
  camFull(dur = 0.9) { const v = this.page.viewportSize(); this.cam({ x: v.width / 2, y: v.height / 2, zoom: 1 }, dur); }

  // Smoothly scroll the nearest scrollable ancestor of `target` (or the
  // page) by `dy`/`dx` CSS px over `dur` s, like a trackpad.
  async scroll(target, { dy = 0, dx = 0, dur = 1.0 } = {}) {
    this.log({ type: 'scroll', dy, dx, dur });
    const fn = async (el, { dy, dx, dur }) => {
      const scrollable = n => {
        for (let e = n; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (dy && /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) return e;
          if (dx && /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) return e;
        }
        return document.scrollingElement;
      };
      const box = scrollable(el);
      const sx = box.scrollLeft, sy = box.scrollTop, t0 = performance.now();
      const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      await new Promise(res => {
        const step = () => {
          const p = Math.min(1, (performance.now() - t0) / (dur * 1000));
          box.scrollTo(sx + dx * ease(p), sy + dy * ease(p));
          p < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      });
    };
    const args = { dy, dx, dur };
    await this.page.locator(target || 'main').first().evaluate(fn, args);
  }

  // Paste text into a field the way a real paste lands: all at once.
  async paste(selector, text) {
    this.log({ type: 'shortcut', keys: ['Ctrl', 'V'] });
    await this.page.locator(selector).first().evaluate((el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
  }

  // Scroll so the element's top sits `top` px below the viewport top.
  async scrollIntoTop(selector, { top = 90, dur = 1.0 } = {}) {
    const b = await this.box(selector);
    await this.scroll(null, { dy: b.y - top, dur });
  }
}

module.exports = { Recorder, sleep, rand, K, DILATE_SCRIPT };
