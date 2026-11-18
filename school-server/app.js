'use strict';
// CAS School Server
//
// Runs on a Windows PC on a school's local network (no internet needed) and
// serves the student app's past-questions pack and the latest student APK to
// tablets over Wi-Fi. When the PC has internet it refreshes the pack from the
// CAS cloud; packs and APKs can also be loaded from a flash drive through the
// admin page at http://localhost:8787 (only reachable from this PC).
//
// No npm dependencies: copy the folder with node.exe and run.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
require('dns').setDefaultResultOrder('ipv4first');

const VERSION = '1.1.0';
const PORT = Number(process.env.CAS_SERVER_PORT) || 8787;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const SYNC_EVERY_MS = 30 * 60 * 1000;


// ── Small helpers ─────────────────────────────────────────────────────────────

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(line);
  try {
    const f = path.join(DATA, 'server.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, f + '.1');
    fs.appendFileSync(f, line);
  } catch { /* logging must never stop the server */ }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const CONFIG_FILE = path.join(DATA, 'config.json');
function config() {
  return { cloud_url: 'https://cas-backend-20rn.onrender.com', school_name: '', ...readJson(CONFIG_FILE, {}) };
}
if (!fs.existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, config());

const STATE_FILE = path.join(DATA, 'state.json');
const state = { last_sync: null, last_sync_result: null, last_online: null, ...readJson(STATE_FILE, {}) };
const saveState = () => { try { writeJson(STATE_FILE, state); } catch (e) { log('state save failed', e.message); } };

// ── Zip reading (central directory + zlib inflate) ───────────────────────────

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip file');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries[name] = { method, csize, local };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const lnameLen = buf.readUInt16LE(e.local + 26);
      const lextraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnameLen + lextraLen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip compression in ${name}`);
    },
  };
}

// ── APK version (binary AndroidManifest.xml) ─────────────────────────────────

function apkVersion(buf) {
  const zip = readZip(buf);
  const xml = zip.read('AndroidManifest.xml');
  if (!xml) throw new Error('This file is not an Android app (no AndroidManifest.xml).');
  let strings = [], resIds = [];
  let p = 8; // after the XML chunk header
  while (p < xml.length) {
    const type = xml.readUInt16LE(p), headerSize = xml.readUInt16LE(p + 2), size = xml.readUInt32LE(p + 4);
    if (type === 0x0001) { // string pool
      const count = xml.readUInt32LE(p + 8), flags = xml.readUInt32LE(p + 16), start = xml.readUInt32LE(p + 20);
      const utf8 = (flags & 0x100) !== 0;
      for (let i = 0; i < count; i++) {
        let o = p + start + xml.readUInt32LE(p + headerSize + i * 4);
        if (utf8) {
          o += (xml[o] & 0x80) ? 2 : 1;                 // utf16 length
          let len = xml[o]; o += 1;
          if (len & 0x80) { len = ((len & 0x7f) << 8) | xml[o]; o += 1; }
          strings.push(xml.toString('utf8', o, o + len));
        } else {
          let len = xml.readUInt16LE(o); o += 2;
          if (len & 0x8000) { len = ((len & 0x7fff) << 16) | xml.readUInt16LE(o); o += 2; }
          strings.push(xml.toString('utf16le', o, o + len * 2));
        }
      }
    } else if (type === 0x0180) { // resource ids for attribute names
      for (let o = p + 8; o < p + size; o += 4) resIds.push(xml.readUInt32LE(o));
    } else if (type === 0x0102) { // start element
      const name = strings[xml.readUInt32LE(p + 20)];
      if (name === 'manifest') {
        const attrStart = xml.readUInt16LE(p + 24), attrSize = xml.readUInt16LE(p + 26), attrCount = xml.readUInt16LE(p + 28);
        const out = {};
        for (let i = 0; i < attrCount; i++) {
          const a = p + 16 + attrStart + i * attrSize;
          const nameIdx = xml.readUInt32LE(a + 4);
          const raw = xml.readInt32LE(a + 8);
          const dataType = xml[a + 15];
          const data = xml.readUInt32LE(a + 16);
          const attrName = strings[nameIdx] || '';
          const resId = resIds[nameIdx];
          const value = dataType === 0x03 ? strings[data] : raw >= 0 ? strings[raw] : data;
          if (attrName === 'versionCode' || resId === 0x0101021b) out.versionCode = Number(dataType === 0x10 ? data : value);
          if (attrName === 'versionName' || resId === 0x0101021c) out.versionName = String(value);
          if (attrName === 'package') out.package = String(value);
        }
        return out;
      }
    }
    p += size || 8;
  }
  throw new Error('Could not read the app version.');
}

// ── Past questions pack ───────────────────────────────────────────────────────
// Each pack lives in its own folder (data/pack-<stamp>); data/current-pack.txt
// names the live one. A new pack is written beside it and switched in one
// step, so a tablet mid-download never sees half a pack (and Windows never
// has to rename a folder that is being read).

const CURRENT = path.join(DATA, 'current-pack.txt');
function packDir() {
  try { const d = fs.readFileSync(CURRENT, 'utf8').trim(); if (d && fs.existsSync(path.join(DATA, d))) return path.join(DATA, d); } catch { /* none */ }
  return null;
}
function packManifest() {
  const d = packDir();
  return d ? readJson(path.join(d, 'manifest.json')) : null;
}
function switchPack(newDir) {
  const old = packDir();
  fs.writeFileSync(CURRENT, path.basename(newDir));
  if (old && old !== newDir) setTimeout(() => fs.rm(old, { recursive: true, force: true }, () => {}), 10 * 60 * 1000);
}
function newPackDir() {
  const d = path.join(DATA, `pack-${Date.now()}`);
  fs.mkdirSync(path.join(d, 'subjects'), { recursive: true });
  fs.mkdirSync(path.join(d, 'images'), { recursive: true });
  return d;
}
// Leftover pack folders from earlier runs.
for (const n of fs.readdirSync(DATA)) {
  if (n.startsWith('pack-') && path.join(DATA, n) !== packDir()) fs.rm(path.join(DATA, n), { recursive: true, force: true }, () => {});
}

const safeName = (s) => /^[A-Za-z0-9._-]+$/.test(s) && !s.includes('..');

/** Loads a pack .zip (as downloaded from Super Admin). */
function loadPackZip(buf, { force = false } = {}) {
  let zip;
  try { zip = readZip(buf); } catch { throw new Error('This file is not a Past Questions pack (.zip).'); }
  const mPath = zip.names.find(n => /(^|\/)manifest\.json$/.test(n) && !n.includes('__MACOSX'));
  if (!mPath) throw new Error('This .zip is not a Past Questions pack (no manifest.json).');
  const base = mPath.slice(0, -'manifest.json'.length);
  const manifest = JSON.parse(zip.read(mPath).toString('utf8'));
  if (!Array.isArray(manifest.subjects) || typeof manifest.version !== 'number') throw new Error('This .zip is not a Past Questions pack.');
  const cur = packManifest();
  if (cur && manifest.version <= cur.version && !force) {
    const e = new Error(manifest.version === cur.version
      ? 'The server already has this pack (same version).'
      : `This pack (version ${manifest.version}) is older than the one on the server (version ${cur.version}).`);
    e.code = 'OLDER'; throw e;
  }
  const dir = newPackDir();
  let questions = 0;
  for (const s of manifest.subjects) {
    const raw = zip.read(`${base}subjects/${s.slug}.json`);
    if (!raw || !safeName(s.slug)) continue;
    fs.writeFileSync(path.join(dir, 'subjects', `${s.slug}.json`), raw);
    questions += (JSON.parse(raw.toString('utf8')).questions || []).length;
  }
  for (const n of zip.names) {
    if (n.startsWith(`${base}images/`) && safeName(n.slice(base.length + 7))) {
      fs.writeFileSync(path.join(dir, 'images', n.slice(base.length + 7)), zip.read(n));
    }
  }
  writeJson(path.join(dir, 'manifest.json'), { version: manifest.version, published_at: manifest.published_at, subjects: manifest.subjects, source: 'file', loaded_at: new Date().toISOString() });
  switchPack(dir);
  log(`pack loaded from file: version ${manifest.version}, ${questions} questions`);
  return { version: manifest.version, subjects: manifest.subjects.length, questions };
}

const extOf = (url) => (String(url).split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png').toLowerCase();

async function fetchWithTimeout(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { signal: ctl.signal }); } finally { clearTimeout(t); }
}

let syncing = false;
/** Brings the pack up to date from the CAS cloud. Quiet when offline. */
async function syncFromCloud() {
  if (syncing) return state.last_sync_result;
  syncing = true;
  const cloud = config().cloud_url.replace(/\/+$/, '');
  try {
    let remote;
    try {
      // A mobile router can take a few seconds to wake its link, and the
      // cloud server can be slow on its first request: try three times.
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await fetchWithTimeout(`${cloud}/api/pasco-bank/pack/manifest`, 30000);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          remote = await r.json();
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise(res => setTimeout(res, 5000));
        }
      }
    } catch (e) {
      state.last_sync = new Date().toISOString();
      state.last_sync_result = { ok: false, offline: true, message: 'No internet connection.' };
      saveState();
      return state.last_sync_result;
    }
    state.last_online = new Date().toISOString();
    const cur = packManifest();
    const curDir = packDir();
    const curHash = new Map((cur?.subjects || []).map(s => [s.slug, s.hash]));
    const changed = remote.subjects.filter(s => curHash.get(s.slug) !== s.hash);
    const removed = (cur?.subjects || []).some(s => !remote.subjects.find(r => r.slug === s.slug));
    // Never go back to an older pack (one loaded by hand can be newer).
    if (cur && remote.version < cur.version) {
      state.last_sync_result = { ok: true, message: `The server's pack (version ${cur.version}) is newer than the online one (${remote.version}).` };
    } else if (cur && !changed.length && !removed) {
      if (cur.version !== remote.version) writeJson(path.join(curDir, 'manifest.json'), { ...cur, version: remote.version, published_at: remote.published_at });
      state.last_sync_result = { ok: true, message: 'Already up to date.' };
    } else {
      const dir = newPackDir();
      // Unchanged subjects and their images are copied from the current pack.
      for (const s of remote.subjects) {
        if (changed.includes(s) || !curDir) continue;
        fs.copyFileSync(path.join(curDir, 'subjects', `${s.slug}.json`), path.join(dir, 'subjects', `${s.slug}.json`));
        const pack = readJson(path.join(dir, 'subjects', `${s.slug}.json`), { questions: [] });
        for (const p of imagePaths(pack)) {
          const from = path.join(curDir, p);
          if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, p));
        }
      }
      let missing = 0;
      for (const s of changed) {
        const before = missing;
        const r = await fetchWithTimeout(`${cloud}/api/pasco-bank/pack/subjects/${encodeURIComponent(s.slug)}`, 60000);
        if (!r.ok) throw new Error(`Downloading ${s.name} failed (HTTP ${r.status}).`);
        const pack = await r.json();
        for (const q of pack.questions) {
          const grab = async (url, name) => {
            if (!url) return null;
            const rel = `images/${name}.${extOf(url)}`;
            try {
              const ir = await fetchWithTimeout(url, 30000);
              if (!ir.ok) throw new Error(String(ir.status));
              fs.writeFileSync(path.join(dir, rel), Buffer.from(await ir.arrayBuffer()));
              return rel;
            } catch { missing++; return null; }
          };
          const imgs = Array.isArray(q.images) ? q.images : (q.image_url ? [q.image_url] : []);
          q.images = [];
          for (const [n, url] of imgs.entries()) q.images.push(await grab(url, `${q.id}-${n + 1}`));
          q.image_url = q.images[0] ?? null;
          if (Array.isArray(q.option_images)) {
            for (const [k, url] of q.option_images.entries()) q.option_images[k] = await grab(url, `${q.id}-o${k + 1}`);
          }
        }
        writeJson(path.join(dir, 'subjects', `${s.slug}.json`), pack);
        // A subject with missing images keeps a different hash so it is retried.
        if (missing > before) s.hash = `${s.hash}-partial`;
      }
      writeJson(path.join(dir, 'manifest.json'), { version: remote.version, published_at: remote.published_at, subjects: remote.subjects, source: 'online', loaded_at: new Date().toISOString() });
      switchPack(dir);
      const q = remote.subjects.reduce((n, s) => n + s.count, 0);
      state.last_sync_result = { ok: true, message: `Updated ${changed.length} subject${changed.length === 1 ? '' : 's'} (${q} questions in total)${missing ? `; ${missing} images could not be downloaded and will be retried` : ''}.` };
      log(`synced from cloud: version ${remote.version}, ${changed.length} subjects changed`);
    }
    const apps = await syncApps(cloud);
    if (apps.length) state.last_sync_result = { ...state.last_sync_result, message: `${state.last_sync_result.message} New app: ${apps.join(', ')}.` };
    state.last_sync = new Date().toISOString();
    saveState();
    return state.last_sync_result;
  } catch (e) {
    state.last_sync = new Date().toISOString();
    state.last_sync_result = { ok: false, message: `Update stopped: ${e.message}` };
    saveState();
    log('sync failed', e.message);
    return state.last_sync_result;
  } finally { syncing = false; }
}

function imagePaths(pack) {
  const out = [];
  for (const q of pack.questions || []) {
    for (const p of [...(q.images || (q.image_url ? [q.image_url] : [])), ...(q.option_images || [])]) {
      if (typeof p === 'string' && p.startsWith('images/') && safeName(p.slice(7))) out.push(p);
    }
  }
  return out;
}

// ── Apps (APK): CAS Student for the tablets, CAS Teacher for teachers' phones ─

const APPS = {
  student: { pkg: 'com.cas.student', dir: 'app', name: 'CAS Student' },
  teacher: { pkg: 'com.cas.teacher', dir: 'app-teacher', name: 'CAS Teacher' },
};
for (const k of Object.keys(APPS)) fs.mkdirSync(path.join(DATA, APPS[k].dir), { recursive: true });
const appDir = (kind) => path.join(DATA, APPS[kind].dir);
// The loaded app, or null when its file is missing.
const appInfo = (kind = 'student') => {
  const a = readJson(path.join(appDir(kind), 'latest.json'));
  return a && a.file && fs.existsSync(path.join(appDir(kind), a.file)) ? a : null;
};

function removeOldApks(kind) {
  const keep = appInfo(kind)?.file;
  if (!keep) return;
  for (const n of fs.readdirSync(appDir(kind))) {
    if (n.endsWith('.apk') && n !== keep) fs.rm(path.join(appDir(kind), n), { force: true }, () => {});
  }
}

/** Loads a CAS Student or CAS Teacher APK; which one is read from the file. */
function loadApk(buf, { force = false, source = 'file' } = {}) {
  let v;
  try { v = apkVersion(buf); } catch (e) { throw new Error(/zip/i.test(e.message) ? 'This file is not an Android app (.apk).' : e.message); }
  const kind = Object.keys(APPS).find(k => APPS[k].pkg === v.package);
  if (!kind) throw new Error(`This is not the CAS Student or CAS Teacher app (${v.package || 'unknown app'}).`);
  if (!Number.isInteger(v.versionCode)) throw new Error('Could not read the app version.');
  const cur = appInfo(kind);
  if (cur && v.versionCode <= cur.versionCode && !force) {
    const e = new Error(v.versionCode === cur.versionCode
      ? `The server already has this ${APPS[kind].name} version (${cur.versionName}, build ${cur.versionCode}).`
      : `This ${APPS[kind].name} app (build ${v.versionCode}) is older than the one on the server (build ${cur.versionCode}).`);
    e.code = 'OLDER'; throw e;
  }
  const file = `cas-${kind}-${v.versionCode}-${Date.now()}.apk`;
  fs.writeFileSync(path.join(appDir(kind), file), buf);
  const info = {
    kind, versionCode: v.versionCode, versionName: v.versionName || '', size: buf.length, file, source,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), loaded_at: new Date().toISOString(),
  };
  writeJson(path.join(appDir(kind), 'latest.json'), info);
  // Older APKs go a little later, in case a device is still downloading one.
  // Keep whichever APK is current when the timer fires: another may have
  // been loaded since this one.
  setTimeout(() => removeOldApks(kind), 30 * 60 * 1000);
  log(`${APPS[kind].name} app loaded: ${info.versionName} (build ${info.versionCode}) from ${source}`);
  return info;
}

/** Copies newer app releases from CAS when there is internet. Never goes back. */
async function syncApps(cloud) {
  const out = [];
  for (const kind of Object.keys(APPS)) {
    try {
      const r = await fetchWithTimeout(`${cloud}/api/app-releases/${kind}/latest`, 30000);
      if (!r.ok) continue;
      const rel = await r.json();
      if (!rel || !Number.isInteger(rel.versionCode)) continue;
      const cur = appInfo(kind);
      if (cur && rel.versionCode <= cur.versionCode) continue;
      const d = await fetchWithTimeout(`${cloud}${rel.url}`, 20 * 60 * 1000);
      if (!d.ok) throw new Error(`HTTP ${d.status}`);
      const buf = Buffer.from(await d.arrayBuffer());
      if (buf.length !== rel.size || crypto.createHash('sha256').update(buf).digest('hex') !== rel.sha256) throw new Error('the download was incomplete');
      loadApk(buf, { source: 'online' });
      out.push(`${APPS[kind].name} ${rel.versionName || rel.versionCode}`);
    } catch (e) { log(`${APPS[kind].name} app update from CAS failed:`, e.message); }
  }
  return out;
}

// ── Learning materials (the LM folder) ───────────────────────────────────────
// Kept in data/lm with the same folders as the USB LM folder. Tablets read
// /lm/manifest and download changed files from /lm/file (resumable).

const LM_DIR = path.join(DATA, 'lm');
fs.mkdirSync(LM_DIR, { recursive: true });

/** Cleans a relative path ("Form 1/Maths/a.pdf"); null when it would leave LM. */
function lmRel(raw) {
  const parts = String(raw || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || p.length > 200) return null;
  }
  return parts.join('/');
}
const lmAbs = (rel) => path.join(LM_DIR, ...rel.split('/').filter(Boolean));
const isTempName = (n) => n.startsWith('.') || n.endsWith('.uploading');

let lmCache = null;           // { version, files, folders, total, at }
function lmScan() {
  if (lmCache && Date.now() - lmCache.at < 60 * 1000) return lmCache;
  const files = [];
  const folders = [];
  const walk = (dir, rel) => {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      if (isTempName(d.name)) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { folders.push(r); walk(path.join(dir, d.name), r); }
      else if (d.isFile()) {
        try { const st = fs.statSync(path.join(dir, d.name)); files.push({ path: r, size: st.size, mtime: Math.floor(st.mtimeMs) }); } catch { /* vanished */ }
      }
    }
  };
  walk(LM_DIR, '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  folders.sort();
  const version = crypto.createHash('sha1').update(files.map(f => `${f.path}|${f.size}|${f.mtime}`).concat(folders).join('\n')).digest('hex').slice(0, 16);
  lmCache = { version, files, folders, total: files.reduce((n, f) => n + f.size, 0), at: Date.now() };
  return lmCache;
}
const lmChanged = () => { lmCache = null; };

/** Streams one LM file, honouring a Range header so downloads can resume. */
function sendLmFile(req, res, rel) {
  const abs = lmAbs(rel);
  let st;
  try { st = fs.statSync(abs); } catch { return send(res, 404, { error: 'Not found' }); }
  if (!st.isFile()) return send(res, 404, { error: 'Not found' });
  const range = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
  const base = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': st.size });
  fs.createReadStream(abs).pipe(res);
}

/** Admin upload: the request body goes straight to disk (multi-GB safe). */
function receiveLmFile(req, res, rel) {
  if (!rel || rel.endsWith('/')) return send(res, 400, { error: 'Missing file name.' });
  const abs = lmAbs(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.uploading`;
  const out = fs.createWriteStream(tmp);
  let failed = false;
  const fail = (msg) => { if (failed) return; failed = true; out.destroy(); fs.rm(tmp, { force: true }, () => {}); send(res, 500, { error: msg }); };
  req.on('error', () => fail('The upload was interrupted.'));
  out.on('error', (e) => fail(/ENOSPC/.test(e.code) ? 'The server PC is out of disk space.' : 'Could not save the file.'));
  out.on('finish', () => {
    if (failed) return;
    try { fs.rmSync(abs, { force: true }); fs.renameSync(tmp, abs); }
    catch { return fail('Could not save the file.'); }
    lmChanged();
    send(res, 200, { ok: true, path: rel, size: fs.statSync(abs).size });
  });
  req.pipe(out);
}

function lmList(rel) {
  const abs = lmAbs(rel);
  const folders = [], files = [];
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (isTempName(d.name)) continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      const inside = lmScan().files.filter(f => f.path.startsWith(`${r}/`));
      folders.push({ name: d.name, path: r, files: inside.length, size: inside.reduce((n, f) => n + f.size, 0) });
    } else if (d.isFile()) {
      const st = fs.statSync(path.join(abs, d.name));
      files.push({ name: d.name, path: r, size: st.size, mtime: st.mtimeMs });
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  return { path: rel, folders: folders.sort(byName), files: files.sort(byName) };
}

// Copying a folder from this PC runs in the background; the page polls status.
const lmCopy = { running: false, from: null, copied: 0, total: 0, bytes: 0, current: null, error: null, finished_at: null };
async function copyIntoLm(from, toRel) {
  const src = path.resolve(String(from || '').trim().replace(/^"|"$/g, ''));
  let st;
  try { st = fs.statSync(src); } catch { throw new Error('That folder was not found on this PC.'); }
  if (!st.isDirectory()) throw new Error('That is a file, not a folder.');
  if (path.resolve(src).startsWith(path.resolve(LM_DIR))) throw new Error('That folder is already inside the learning materials.');
  if (lmCopy.running) throw new Error('A copy is already running.');
  const list = [];
  const dirs = [];   // empty folders are part of the school's LM layout too
  const walk = (dir, rel) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.') || /^(desktop\.ini|thumbs\.db)$/i.test(d.name) || /\.(crdownload|part|partial|tmp)$/i.test(d.name)) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { if (lmRel(r)) dirs.push(r); walk(path.join(dir, d.name), r); }
      else if (d.isFile() && lmRel(r)) list.push({ abs: path.join(dir, d.name), rel: r });
    }
  };
  walk(src, '');
  for (const r of dirs) fs.mkdirSync(lmAbs(toRel ? `${toRel}/${r}` : r), { recursive: true });
  Object.assign(lmCopy, { running: true, from: src, copied: 0, total: list.length, bytes: 0, current: null, error: null, finished_at: null });
  (async () => {
    try {
      for (const f of list) {
        const dest = lmAbs(toRel ? `${toRel}/${f.rel}` : f.rel);
        lmCopy.current = f.rel;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const s = fs.statSync(f.abs);
        let same = false;
        try { const d = fs.statSync(dest); same = d.size === s.size && Math.abs(d.mtimeMs - s.mtimeMs) < 2000; } catch { /* new file */ }
        if (!same) {
          await fs.promises.copyFile(f.abs, `${dest}.${process.pid}.uploading`);
          fs.rmSync(dest, { force: true });
          fs.renameSync(`${dest}.${process.pid}.uploading`, dest);
          fs.utimesSync(dest, s.atime, s.mtime);
        }
        lmCopy.copied += 1; lmCopy.bytes += s.size;
      }
      log(`learning materials copied from ${src}: ${list.length} files`);
    } catch (e) {
      lmCopy.error = /ENOSPC/.test(e.code) ? 'The server PC ran out of disk space.' : `The copy stopped: ${e.message}`;
      log('lm copy failed', e.message);
    } finally {
      lmCopy.running = false; lmCopy.current = null; lmCopy.finished_at = new Date().toISOString(); lmChanged();
    }
  })();
  return { total: list.length };
}

// ── Tablets seen ──────────────────────────────────────────────────────────────

const DEVICES_FILE = path.join(DATA, 'devices.json');
const devices = readJson(DEVICES_FILE, {});
let devicesDirty = false;
setInterval(() => { if (devicesDirty) { devicesDirty = false; try { writeJson(DEVICES_FILE, devices); } catch { /* retry next time */ } } }, 15000).unref();

function checkIn(req) {
  const id = String(req.headers['x-cas-device'] || '').slice(0, 64);
  if (!/^[A-Za-z0-9-]{6,64}$/.test(id)) return;
  // The device list is for student tablets; teachers' phones only fetch updates.
  if (String(req.headers['x-cas-app'] || '').toLowerCase() === 'teacher') return;
  devices[id] = {
    ip: clientIp(req),
    app_build: Number(req.headers['x-cas-app-build']) || null,
    app_version: String(req.headers['x-cas-app-version'] || '').slice(0, 20) || null,
    pack_version: req.headers['x-cas-pack-version'] ? Number(req.headers['x-cas-pack-version']) : null,
    last_seen: new Date().toISOString(),
  };
  devicesDirty = true;
}

// ── Offline LMS ───────────────────────────────────────────────────────────────

function pascoForTeachers(subject) {
  const m = packManifest();
  if (!m) return { subjects: [] };
  if (!subject) return { subjects: m.subjects.map(s => ({ name: s.name, slug: s.slug, count: s.count })) };
  const d = packDir();
  const pack = d && readJson(path.join(d, 'subjects', `${subject}.json`));
  if (!pack) return { subjects: [], questions: [] };
  const paperName = new Map((pack.papers || []).map(pp => [pp.id, [pp.exam, pp.year, pp.paper_label].filter(Boolean).join(' ')]));
  const packUrl = (x) => (typeof x === 'string' && x.startsWith('images/') ? `/pack/${x}` : null);
  return {
    subject: pack.subject,
    questions: (pack.questions || []).map(q => ({
      id: q.id, type: q.question_type === 'theory' ? 'short' : 'mcq', paper: paperName.get(q.paper_id) || '', no: q.question_no,
      // Pictures come along; the server copies them into the test when it is saved.
      text: String(q.question_text || '').replace(/\n{3,}/g, '\n\n').trim(), options: q.options || [],
      correct: q.correct, explanation: q.explanation, marking_scheme: q.marking_scheme,
      images: (Array.isArray(q.images) ? q.images : q.image_url ? [q.image_url] : []).map(packUrl),
      option_images: (q.option_images || []).map(packUrl),
      has_picture: !!((q.images && q.images.filter(Boolean).length) || q.image_url || (q.option_images || []).some(Boolean)),
    })),
  };
}

let lms = null;   // set in start()

// ── HTTP ──────────────────────────────────────────────────────────────────────

const cookie = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
};
const PAGE_STYLE = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.5 system-ui,sans-serif;background:#F4EFE6;color:#1C1208;margin:0;padding:32px 16px}main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #E2D9CC;border-radius:14px;padding:20px}@media (prefers-color-scheme:dark){body{background:#0E1A0C;color:#EEE8DF}main{background:#16241A;border-color:#2E4230}}</style>';
const ADMIN_LOGIN_PAGE = `<!doctype html><title>CAS School Server</title>${PAGE_STYLE}<main><h1 style="font-size:20px;margin:0 0 8px">CAS School Server</h1><p id="m">Opening the server settings…</p></main>
<script>
(async () => {
  const m = location.hash.match(/ticket=([A-Za-z0-9_.-]+)/);
  history.replaceState(null, '', '/admin-login');
  const say = (t) => { document.getElementById('m').textContent = t; };
  if (!m) return say('Open the school server from the CAS admin portal: LMS, School Server, Open school server.');
  try {
    const r = await fetch('/admin-login', { method: 'POST', body: JSON.stringify({ ticket: m[1] }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return location.replace('/');
    say(d.error || 'That link did not work. Open the school server again from the CAS admin portal.');
  } catch { say('The school server did not answer. Check you are on the school Wi-Fi.'); }
})();
</script>`;
const SIGNED_OUT_PAGE = `<!doctype html><title>CAS School Server</title>${PAGE_STYLE}<main><h1 style="font-size:20px;margin:0 0 8px">Signed out</h1><p>This browser can no longer change the school server's settings. Open it again from the CAS admin portal when needed.</p></main>`;

function clientIp(req) { return String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''); }
const isLocal = (req) => ['127.0.0.1', '::1'].includes(clientIp(req));

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  return out;
}

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('The file is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function info() {
  const m = packManifest();
  const short = (a) => (a ? { versionCode: a.versionCode, versionName: a.versionName, size: a.size, sha256: a.sha256 } : null);
  return {
    service: 'cas-school-server', version: VERSION, school_name: config().school_name || null,
    pack_version: m?.version ?? null, pack_published_at: m?.published_at ?? null,
    app: short(appInfo('student')), teacher_app: short(appInfo('teacher')),
    lm: (() => { const m = lmScan(); return { version: m.version, files: m.files.length, size: m.total }; })(),
  };
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

// Which of this PC's addresses tablets and teachers reach it on. CAS uses the
// busiest one when a teacher opens Offline Assessment from the online portal.
const addressHits = {};
function lanReport() {
  const skip = /virtual|vethernet|vmware|vbox|hyper-v|loopback|bluetooth|tailscale|zerotier|docker|wsl/i;
  return lanAddresses()
    .filter(a => !a.address.startsWith('169.254.') && !skip.test(a.name))
    .map(a => ({ address: a.address, hits: addressHits[a.address] || 0 }));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (!isLocal(req)) { const la = String(req.socket.localAddress || '').replace(/^::ffff:/, ''); if (la) addressHits[la] = (addressHits[la] || 0) + 1; }

  // Offline LMS (tablets and the teacher page).
  if (p.startsWith('/lms/') && lms) { if (await lms.handle(req, res, url)) return; }
  if (req.method === 'GET' && (p === '/teacher' || p === '/teacher/')) {
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'teacher.html'), 'utf8'));
  }

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', { 'Access-Control-Allow-Headers': 'X-CAS-Device, X-CAS-App-Build, X-CAS-App-Version, X-CAS-Pack-Version, Range', 'Access-Control-Allow-Methods': 'GET' });
  }

  // Tablets
  if (req.method === 'GET' && p === '/cas-school-server') { checkIn(req); return send(res, 200, info()); }

  if (req.method === 'GET' && p === '/pack/manifest') {
    const m = packManifest();
    return m ? send(res, 200, { version: m.version, published_at: m.published_at, subjects: m.subjects }) : send(res, 404, { error: 'No past questions on the server yet.' });
  }
  const subj = p.match(/^\/pack\/subjects\/([A-Za-z0-9-]+)$/);
  if (req.method === 'GET' && subj) {
    const d = packDir();
    const pack = d && readJson(path.join(d, 'subjects', `${subj[1]}.json`));
    if (!pack) return send(res, 404, { error: 'Subject not found' });
    // Relative image paths become full addresses on this server, so the app
    // downloads them the same way it does from the cloud.
    const host = `http://${req.headers.host || `localhost:${PORT}`}/pack/`;
    const abs = (x) => (typeof x === 'string' && x.startsWith('images/') ? host + x : x);
    for (const q of pack.questions || []) {
      if (Array.isArray(q.images)) q.images = q.images.map(abs);
      if (Array.isArray(q.option_images)) q.option_images = q.option_images.map(abs);
      q.image_url = abs(q.image_url);
      delete q.sources;
    }
    return send(res, 200, pack);
  }
  const img = p.match(/^\/pack\/images\/([A-Za-z0-9._-]+)$/);
  if (req.method === 'GET' && img && safeName(img[1])) {
    const d = packDir();
    const f = d && path.join(d, 'images', img[1]);
    if (!f || !fs.existsSync(f)) return send(res, 404, { error: 'Not found' });
    return send(res, 200, fs.readFileSync(f), { 'Content-Type': MIME[extOf(img[1])] || 'application/octet-stream', 'Cache-Control': 'max-age=86400' });
  }

  if (req.method === 'GET' && p === '/lm/manifest') {
    const m = lmScan();
    return send(res, 200, { version: m.version, total: m.total, files: m.files, folders: m.folders });
  }
  if (req.method === 'GET' && p === '/lm/file') {
    const rel = lmRel(url.searchParams.get('path'));
    if (!rel) return send(res, 400, { error: 'Bad path' });
    return sendLmFile(req, res, rel);
  }

  const apkRoute = p === '/app/latest.apk' ? 'student' : p === '/app/teacher/latest.apk' ? 'teacher' : null;
  if (req.method === 'GET' && apkRoute) {
    const a = appInfo(apkRoute);
    const f = a && path.join(appDir(apkRoute), a.file);
    if (!f || !fs.existsSync(f)) return send(res, 404, { error: 'No app on the server yet.' });
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': fs.statSync(f).size,
      'Content-Disposition': `attachment; filename="${APPS[apkRoute].name.replace(' ', '-')}-${a.versionName || a.versionCode}.apk"`,
      'Access-Control-Allow-Origin': '*',
    });
    return fs.createReadStream(f).pipe(res);
  }

  // Admin page and actions: this PC only.
  // The school admin signing in from another device on the Wi-Fi, with a pass
  // from CAS (admin portal: LMS › School Server › Open school server). The pass
  // travels in the address's #hash; this page sends it here and gets a cookie.
  if (p === '/admin-login') {
    if (req.method === 'GET') return send(res, 200, ADMIN_LOGIN_PAGE);
    if (req.method === 'POST' && lms) {
      const body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}');
      const r = lms.adminTicketLogin(body.ticket);
      if (r.error) return send(res, 401, { error: r.error });
      log(`admin page opened from ${clientIp(req)} with a CAS pass`);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `cas_admin=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${r.max_age}` });
    }
  }
  if (p === '/admin-logout') {
    if (lms) lms.adminSignOut(cookie(req, 'cas_admin'));
    return send(res, 200, SIGNED_OUT_PAGE, { 'Set-Cookie': 'cas_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (p === '/' || p.startsWith('/admin')) {
    if (!isLocal(req) && !(lms && lms.adminSessionOk(cookie(req, 'cas_admin')))) {
      return send(res, 403, p === '/'
        ? '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAS School Server</title><p style="font-family:sans-serif;padding:24px;max-width:560px;line-height:1.5">The CAS School Server is running. Its settings open on the server PC itself, at http://localhost:8787. From another laptop or phone on the school Wi-Fi, the school admin opens them from the CAS admin portal: LMS, School Server, Open school server.</p>'
        : { error: 'Open the school server from the CAS admin portal, or on the server PC.' });
    }
    if (req.method === 'GET' && p === '/') return send(res, 200, fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8'));
    if (req.method === 'GET' && p === '/admin/status') {
      const m = packManifest();
      return send(res, 200, {
        ...info(), port: PORT, lan: lanAddresses(), config: config(), remote: !isLocal(req), server_update: serverUpdateInfo(),
        pack: m ? { version: m.version, published_at: m.published_at, source: m.source, loaded_at: m.loaded_at, subjects: m.subjects } : null,
        app_info: appInfo('student'), teacher_app_info: appInfo('teacher'), sync: { ...state, running: syncing },
        lm_copy: lmCopy,
        cas: lms ? lms.status() : null,
        devices: Object.entries(devices).map(([id, d]) => ({ id, ...d })).sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen))),
      });
    }
    // Uploads stream straight to disk, so they skip the body reader below.
    if (req.method === 'PUT' && p === '/admin/lm/file') {
      const rel = lmRel(url.searchParams.get('path'));
      if (!rel) return send(res, 400, { error: 'That file name is not allowed.' });
      if (!rel.includes('/')) return send(res, 400, { error: 'Files cannot go at the top of LM. Use Add material to choose the class folder.' });
      return receiveLmFile(req, res, rel);
    }
    try {
      if (req.method === 'GET' && p === '/admin/lm/list') {
        const rel = lmRel(url.searchParams.get('path'));
        if (rel === null) return send(res, 400, { error: 'Bad path' });
        if (!fs.existsSync(lmAbs(rel))) return send(res, 404, { error: 'That folder no longer exists.' });
        return send(res, 200, lmList(rel));
      }
      if (req.method === 'POST' && p === '/admin/lm/folder') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        const rel = lmRel(body.path);
        if (!rel) return send(res, 400, { error: 'Folder names cannot contain < > : " | ? * or be empty.' });
        fs.mkdirSync(lmAbs(rel), { recursive: true });
        lmChanged();
        return send(res, 200, { ok: true, path: rel });
      }
      if (req.method === 'DELETE' && p === '/admin/lm') {
        const rel = lmRel(url.searchParams.get('path'));
        if (!rel) return send(res, 400, { error: 'Bad path' });
        fs.rmSync(lmAbs(rel), { recursive: true, force: true });
        lmChanged();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/admin/lm/layout') return send(res, 200, { ...lms.lmLayout(), notes: lms.allNotes() });
      if (req.method === 'POST' && p === '/admin/lm/layout') {
        const body = JSON.parse((await readBody(req, 512 * 1024)).toString('utf8') || '{}');
        return send(res, 200, lms.saveLmLayout(body));
      }
      if (req.method === 'POST' && p === '/admin/server-update/install') {
        const r = maybeInstallUpdate(true);
        return send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error || 'It could not be installed.' });
      }
      if (req.method === 'POST' && p === '/admin/lm/preview') {
        const body = JSON.parse((await readBody(req, 512 * 1024)).toString('utf8') || '{}');
        return send(res, 200, lms.previewNotes(body));
      }
      if (req.method === 'POST' && p === '/admin/lm/move') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        const from = lmRel(body.from); const toDir = lmRel(body.to_dir);
        if (!from || !toDir) return send(res, 400, { error: 'Choose a folder inside LM.' });
        const src = lmAbs(from);
        if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return send(res, 404, { error: 'That file no longer exists.' });
        const name = path.basename(src);
        const dest = lmAbs(`${toDir}/${name}`);
        if (fs.existsSync(dest)) return send(res, 409, { error: `${name} is already in that folder.` });
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(src, dest);
        lmChanged();
        return send(res, 200, { ok: true, path: `${toDir}/${name}` });
      }
      const nm = p.match(/^\/admin\/lm\/notes\/([a-f0-9-]+)$/);
      if (req.method === 'DELETE' && nm) return send(res, lms.adminRemoveNote(nm[1]) ? 200 : 404, { ok: true });
      if (req.method === 'POST' && p === '/admin/lm/copy') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        const to = body.to ? lmRel(body.to) : '';
        if (to === null) return send(res, 400, { error: 'Bad destination folder' });
        return send(res, 200, await copyIntoLm(body.from, to));
      }
      if (req.method === 'POST' && p === '/admin/cas/pair') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        return send(res, 200, { school: await lms.pair(body.school_code, body.code) });
      }
      if (req.method === 'POST' && p === '/admin/cas/disconnect') { lms.disconnect(); return send(res, 200, { ok: true }); }
      if (req.method === 'POST' && p === '/admin/cas/sync') return send(res, 200, (await lms.sync()) || { ok: false, message: 'Not connected to CAS.' });
      if (req.method === 'POST' && p === '/admin/sync') return send(res, 200, await syncFromCloud());
      if (req.method === 'POST' && p === '/admin/pack') {
        const body = await readBody(req, 500 * 1024 * 1024);
        return send(res, 200, loadPackZip(body, { force: url.searchParams.get('force') === '1' }));
      }
      if (req.method === 'POST' && p === '/admin/app') {
        const body = await readBody(req, 400 * 1024 * 1024);
        return send(res, 200, loadApk(body, { force: url.searchParams.get('force') === '1' }));
      }
      if (req.method === 'POST' && p === '/admin/config') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}');
        const next = { ...config() };
        if (typeof body.school_name === 'string') next.school_name = body.school_name.trim().slice(0, 120);
        if (typeof body.cloud_url === 'string' && /^https:\/\/[^\s]+$/.test(body.cloud_url.trim())) next.cloud_url = body.cloud_url.trim();
        writeJson(CONFIG_FILE, next);
        return send(res, 200, next);
      }
      if (req.method === 'POST' && p === '/admin/devices/clear') {
        for (const k of Object.keys(devices)) delete devices[k];
        devicesDirty = true;
        return send(res, 200, { ok: true });
      }
    } catch (e) {
      return send(res, e.code === 'OLDER' ? 409 : 400, { error: e.message, code: e.code || null });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

// ── Updating this server program from CAS ────────────────────────────────────
// A super admin publishes a server update in CAS (App Releases). At each sync
// the server asks for the latest version; a newer one is downloaded, checked
// (SHA-256) and kept in data/server-update until it can be installed: outside
// school hours (weekdays 07:00 to 16:00) and with no test underway, or at once
// when the admin clicks Install now. Installing backs up the current program,
// writes the new files and restarts; server.js (the launcher) goes back to the
// backup if the new version fails to start, and that version is not retried.
const UPDATE_STATE = path.join(DATA, 'update-state.json');
const UPDATE_DIR = path.join(DATA, 'server-update');
const BACKUPS = path.join(DATA, 'server-backups');
const PENDING = path.join(UPDATE_DIR, 'pending.json');
// Program files an update may write. Not run.bat, install files or node.exe.
const updatable = (rel) => typeof rel === 'string' && !rel.includes('..') && !rel.startsWith('/') && !rel.includes('\\')
  && (/^(app\.js|lms\.js|server\.js|admin\.html|teacher\.html|README\.txt)$/.test(rel) || /^(vendor|tools|docs)\/[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+)*$/.test(rel));
const verParts = (v) => String(v || '').split('.').map(n => parseInt(n, 10) || 0);
function newerThan(a, b) {
  const x = verParts(a), y = verParts(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
const readJsonFile = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
let pendingUpdate = readJsonFile(PENDING);   // { version, notes, sha256, file }
if (pendingUpdate && (!newerThan(pendingUpdate.version, VERSION) || !fs.existsSync(pendingUpdate.file || ''))) pendingUpdate = null;
let updateNote = null;                        // last outcome, shown on the admin page

function schoolHours(now = new Date()) {
  const d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
  return d >= 1 && d <= 5 && m >= 7 * 60 && m < 16 * 60;
}
function programFiles() {
  const out = [];
  for (const f of ['app.js', 'lms.js', 'server.js', 'admin.html', 'teacher.html', 'README.txt']) if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  const walk = (rel) => {
    let names = []; try { names = fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }); } catch { return; }
    for (const d of names) { const r = `${rel}/${d.name}`; if (d.isDirectory()) walk(r); else out.push(r); }
  };
  for (const dir of ['vendor', 'tools', 'docs']) walk(dir);
  return out;
}
// Called by the CAS sync with the latest release and a way to download it.
async function offerServerRelease(rel, download) {
  if (!rel || !rel.version || !newerThan(rel.version, VERSION)) { pendingUpdate = null; return; }
  const st = readJsonFile(UPDATE_STATE);
  if (st && st.status === 'rolled-back' && st.to === rel.version) return;   // that version failed here
  if (!pendingUpdate || pendingUpdate.version !== rel.version) {
    const buf = await download();
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== rel.sha256) throw new Error('The server update arrived damaged; it will be fetched again.');
    const bundle = JSON.parse(buf.toString('utf8'));
    if (bundle.version !== rel.version || !bundle.files || typeof bundle.files !== 'object') throw new Error('That server update is not valid.');
    for (const k of Object.keys(bundle.files)) if (!updatable(k)) throw new Error(`That server update has a file it may not write: ${k}`);
    fs.mkdirSync(UPDATE_DIR, { recursive: true });
    const file = path.join(UPDATE_DIR, `cas-school-server-${rel.version}.json`);
    fs.writeFileSync(file, buf);
    pendingUpdate = { version: rel.version, notes: rel.notes || '', sha256: sha, file };
    fs.writeFileSync(PENDING, JSON.stringify(pendingUpdate));
    log(`server update ${rel.version} downloaded; it installs outside school hours`);
  }
  maybeInstallUpdate(false);
}
function maybeInstallUpdate(now) {
  if (!pendingUpdate) return { ok: false, error: 'No update is waiting.' };
  if (!now) {
    if (schoolHours()) return { ok: false, waiting: 'school hours' };
    if (lms && lms.testsUnderway() > 0) return { ok: false, waiting: 'a test is underway' };
  }
  try { return installUpdate(); } catch (e) { updateNote = `The update could not be installed: ${e.message}`; log('server update failed', e.message); return { ok: false, error: updateNote }; }
}
function installUpdate() {
  const bundle = JSON.parse(fs.readFileSync(pendingUpdate.file, 'utf8'));
  const backup = path.join(BACKUPS, `${VERSION}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  for (const rel of programFiles()) {
    const to = path.join(backup, ...rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...rel.split('/')), to);
  }
  const launcherHere = (() => { try { return fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8').includes('CAS-LAUNCHER'); } catch { return false; } })();
  for (const [rel, b64] of Object.entries(bundle.files)) {
    if (rel === 'server.js' && launcherHere) continue;   // the launcher stays as it is
    const to = path.join(ROOT, ...rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(`${to}.updating`, Buffer.from(b64, 'base64'));
    fs.renameSync(`${to}.updating`, to);
  }
  fs.writeFileSync(UPDATE_STATE, JSON.stringify({ status: 'trial', from: VERSION, to: bundle.version, backup, attempts: 0, installed_at: new Date().toISOString() }, null, 2));
  try { fs.rmSync(PENDING, { force: true }); } catch { /* gone */ }
  // Keep the three newest backups.
  try {
    const all = fs.readdirSync(BACKUPS).map(n => ({ n, t: fs.statSync(path.join(BACKUPS, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const old of all.slice(3)) fs.rmSync(path.join(BACKUPS, old.n), { recursive: true, force: true });
  } catch { /* fine */ }
  log(`server update ${bundle.version} installed (was ${VERSION}); restarting`);
  setTimeout(() => process.exit(0), 1500);   // run.bat starts the new version
  return { ok: true, version: bundle.version };
}
// After a restart: a version that has run for 90 seconds is kept.
setTimeout(() => {
  const st = readJsonFile(UPDATE_STATE);
  if (st && st.status === 'trial' && st.to === VERSION) {
    st.status = 'ok'; st.ok_at = new Date().toISOString();
    try { fs.writeFileSync(UPDATE_STATE, JSON.stringify(st, null, 2)); } catch { /* fine */ }
    log(`server update ${VERSION} is running well`);
  }
}, 90 * 1000).unref();
// An update that arrived in school hours installs once they end.
setInterval(() => { if (pendingUpdate) maybeInstallUpdate(false); }, 10 * 60 * 1000).unref();
function serverUpdateInfo() {
  const st = readJsonFile(UPDATE_STATE);
  return {
    version: VERSION,
    pending: pendingUpdate ? { version: pendingUpdate.version, notes: pendingUpdate.notes } : null,
    school_hours: schoolHours(),
    last: st ? { status: st.status, from: st.from, to: st.to, at: st.rolled_back_at || st.ok_at || st.installed_at } : null,
    note: updateNote,
  };
}

function start() {
// A Past Questions picture file in the current pack, for copying into tests.
const packImagePath = (name) => {
  if (!safeName(name)) return null;
  const d = packDir(); const f = d && path.join(d, 'images', name);
  return f && fs.existsSync(f) ? f : null;
};


lms = require('./lms.js')({ DATA, log, send, readBody, config, pascoForTeachers, packImagePath, lanReport, port: PORT,
  lm: { abs: lmAbs, changed: lmChanged, folders: () => lmScan().folders }, version: VERSION, offerServerRelease });
lms.start();
const server = http.createServer((req, res) => {
  handle(req, res).catch(e => { log('request failed', req.url, e.message); try { send(res, 500, { error: 'Server error' }); } catch { /* already sent */ } });
});
server.requestTimeout = 0; // large uploads and APK downloads on slow Wi-Fi
server.listen(PORT, '0.0.0.0', () => {
  log(`CAS School Server ${VERSION} listening on port ${PORT}: ${lanAddresses().map(a => a.address).join(', ') || 'no network'}`);
});

setTimeout(syncFromCloud, 10 * 1000);
setInterval(syncFromCloud, SYNC_EVERY_MS);
}

// Run directly, or through the launcher (server.js), which run.bat starts.
if (require.main === module || (require.main && path.basename(require.main.filename) === 'server.js')) start();
module.exports = { readZip, apkVersion };
