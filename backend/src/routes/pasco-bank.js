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
const { parsePaperText } = require('../services/pasco-text-import.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });

const EXAMS   = ['WASSCE', 'BECE', 'NOVDEC', 'CTVET', 'MOCK', 'PRACTICE', 'OTHER'];
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'subject';

function cleanText(v, max) {
  const s = String(v ?? '').trim();
  return s && s.length <= max ? s : null;
}

async function bumpPack(client = pool) {
  await client.query(`UPDATE pasco_pack_state SET version = version + 1, published_at = now() WHERE id`);
}

// Question images: q.images is [{url}], shown where the text says
// [image 1], [image 2] ([image] = [image 1]); any image no marker places goes
// under the question. image_url mirrors the first image for older clients.
const MARKER = /\[image(?:\s+(\d+))?\]/gi;
const questionImages = (q) => {
  const list = Array.isArray(q.images) ? q.images.map(i => i?.url).filter(Boolean) : [];
  return list.length ? list : (q.image_url ? [q.image_url] : []);
};

// Flattens a DB row into the shape every client uses.
function shapeQuestion(q) {
  const opts = Array.isArray(q.options) ? q.options : [];
  const ci = opts.findIndex(o => o?.is_correct === true);
  const images = questionImages(q);
  return {
    id: q.id, paper_id: q.paper_id, question_no: q.question_no, question_type: q.question_type,
    question_text: q.question_text, options: opts.map(o => o?.text ?? ''),
    option_images: opts.map(o => o?.image_url ?? null),
    correct: ci >= 0 ? LETTERS[ci] : null,
    explanation: q.explanation, marking_scheme: q.marking_scheme,
    images, image_url: images[0] ?? null,
    topic: q.topic, difficulty: q.difficulty, year: q.year,
    answer_source: q.answer_source, needs_review: q.needs_review, has_diagram: q.has_diagram,
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
      const grab = async (url, name) => {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(String(r.status));
          const ext = (url.split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png').toLowerCase();
          const rel = `images/${name}.${ext}`;
          zip.append(Buffer.from(await r.arrayBuffer()), { name: `Past Questions/${rel}` });
          return rel;
        } catch { failed.push(name); return null; }
      };
      for (const q of pack.questions) {
        const imgs = [];
        for (const [n, url] of q.images.entries()) imgs.push(await grab(url, `${q.id}-${n + 1}`));
        q.images = imgs;
        q.image_url = imgs[0] ?? null;
        for (const [k, url] of q.option_images.entries()) if (url) q.option_images[k] = await grab(url, `${q.id}-o${k + 1}`);
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
                 options, explanation, marking_scheme, topic, difficulty, answer_source, needs_review, has_diagram)
              VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)`,
              [p.id, p.subject_name, p.year, source, r.question_no, r.question_type, r.question_text,
               r.options ? JSON.stringify(r.options) : null, r.explanation, r.marking_scheme, r.topic,
               r.difficulty, r.answer_source, r.needs_review, r.has_diagram]);
          }
          const diagrams = rows.filter(r => r.has_diagram).length;
          const parts = rows.length ? [`Read ${rows.length} question${rows.length === 1 ? '' : 's'}.`] : [];
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

// ── Without AI: pasted text and spreadsheet rows ─────────────────────────────

async function insertRows(paper, rows) {
  const source = [paper.exam, paper.paper_label].filter(Boolean).join(' ');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`
        INSERT INTO lms_pasco_questions
          (school_id, paper_id, subject_name, year, source, question_no, question_type, question_text,
           options, explanation, marking_scheme, topic, difficulty, answer_source, needs_review, has_diagram)
        VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)`,
        [paper.id, paper.subject_name, paper.year, source, r.question_no, r.question_type, r.question_text,
         r.options ? JSON.stringify(r.options) : null, r.explanation, r.marking_scheme, r.topic,
         r.difficulty, r.answer_source, r.needs_review, !!r.has_diagram]);
    }
    await client.query(`UPDATE pasco_papers SET updated_at=now() WHERE id=$1`, [paper.id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
  if (paper.status === 'published' && rows.length) await bumpPack();
}

async function sharedPaper(id) {
  const { rows } = await pool.query(`SELECT * FROM pasco_papers WHERE id=$1 AND school_id IS NULL`, [id]);
  return rows[0] || null;
}

// Typed paper text in the usual numbered layout. No AI.
router.post('/papers/:id/import-text', async (req, res, next) => {
  try {
    const paper = await sharedPaper(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const text = String(req.body?.text || '');
    if (!text.trim()) return res.status(400).json({ error: 'Paste the text of the paper first.' });
    if (text.length > 500000) return res.status(400).json({ error: 'That is too much text for one paper.' });
    const { rows, problems } = parsePaperText(text);
    if (!rows.length) {
      return res.status(400).json({ error: 'No numbered questions were found. Each question should start with its number, such as "1." or "1)", with options on lines starting "A.", "B." and so on.' });
    }
    await insertRows(paper, rows);
    const toCheck = rows.filter(r => r.needs_review).length;
    res.json({ added: rows.length, to_check: toCheck, problems });
  } catch (err) { next(err); }
});

// Rows from the Excel template (read in the browser). No AI.
// Each row: { row, question_no, question_type, question_text, options[], answer,
//             explanation, marking_scheme, topic, difficulty }
router.post('/papers/:id/import-rows', async (req, res, next) => {
  try {
    const paper = await sharedPaper(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const input = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!input.length) return res.status(400).json({ error: 'The spreadsheet has no question rows.' });
    if (input.length > 1000) return res.status(400).json({ error: 'A paper can have up to 1000 rows.' });
    const rows = [];
    const problems = [];
    for (const r of input) {
      const at = `Row ${r.row ?? '?'}`;
      const type = String(r.question_type || '').toLowerCase().startsWith('t') ? 'theory' : 'objective';
      const text = cleanText(r.question_text, 8000);
      if (!text) { problems.push(`${at}: no question text, skipped.`); continue; }
      const difficulty = ['easy', 'medium', 'hard'].includes(String(r.difficulty || '').toLowerCase()) ? String(r.difficulty).toLowerCase() : 'medium';
      const base = {
        question_no: parseInt(r.question_no, 10) || null, question_type: type, question_text: text,
        topic: r.topic ? cleanText(r.topic, 120) : null, difficulty, has_diagram: false,
      };
      if (type === 'theory') {
        const scheme = r.marking_scheme ? cleanText(r.marking_scheme, 8000) : null;
        rows.push({ ...base, options: null, explanation: null, marking_scheme: scheme,
          answer_source: scheme ? 'paper' : null, needs_review: !scheme });
        if (!scheme) problems.push(`${at}: theory question without a marking scheme, marked to check.`);
        continue;
      }
      const opts = (Array.isArray(r.options) ? r.options : []).map(o => String(o ?? '').trim());
      while (opts.length && !opts[opts.length - 1]) opts.pop();   // empty E (or D) columns
      if (opts.length < 2) { problems.push(`${at}: fewer than two options, skipped.`); continue; }
      if (opts.length > 5) { problems.push(`${at}: more than five options, skipped.`); continue; }
      const idx = LETTERS.indexOf(String(r.answer || '').trim().toLowerCase().replace(/[^a-e]/g, '').slice(0, 1));
      const ok = idx >= 0 && idx < opts.length && !opts.some(o => !o);
      if (!ok) problems.push(`${at}: ${idx < 0 ? 'no answer letter' : opts.some(o => !o) ? 'an empty option' : 'answer letter has no option'}, marked to check.`);
      rows.push({ ...base,
        options: opts.map((t, i) => ({ text: t, is_correct: ok && i === idx })),
        explanation: r.explanation ? cleanText(r.explanation, 4000) : null, marking_scheme: null,
        answer_source: ok ? 'paper' : null, needs_review: !ok });
    }
    if (!rows.length) return res.status(400).json({ error: 'No row could be used.', problems });
    await insertRows(paper, rows);
    res.json({ added: rows.length, to_check: rows.filter(r => r.needs_review).length, problems });
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
    const pics = (Array.isArray(body.option_images) ? body.option_images : [])
      .map(u => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : null));
    if (opts.length < 2 || opts.length > 5) return { error: 'An objective question needs 2 to 5 options.' };
    const blank = opts.findIndex((o, i) => !o && !pics[i]);
    if (blank >= 0) return { error: `Option ${LETTERS[blank].toUpperCase()} needs text or a picture.` };
    const ci = LETTERS.indexOf(String(body.correct || '').toLowerCase());
    if (ci < 0 || ci >= opts.length) return { error: 'Choose the correct option.' };
    out.options = opts.map((t, i) => ({ text: t, is_correct: i === ci, ...(pics[i] ? { image_url: pics[i] } : {}) }));
  }
  return { value: out };
}

async function paperOf(questionId) {
  const { rows } = await pool.query(`
    SELECT q.id, q.answer_source, q.options, q.images, q.image_url, q.question_text, q.marking_scheme, p.id AS paper_id, p.status
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

async function storeImage(dataUri, paperId, name) {
  const m = String(dataUri || '').match(/^data:(image\/(png|jpeg|webp|gif));base64,/);
  if (!m) return { error: 'The image must be a PNG, JPG, WEBP or GIF.' };
  if (dataUri.length > 4 * 1024 * 1024 * 1.37) return { error: 'The image must be under 4 MB.' };
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  return { url: await uploadFile(dataUri, `pasco-papers/${paperId}/${name}-${Date.now()}.${ext}`) };
}

// Renumbers [image N] markers after image `removed` (1-based) is deleted:
// its own markers go, later ones move down by one.
function renumber(text, removed) {
  if (!text) return text;
  return text.replace(MARKER, (_, n) => {
    const k = n ? parseInt(n, 10) : 1;
    if (k === removed) return '';
    return k > removed ? `[image ${k - 1}]` : `[image ${k}]`;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

async function saveImages(cur, images, extra = {}) {
  const { rows } = await pool.query(`
    UPDATE lms_pasco_questions SET images=$1::jsonb, image_url=$2,
           question_text=COALESCE($3, question_text), marking_scheme=$4, updated_at=now()
     WHERE id=$5 RETURNING *`,
    [JSON.stringify(images.map(u => ({ url: u }))), images[0] ?? null, extra.question_text ?? null,
     extra.marking_scheme !== undefined ? extra.marking_scheme : cur.marking_scheme, cur.id]);
  if (cur.status === 'published') await bumpPack();
  return shapeQuestion(rows[0]);
}

// Add a question image: { image: data URI }; { replace: N } swaps image N.
// A new image becomes number images.length; the editor puts its marker in.
router.post('/questions/:id/images', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    const images = questionImages(cur);
    const replace = req.body?.replace ? parseInt(req.body.replace, 10) : null;
    if (replace && (replace < 1 || replace > images.length)) return res.status(400).json({ error: 'No such image.' });
    if (!replace && images.length >= 6) return res.status(400).json({ error: 'A question can have up to 6 images.' });
    const { url, error } = await storeImage(req.body?.image, cur.paper_id, `q-${cur.id}`);
    if (error) return res.status(400).json({ error });
    if (replace) images[replace - 1] = url; else images.push(url);
    res.json(await saveImages(cur, images));
  } catch (err) { next(err); }
});

// Remove question image N; markers in the text are renumbered to match.
router.delete('/questions/:id/images/:n', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    const images = questionImages(cur);
    const n = parseInt(req.params.n, 10);
    if (!(n >= 1 && n <= images.length)) return res.status(404).json({ error: 'No such image.' });
    images.splice(n - 1, 1);
    res.json(await saveImages(cur, images, {
      question_text: renumber(cur.question_text, n),
      marking_scheme: renumber(cur.marking_scheme, n),
    }));
  } catch (err) { next(err); }
});

// Picture for option K (1-based): { image: data URI } to set, { image: null } to remove.
router.post('/questions/:id/options/:k/image', async (req, res, next) => {
  try {
    const cur = await paperOf(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Question not found' });
    const opts = Array.isArray(cur.options) ? cur.options : [];
    const k = parseInt(req.params.k, 10);
    if (!(k >= 1 && k <= opts.length)) return res.status(404).json({ error: 'Save the options first, then add pictures to them.' });
    let url = null;
    if (req.body?.image) {
      const r = await storeImage(req.body.image, cur.paper_id, `q-${cur.id}-o${k}`);
      if (r.error) return res.status(400).json({ error: r.error });
      url = r.url;
    } else if (!String(opts[k - 1]?.text || '').trim()) {
      return res.status(400).json({ error: `Option ${LETTERS[k - 1].toUpperCase()} has no text, so it needs its picture. Type some text for it first.` });
    }
    const updated = opts.map((o, i) => {
      if (i !== k - 1) return o;
      const rest = { ...o }; delete rest.image_url;
      return url ? { ...rest, image_url: url } : rest;
    });
    const { rows } = await pool.query(
      `UPDATE lms_pasco_questions SET options=$1::jsonb, updated_at=now() WHERE id=$2 RETURNING *`,
      [JSON.stringify(updated), cur.id]);
    if (cur.status === 'published') await bumpPack();
    res.json(shapeQuestion(rows[0]));
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.slugify = slugify;
