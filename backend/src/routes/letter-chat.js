'use strict';
const router    = require('express').Router();
const pool      = require('../config/db');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');
const { fetchChunksRAG } = require('../utils/rag');

router.use(authenticate, requireActiveSubscription);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 'other' is too vague for grounded AI drafting.
// suspension/dismissal carry legal weight — AI never produces those.
// All other offense categories are now permitted for AI drafting.
const SENSITIVE_OFFENSE_CATS  = new Set(['other']);
const SENSITIVE_LETTER_TYPES = new Set(['suspension', 'dismissal']);

function isBlocked(documentType, metadata) {
  if (documentType !== 'student_letter') return false;
  if (SENSITIVE_OFFENSE_CATS.has(metadata?.offense_category))  return true;
  if (SENSITIVE_LETTER_TYPES.has(metadata?.letter_type))        return true;
  return false;
}

// ── Grounding retrieval ───────────────────────────────────────────────────────
// Strategy: try RAG first (vector similarity, voyage-3); if no active chunks
// exist or VOYAGE_API_KEY is absent, fall back to manually-tagged clauses.
// Returns { mode: 'rag'|'clauses'|'none', results: NormalizedResult[] }
//
// NormalizedResult: { section_label, text, document_title, chunk_preview? }
// section_label = section_ref (clauses) or section_hint (chunks), may be null.
// chunk_preview = first 200 chars of chunk_text — for frontend disclosure only.

async function fetchClauses(schoolId, documentType, metadata) {
  const category = documentType === 'teacher_query'
    ? metadata?.category
    : metadata?.offense_category;
  if (!category) return [];
  try {
    const { rows } = await pool.query(
      `SELECT pc.section_ref, pc.clause_text, pd.title AS document_title
       FROM policy_clauses pc
       JOIN policy_documents pd ON pd.id = pc.document_id
       WHERE pd.is_active = true
         AND (pd.school_id IS NULL OR pd.school_id = $1)
         AND pc.applicable_to @> ARRAY[$2]::TEXT[]
         AND pc.categories    @> ARRAY[$3]::TEXT[]
       ORDER BY pd.school_id NULLS FIRST, pc.display_order ASC
       LIMIT 6`,
      [schoolId, documentType, category]
    );
    return rows;
  } catch (e) {
    console.error('fetchClauses error:', e.message);
    return [];
  }
}

async function fetchGrounding(schoolId, documentType, metadata) {
  // Try RAG (only if VOYAGE_API_KEY configured — otherwise fall through to clauses)
  const ragRows = await fetchChunksRAG(schoolId, documentType, metadata);
  if (ragRows.length > 0) {
    return {
      mode: 'rag',
      results: ragRows.map(r => ({
        section_label: r.section_hint ?? null,
        text:          r.chunk_text,
        document_title: r.document_title,
        chunk_preview: r.chunk_text.slice(0, 200),
      })),
    };
  }

  // Fall back to manually-tagged clauses (live re-query each time for clause edit visibility)
  const clauseRows = await fetchClauses(schoolId, documentType, metadata);
  if (clauseRows.length > 0) {
    return {
      mode: 'clauses',
      results: clauseRows.map(r => ({
        section_label:  r.section_ref,
        text:           r.clause_text,
        document_title: r.document_title,
      })),
    };
  }

  return { mode: 'none', results: [] };
}

// Build the grounded-rules block to append to the system prompt.
// Omitted entirely when results is empty — model drafts normally without citation.
function buildGroundingBlock(grounding) {
  if (!grounding.results.length) return '';
  const byDoc = new Map();
  for (const r of grounding.results) {
    if (!byDoc.has(r.document_title)) byDoc.set(r.document_title, []);
    byDoc.get(r.document_title).push(r);
  }
  const sections = [...byDoc.entries()].map(([title, items]) => {
    const lines = items.map(r => {
      const label = r.section_label ? `${r.section_label}: ` : '';
      return `• ${label}"${r.text}"`;
    }).join('\n');
    return `[${title}]\n${lines}`;
  }).join('\n\n');
  return `\n\nAPPLICABLE RULES — CITE ONLY FROM THESE:
────────────────────────────────────────
${sections}
────────────────────────────────────────
CITATION INSTRUCTIONS:
- You may cite or closely paraphrase the passages above, referencing their section numbers exactly as written.
- Do NOT cite, quote, or reference any rule, section number, or policy that is not in the block above — even if you believe it exists.
- GES clauses take precedence; school-specific clauses supplement GES rules and do not override or contradict them.
- If no relevant rule is listed above, draft the letter without a citation. Do not invent a section reference.`;
}

// grounding is frozen at session start (RAG) or re-queried live (clauses fallback).
function buildSystemPrompt(schoolName, documentType, metadata, grounding = { mode: 'none', results: [] }) {
  let base;
  const sanctionRule = `
SANCTION RULE (strictly enforced):
- Do NOT originate, suggest, or imply any disciplinary sanction, punishment, or consequence unless ONE of the following applies:
  a) The user explicitly states the sanction in this conversation (e.g. "two-day suspension", "detention"), in which case you may incorporate exactly what they stated — do not alter, escalate, or soften it.
  b) A policy clause in the APPLICABLE RULES block below explicitly specifies a fixed sanction for this scenario, in which case you may reference only what that clause states — nothing beyond it.
- If neither applies, leave any consequence/sanction section as a clear placeholder (e.g. "[sanction to be specified by school administration]") rather than inventing or implying an outcome.`;

  if (documentType === 'student_letter') {
    base = `You are assisting an admin at ${schoolName} in drafting a formal disciplinary letter to a student.

Context:
- Student: ${metadata.student_name ?? ''}${metadata.class_name ? ` (${metadata.class_name})` : ''}
- Letter type: ${metadata.letter_type ?? ''}
- Offense category: ${metadata.offense_category ?? ''}${metadata.offense_other ? ` — ${metadata.offense_other}` : ''}
- Subject line: "${metadata.subject ?? ''}"

Your role:
- Help draft the BODY of the letter only — the paragraphs between "Dear [Name]," and "Yours faithfully,"
- Do NOT include the date, ref number, recipient address block, salutation, or signature block (the system handles those)
- Before producing a full draft, ask for: (1) exactly what happened, (2) when it occurred, (3) who was involved, (4) any prior warnings or relevant history — do not draft without these facts
- Present a complete draft once you have the incident details; revise based on feedback
- Keep the tone firm, professional, and fair; use formal English appropriate for an official school document
- Write in third-person institutional voice ("The school notes that…", "You are hereby directed to…")
${sanctionRule}`;
  } else {
    base = `You are assisting an admin at ${schoolName} in drafting a formal query letter to a teacher.

Context:
- Teacher: ${metadata.teacher_name ?? ''}${metadata.department ? ` (${metadata.department})` : ''}
- Category: ${metadata.category ?? ''}${metadata.category_other ? ` — ${metadata.category_other}` : ''}
- Subject line: "${metadata.subject ?? ''}"

Your role:
- Help draft the BODY of the query letter — the paragraphs between "Dear [Name]," and "Yours faithfully,"
- Do NOT include the date, ref number, recipient address, salutation, or signature block
- Before producing a full draft, ask for: (1) the specific concern or incident, (2) when it occurred, (3) any relevant context or prior discussions, (4) what response is expected and by when — do not draft without these facts
- Present a complete draft once you have the details; revise based on feedback
- Keep the tone formal and fair; use professional language appropriate for an official school query
${sanctionRule}`;
  }
  const formatAndToneRule = `

FORMATTING AND TONE (strictly enforced):
- Write plain text only. Do not use markdown: no asterisks, no bold, no italics, no headers, no bullet symbols.
- Numbered lists are acceptable (1. 2. 3.) for enumerated items; otherwise use plain paragraph breaks.
- Do not use em dashes (—). Use a comma, semicolon, or full stop instead.
- Write in plain, direct sentences as a professional school administrator would. Avoid AI-typical filler phrases such as "it is imperative that", "it is essential that", "it is crucial that", "please note that", "I want to draw your attention to", or "it goes without saying".`;

  return base + formatAndToneRule + buildGroundingBlock(grounding);
}

function openingMessage(documentType, metadata) {
  if (documentType === 'student_letter') {
    return `I'm ready to help you draft the body of this ${metadata.letter_type ?? ''} letter for ${metadata.student_name ?? 'the student'}.\n\nTo write this well, please tell me:\n1. What happened — the specific incident or behaviour\n2. When it occurred (date or period)\n3. Any prior warnings or relevant history\n4. What outcome or action you want the letter to communicate\n\nOnce I have these details I will draft the body text for your review.`;
  }
  return `I'm ready to help you draft the body of this query letter for ${metadata.teacher_name ?? 'the teacher'}.\n\nPlease tell me:\n1. What happened — the specific concern or incident\n2. When it occurred\n3. Any relevant context or prior discussions\n4. What response you expect from the teacher and by when\n\nWith those details I can draft a clear, formal query body for your review.`;
}

// POST /api/letter-chat/start
// Body: { document_type: 'teacher_query'|'student_letter', metadata: { ... } }
// Returns: { session_id, opening_message, grounding_clauses }
router.post('/start', adminOnly, async (req, res, next) => {
  try {
    const { document_type, metadata } = req.body;

    if (!['teacher_query', 'student_letter'].includes(document_type)) {
      return res.status(400).json({ error: 'document_type must be teacher_query or student_letter' });
    }
    if (!metadata?.subject?.trim()) {
      return res.status(400).json({ error: 'metadata.subject is required' });
    }

    if (isBlocked(document_type, metadata)) {
      return res.status(422).json({
        error: 'AI drafting is not available for this offense category or letter type. Please compose the letter body manually.',
        blocked: true,
      });
    }

    // Retrieve grounding: RAG preferred, clause fallback (fail-open: none on error)
    const grounding = await fetchGrounding(req.schoolId, document_type, metadata);

    // Freeze grounding in session metadata.
    // RAG results are stored here to avoid re-embedding each turn.
    // Clause fallback is re-queried live each turn (supports immediate clause edits).
    const enrichedMetadata = {
      ...metadata,
      _grounding_mode:    grounding.mode,
      _grounding_results: grounding.mode === 'rag' ? grounding.results : undefined,
      _clause_count:      grounding.results.length,
    };

    const { rows } = await pool.query(
      `INSERT INTO letter_draft_sessions (school_id, created_by, document_type, metadata, messages)
       VALUES ($1, $2, $3, $4, '[]')
       RETURNING id`,
      [req.schoolId, req.user.id, document_type, JSON.stringify(enrichedMetadata)]
    );

    res.status(201).json({
      session_id:      rows[0].id,
      opening_message: openingMessage(document_type, metadata),
      // Normalized grounding for the disclosure panel — same shape for RAG and clauses.
      grounding_clauses: grounding.results.map(r => ({
        section_ref:   r.section_label ?? null,
        document_title: r.document_title,
        chunk_preview: r.chunk_preview ?? undefined,
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/letter-chat/:session_id/message
// Body: { content }
// Returns: { role: 'assistant', content }
router.post('/:session_id/message', adminOnly, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

    const { rows: sRows } = await pool.query(
      `SELECT * FROM letter_draft_sessions
       WHERE id = $1 AND school_id = $2 AND created_by = $3`,
      [req.params.session_id, req.schoolId, req.user.id]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Session not found' });

    const session = sRows[0];
    if (session.finalized_at) return res.status(400).json({ error: 'Session already finalized' });
    if (new Date(session.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Session expired — please start a new draft session' });
    }

    const { rows: schRows } = await pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]);
    const schoolName = schRows[0]?.name ?? 'the school';

    // Grounding at message time:
    // - RAG mode: use results frozen at session start (avoid re-embedding each turn)
    // - Clause mode: re-query live so clause edits are reflected immediately
    // - None: no grounding block in system prompt
    let grounding;
    if (session.metadata._grounding_mode === 'rag' && session.metadata._grounding_results?.length) {
      grounding = { mode: 'rag', results: session.metadata._grounding_results };
    } else if (session.metadata._grounding_mode === 'clauses') {
      const clauseRows = await fetchClauses(req.schoolId, session.document_type, session.metadata);
      grounding = clauseRows.length > 0
        ? { mode: 'clauses', results: clauseRows.map(r => ({ section_label: r.section_ref, text: r.clause_text, document_title: r.document_title })) }
        : { mode: 'none', results: [] };
    } else {
      grounding = { mode: 'none', results: [] };
    }
    const systemPrompt = buildSystemPrompt(schoolName, session.document_type, session.metadata, grounding);

    // Append user message and call Claude
    const updatedMessages = [...(session.messages ?? []), { role: 'user', content: content.trim() }];

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system:     systemPrompt,
      messages:   updatedMessages,
    });

    const aiContent = response.content[0]?.text ?? '';
    const finalMessages = [...updatedMessages, { role: 'assistant', content: aiContent }];

    await pool.query(
      `UPDATE letter_draft_sessions SET messages = $1, updated_at = now() WHERE id = $2`,
      [JSON.stringify(finalMessages), session.id]
    );

    res.json({ role: 'assistant', content: aiContent });
  } catch (err) { next(err); }
});

// PATCH /api/letter-chat/:session_id/finalize
// Marks the session as finalized (no more messages can be added).
// Returns: { messages }
router.patch('/:session_id/finalize', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE letter_draft_sessions
       SET finalized_at = now(), updated_at = now()
       WHERE id = $1 AND school_id = $2 AND created_by = $3 AND finalized_at IS NULL
       RETURNING messages`,
      [req.params.session_id, req.schoolId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found or already finalized' });
    res.json({ messages: rows[0].messages });
  } catch (err) { next(err); }
});

// GET /api/letter-chat/:session_id — read session (used by principal transcript view)
router.get('/:session_id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, document_type, metadata, messages, finalized_at, created_at
       FROM letter_draft_sessions
       WHERE id = $1 AND school_id = $2`,
      [req.params.session_id, req.schoolId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
