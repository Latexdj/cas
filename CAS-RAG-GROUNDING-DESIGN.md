# CAS RAG Grounding Design
## Switching Policy-Document Grounding from Manual Clause Tagging to Embedding-Based Retrieval

**Status**: Design (not yet implemented)  
**Date**: 2026-09-05  
**Supersedes**: Phase 5a/5b manual clause-tagging system in CAS-POLICY-GROUNDING-DESIGN.md  
**Scope**: `backend/src/routes/letter-chat.js`, `backend/src/routes/policy-documents.js`, `admin-portal/app/(dashboard)/discipline/`, `admin-portal/app/super-admin/(shell)/policy-documents/`

---

## 1. Motivation

The current system (Phase 5a/5b) requires admins to manually:
1. Upload a PDF
2. Extract its text
3. Select a passage
4. Enter a section reference, categories, and applicable_to tags
5. Submit each clause individually

This is labour-intensive, error-prone, and means coverage depends entirely on which passages a human chose to tag. A large GES document like the Teacher Code of Conduct may have dozens of relevant clauses — the manual system will always be incomplete.

RAG (Retrieval-Augmented Generation) replaces the tagging step: the full document is stored, chunked, and embedded once at ingestion. At session start the case context is embedded and the most semantically relevant passages are retrieved automatically, with no per-clause human intervention required.

---

## 2. Confirmed Research Findings

Before designing, the following facts were verified against the live system:

| Question | Finding |
|---|---|
| pgvector installed? | **No.** Extensions present: `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. pgvector must be explicitly enabled. |
| Existing embedding provider? | **None.** Only AI integration is `@anthropic-ai/sdk` (Claude Haiku for chat). No OpenAI, Voyage AI, Cohere, or any embedding API in the codebase. |
| Existing policy_clauses rows? | **0 rows in production.** Migration burden is zero. |
| Current retrieval mechanism | Category-based SQL filter with GIN index on `categories[]` and `applicable_to @>` filter. Returns ≤6 rows. Re-queried live on every chat turn. |

---

## 3. Storage Schema

### 3.1 Enable pgvector

Before any schema changes, pgvector must be enabled on the Supabase project:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This must be run on the Supabase database directly (via Supabase dashboard → SQL editor, or the Supabase CLI). It cannot be done from the backend application.

### 3.2 New Table: `policy_chunks`

Replaces `policy_clauses` as the grounding data source.

```sql
CREATE TABLE policy_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  chunk_index     INT  NOT NULL,          -- ordering within the document
  section_hint    TEXT,                   -- detected heading, e.g. "4.2.1" or null
  chunk_text      TEXT NOT NULL,
  token_count     INT  NOT NULL,          -- approx tokens, recorded at ingestion
  embedding       vector(1024),           -- Voyage AI voyage-3 dimensions
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (document_id, chunk_index)
);

-- Index for vector similarity search
CREATE INDEX policy_chunks_embedding_idx
  ON policy_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for fast deletion/lookup by document
CREATE INDEX policy_chunks_document_idx ON policy_chunks (document_id);
```

**Notes:**
- `embedding` is nullable — a chunk without an embedding cannot be retrieved via RAG but the row is preserved (useful if ingestion partially fails).
- `section_hint` is best-effort, extracted by regex during chunking. It is shown in the disclosure panel in place of `section_ref`.
- `vector(1024)` is for Voyage AI `voyage-3`. If provider changes, this dimension must change and all embeddings must be regenerated.

### 3.3 What Happens to `policy_clauses`

`policy_clauses` currently has **0 rows in production**. Once RAG is working and verified, `policy_clauses` and all its CRUD endpoints can be dropped in a clean-up phase. No data migration is required.

During the transition period (RAG built but not yet verified in production), both tables can coexist. The `letter-chat.js` route would switch from `fetchClauses()` to the new RAG retrieval function.

---

## 4. Embedding Provider

### 4.1 Recommendation: Voyage AI `voyage-4`

**Rationale:**
- Anthropic explicitly partners with and recommends Voyage AI for RAG pipelines alongside Claude. The semantic spaces are well-aligned.
- `voyage-4` is Voyage AI's current-generation general-purpose model (released January 2026), replacing `voyage-3`. It includes a 200M-token free allocation per account — no cost for initial ingestion at any realistic scale.
- Default output dimension: **1024** (confirmed against live docs). Supports flexible Matryoshka dimensions (256 / 512 / 1024 / 2048) — using the default 1024 for this implementation.
- 32,000-token context window — handles long policy sections without truncation.
- Simpler operational footprint than adding OpenAI as a second vendor.

**Alternative**: OpenAI `text-embedding-3-small` (1536 dims). Acceptable but introduces a second vendor with no additional quality benefit for this use case.

### 4.2 Cost Estimate

| Operation | Tokens | Rate | Cost |
|---|---|---|---|
| Ingest one 80-page GES document | ~40,000 tokens of text | $0.06 / 1M tokens | ~$0.0024 per document |
| Ingest one 20-page school rules doc | ~10,000 tokens | $0.06 / 1M tokens | ~$0.0006 per document |
| Query at session start (case description) | ~100 tokens | $0.06 / 1M tokens | ~$0.000006 per session |

**Total ingestion cost for a complete corpus** (2 GES documents + ~50 schools × 1 school rules doc each): ≈ $0.036 one-time. Session query cost is negligible at any realistic usage volume.

The embedding cost is not a meaningful constraint. Provider decision should be based on quality and governance, not cost.

### 4.3 API Integration

Voyage AI offers a REST API and an official Node.js SDK (`voyageai`). Integration into the backend is a single dependency addition:

```
npm install voyageai
```

Credentials: one new environment variable `VOYAGE_API_KEY` in the Render and local `.env`.

---

## 5. Chunking Strategy

PDF text extracted by `pdf-parse` is plain text with no guaranteed structure markers. Legal and regulatory documents have two common patterns:

1. **Numbered section headings**: `4.2.1 A teacher absent without approved leave...`
2. **Unnumbered paragraphs** under a heading that appeared earlier in the text

Fixed token windows are inappropriate here — they split mid-clause, severing the legal meaning from its context.

### 5.1 Recommended: Hybrid Section-Boundary Chunking

```
1. Split text at detected section headings:
   Regex: /^\s*(\d+(\.\d+)*\.?\s+[A-Z])/m  (e.g. "4.2.1 A teacher...")
   Each detected heading starts a new chunk.

2. If no headings detected, fall back to paragraph-boundary chunking:
   Split at double newlines (\n\n). Merge short adjacent paragraphs until
   chunk approaches 400 tokens. Never split mid-sentence.

3. Apply 50-token trailing overlap between consecutive chunks:
   The last 50 tokens of chunk N are prepended to chunk N+1.
   This preserves context for clauses that reference the preceding paragraph.

4. Hard cap: no chunk exceeds 500 tokens.
   A section that exceeds 500 tokens is split at the nearest sentence boundary.
```

**Why overlap?** GES policy clauses frequently use anaphoric references ("Such a teacher", "In such cases") that are meaningless without the preceding sentence. 50-token overlap ensures these references are retrievable.

### 5.2 Section Hint Extraction

After chunking, attempt to extract a section number from the first line of each chunk:

```
Regex: /^(\d+(\.\d+)+\.?)/
```

If matched, store as `section_hint` (e.g., `"4.2.1"`). Used in the disclosure panel. If no match, `section_hint` is null and the panel shows the document title only.

---

## 6. Retrieval Logic

### 6.1 At Session Start

Replace the current `fetchClauses()` SQL call with:

```
1. Build query string from session metadata:
   "{document_type} offense: {offense_category}. {teacher_name or student_name}."
   Example: "teacher_query offense: absenteeism. Kwame Mensah."

2. Embed the query string via Voyage AI voyage-3.

3. Run cosine similarity search:
   SELECT pc.id, pc.section_hint, pc.chunk_text, pc.document_id,
          pd.title AS document_title, pd.school_id,
          1 - (pc.embedding <=> $1) AS similarity
   FROM policy_chunks pc
   JOIN policy_documents pd ON pd.id = pc.document_id
   WHERE pd.is_active = true
     AND (pd.school_id IS NULL OR pd.school_id = $2)
     AND pc.embedding IS NOT NULL
     AND 1 - (pc.embedding <=> $1) >= $3   -- similarity threshold
   ORDER BY similarity DESC
   LIMIT 6;

4. If 0 rows returned: inject nothing — AI operates without grounding.
   Log this event (document_type, offense_category, school_id) for calibration.

5. If rows returned: pass chunk_text to Claude system prompt, section_hint
   and document_title to frontend disclosure panel.
```

`<=>` is pgvector's cosine distance operator. `1 - distance = similarity`.

### 6.2 Similarity Threshold

**Starting value: 0.72** (cosine similarity).

This is a calibration parameter. At 0.72:
- Chunks with clear topical overlap with the query will pass.
- Chunks about an unrelated offense category should not pass.
- Exact threshold needs empirical calibration against real GES documents before production launch.

The threshold must be a configurable constant in the backend, not hardcoded in the SQL string, so it can be adjusted without a redeploy:

```js
const RAG_SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD ?? '0.72');
```

### 6.3 Re-Retrieval Policy

**Retrieve once at session start; do not re-embed on each chat turn.**

Rationale: the offense category and case facts are established before the chat begins and do not change during the conversation. Re-embedding every turn would add latency and cost with no retrieval benefit. If the admin provides additional facts mid-conversation ("it was actually the third offence"), those facts are handled by Claude's conversation context, not by re-retrieval.

### 6.4 GES vs School-Specific Priority

The existing SQL already orders by `school_id NULLS FIRST` — GES-level documents (school_id IS NULL) surface first, then school-specific. The RAG query should apply the same priority:

```sql
ORDER BY pd.school_id NULLS LAST, similarity DESC
LIMIT 6
```

Wait — GES docs should surface first (higher priority), so NULLS FIRST. But we also want to rank by similarity within each tier. The correct ordering is:

```sql
ORDER BY (pd.school_id IS NULL) DESC, similarity DESC
LIMIT 6
```

This ensures GES clauses come before school-level clauses, and within each tier the most similar chunks are ranked first.

**Flag for review**: Is this priority order correct? A school-specific clause that is highly relevant (similarity 0.95) may be more appropriate than a GES clause at 0.73. The current ordering assumes GES always takes priority regardless of similarity. Confirm with supervisor whether this assumption should hold in the RAG system.

---

## 7. Disclosure Requirement

### 7.1 Problem with Current Panel

The existing Phase 5b disclosure panel shows:

```
POLICY GROUNDING ACTIVE
4.2.1 — Teacher Code of Conduct
```

in 10px uppercase text at the top of the chat window. It is easy to miss and shows no actual clause text — the admin cannot verify that the right passages were retrieved.

### 7.2 New Disclosure Panel Design

The grounding panel must be expanded to show retrieved chunk content, not just a label. Requirements:

- **Visible before the AI's first message** — the admin must be able to review what was retrieved before reading the AI's draft.
- **Collapsible** — open by default, collapsible to a single header row so the admin can dismiss it after review.
- **Shows per-chunk**: section_hint (or "§ unknown" if null) + document_title + first 150 characters of chunk_text as a preview.
- **Shows chunk count**: "3 policy clauses retrieved" not just "Policy grounding active".
- **Shows the no-grounding case explicitly**: if 0 chunks were retrieved, show "No matching policy clauses found — AI is responding without policy grounding" in a distinct warning style (amber/orange, not green). This is safety-critical: the admin must know when grounding is absent.

### 7.3 Backend Changes

The `/api/letter-chat/start` response currently returns:

```js
grounding_clauses: clauses.map(c => ({ section_ref: c.section_ref, document_title: c.document_title }))
```

With RAG, this becomes:

```js
grounding_clauses: chunks.map(c => ({
  section_hint:   c.section_hint,       // may be null
  document_title: c.document_title,
  chunk_preview:  c.chunk_text.slice(0, 200),  // first 200 chars for disclosure panel
}))
```

The full `chunk_text` is not sent to the frontend — only a preview. The full text is sent to Claude's system prompt server-side.

---

## 8. Citation Instruction

**No change.**

The existing system prompt for clause citation reads (from Phase 5b):

> Only cite policies that were provided to you. Do not invent section numbers or fabricate clauses.

This instruction remains valid and sufficient. The RAG system provides retrieved chunks in the same position in the system prompt where manually tagged clauses previously appeared. The citation rule is independent of how retrieval works.

---

## 9. New Ingestion Flow

### 9.1 Current Flow (Manual, Phase 5c)

```
Admin → upload PDF → extract text → select passage → enter metadata → submit clause
(Repeated for every clause)
```

### 9.2 New Flow (RAG)

```
Admin → upload PDF → click "Process for RAG" → backend chunks + embeds → done
```

The admin does not select passages or enter metadata. The entire document is processed automatically.

### 9.3 Backend: New Endpoint

A new endpoint handles the chunking and embedding:

```
POST /api/policy-documents/:id/process-rag
Content-Type: multipart/form-data
Body: pdf (file)

Response 200: { chunks_created: N, document_id: "..." }
Response 403: if admin cannot modify this document
Response 409: if document already has chunks (must delete first or force-reprocess)
```

Processing steps:
1. Validate document ownership (same `canModify()` check as existing endpoints).
2. Accept PDF upload (same multer config as `extract-pdf`).
3. Extract text via `pdfParse(new Uint8Array(req.file.buffer))`.
4. Chunk text using the hybrid strategy (section-boundary → paragraph-boundary fallback).
5. Embed all chunks in batches (Voyage AI supports batch embedding of up to 128 texts per request).
6. Insert rows into `policy_chunks` within a transaction — if any step fails, roll back all inserts.
7. Return `{ chunks_created: N }`.

**Why a separate endpoint rather than processing on upload?**
- Embedding a large PDF takes several seconds of external API time. It should not block the document creation response.
- The admin may want to review the document before committing it to RAG.
- Allows re-processing if the chunking strategy is updated (delete existing chunks, re-run endpoint).

### 9.4 Deleting Chunks

When a `policy_document` is deleted (`DELETE /api/policy-documents/:id`), `policy_chunks` rows cascade-delete automatically via `ON DELETE CASCADE`. No additional logic needed.

A "re-process" flow requires explicitly deleting existing chunks before re-running:

```
DELETE FROM policy_chunks WHERE document_id = $1
```

This can be handled by the `process-rag` endpoint with a `?force=true` query parameter, or a dedicated `DELETE /api/policy-documents/:id/chunks` endpoint.

### 9.5 Frontend Admin UI Changes

**Super admin (GES documents)**: `admin-portal/app/super-admin/(shell)/policy-documents/page.tsx`
- Add a "Process for RAG" button per document (visible if no chunks exist) or "Re-process" (if chunks exist, showing chunk count).
- Show chunk count badge next to each document.

**School admin (school_rules)**: `admin-portal/app/(dashboard)/settings/policy-documents/page.tsx`
- Same additions.

The manual clause entry UI (current Phase 5c interface) can be removed once RAG is verified. The `extract-pdf` endpoint can also be removed. Both depend on `policy_clauses`.

---

## 10. Migration Plan

| Item | Action | Effort |
|---|---|---|
| pgvector extension | Enable via Supabase SQL editor | 1 SQL command |
| `policy_clauses` existing rows | 0 rows — nothing to migrate | None |
| `policy_clauses` table | Keep during transition; drop after RAG verified | 1 SQL DROP |
| Clause CRUD endpoints (GET/POST/PATCH/DELETE /clauses) | Keep during transition; remove after RAG verified | — |
| `extract-pdf` endpoint | Keep during transition; remove after RAG verified | — |
| Admin clause entry UI | Keep during transition; remove after RAG verified | — |
| `fetchClauses()` in letter-chat.js | Replace with `fetchChunksRAG()` | ~30 LOC change |
| Grounding panel in discipline/page.tsx | Expand to show chunk previews | UI update |
| Environment variables | Add `VOYAGE_API_KEY`, optionally `RAG_SIMILARITY_THRESHOLD` | Render dashboard |

The migration is purely additive until the final clean-up phase. No existing functionality breaks during the transition.

---

## 11. Phased Build Order

### Phase 6a — Infrastructure
1. Enable `vector` extension on Supabase (Supabase dashboard, one SQL command).
2. Create `policy_chunks` table with HNSW index.
3. Add `VOYAGE_API_KEY` to Render environment and local `.env`.
4. Install `voyageai` npm package in backend.
5. Write a test script to confirm: Voyage AI embedding of a sentence → 1024-element float array → stored in pgvector → retrieved by cosine similarity.

**Gate**: vector round-trip working before proceeding.

### Phase 6b — Ingestion
1. Write chunking utility (`chunkPolicyText(text): Array<{chunk_index, section_hint, chunk_text, token_count}>`).
2. Write embedding utility (batch-embed chunks via Voyage AI, return augmented chunk array).
3. Implement `POST /api/policy-documents/:id/process-rag` endpoint.
4. Test against a real GES PDF: confirm chunk count, section hints, embedding dimensions.
5. Add chunk count display to both admin UI document lists.
6. Add "Process for RAG" / "Re-process" button to admin UI.

**Gate**: super admin can upload GES Teacher Code, process it for RAG, see chunk count.

### Phase 6c — Retrieval
1. Write `fetchChunksRAG(schoolId, documentType, metadata)` in `letter-chat.js`:
   - Embed query string.
   - Similarity search with threshold.
   - Return ≤6 chunks.
   - Log zero-result events.
2. Replace `fetchClauses()` call in `/api/letter-chat/start` with `fetchChunksRAG()`.
3. Update `/start` response to include `chunk_preview` and `section_hint` fields.
4. Test: start a discipline session with chunks in DB → confirm grounding returned.
5. Test: start session with no matching chunks → confirm empty grounding returned.

**Gate**: chat grounding uses RAG retrieval end-to-end.

### Phase 6d — Frontend Disclosure
1. Update `ChatPanel` in `discipline/page.tsx`:
   - Collapsible grounding panel, open by default.
   - Show chunk count in header.
   - Show section_hint + document_title + 150-char preview per chunk.
   - Show amber "no grounding" warning when grounding_clauses is empty.
2. Test UI against live grounded session.

**Gate**: grounding panel shows chunk previews; no-grounding warning displays correctly.

### Phase 6e — Clean-up (after RAG verified in production)
1. Drop `policy_clauses` table.
2. Remove clause CRUD endpoints from `policy-documents.js`.
3. Remove `extract-pdf` endpoint from `policy-documents.js`.
4. Remove clause entry UI from both admin portals.
5. Remove `fetchClauses()` function from `letter-chat.js`.

**Gate**: no references to `policy_clauses` remain in codebase.

---

## 12. Open Questions for Supervisor Review

These items are ambiguous or require a decision that goes beyond technical design. Flag before implementation begins.

1. **Similarity threshold value**
   Starting proposal is 0.72. This needs calibration against actual GES documents and real offense categories. Who runs this calibration, and is there a process for adjusting it after launch without a full redeploy? (The `RAG_SIMILARITY_THRESHOLD` env var approach allows Render-level adjustment without code changes.)

2. **Embedding provider approval**
   Voyage AI has not been used in this project before. Does the organisation approve adding a new AI vendor? The alternative (OpenAI) is also a new vendor. Are there procurement or security review requirements for new API vendors?

3. **Data residency and compliance**
   The GES Teacher Code of Conduct and Student Code are official government of Ghana documents. Sending chunks of these documents to a US-based embedding API (Voyage AI or OpenAI) may have data governance implications. The text itself (not just metadata) leaves the Supabase/Render infrastructure. Is this acceptable? If not, a self-hosted embedding model must be considered (e.g., `nomic-embed-text` via Ollama, or HuggingFace Inference API with a Ghana/EU-hosted endpoint).

4. **GES-vs-school priority in retrieval**
   Current design surfaces GES documents before school-level documents regardless of similarity score. Is this the correct policy? A school may have rules that are more specific and relevant than the GES baseline. Should retrieval be purely by similarity, or should GES always take precedence within the 6-chunk cap?

5. **Chunk review by admin before activation**
   After "Process for RAG" runs, the chunks are immediately active for retrieval. Should there be a review step where the admin can see the chunks and approve/reject before they go live? This is particularly relevant for GES documents managed by super admin, where a chunking error could affect all schools.

6. **Re-retrieval on each chat turn**
   Current design retrieves once at session start. If the admin describes the incident in more detail during the chat (e.g., "actually it was a third offence"), the initial retrieval may not have captured the most relevant clause. Should retrieval be re-run on each turn using the growing conversation as the query? This adds ~100ms latency and ~$0.000006 per message — negligible cost, but adds complexity. Confirm with supervisor.

7. **HNSW index parameters**
   The schema uses `m = 16, ef_construction = 64` — pgvector defaults. For a small corpus (<10,000 chunks), these are fine. If the corpus grows significantly (many schools, large documents), the index may need tuning. Supabase's managed pgvector may also have constraints on index type or parameters. Confirm with Supabase plan limits before creating the index.

8. **policy_clauses deprecation timeline**
   Phase 6e removes the manual clause system entirely. Is there a use case for keeping manual clause tagging as a fallback or supplement to RAG? If some documents are too poorly formatted for auto-chunking (e.g., scanned PDFs with bad OCR), manual tagging may still be needed for those cases.
