const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const DAY_MAP = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};
for (let n = 1; n <= 7; n++) DAY_MAP[String(n)] = n;

/** Convert an Excel cell value to HH:MM string */
function parseTime(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    // Excel serial fraction of a day
    const totalMins = Math.round(val * 24 * 60);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (val instanceof Date) {
    const h = val.getUTCHours();
    const m = val.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  // HH:MM or H:MM (24h or 12h)
  const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (m) {
    let h = parseInt(m[1]);
    const min = m[2];
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT tt.id, tt.day_of_week, tt.start_time, tt.end_time, tt.subject, tt.class_names,
             te.id AS teacher_id, te.name AS teacher_name
      FROM timetable tt
      JOIN teachers te ON te.id = tt.teacher_id
      WHERE tt.school_id = $1
      ORDER BY tt.day_of_week, tt.start_time
    `, [req.schoolId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/today/:teacherId', async (req, res, next) => {
  try {
    const jsDay     = new Date().getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const { rows } = await pool.query(`
      SELECT id, day_of_week, start_time, end_time, subject, class_names,
             EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 AS duration_hours
      FROM timetable
      WHERE school_id = $1 AND teacher_id = $2 AND day_of_week = $3
      ORDER BY start_time
    `, [req.schoolId, req.params.teacherId, dayOfWeek]);

    res.json(rows.map(r => ({ ...r, periods: Math.round(parseFloat(r.duration_hours)) })));
  } catch (err) { next(err); }
});

router.get('/teacher/:teacherId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, day_of_week, start_time, end_time, subject, class_names
       FROM timetable WHERE school_id = $1 AND teacher_id = $2
       ORDER BY day_of_week, start_time`,
      [req.schoolId, req.params.teacherId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/upload', adminOnly, upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const replace = req.query.replace === 'true';

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    // Skip header row if detected
    const firstRow  = rows[0].map(c => String(c).toLowerCase().trim());
    const hasHeader = firstRow.some(c => ['teacher', 'day', 'subject', 'class', 'time'].some(k => c.includes(k)));
    const dataRows  = hasHeader ? rows.slice(1) : rows;

    // Load teachers for this school — detect duplicate names
    const { rows: teachers } = await pool.query(
      `SELECT id, LOWER(TRIM(name)) AS name_lower FROM teachers WHERE school_id = $1`,
      [req.schoolId]
    );
    // Build map: name → [id, id, ...] to catch duplicates
    const teacherIdsByName = new Map();
    for (const t of teachers) {
      if (!teacherIdsByName.has(t.name_lower)) teacherIdsByName.set(t.name_lower, []);
      teacherIdsByName.get(t.name_lower).push(t.id);
    }
    // Names with exactly one match are safe; duplicates will produce a row error
    const teacherMap     = new Map([...teacherIdsByName.entries()].filter(([, ids]) => ids.length === 1).map(([n, ids]) => [n, ids[0]]));
    const ambiguousNames = new Set([...teacherIdsByName.entries()].filter(([, ids]) => ids.length > 1).map(([n]) => n));

    // Parse and validate rows
    const valid  = [];
    const errors = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1);

      const teacherName = String(row[0] ?? '').trim();
      const dayRaw      = String(row[1] ?? '').trim();
      const startRaw    = row[2];
      const endRaw      = row[3];
      const subject     = String(row[4] ?? '').trim();
      const classNames  = String(row[5] ?? '').trim();

      // Skip blank rows
      if (!teacherName && !dayRaw && !subject) continue;

      const nameLower = teacherName.toLowerCase();
      if (ambiguousNames.has(nameLower)) {
        errors.push({ row: rowNum, message: `Teacher "${teacherName}" is ambiguous — multiple teachers share this name. Rename one in the Teachers page first.` });
        continue;
      }
      const teacherId = teacherMap.get(nameLower);
      if (!teacherId) {
        errors.push({ row: rowNum, message: `Teacher "${teacherName}" not found — check spelling matches the Teachers list` });
        continue;
      }

      const dayOfWeek = DAY_MAP[dayRaw.toLowerCase()];
      if (!dayOfWeek) {
        errors.push({ row: rowNum, message: `Invalid day "${dayRaw}" — use Monday/Tuesday… or 1–7` });
        continue;
      }

      const startTime = parseTime(startRaw);
      const endTime   = parseTime(endRaw);
      if (!startTime || !endTime) {
        errors.push({ row: rowNum, message: `Invalid time values — use HH:MM format (e.g. 08:00)` });
        continue;
      }

      if (!subject) { errors.push({ row: rowNum, message: 'Subject is required' }); continue; }
      if (!classNames) { errors.push({ row: rowNum, message: 'Classes are required' }); continue; }

      valid.push({ teacherId, dayOfWeek, startTime, endTime, subject, classNames });
    }

    if (valid.length === 0 && errors.length > 0) {
      return res.status(422).json({ inserted: 0, errors });
    }

    await client.query('BEGIN');

    if (replace) {
      await client.query('DELETE FROM timetable WHERE school_id = $1', [req.schoolId]);
    }

    // Auto-create subjects not yet in the subjects table
    const uniqueSubjects = [...new Set(valid.map(r => r.subject))];
    for (const name of uniqueSubjects) {
      await client.query(
        `INSERT INTO subjects (school_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.schoolId, name]
      );
    }

    // Auto-create classes not yet in the classes table
    const uniqueClasses = [...new Set(
      valid.flatMap(r => r.classNames.split(',').map(c => c.trim()).filter(Boolean))
    )];
    for (const name of uniqueClasses) {
      await client.query(
        `INSERT INTO classes (school_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.schoolId, name]
      );
    }

    // Bulk insert timetable entries
    for (const r of valid) {
      await client.query(
        `INSERT INTO timetable (school_id, teacher_id, day_of_week, start_time, end_time, subject, class_names)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.schoolId, r.teacherId, r.dayOfWeek, r.startTime, r.endTime, r.subject, r.classNames]
      );
    }

    await client.query('COMMIT');
    res.json({ inserted: valid.length, errors });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, teacher_id, subject, class_names } = req.body;
    if (!day_of_week || !start_time || !end_time || !teacher_id || !subject || !class_names) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO timetable (school_id, day_of_week, start_time, end_time, teacher_id, subject, class_names)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.schoolId, day_of_week, start_time, end_time, teacher_id, subject.trim(), class_names.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { day_of_week, start_time, end_time, teacher_id, subject, class_names } = req.body;
    const { rows } = await pool.query(
      `UPDATE timetable
       SET day_of_week = COALESCE($1, day_of_week),
           start_time  = COALESCE($2, start_time),
           end_time    = COALESCE($3, end_time),
           teacher_id  = COALESCE($4, teacher_id),
           subject     = COALESCE($5, subject),
           class_names = COALESCE($6, class_names),
           updated_at  = now()
       WHERE id = $7 AND school_id = $8 RETURNING *`,
      [day_of_week||null, start_time||null, end_time||null,
       teacher_id||null, subject||null, class_names||null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Timetable entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM timetable WHERE id = $1 AND school_id = $2`,
      [req.params.id, req.schoolId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Timetable entry not found' });
    res.json({ message: 'Timetable entry deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
