const router = require('express').Router();
const pool   = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { checkModuleAccess } = require('../middleware/moduleAccess');
const { uploadFile, deleteFile } = require('../services/storage.service');
const { findOversizedField } = require('../utils/websiteValidation');

router.use(authenticate, requireActiveSubscription, adminOnly, checkModuleAccess('website'));

const MAX_IMAGES_PER_GALLERY = 40;
// The admin UI already compresses/resizes before upload, so this is rarely
// hit in practice — it's the actual guarantee, since a direct API call
// bypasses client-side compression entirely.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Only ever fed a client-supplied data URI, never a server-trusted one (the
// other website uploads — OG image, hero, logo — tolerate any file because
// an admin picking a "wrong" file only affects their own site; a gallery
// invites repeated uploads, so it's worth checking it's actually an image
// before it reaches storage.
function isImageDataUri(value) {
  return typeof value === 'string' && /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(value);
}

// Base64 encodes 3 bytes as 4 chars, so decoded size is ~3/4 of the string
// length (minus padding) — close enough for a size gate without actually
// allocating a Buffer for a request about to be rejected anyway.
function base64ByteSize(dataUri) {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// A gallery image's page_id must belong to the caller's own school AND
// actually be a gallery-type page — same ownership-check shape as page_id
// validation in admin-website-menu.js.
async function getOwnedGalleryPage(pageId, schoolId) {
  const { rows } = await pool.query(
    `SELECT id FROM website_pages WHERE id = $1 AND school_id = $2 AND page_type = 'gallery'`,
    [pageId, schoolId]
  );
  return rows[0] || null;
}

// GET /?page_id=
router.get('/', async (req, res, next) => {
  try {
    const { page_id } = req.query;
    if (!page_id) return res.status(400).json({ error: 'page_id is required.' });
    const { rows } = await pool.query(
      `SELECT g.* FROM website_gallery_images g
       JOIN website_pages p ON p.id = g.page_id AND p.school_id = g.school_id
       WHERE g.page_id = $1 AND g.school_id = $2
       ORDER BY g.sort_order`,
      [page_id, req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { page_id, image_data, caption } = req.body;
    if (!page_id || !image_data) return res.status(400).json({ error: 'page_id and image_data are required.' });
    if (!isImageDataUri(image_data)) return res.status(400).json({ error: 'Only JPEG, PNG, WEBP, or GIF images are accepted.' });
    if (base64ByteSize(image_data) > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: `Image must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller.` });
    }

    const page = await getOwnedGalleryPage(page_id, req.schoolId);
    if (!page) return res.status(400).json({ error: 'That page does not exist, or is not a gallery page.' });

    if (caption) {
      const oversized = findOversizedField({ caption });
      if (oversized) return res.status(400).json({ error: `Caption must be ${oversized.limit} characters or fewer.` });
    }

    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS n FROM website_gallery_images WHERE page_id = $1`, [page_id]
    );
    if (countRows[0].n >= MAX_IMAGES_PER_GALLERY) {
      return res.status(400).json({ error: `A gallery is limited to ${MAX_IMAGES_PER_GALLERY} images.` });
    }

    const ext = (image_data.match(/^data:image\/([a-z]+);/) || [])[1]?.replace('jpeg', 'jpg') || 'jpg';
    const storagePath = `website/${req.schoolId}/gallery/${page_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const imageUrl = await uploadFile(image_data, storagePath);

    const { rows: maxRow } = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM website_gallery_images WHERE page_id = $1`, [page_id]
    );

    const { rows } = await pool.query(
      `INSERT INTO website_gallery_images (school_id, page_id, image_url, storage_path, caption, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.schoolId, page_id, imageUrl, storagePath, caption || null, maxRow[0].next]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { caption, sort_order } = req.body;
    if (caption !== undefined && caption !== null) {
      const oversized = findOversizedField({ caption });
      if (oversized) return res.status(400).json({ error: `Caption must be ${oversized.limit} characters or fewer.` });
    }
    const { rows } = await pool.query(
      `UPDATE website_gallery_images SET
         caption    = CASE WHEN $1::text IS NOT NULL THEN NULLIF($1, '') ELSE caption END,
         sort_order = COALESCE($2, sort_order)
       WHERE id = $3 AND school_id = $4
       RETURNING *`,
      [caption !== undefined ? (caption || '') : null, sort_order ?? null, req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM website_gallery_images WHERE id = $1 AND school_id = $2 RETURNING storage_path`,
      [req.params.id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image not found' });
    // Best-effort — the DB row is already gone, which is what matters for
    // the admin's and visitors' experience; an orphaned blob is a minor,
    // separately-cleanable cost, not worth failing the request over.
    try { await deleteFile(rows[0].storage_path); } catch (e) { console.error('[gallery] storage cleanup failed:', e.message); }
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
