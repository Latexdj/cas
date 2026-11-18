// Storybooks added in Super Admin, alongside the African Storybook stories
// built into the student app. Each story has a cover picture and pages of
// text with an optional picture each.
//
//   GET /api/storybooks/manifest       public: every published story (the app
//                                      and school servers download this)
//   /api/storybooks/admin/*            Super Admin: write, picture, publish
const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, superAdminOnly } = require('../middleware/auth');
const { uploadFile } = require('../services/storage.service');

const LICENCES = ['CC BY 4.0', 'CC BY 3.0', 'Own work'];
const MAX_PAGES = 40;

const text = (v, max) => { const s = String(v ?? '').trim(); return s.length <= max ? s : s.slice(0, max); };
const pagesOf = (row) => (Array.isArray(row.pages) ? row.pages : []).map(p => ({ text: String(p?.text ?? ''), image: p?.image || null }));

function shape(row) {
  return {
    id: row.id, title: row.title, author: row.author, illustrator: row.illustrator,
    licence: row.licence, level: row.level, status: row.status,
    cover: row.cover_url || null, pages: pagesOf(row),
    updated_at: row.updated_at, published_at: row.published_at,
  };
}

async function bump(client = pool) {
  await client.query('UPDATE storybook_state SET version = version + 1, changed_at = now() WHERE id');
}

// ── Public ──
router.get('/manifest', async (req, res, next) => {
  try {
    const { rows: [st] } = await pool.query('SELECT version FROM storybook_state WHERE id');
    const { rows } = await pool.query(`SELECT * FROM storybooks WHERE status = 'published' ORDER BY published_at DESC NULLS LAST, title`);
    res.set('Cache-Control', 'no-cache');
    res.json({
      version: st?.version ?? 0,
      stories: rows.map(r => {
        const s = shape(r);
        // images[0] is the cover, images[n] page n: the app's picture numbering.
        return { id: s.id, title: s.title, author: s.author, illustrator: s.illustrator, licence: s.licence, level: s.level,
          pages: s.pages.map(p => p.text), images: [s.cover, ...s.pages.map(p => p.image)], updated_at: s.updated_at };
      }),
    });
  } catch (err) { next(err); }
});

// ── Super Admin ──
router.use('/admin', authenticate, superAdminOnly);

router.get('/admin', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM storybooks ORDER BY updated_at DESC');
    res.json(rows.map(shape));
  } catch (err) { next(err); }
});

router.post('/admin', async (req, res, next) => {
  try {
    const title = text(req.body?.title, 120);
    if (!title) return res.status(400).json({ error: 'Give the story a title.' });
    const { rows: [row] } = await pool.query(
      `INSERT INTO storybooks (title, pages) VALUES ($1, '[{"text":"","image":null}]'::jsonb) RETURNING *`, [title]);
    res.status(201).json(shape(row));
  } catch (err) { next(err); }
});

router.get('/admin/:id', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query('SELECT * FROM storybooks WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Story not found' });
    res.json(shape(row));
  } catch (err) { next(err); }
});

// Saves the details and pages. Page pictures may only be ones this story
// already has (they are added with the picture route), so pages can be
// reordered with their pictures.
router.put('/admin/:id', async (req, res, next) => {
  try {
    const { rows: [cur] } = await pool.query('SELECT * FROM storybooks WHERE id = $1', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Story not found' });
    const b = req.body || {};
    const title = text(b.title ?? cur.title, 120);
    if (!title) return res.status(400).json({ error: 'Give the story a title.' });
    const level = Number(b.level ?? cur.level);
    if (![1, 2, 3, 4].includes(level)) return res.status(400).json({ error: 'Choose a level from 1 to 4.' });
    const licence = b.licence ?? cur.licence;
    if (!LICENCES.includes(licence)) return res.status(400).json({ error: 'Choose one of the listed licences.' });
    const known = new Set([cur.cover_url, ...pagesOf(cur).map(p => p.image)].filter(Boolean));
    let pages = pagesOf(cur);
    if (Array.isArray(b.pages)) {
      if (b.pages.length > MAX_PAGES) return res.status(400).json({ error: `A story can have up to ${MAX_PAGES} pages.` });
      pages = b.pages.map(p => ({ text: text(p?.text, 2000), image: p?.image && known.has(p.image) ? p.image : null }));
    }
    const status = b.status === 'published' || b.status === 'draft' ? b.status : cur.status;
    if (status === 'published') {
      if (!pages.length || pages.some(p => !p.text)) return res.status(400).json({ error: 'Every page needs some words before the story can be published.' });
    }
    const { rows: [row] } = await pool.query(`
      UPDATE storybooks SET title=$1, author=$2, illustrator=$3, licence=$4, level=$5, pages=$6::jsonb, status=$7,
             published_at = CASE WHEN $7 = 'published' AND status <> 'published' THEN now() ELSE published_at END,
             updated_at = now()
       WHERE id = $8 RETURNING *`,
      [title, text(b.author ?? cur.author, 120), text(b.illustrator ?? cur.illustrator, 120), licence, level,
       JSON.stringify(pages), status, cur.id]);
    if (status === 'published' || cur.status === 'published') await bump();
    res.json(shape(row));
  } catch (err) { next(err); }
});

// A picture: slot 0 is the cover, slot n is page n. { image: data URI } sets
// it, { image: null } removes it.
router.post('/admin/:id/picture/:slot', async (req, res, next) => {
  try {
    const { rows: [cur] } = await pool.query('SELECT * FROM storybooks WHERE id = $1', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Story not found' });
    const slot = parseInt(req.params.slot, 10);
    const pages = pagesOf(cur);
    if (!(slot >= 0 && slot <= pages.length)) return res.status(400).json({ error: 'Save the page first, then add its picture.' });
    let url = null;
    if (req.body?.image) {
      const m = String(req.body.image).match(/^data:image\/(png|jpeg|webp);base64,/);
      if (!m) return res.status(400).json({ error: 'The picture must be a PNG, JPG or WEBP.' });
      if (req.body.image.length > 3 * 1024 * 1024 * 1.37) return res.status(400).json({ error: 'The picture must be under 3 MB.' });
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      url = await uploadFile(req.body.image, `storybooks/${cur.id}/${slot === 0 ? 'cover' : `page-${slot}`}-${Date.now()}.${ext}`);
    }
    if (slot === 0) {
      await pool.query('UPDATE storybooks SET cover_url=$1, updated_at=now() WHERE id=$2', [url, cur.id]);
    } else {
      pages[slot - 1].image = url;
      await pool.query('UPDATE storybooks SET pages=$1::jsonb, updated_at=now() WHERE id=$2', [JSON.stringify(pages), cur.id]);
    }
    if (cur.status === 'published') await bump();
    const { rows: [row] } = await pool.query('SELECT * FROM storybooks WHERE id = $1', [cur.id]);
    res.json(shape(row));
  } catch (err) { next(err); }
});

router.delete('/admin/:id', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query('DELETE FROM storybooks WHERE id = $1 RETURNING status', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Story not found' });
    if (row.status === 'published') await bump();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
