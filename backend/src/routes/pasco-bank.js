'use strict';
// Past Questions bank (shared with every school, managed by the super admin).
//
//   pasco_papers           one row per source paper (exam, subject, year, paper)
//   lms_pasco_questions    its questions (also used by schools' own Pasco rows)
//   pasco_pack_state       a version number bumped whenever the published set
//                          changes, so offline tablets know to update
//
// The /pack routes are public: past questions are public exam material and the
// offline student app has no login.

const router  = require('express').Router();
const multer  = require('multer');
const crypto  = require('crypto');
const pool    = require('../config/db');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');
const { importPaper, PDF_MIME, DOCX_MIME, IMAGE_MIME } = require('../services/pasco-import.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });

const EXAMS   = ['WASSCE', 'BECE', 'NOVDEC', 'MOCK', 'OTHER'];
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subject';

function cleanText(v, max) {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
}

async function bumpPack(client = pool) {
  await client.query(`UPDATE pasco_pack_state SET version = version + 1, published_at = now() WHERE id`);
}

// Flattens a DB row into the shape every client uses.
function shapeQuestion(q) {
  const opts = Array.isArray(q.options) ? q.options : [];
  const ci = opts.findIndex(o => o?.is_correct === true);
  return {
    id: q.id, paper_id: q.paper_id, question_no: q.question_no, question_type: q.question_type,
    question_text: q.question_text, options: opts.map(o => o?.text ?? ''),
    correct: ci >= 0 ? LETTERS[ci] : null,
    explanation: q.explanation, marking_scheme: q.marking_scheme, image_url: q.image_url,
    topic: q.topic, difficulty: q.difficulty, year: q.year,
    answer_source: q.answer_source, needs_review: q.needs_review,
  };
}

// ── PUBLIC: offline pack ──────────────────────────────────────────────────────

const PUBLISHED_SQL = `
  FROM lms_pasco_questions q
  JOIN pasco_papers p ON p.id = q.paper_id
 WHERE p.school_id IS NULL AND p.status = 'published'`;

async function manifest() {
  const { rows: [st] } = await pool.query(`SELECT version, published_at FROM pasco_pack_state WHERE id`);
  const { rows } = await pool.query(`
    SELECT p.subject_name AS name, COUNT(*)::int AS count,
           md5(string_agg(q.id::text || q.updated_at::text || p.updated_at::text, ',' ORDER BY q.id)) AS hash
    ${PUBLISHED_SQL}
    GROUP BY p.subject_name ORDER BY p.subject_name`);
  return {
    version: st?.version ?? 0,
    published_at: st?.published_at ?? null,
    subjects: rows.map(r => ({ ...r, slug: slugify(r.name) })),
  };
}

async function subjectPack(slug) {
  const { rows: names } = await pool.query(`SELECT DISTINCT p.subject_name ${PUBLISHED_SQL}`);
  const name = names.map(r => r.subject_name).find(n => slugify(n) === slug);
  if (!name) return null;
  const { rows: papers } = await pool.query(`
    SELECT id, exam, year, paper_label FROM pasco_papers
     WHERE school_id IS NULL AND status = 'published' AND subject_name = $1
     ORDER BY year DESC NULLS LAST, paper_label`, [name]);
  const { rows: qs } = await pool.query(`
    SELECT q.*, p.year ${PUBLISHED_SQL} AND p.subject_name = $1
    ORDER BY p.year DESC NULLS LAST, p.paper_label, q.question_type, q.question_no NULLS LAST, q.created_at`, [name]);
  const questions = qs.map(q => {
    const s = shapeQuestion(q);
    delete s.answer_source; delete s.needs_review;
    return s;
  });
  const hash = crypto.createHash('md5').update(JSON.stringify(questions)).digest('hex');
  return { subject: name, slug, hash, papers, questions };
}

router.get('/pack/manifest', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.json(await manifest());
  } catch (err) { next(err); }
});

router.get('/pack/subjects/:slug', async (req, res, next) => {
  try {
    const pack = await subjectPack(req.params.slug);
    if (!pack) return res.status(404).json({ error: 'Subject not found' });
    const etag = `"${pack.hash}"`;
    res.set('ETag', etag);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(pack);
  } catch (err) { next(err); }
});

// ── SUPER ADMIN ───────────────────────────────────────────────────────────────

router.use(authenticate, superAdminOnly);

// Zip of the whole pack for tablets that never go online. Images are copied
// in and their URLs rewritten to relative paths.
router.get('/pack/zip', async (req, res, next) => {
  try {
    const archiver = require('archiver');
    const m = await manifest();
    const packs = [];
    for (const s of m.subjects) packs.push(await subjectPack(s.slug));

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="past-questions-v${m.version}.zip"`);
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.on('error', next);
    zip.pipe(res);

    const failed = [];
    for (const pack of packs) {
      if (!pack) continue;
      for (const q of pack.questions) {
        if (!q.image_url) continue;
        try {
          const r = await fetch(q.image_url);
          if (!r.ok) throw new Error(String(r.status));
          const ext = (q.image_url.split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png').toLowerCase();
          const rel = `images/${q.id}.${ext}`;
          zip.append(Buffer.from(await r.arrayBuffer()), { name: `Past Questions/${rel}` });
          q.image_url = rel;
        } catch { failed.push(q.id); q.image_url = null; }
      }
      zip.append(JSON.stringify(pack), { name: `Past Questions/subjects/${pack.slug}.json` });
    }
    // Same subject hashes as the online manifest, so a tablet loaded over USB
    // doesn't download everything again the first time it goes online.
    const have = new Set(packs.filter(Boolean).map(p => p.slug));
    zip.append(JSON.stringify({ ...m, subjects: m.subjects.filter(s => have.has(s.slug)), missing_images: failed }, null, 2),
      { name: 'Past Questions/manifest.json' });
    await zip.finalize();
  } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const m = await manifest();
    const { rows: [counts] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE status = 'published')::int AS published,
             COUNT(*) FILTER (WHERE status = 'draft')::int     AS drafts
        FROM pasco_papers WHERE school_id IS NULL`);
    res.json({ ...m, papers: counts });
  } catch (err) { next(err); }
});

router.get('/papers', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
             COUNT(q.id)::int AS question_count,
             COUNT(q.id) FILTER (WHERE q.needs_review)::int AS review_count,
             COUNT(q.id) FILTER (WHERE q.question_type = 'theory')::int AS theory_count
        FROM pasco_papers p
        LEFT JOIN lms_pasco_questions q ON q.paper_id = p.id
       WHERE p.school_id IS NULL
       GROUP BY p.id
       ORDER BY p.subject_name, p.year DESC NULLS LAST, p.paper_label`);
    res.json(rows);
  } catch (err) { next(err); }
});

function readPaper(body) {
  const exam = String(body.exam || '').toUpperCase();
  const subject_name = cleanText(body.subject_name, 120);
  const year = body.year === '' || body.year == null ? null : parseInt(body.year, 10);
  const paper_label = body.paper_label ? cleanText(body.paper_label, 60) : null;
  if (!EXAMS.includes(exam)) return { error: 'Choose the exam.' };
  if (!subject_name)         return { error: 'Subject is required.' };
  if (year != null && (!Number.isInteger(year) || year < 1960 || year > 2100)) return { error: 'Year must be a 4-digit year.' };
  return { value: { exam, subject_name, year, paper_label } };
}

router.post('/papers', async (req, res, next) => {
  try {
    const { error, value } = readPaper(req.body);
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(
      `INSERT INTO pasco_papers (exam, subject_name, year, paper_label) VALUES ($1,$2,$3,$4) RETURNING *`,
      [value.exam, value.subject_name, value.year, value.paper_label]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/papers/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM pasco_papers WHERE id = $1 AND school_id IS NULL`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Paper not found' });
    const { rows: qs } = await pool.query(`
      SELECT * FROM lms_pasco_questions WHERE paper_id = $1
       ORDER BY question_type, question_no NULLS LAST, created_at`, [req.params.id]);
    res.json({ ...rows[0], questions: qs.map(shapeQuestion) });
  } catch (err) { next(err); }
});

router.put('/papers/:id', async (req, res, next) => {
  try {
    const { error, value } = readPaper(req.body);
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(`
      UPDATE pasco_papers SET exam=$1, subject_name=$2, year=$3, paper_label=$4, updated_at=now()
       WHERE id=$5 AND school_id IS NULL RETURNING *`,
      [value.exam, value.subject_name, value.year, value.paper_label, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Paper not found' });
    // Keep the questions' own subject/year in step for the online Pasco filters.
    await pool.query(`UPDATE lms_pasco_questions SET subject_name=$1, year=$2, source=$3, updated_at=now() WHERE paper_id=$4`,
      [value.subject_name, value.year, [value.exam, value.paper_label].filter(Boolean).join(' '), req.params.id]);
    if (rows[0].status === 'published') await bumpPack();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/papers/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`DELETE FROM pasco_papers WHERE id=$1 AND school_id IS NULL RETURNING status`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Paper not found' });
    if (rows[0].status === 'published') await bumpPack();
    res.json({ message: 'Paper deleted' });
  } catch (err) { next(err); }
});

router.post('/papers/:id/publish', async (req, res, next) => {
  try {
    const publish = req.body?.publish !== false;
    const { rows: [p] } = await pool.query(`SELECT * FROM pasco_papers WHERE id=$1 AND school_id IS NULL`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paper not found' });
    if (publish) {
      const { rows: [c] } = await pool.query(`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE needs_review)::int AS review
          FROM lms_pasco_questions WHERE paper_id=$1`, [p.id]);
      if (c.total === 0) return res.status(400).json({ error: 'Add at least one question before publishing.' });
      if (c.review > 0)  return res.status(400).json({ error: `${c.review} question${c.review === 1 ? '' : 's'} still need checking.` });
    }
    const status = publish ? 'published' : 'draft';
    const { rows } = await pool.query(`UPDATE pasco_papers SET status=$1, updated_at=now() WHERE id=$2 RETURNING *`, [status, p.id]);
    if (status !== p.status) await bumpPack();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Upload the paper and read it with AI in the background. The page polls
// GET /papers/:id until import_status is done or failed.
router.post('/papers/:id/import', upload.array('files', 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Choose a file to import.' });
    for (const f of files) {
      const ok = f.mimetype === PDF_MIME || IMAGE_MIME.includes(f.mimetype) || f.mimetype === DOCX_MIME || /\.docx$/i.test(f.originalname);
      if (!ok) return res.status(400).json({ error: `${f.originalname} is not a PDF, Word (.docx) or image file.` });
    }
    const { rows: [p] } = await pool.query(`SELECT * FROM pasco_papers WHERE id=$1 AND school_id IS NULL`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paper not found' });
    if (p.import_status === 'running') return res.status(409).json({ error: 'This paper is already being read.' });

    // Keep the source so the reviewer can check questions against it.
    const stored = [];
    for (const [i, f] of files.entries()) {
      const safe = (f.originalname || `file-${i}`).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      try {
        const url = await uploadFile(`data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
          `pasco-papers/${p.id}/${Date.now()}-${i}-${safe}`);
        stored.push({ url, mime: f.mimetype, name: f.originalname });
      } catch (e) {
        console.error('[Past Questions] source upload failed:', e.message);
      }
    }
    await pool.query(`
      UPDATE pasco_papers SET import_status='running', import_note=NULL,
             source_files = source_files || $1::jsonb, updated_at=now() WHERE id=$2`,
      [JSON.stringify(stored), p.id]);
    res.status(202).json({ status: 'running' });

    (async () => {
      try {
        const { rows, note } = await importPaper(files, {
          exam: p.exam, subject: p.subject_name, year: p.year, paperLabel: p.paper_label });
        const source = [p.exam, p.paper_label].filter(Boolean).join(' ');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const r of rows) {
            await client.query(`
              INSERT INTO lms_pasco_questions
                (school_id, paper_id, subject_name, year, source, question_no, question_type, question_text,
                 options, explanation, marking_scheme, topic, difficulty, answer_source, needs_review)
              VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
              [p.id, p.subject_name, p.year, source, r.question_no, r.question_type, r.question_text,
               r.options ? JSON.stringify(r.options) : null, r.explanation, r.marking_scheme, r.topic,
               r.difficulty, r.answer_source, r.needs_review]);
          }
          const diagrams = rows.filter(r => r.has_diagram).length;
          const parts = [`Read ${rows.length} question${rows.length === 1 ? '' : 's'}.`];
          if (diagrams) parts.push(`${diagrams} need${diagrams === 1 ? 's' : ''} a diagram image.`);
          if (note) parts.push(note);
          await client.query(`UPDATE pasco_papers SET import_status=$1, import_note=$2, updated_at=now() WHERE id=$3`,
            [rows.length ? 'done' : 'failed', parts.join(' '), p.id]);
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      } catch (e) {
        console.error('[Past Questions] import failed:', e.message);
        await pool.query(`UPDATE pasco_papers SET import_status='failed', import_note=$1, updated_at=now() WHERE id=$2`,
          [`The import failed: ${e.message}`, p.id]).catch(() => {});
      }
    })();
  } catch (err) { next(err); }
});

// ── Questions ────────────────────────────────────────────────────────────────

// Validates a question body. options: string[]; correct: letter.
function readQuestion(body) {
  const question_type = body.question_type === 'theory' ? 'theory' : 'objective';
  const question_text = cleanText(body.question_text, 8000);
  if (!question_text) return { error: 'Question text is required.' };
  const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty) ? body.difficulty : 'medium';
  const out = {
    question_type, question_text, difficulty,
    question_no: body.question_no === '' || body.question_no == null ? null : parseInt(body.question_no, 10) || null,
    topic: body.topic ? cleanText(body.topic, 120) : null,
    explanation: question_type === 'objective' && body.explanation ? cleanText(body.explanation, 4000) : null,
    marking_scheme: question_type === 'theory' && body.marking_scheme ? cleanText(body.marking_scheme, 8000) : null,
    options: null,
  };
  if (question_type === 'objective') {
    const opts = (Array.isArray(body.options) ? body.options : []).map(o => String(o ?? '').trim());
    if (opts.length < 2 || opts.length > 5 || opts.some(o => !o)) return { error: 'An objective question needs 2 to 5 filled-in options.' };
    const ci = LETTERS.indexOf(String(body.correct || '').toLowerCase());
    if (ci < 0 || ci >= opts.length) return { error: 'Choose the correct option.' };
    out.options = opts.map((t, i) => ({ text: t, is_correct: i === ci }));
  }
  return { value: out };
}

async function paperOf(questionId) {
  const { rows } = await pool.query(`
    SELECT q.id, q.answer_source, q.options, p.id AS paper_id, p.status
      FROM lms_pasco_questions q JOIN pasco_papers p ON p.id = q.paper_id
     WHERE q.id = $1 AND p.school_id IS NULL`, [questionId]);
  return rows[0] || null;
}

router.post('/papers/:id/questions', async (req, res, next) => {
  try {
    const { rows: [p] } = await pool.query(`SELECT * FROM pasco_papers WHERE id=$1 AND school_id IS NULL`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paper not found' });
    const { error, value: v } = readQuestion(req.body);
    if (error) return res.status(400).json({ error });
    const { rows } = await pool.query(`
      INSERT INTO lms_pasco_questions
        (school_id, paper_id, subject_name, year, source, question_no, question_type, question_text,
         options, explanation, marking_scheme, topic, difficulty, answer_source, needs_review)
      VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,'reviewer',false) RETURNING *`,
      [p.id, p.subject_name, p.year, [p.exam, p.paper_label].filter(Boolean).join(' '), v.question_no, v.question_type,
       v.question_text, v.options ? JSON.stringify(v.options) : null, v.explanation, v.marking_scheme, v.topic, v.difficulty]);
    if (p.status === 'published') await bumpPack();
    res.status(201).json(shapeQuestion(rows[0]));
  } catch (err) { next(err); }
});

// Saving a question means the reviewer has checked it, unless they only
// saved with checked:false.
router.put('/questions/:id', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    const { error, value: v } = readQuestion(req.body);
    if (error) return res.status(400).json({ error });
    const checked = req.body.checked !== false;
    const { rows } = await pool.query(`
      UPDATE lms_pasco_questions SET question_no=$1, question_type=$2, question_text=$3, options=$4::jsonb,
             explanation=$5, marking_scheme=$6, topic=$7, difficulty=$8,
             answer_source = CASE WHEN $9 THEN 'reviewer' ELSE answer_source END,
             needs_review = CASE WHEN $9 THEN false ELSE needs_review END,
             updated_at=now()
       WHERE id=$10 RETURNING *`,
      [v.question_no, v.question_type, v.question_text, v.options ? JSON.stringify(v.options) : null,
       v.explanation, v.marking_scheme, v.topic, v.difficulty, checked, req.params.id]);
    if (cur.status === 'published') await bumpPack();
    res.json(shapeQuestion(rows[0]));
  } catch (err) { next(err); }
});

router.delete('/questions/:id', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    await pool.query(`DELETE FROM lms_pasco_questions WHERE id=$1`, [req.params.id]);
    if (cur.status === 'published') await bumpPack();
    res.json({ message: 'Question deleted' });
  } catch (err) { next(err); }
});

// Diagram image: { image: data URI } to set, { image: null } to remove.
router.post('/questions/:id/image', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    let url = null;
    if (req.body?.image) {
      const m = String(req.body.image).match(/^data:(image\/(png|jpeg|webp|gif));base64,/);
      if (!m) return res.status(400).json({ error: 'The image must be a PNG, JPG, WEBP or GIF.' });
      if (req.body.image.length > 4 * 1024 * 1024 * 1.37) return res.status(400).json({ error: 'The image must be under 4 MB.' });
      const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
      url = await uploadFile(req.body.image, `pasco-papers/${cur.paper_id}/q-${cur.id}-${Date.now()}.${ext}`);
    }
    const { rows } = await pool.query(
      `UPDATE lms_pasco_questions SET image_url=$1, updated_at=now() WHERE id=$2 RETURNING *`, [url, cur.id]);
    if (cur.status === 'published') await bumpPack();
    res.json(shapeQuestion(rows[0]));
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.slugify = slugify;
