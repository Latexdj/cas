'use strict';
const router   = require('express').Router();
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const pool     = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { chunkPolicyText, embedTexts } = require('../utils/rag');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate, adminOnly, requireActiveSubscription);

// Non-sensitive categories cross-checked against SENSITIVE_OFFENSE_CATS in letter-chat.js.
// Sensitive categories (exam_malpractice, substance_use, fighting_assault, bullying_harassment,
// indecent_behavior, other) and letter types (suspension, dismissal) are intentionally excluded.
const ALLOWED_TEACHER_CATS  = new Set(['absenteeism','misconduct','insubordination','negligence','poor_performance']);
const ALLOWED_STUDENT_CATS  = new Set(['lateness_absenteeism','insubordination','theft_damage','vandalism']);
const VALID_APPLICABLE_TO   = new Set(['teacher_query','student_letter']);
const VALID_DOC_TYPES       = new Set(['ges_teacher_code','ges_student_code','school_rules']);

function allowedCatsFor(applicableTo) {
  const allowed = new Set();
  if (applicableTo.includes('teacher_query'))  ALLOWED_TEACHER_CATS.forEach(c => allowed.add(c));
  if (applicableTo.includes('student_letter')) ALLOWED_STUDENT_CATS.forEach(c => allowed.add(c));
  return allowed;
}

// super_admin can touch any doc; admin can only touch docs belonging to their school
function canModify(req, docSchoolId) {
  if (req.user.role === 'super_admin') return true;
  return docSchoolId !== null && docSchoolId === req.schoolId;
}

// ── Documents ─────────────────────────────────────────────────────────────────

// GET /api/policy-documents
// Returns GES-level (school_id IS NULL) + school-specific docs visible to this user.
// For super_admin req.schoolId = null, so the query returns only GES docs.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT pd.*, t.name AS created_by_name
       FROM policy_documents pd
       LEFT JOIN teachers t ON t.id = pd.created_by
       WHERE pd.school_id IS NULL OR pd.school_id = $1
       ORDER BY pd.school_id NULLS FIRST, pd.created_at DESC`,
      [req.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/policy-documents
router.post('/', async (req, res, next) => {
  try {
    const { title, document_type, source_url, is_active = true } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!VALID_DOC_TYPES.has(document_type)) return res.status(400).json({ error: 'Invalid document_type' });
    // GES-level types (ges_teacher_code, ges_student_code) are super_admin-only
    if (document_type !== 'school_rules' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can create GES-level documents' });
    }
    // school_rules must have a school context; super_admin has no school
    if (document_type === 'school_rules' && req.user.role === 'super_admin') {
      return res.status(400).json({ error: 'school_rules documents must belong to a specific school' });
    }
    const { rows } = await pool.query(
      `INSERT INTO policy_documents (school_id, title, document_type, source_url, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.schoolId, title.trim(), document_type, source_url || null, is_active, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/policy-documents/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query(
      'SELECT * FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, existing[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    const doc = existing[0];
    const { title, source_url, is_active } = req.body;
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Title cannot be empty' });
    const { rows } = await pool.query(
      `UPDATE policy_documents
       SET title = $1, source_url = $2, is_active = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [title?.trim() ?? doc.title, source_url ?? doc.source_url, is_active ?? doc.is_active, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/policy-documents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT school_id FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, rows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot delete GES-level documents' });
    }
    await pool.query('DELETE FROM policy_documents WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Clauses ───────────────────────────────────────────────────────────────────

// GET /api/policy-documents/:id/clauses
router.get('/:id/clauses', async (req, res, next) => {
  try {
    const { rows: doc } = await pool.query(
      `SELECT id FROM policy_documents WHERE id = $1 AND (school_id IS NULL OR school_id = $2)`,
      [req.params.id, req.schoolId]
    );
    if (!doc.length) return res.status(404).json({ error: 'Document not found' });
    const { rows } = await pool.query(
      `SELECT * FROM policy_clauses WHERE document_id = $1 ORDER BY display_order ASC, created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/policy-documents/:id/clauses
router.post('/:id/clauses', async (req, res, next) => {
  try {
    const { rows: docRows } = await pool.query(
      'SELECT * FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, docRows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    const { section_ref, clause_text, applicable_to = [], categories = [], display_order = 0 } = req.body;
    if (!section_ref?.trim()) return res.status(400).json({ error: 'section_ref is required' });
    if (!clause_text?.trim()) return res.status(400).json({ error: 'clause_text is required' });
    const invalidApp = applicable_to.filter(a => !VALID_APPLICABLE_TO.has(a));
    if (invalidApp.length) return res.status(400).json({ error: `Invalid applicable_to values: ${invalidApp.join(', ')}` });
    const allowed = allowedCatsFor(applicable_to);
    const invalidCats = categories.filter(c => !allowed.has(c));
    if (invalidCats.length) return res.status(400).json({ error: `Invalid or sensitive categories: ${invalidCats.join(', ')}` });
    const { rows } = await pool.query(
      `INSERT INTO policy_clauses (document_id, section_ref, clause_text, applicable_to, categories, display_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, section_ref.trim(), clause_text.trim(), applicable_to, categories, display_order]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/policy-documents/:id/clauses/:clauseId
router.patch('/:id/clauses/:clauseId', async (req, res, next) => {
  try {
    const { rows: docRows } = await pool.query(
      'SELECT * FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, docRows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    const { rows: clauseRows } = await pool.query(
      'SELECT * FROM policy_clauses WHERE id = $1 AND document_id = $2',
      [req.params.clauseId, req.params.id]
    );
    if (!clauseRows.length) return res.status(404).json({ error: 'Clause not found' });
    const clause = clauseRows[0];
    const { section_ref, clause_text, applicable_to, categories, display_order } = req.body;
    const newApplicable = applicable_to ?? clause.applicable_to;
    const newCategories = categories ?? clause.categories;
    const invalidApp = newApplicable.filter(a => !VALID_APPLICABLE_TO.has(a));
    if (invalidApp.length) return res.status(400).json({ error: `Invalid applicable_to values: ${invalidApp.join(', ')}` });
    const allowed = allowedCatsFor(newApplicable);
    const invalidCats = newCategories.filter(c => !allowed.has(c));
    if (invalidCats.length) return res.status(400).json({ error: `Invalid or sensitive categories: ${invalidCats.join(', ')}` });
    const { rows } = await pool.query(
      `UPDATE policy_clauses
       SET section_ref = $1, clause_text = $2, applicable_to = $3,
           categories = $4, display_order = $5, updated_at = now()
       WHERE id = $6 RETURNING *`,
      [
        section_ref?.trim() ?? clause.section_ref,
        clause_text?.trim() ?? clause.clause_text,
        newApplicable, newCategories,
        display_order ?? clause.display_order,
        req.params.clauseId,
      ]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/policy-documents/:id/clauses/:clauseId
router.delete('/:id/clauses/:clauseId', async (req, res, next) => {
  try {
    const { rows: docRows } = await pool.query(
      'SELECT school_id FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, docRows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    const result = await pool.query(
      'DELETE FROM policy_clauses WHERE id = $1 AND document_id = $2',
      [req.params.clauseId, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Clause not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/policy-documents/:id/extract-pdf
// Accepts a PDF upload, extracts full text with pdf-parse, returns it.
// Nothing is persisted — this is a convenience tool for the clause-entry UI.
router.post('/:id/extract-pdf', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Uploaded file must be a PDF' });
    }
    const { rows } = await pool.query(
      'SELECT school_id FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, rows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot extract from GES-level documents' });
    }
    // pdf-parse/PDF.js fails with Node's Buffer type on Node ≥24 — Uint8Array works on all versions
    const parsed = await pdfParse(new Uint8Array(req.file.buffer));
    res.json({ text: parsed.text, pages: parsed.numpages });
  } catch (err) { next(err); }
});

// ── RAG Chunks ────────────────────────────────────────────────────────────────

// GET /api/policy-documents/:id/chunks
// Returns chunk summary (count + previews) for the admin RAG status panel.
// Readable by any admin who can see the document (GES docs are readable by school admins).
router.get('/:id/chunks', async (req, res, next) => {
  try {
    const { rows: doc } = await pool.query(
      `SELECT id FROM policy_documents WHERE id = $1 AND (school_id IS NULL OR school_id = $2)`,
      [req.params.id, req.schoolId]
    );
    if (!doc.length) return res.status(404).json({ error: 'Document not found' });
    const { rows } = await pool.query(
      `SELECT id, chunk_index, section_hint, LEFT(chunk_text, 200) AS chunk_preview, is_active
       FROM policy_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
      [req.params.id]
    );
    const total  = rows.length;
    const active = rows.filter(r => r.is_active).length;
    res.json({ total, active, chunks: rows });
  } catch (err) { next(err); }
});

// POST /api/policy-documents/:id/process-rag
// Accepts a PDF, chunks + embeds it, stores inactive chunks.
// Replaces any existing chunks for this document.
router.post('/:id/process-rag', upload.single('pdf'), async (req, res, next) => {
  try {
    const { rows: docRows } = await pool.query(
      'SELECT school_id FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, docRows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Uploaded file must be a PDF' });
    }
    if (!process.env.VOYAGE_API_KEY) {
      return res.status(503).json({ error: 'VOYAGE_API_KEY not configured — RAG processing unavailable' });
    }

    // Extract text (Node ≥24 compat: pass Uint8Array not Buffer)
    const parsed = await pdfParse(new Uint8Array(req.file.buffer));
    if (!parsed.text.trim()) {
      return res.status(422).json({ error: 'PDF contains no extractable text (scanned image?)' });
    }

    // Chunk
    const rawChunks = chunkPolicyText(parsed.text);
    if (rawChunks.length === 0) {
      return res.status(422).json({ error: 'No content chunks could be extracted from this PDF' });
    }

    // Embed all chunks via Voyage AI
    let embeddings;
    try {
      embeddings = await embedTexts(rawChunks.map(c => c.chunk_text));
    } catch (e) {
      const msg = e.message ?? String(e);
      if (msg.startsWith('Voyage AI error')) {
        return res.status(502).json({ error: `Embedding service error: ${msg}` });
      }
      throw e;
    }

    // Verify dimension matches the vector(1024) column before inserting
    const dim = embeddings[0]?.length;
    if (dim !== 1024) {
      return res.status(422).json({
        error: `Embedding dimension mismatch: model returned ${dim} dims but column expects 1024. ` +
               `Update the voyage model or re-run the migrate-6a.sql with vector(${dim}).`,
      });
    }

    // Replace existing chunks in a transaction (all inactive by default — admin must activate)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM policy_chunks WHERE document_id = $1', [req.params.id]);
      for (let i = 0; i < rawChunks.length; i++) {
        const c   = rawChunks[i];
        const emb = embeddings[i];
        await client.query(
          `INSERT INTO policy_chunks
             (document_id, chunk_index, section_hint, chunk_text, token_count, embedding, is_active)
           VALUES ($1, $2, $3, $4, $5, $6::vector, false)`,
          [req.params.id, c.chunk_index, c.section_hint, c.chunk_text, c.token_count,
           `[${emb.join(',')}]`]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const preview = rawChunks.map(c => ({
      chunk_index:   c.chunk_index,
      section_hint:  c.section_hint,
      chunk_preview: c.chunk_text.slice(0, 200),
    }));
    res.status(201).json({ chunks_created: rawChunks.length, chunks: preview });
  } catch (err) { next(err); }
});

// PATCH /api/policy-documents/:id/chunks
// Body: { is_active: true|false } — activates or deactivates all chunks for this document.
router.patch('/:id/chunks', async (req, res, next) => {
  try {
    const { rows: docRows } = await pool.query(
      'SELECT school_id FROM policy_documents WHERE id = $1', [req.params.id]
    );
    if (!docRows.length) return res.status(404).json({ error: 'Document not found' });
    if (!canModify(req, docRows[0].school_id)) {
      return res.status(403).json({ error: 'Cannot modify GES-level documents' });
    }
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active (boolean) is required' });
    }
    const { rowCount } = await pool.query(
      'UPDATE policy_chunks SET is_active = $1 WHERE document_id = $2',
      [is_active, req.params.id]
    );
    res.json({ updated: rowCount, is_active });
  } catch (err) { next(err); }
});

module.exports = router;
