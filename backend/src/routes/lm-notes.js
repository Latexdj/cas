'use strict';
// Teacher notes for the student tablets. A teacher uploads a file for one of
// their subjects and classes; each school's CAS School Server downloads it at
// its next sync and puts it in the TEACHER NOTES folder of those classes'
// learning materials, which tablets copy over the school Wi-Fi.

const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../services/storage.service');

const MAX_BYTES = 25 * 1024 * 1024;
const EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|rtf|odt|odp|jpe?g|png|gif|webp|mp4|mp3|m4a)$/i;
const MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text', odp: 'application/vnd.oasis.opendocument.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4',
};
const safeName = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 150);

const teacherOnly = (req, res, next) => (req.user.role === 'teacher' ? next() : res.status(403).json({ error: 'For teachers only.' }));

// The subjects and classes this teacher teaches, from the timetable
// (merged classes come as "1A, 1B"); the same list the school server uses.
async function mySubjects(schoolId, teacherId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT subject, class_names FROM timetable
      WHERE school_id=$1 AND teacher_id=$2 AND subject IS NOT NULL AND subject <> ''`, [schoolId, teacherId]);
  const m = new Map();
  for (const r of rows) {
    const subj = r.subject.trim();
    if (!m.has(subj)) m.set(subj, new Set());
    for (const c of String(r.class_names || '').split(',').map(x => x.trim()).filter(Boolean)) m.get(subj).add(c);
  }
  const byNum = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  return [...m.entries()].sort(([a], [b]) => byNum(a, b)).map(([subject, set]) => ({ subject, classes: [...set].sort(byNum) }));
}

router.get('/mine', authenticate, teacherOnly, async (req, res, next) => {
  try {
    const [subjects, { rows: notes }] = await Promise.all([
      mySubjects(req.schoolId, req.user.id),
      pool.query(`SELECT id, subject, class_names, file_name, size, created_at FROM lm_teacher_notes
                   WHERE school_id=$1 AND teacher_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC`, [req.schoolId, req.user.id]),
    ]);
    res.json({ subjects, notes });
  } catch (err) { next(err); }
});

// Body: { subject, class_names: [..], file_name, data: "data:<mime>;base64,..." }
router.post('/', authenticate, teacherOnly, async (req, res, next) => {
  try {
    const { subject, class_names, file_name, data } = req.body || {};
    const name = safeName(file_name);
    if (!name || !EXT.test(name)) return res.status(400).json({ error: 'Use a PDF, Word, PowerPoint, Excel, picture, audio or video file.' });
    const mine = (await mySubjects(req.schoolId, req.user.id)).find(x => x.subject === subject);
    if (!mine) return res.status(400).json({ error: 'Choose one of your subjects.' });
    const classes = (Array.isArray(class_names) ? class_names : []).map(String).filter(c => mine.classes.includes(c));
    if (!classes.length) return res.status(400).json({ error: 'Tick at least one of your classes.' });
    const m = String(data || '').match(/^data:[^;]*;base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'The file did not arrive. Try again.' });
    const bytes = Math.floor(m[1].length * 3 / 4);
    if (bytes > MAX_BYTES) return res.status(413).json({ error: 'That file is too large (25 MB at most here; larger files can go in on the school server).' });

    const ext = name.split('.').pop().toLowerCase();
    const id = crypto.randomUUID();
    const storagePath = `lm-notes/${req.schoolId}/${id}.${ext}`;
    const url = await uploadFile(`data:${MIME[ext] || 'application/octet-stream'};base64,${m[1]}`, storagePath);
    const { rows: [row] } = await pool.query(
      `INSERT INTO lm_teacher_notes (id, school_id, teacher_id, subject, class_names, file_name, storage_path, url, size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, subject, class_names, file_name, size, created_at`,
      [id, req.schoolId, req.user.id, subject, classes.join(', '), name, storagePath, url, bytes]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, teacherOnly, async (req, res, next) => {
  try {
    const { rows: [n] } = await pool.query(
      `UPDATE lm_teacher_notes SET deleted_at=now() WHERE id=$1 AND school_id=$2 AND teacher_id=$3 AND deleted_at IS NULL
       RETURNING storage_path`, [req.params.id, req.schoolId, req.user.id]);
    if (!n) return res.status(404).json({ error: 'Not found' });
    // The school server removes it from the tablets at its next sync.
    deleteFile(n.storage_path).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router, mySubjects };
