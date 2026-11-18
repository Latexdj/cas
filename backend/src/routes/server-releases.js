'use strict';
/**
 * Versions of the CAS School Server program. A super admin publishes an
 * update file (built with school-server/tools/make-update.mjs); every school
 * server checks at its sync, downloads a newer version and installs it outside
 * school hours (see school-server/app.js).
 *
 * Super admin: GET    /api/server-releases
 *              POST   /api/server-releases          { bundle, notes }
 *              DELETE /api/server-releases/:id      (withdraw)
 * Servers:     routes/school-server.js (/server-release, /server-release/download)
 */
const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const supabase = require('../config/supabase');
const { authenticate, superAdminOnly } = require('../middleware/auth');

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';
const MAX = 20 * 1024 * 1024;
const updatable = (rel) => typeof rel === 'string' && !rel.includes('..') && !rel.startsWith('/') && !rel.includes('\\')
  && (/^(app\.js|lms\.js|server\.js|admin\.html|teacher\.html|README\.txt)$/.test(rel) || /^(vendor|tools|docs)\/[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+)*$/.test(rel));
const verParts = (v) => String(v || '').split('.').map(n => parseInt(n, 10) || 0);
const cmp = (a, b) => { const x = verParts(a), y = verParts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

const shape = (r) => ({ id: r.id, version: r.version, notes: r.notes, size: Number(r.size), sha256: r.sha256, status: r.status, published_at: r.published_at });

async function latest() {
  const { rows } = await pool.query(`SELECT * FROM server_releases WHERE status='live'`);
  return rows.sort((a, b) => cmp(b.version, a.version))[0] || null;
}

router.get('/', authenticate, superAdminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM server_releases ORDER BY published_at DESC LIMIT 30`);
    const { rows: servers } = await pool.query(
      `SELECT ss.name, ss.last_seen_at, ss.version, s.name AS school FROM school_servers ss JOIN schools s ON s.id = ss.school_id
        WHERE ss.revoked_at IS NULL ORDER BY s.name`);
    res.json({ releases: rows.map(shape), latest: (await latest())?.version || null, servers });
  } catch (e) { next(e); }
});

router.post('/', authenticate, superAdminOnly, async (req, res, next) => {
  try {
    const bundle = req.body?.bundle;
    if (!bundle || typeof bundle !== 'object' || !bundle.files || typeof bundle.files !== 'object') return res.status(400).json({ error: 'That is not a CAS School Server update file.' });
    if (!/^\d+\.\d+\.\d+$/.test(String(bundle.version || ''))) return res.status(400).json({ error: 'The update file has no version number.' });
    const names = Object.keys(bundle.files);
    const bad = names.find(n => !updatable(n) || typeof bundle.files[n] !== 'string');
    if (bad) return res.status(400).json({ error: `The update file has a file it may not contain: ${bad}` });
    if (!names.includes('app.js') || !names.includes('lms.js')) return res.status(400).json({ error: 'The update file is missing the server program (app.js, lms.js).' });
    const cur = await latest();
    if (cur && cmp(bundle.version, cur.version) <= 0) return res.status(409).json({ error: `Version ${bundle.version} is not newer than the published ${cur.version}.` });
    const buf = Buffer.from(JSON.stringify({ version: bundle.version, built_at: bundle.built_at || null, files: bundle.files }));
    if (buf.length > MAX) return res.status(413).json({ error: 'That update file is too large.' });
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const id = crypto.randomUUID();
    const storagePath = `server-releases/${bundle.version}-${id}.json`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, { contentType: 'application/json', upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { rows: [r] } = await pool.query(
      `INSERT INTO server_releases (id, version, notes, size, sha256, storage_path, status, published_by)
       VALUES ($1,$2,$3,$4,$5,$6,'live',$7) RETURNING *`,
      [id, bundle.version, String(req.body?.notes || '').slice(0, 1000) || null, buf.length, sha256, storagePath, req.user.id || null]);
    res.status(201).json(shape(r));
  } catch (e) { next(e); }
});

// Withdraw a version: servers stop being offered it (the one before becomes
// the latest again). Servers that already installed it keep it.
router.delete('/:id', authenticate, superAdminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(`UPDATE server_releases SET status='withdrawn' WHERE id=$1 AND status='live'`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = { router, latest };
