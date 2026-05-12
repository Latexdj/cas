const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, code FROM subjects WHERE school_id = $1 ORDER BY name`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      `INSERT INTO subjects (school_id, name, code) VALUES ($1,$2,$3) RETURNING id, name, code`,
      [req.schoolId, name.trim(), code?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Subject already exists' });
    next(err);
  }
});

router.post('/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    // Skip header row if first cell looks like a label
    const firstCell = String(rows[0][0] || '').toLowerCase().trim();
    const hasHeader = firstCell.includes('name') || firstCell.includes('subject') || firstCell === 'code';
    const dataRows  = hasHeader ? rows.slice(1) : rows;

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row  = dataRows[i];
      const name = String(row[0] ?? '').trim();
      const code = String(row[1] ?? '').trim();
      const rowNum = i + (hasHeader ? 2 : 1);

      if (!name) { skipped++; continue; }

      try {
        const { rows: res } = await pool.query(
          `INSERT INTO subjects (school_id, name, code)
           VALUES ($1, $2, $3)
           ON CONFLICT (school_id, name)
           DO UPDATE SET code = EXCLUDED.code
           RETURNING (xmax = 0) AS is_new`,
          [req.schoolId, name, code || null]
        );
        if (res[0].is_new) inserted++;
        else updated++;
      } catch (err) {
        errors.push({ row: rowNum, message: err.message });
      }
    }

    res.json({ inserted, updated, skipped, errors });
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const { rows } = await pool.query(
      `UPDATE subjects
       SET name = COALESCE($1, name), code = COALESCE($2, code)
       WHERE id = $3 AND school_id = $4
       RETURNING id, name, code`,
      [name?.trim() || null, code?.trim() || null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subject not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Subject name already in use' });
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rows: inUse } = await pool.query(
      `SELECT id FROM timetable
       WHERE school_id = $1
         AND LOWER(subject) = (SELECT LOWER(name) FROM subjects WHERE id = $2 AND school_id = $1)
       LIMIT 1`,
      [req.schoolId, req.params.id]
    );
    if (inUse.length)
      return res.status(409).json({ error: 'Cannot delete — subject is used in the timetable' });

    const { rowCount } = await pool.query(
      `DELETE FROM subjects WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Subject not found' });
    res.json({ message: 'Subject deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
