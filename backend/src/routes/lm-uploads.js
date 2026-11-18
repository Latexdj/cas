'use strict';
/**
 * Learning materials sent from CAS to the school's CAS School Server.
 *
 * The school admin, anywhere with internet, picks a folder of the server's LM
 * (the server reports its folders at each sync) and uploads files. A file
 * goes up in 8 MB parts (one request and one storage object each, as for app
 * releases). At its next sync the server downloads the parts, puts the file in
 * that folder, and reports it delivered; CAS then deletes its copy. Tablets
 * get it from the server over the school Wi-Fi.
 *
 * Admin:  GET    /api/lm-uploads                     { folders, server, uploads }
 *         POST   /api/lm-uploads                     { folder, file_name, size }
 *         PUT    /api/lm-uploads/:id/parts/:n         (raw bytes)
 *         POST   /api/lm-uploads/:id/finish
 *         DELETE /api/lm-uploads/:id
 * Server: see routes/school-server.js (/lm/uploads...).
 */
const router  = require('express').Router();
const express = require('express');
const pool    = require('../config/db');
const supabase = require('../config/supabase');
const { authenticate, adminOnly } = require('../middleware/auth');

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';
const PART = 8 * 1024 * 1024;
const MAX_SIZE = 2 * 1024 * 1024 * 1024;   // 2 GB
const partPath = (u, n) => `lm-uploads/${u.school_id}/${u.id}/part-${String(n).padStart(4, '0')}`;
const safePart = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
const cleanFolder = (f) => String(f || '').split('/').map(safePart).filter(Boolean).join('/');

const admin = [authenticate, adminOnly];

const view = (u) => ({
  id: u.id, folder: u.folder, file_name: u.file_name, size: Number(u.size), status: u.status, error: u.error,
  created_at: u.created_at, delivered_at: u.delivered_at, created_by_name: u.created_by_name,
});

router.get('/', admin, async (req, res, next) => {
  try {
    const [{ rows: [server] }, { rows: uploads }] = await Promise.all([
      pool.query(`SELECT name, last_seen_at, lm_folders FROM school_servers
                   WHERE school_id=$1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST LIMIT 1`, [req.schoolId]),
      pool.query(`SELECT * FROM lm_uploads WHERE school_id=$1 AND (status <> 'delivered' OR delivered_at > now() - interval '30 days')
                   ORDER BY created_at DESC LIMIT 200`, [req.schoolId]),
    ]);
    res.json({
      server: server ? { name: server.name, last_seen_at: server.last_seen_at } : null,
      folders: server?.lm_folders || [],
      uploads: uploads.map(view),
    });
  } catch (e) { next(e); }
});

router.post('/', admin, async (req, res, next) => {
  try {
    const folder = cleanFolder(req.body?.folder);
    const name = safePart(req.body?.file_name);
    const size = Number(req.body?.size);
    if (!folder) return res.status(400).json({ error: 'Choose a folder. Files cannot go at the top of LM.' });
    if (!name) return res.status(400).json({ error: 'The file has no name.' });
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'The file is empty.' });
    if (size > MAX_SIZE) return res.status(413).json({ error: 'That file is larger than 2 GB. Copy it onto the school server directly.' });
    const { rows: [srv] } = await pool.query(`SELECT 1 FROM school_servers WHERE school_id=$1 AND revoked_at IS NULL LIMIT 1`, [req.schoolId]);
    if (!srv) return res.status(400).json({ error: 'Connect a school server first.' });
    const parts = Math.ceil(size / PART);
    const { rows: [u] } = await pool.query(
      `INSERT INTO lm_uploads (school_id, folder, file_name, size, parts, status, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,'uploading',$6,$7) RETURNING *`,
      [req.schoolId, folder, name, size, parts, req.user.id || null, req.user.name || null]);
    res.status(201).json({ id: u.id, parts, part_size: PART });
  } catch (e) { next(e); }
});

router.put('/:id/parts/:n', admin, express.raw({ type: () => true, limit: PART + 1024 }), async (req, res, next) => {
  try {
    const { rows: [u] } = await pool.query(`SELECT * FROM lm_uploads WHERE id=$1 AND school_id=$2 AND status='uploading'`, [req.params.id, req.schoolId]);
    if (!u) return res.status(404).json({ error: 'This upload has ended. Start again.' });
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0 || n >= u.parts) return res.status(400).json({ error: 'Bad part number.' });
    const expected = n === u.parts - 1 ? Number(u.size) - PART * (u.parts - 1) : PART;
    if (!Buffer.isBuffer(req.body) || req.body.length !== expected) return res.status(400).json({ error: `Part ${n + 1} arrived incomplete. Try again.` });
    const { error } = await supabase.storage.from(BUCKET).upload(partPath(u, n), req.body, { contentType: 'application/octet-stream', upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function removeParts(u) {
  const paths = Array.from({ length: u.parts }, (_, n) => partPath(u, n));
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100)).catch(() => {});
}

router.post('/:id/finish', admin, async (req, res, next) => {
  try {
    const { rows: [u] } = await pool.query(`SELECT * FROM lm_uploads WHERE id=$1 AND school_id=$2 AND status='uploading'`, [req.params.id, req.schoolId]);
    if (!u) return res.status(404).json({ error: 'This upload has ended. Start again.' });
    // Every part must be there before the server is told to fetch it.
    const { data: listed, error } = await supabase.storage.from(BUCKET).list(`lm-uploads/${u.school_id}/${u.id}`, { limit: 10000 });
    if (error) throw new Error(`Storage check failed: ${error.message}`);
    const have = new Set((listed || []).map(x => x.name));
    for (let n = 0; n < u.parts; n++) if (!have.has(`part-${String(n).padStart(4, '0')}`)) return res.status(400).json({ error: `Part ${n + 1} is missing. Upload the file again.` });
    const { rows: [done] } = await pool.query(`UPDATE lm_uploads SET status='ready' WHERE id=$1 RETURNING *`, [u.id]);
    res.json(view(done));
  } catch (e) { next(e); }
});

// Cancel an upload, or take back one the server has not fetched yet.
router.delete('/:id', admin, async (req, res, next) => {
  try {
    const { rows: [u] } = await pool.query(
      `DELETE FROM lm_uploads WHERE id=$1 AND school_id=$2 AND status IN ('uploading','ready','failed') RETURNING *`, [req.params.id, req.schoolId]);
    if (!u) return res.status(400).json({ error: 'It is already on the school server. Delete it there (Learning materials).' });
    removeParts(u);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = { router, partPath, removeParts, view };
