'use strict';
/**
 * App releases: the latest CAS Teacher and CAS Student APKs, for updating
 * phones over the internet and for CAS School Servers to copy to the school
 * Wi-Fi.
 *
 * An APK (~90 MB) is bigger than one storage object may be and than one
 * request should carry, so the super admin uploads it in 8 MB parts. Each
 * part is its own storage object; the download route streams them back as
 * one file.
 *
 * Public:      GET /api/app-releases/:app/latest
 *              GET /api/app-releases/:app/download/:id
 * Super admin: GET  /api/app-releases
 *              POST /api/app-releases/:app/uploads          { size, sha256 }
 *              PUT  /api/app-releases/uploads/:id/parts/:n  (raw bytes)
 *              POST /api/app-releases/uploads/:id/finish
 *              DELETE /api/app-releases/uploads/:id
 */
const router  = require('express').Router();
const express = require('express');
const crypto  = require('crypto');
const pool    = require('../config/db');
const supabase = require('../config/supabase');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { apkVersion } = require('../services/apk.service');

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';
const PART = 8 * 1024 * 1024;
const MAX_SIZE = 300 * 1024 * 1024;
const APPS = { teacher: 'com.cas.teacher', student: 'com.cas.student' };
const LABEL = { teacher: 'CAS Teacher', student: 'CAS Student' };

const appParam = (req, res) => {
  const a = req.params.app;
  if (!APPS[a]) { res.status(404).json({ error: 'Unknown app' }); return null; }
  return a;
};
const partPath = (r, n) => `${r.storage_prefix}/part-${String(n).padStart(3, '0')}`;
const shape = (r) => r && ({
  id: r.id, app: r.app, versionCode: r.version_code, versionName: r.version_name, size: Number(r.size),
  sha256: r.sha256, notes: r.notes, published_at: r.published_at,
  url: `/api/app-releases/${r.app}/download/${r.id}`,
});

async function current(app) {
  const { rows } = await pool.query(
    `SELECT * FROM app_releases WHERE app = $1 AND status = 'live' ORDER BY version_code DESC LIMIT 1`, [app]);
  return rows[0] || null;
}

// ── Public ───────────────────────────────────────────────────────────────────

router.get('/:app/latest', async (req, res, next) => {
  try {
    const app = appParam(req, res); if (!app) return;
    res.set('Cache-Control', 'no-store');
    res.json(shape(await current(app)));
  } catch (e) { next(e); }
});

router.get('/:app/download/:id', async (req, res, next) => {
  try {
    const app = appParam(req, res); if (!app) return;
    const { rows } = await pool.query(`SELECT * FROM app_releases WHERE id = $1 AND app = $2 AND status = 'live'`, [req.params.id, app]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'That release is no longer available.' });
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(r.size),
      'Content-Disposition': `attachment; filename="${LABEL[app].replace(' ', '-')}-${r.version_name || r.version_code}.apk"`,
    });
    for (let n = 0; n < r.parts; n++) {
      const { data, error } = await supabase.storage.from(BUCKET).download(partPath(r, n));
      if (error || !data) throw new Error(`Missing part ${n} of release ${r.id}`);
      const buf = Buffer.from(await data.arrayBuffer());
      if (!res.write(buf)) await new Promise(ok => res.once('drain', ok));
      if (res.destroyed) return;
    }
    res.end();
  } catch (e) {
    if (res.headersSent) { console.error('[app-releases] download failed:', e.message); res.destroy(); }
    else next(e);
  }
});

// ── Super admin ──────────────────────────────────────────────────────────────

router.use(authenticate, superAdminOnly);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM app_releases WHERE status IN ('live', 'replaced') ORDER BY app, version_code DESC`);
    const out = {};
    for (const app of Object.keys(APPS)) {
      const list = rows.filter(r => r.app === app);
      out[app] = { current: shape(list.find(r => r.status === 'live')), history: list.filter(r => r.status === 'replaced').slice(0, 5).map(shape) };
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/:app/uploads', async (req, res, next) => {
  try {
    const app = appParam(req, res); if (!app) return;
    const size = Number(req.body?.size);
    const sha = String(req.body?.sha256 || '').toLowerCase();
    if (!Number.isInteger(size) || size < 1024 || size > MAX_SIZE) return res.status(400).json({ error: 'That file is not the right size for an app.' });
    if (!/^[0-9a-f]{64}$/.test(sha)) return res.status(400).json({ error: 'Missing file checksum.' });
    const parts = Math.ceil(size / PART);
    const prefix = `app-releases/${app}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const { rows } = await pool.query(
      `INSERT INTO app_releases (app, status, size, sha256, parts, storage_prefix, notes, uploaded_by)
       VALUES ($1, 'uploading', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [app, size, sha, parts, prefix, typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : null, req.user.id]);
    res.json({ id: rows[0].id, part_size: PART, parts });
  } catch (e) { next(e); }
});

router.put('/uploads/:id/parts/:n', express.raw({ type: () => true, limit: PART + 1024 }), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM app_releases WHERE id = $1 AND status = 'uploading'`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'This upload has ended. Start again.' });
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0 || n >= r.parts) return res.status(400).json({ error: 'Bad part number.' });
    const expected = n === r.parts - 1 ? Number(r.size) - PART * (r.parts - 1) : PART;
    if (!Buffer.isBuffer(req.body) || req.body.length !== expected) return res.status(400).json({ error: `Part ${n + 1} arrived incomplete. Try again.` });
    const { error } = await supabase.storage.from(BUCKET).upload(partPath(r, n), req.body, { contentType: 'application/octet-stream', upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function removeParts(r) {
  const paths = Array.from({ length: r.parts }, (_, n) => partPath(r, n));
  await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}

router.post('/uploads/:id/finish', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM app_releases WHERE id = $1 AND status = 'uploading'`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'This upload has ended. Start again.' });
    // Read the whole file back once: checks every part arrived intact and
    // reads the app's real package and version from it.
    const chunks = [];
    for (let n = 0; n < r.parts; n++) {
      const { data, error } = await supabase.storage.from(BUCKET).download(partPath(r, n));
      if (error || !data) return res.status(400).json({ error: `Part ${n + 1} is missing. Upload the file again.` });
      chunks.push(Buffer.from(await data.arrayBuffer()));
    }
    const buf = Buffer.concat(chunks);
    const fail = async (msg) => {
      await pool.query(`UPDATE app_releases SET status = 'failed' WHERE id = $1`, [r.id]);
      await removeParts(r);
      return res.status(400).json({ error: msg });
    };
    if (buf.length !== Number(r.size) || crypto.createHash('sha256').update(buf).digest('hex') !== r.sha256) {
      return fail('The file did not arrive intact. Upload it again.');
    }
    let v;
    try { v = apkVersion(buf); } catch { return fail('This file is not an Android app (.apk).'); }
    if (v.package !== APPS[r.app]) return fail(`This is not the ${LABEL[r.app]} app (it is ${v.package || 'another app'}).`);
    if (!Number.isInteger(v.versionCode)) return fail('Could not read the app version.');
    const cur = await current(r.app);
    if (cur && v.versionCode <= cur.version_code) {
      return fail(v.versionCode === cur.version_code
        ? `Build ${cur.version_code} is already live. Raise the versionCode before building a new app.`
        : `This app (build ${v.versionCode}) is older than the live one (build ${cur.version_code}).`);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE app_releases SET status = 'replaced' WHERE app = $1 AND status = 'live'`, [r.app]);
      const { rows: done } = await client.query(
        `UPDATE app_releases SET status = 'live', version_code = $2, version_name = $3, published_at = now() WHERE id = $1 RETURNING *`,
        [r.id, v.versionCode, v.versionName || null]);
      await client.query('COMMIT');
      res.json(shape(done[0]));
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    // Keep the two releases before this one (to roll back); clear older parts.
    const { rows: old } = await pool.query(
      `SELECT * FROM app_releases WHERE app = $1 AND status = 'replaced' ORDER BY version_code DESC OFFSET 2`, [r.app]);
    for (const o of old) { await removeParts(o); await pool.query(`UPDATE app_releases SET status = 'removed' WHERE id = $1`, [o.id]); }
  } catch (e) { next(e); }
});

router.delete('/uploads/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`UPDATE app_releases SET status = 'failed' WHERE id = $1 AND status = 'uploading' RETURNING *`, [req.params.id]);
    if (rows[0]) await removeParts(rows[0]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
