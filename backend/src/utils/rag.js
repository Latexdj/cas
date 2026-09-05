'use strict';
const pool = require('../config/db');

// ── Text Chunking ─────────────────────────────────────────────────────────────
// Hybrid strategy: section-boundary first, paragraph-boundary fallback.
// Produces chunks of ≤ ~500 tokens (≈ 2000 chars) with 50-token overlap.

const MAX_CHARS    = 2000; // ~500 tokens (1 token ≈ 4 chars)
const OVERLAP_CHARS = 200; // ~50 tokens overlap between consecutive chunks

// Matches numbered headings like "4.2.1 Absence", "Section 5", "Rule 7", "Article 3"
const HEADING_RE = /^(?:\d+(?:\.\d+)*\.?\s+[A-Z]|(?:Section|Rule|Article|Part|Chapter)\s+\d+\b)/i;

// Extract a short section identifier from the first line of a heading paragraph.
function extractHint(para) {
  const m = para.match(/^(\d+(?:\.\d+)*\.?|(?:Section|Rule|Article|Part|Chapter)\s+\d+(?:\.\d+)*)/i);
  return m ? m[1].replace(/\.$/, '').trim() : null;
}

function chunkPolicyText(rawText) {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  const paragraphs = text.split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length >= 15);

  if (paragraphs.length === 0) return [];

  const chunks = [];
  let current    = '';
  let sectionHint = null;

  function flush(nextPara) {
    if (current.trim().length >= 20) {
      chunks.push({ text: current.trim(), hint: sectionHint });
    }
    // Carry overlap into next chunk — trim leading partial word
    const tail = current.length > OVERLAP_CHARS
      ? current.slice(-OVERLAP_CHARS).replace(/^\S+\s/, '')
      : current;
    current = tail ? tail + (nextPara ? '\n\n' + nextPara : '') : (nextPara ?? '');
  }

  for (const para of paragraphs) {
    const isHeading = HEADING_RE.test(para);

    if (isHeading && current.length > 0) {
      flush(para);
      sectionHint = extractHint(para);
    } else if (!isHeading && current.length + para.length + 2 > MAX_CHARS && current.length >= MAX_CHARS / 3) {
      flush(para);
    } else {
      current += (current ? '\n\n' : '') + para;
      if (isHeading && !sectionHint) sectionHint = extractHint(para);
    }
  }
  if (current.trim().length >= 20) chunks.push({ text: current.trim(), hint: sectionHint });

  return chunks.map((c, i) => ({
    chunk_index:  i,
    section_hint: c.hint,
    chunk_text:   c.text,
    token_count:  Math.ceil(c.text.length / 4),
  }));
}

// ── Voyage AI Embedding ───────────────────────────────────────────────────────
// Uses Node's built-in fetch (Node >= 18). Batches at 64 texts per request.

const VOYAGE_BATCH = 64;

async function embedTexts(texts) {
  if (!process.env.VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY is not configured');
  const results = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const batch = texts.slice(i, i + VOYAGE_BATCH);
    // Retry up to 3 times on 429 (rate limit) with backoff
    let attempt = 0;
    let res;
    while (true) {
      res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: batch, model: 'voyage-3' }),
      });
      if (res.status === 429 && attempt < 3) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(20000 * 2 ** attempt, 120000);
        console.warn(`[RAG] Voyage 429 rate limit — waiting ${waitMs / 1000}s (attempt ${attempt + 1}/3)`);
        await new Promise(r => setTimeout(r, waitMs));
        attempt++;
        continue;
      }
      break;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Voyage AI error ${res.status}: ${err.detail ?? err.message ?? res.statusText}`);
    }
    const data = await res.json();
    const sorted = data.data.sort((a, b) => a.index - b.index);
    results.push(...sorted.map(e => e.embedding));
  }
  return results;
}

// ── RAG Retrieval Query ───────────────────────────────────────────────────────
// Privacy rule: never include student/teacher names in the embedding query.
// Query = document_type label + offense category only.

function buildRagQuery(documentType, metadata) {
  const category = documentType === 'teacher_query'
    ? metadata?.category
    : metadata?.offense_category;
  if (!category) return null;
  const typeLabel = documentType === 'teacher_query' ? 'teacher query' : 'student disciplinary letter';
  return `${typeLabel} offense: ${category}.`;
}

// Similarity threshold — configurable without redeploy via env var.
// Gate: calibrate this against real GES chunks before calling 6c done.
const DEFAULT_THRESHOLD = 0.72;

async function fetchChunksRAG(schoolId, documentType, metadata) {
  const queryText = buildRagQuery(documentType, metadata);
  if (!queryText) return [];
  if (!process.env.VOYAGE_API_KEY) return [];

  try {
    const [queryEmbedding] = await embedTexts([queryText]);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const threshold = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD ?? String(DEFAULT_THRESHOLD));

    const { rows } = await pool.query(
      `SELECT pc.chunk_text, pc.section_hint, pd.title AS document_title,
              1 - (pc.embedding <=> $1::vector) AS similarity
       FROM policy_chunks pc
       JOIN policy_documents pd ON pd.id = pc.document_id
       WHERE pd.is_active = true
         AND pc.is_active = true
         AND (pd.school_id IS NULL OR pd.school_id = $2)
         AND pc.embedding IS NOT NULL
         AND 1 - (pc.embedding <=> $1::vector) >= $3
       ORDER BY similarity DESC
       LIMIT 6`,
      [embeddingStr, schoolId, threshold]
    );

    if (rows.length > 0) {
      console.log(
        `[RAG] query="${queryText}" threshold=${threshold} ` +
        `hits=${rows.length} top_similarity=${rows[0].similarity.toFixed(4)}`
      );
    } else {
      console.log(`[RAG] query="${queryText}" threshold=${threshold} hits=0 (no grounding)`);
    }

    return rows;
  } catch (e) {
    console.error('[RAG] fetchChunksRAG error:', e.message);
    return [];
  }
}

module.exports = { chunkPolicyText, embedTexts, buildRagQuery, fetchChunksRAG };
