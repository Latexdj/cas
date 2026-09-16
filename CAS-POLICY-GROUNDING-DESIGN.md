# Policy-Document Grounding for Letter-Chat Drafting

**Status:** Design — for supervisor review  
**Scope:** Phase 5 (proposed)  
**Author:** CAS Admin / Claude Sonnet 4.6

---

## Problem

The current letter-chat system (Phase 4) drafts query letters and disciplinary letters using only the model's training-time knowledge of GES rules. That knowledge may be outdated, paraphrased, or hallucinated. A disciplinary letter citing "Section 4.2.1 of the GES Code of Conduct" when no such section exists — or citing an outdated version — is worse than no citation at all: it's a factual error on a signed official document.

**Goal:** at session start, inject the actual applicable policy text as explicit context; instruct the model to cite only what was supplied; proceed without a citation rather than invent one.

---

## Research Findings

### Existing document handling
- `storage.service.js` → `uploadDocument()` accepts PDF/DOC/DOCX as base64 data URIs, uploads to Supabase Storage, returns a public URL. No text is extracted; the file is stored opaquely.
- `multer` (v2.1.1) is already installed and in use in `teachers.js` for multipart uploads.
- `puppeteer-core` + `@sparticuz/chromium` handle PDF **generation** (output only).
- **No text extraction library exists** (`pdf-parse`, `mammoth`, `textract` are all absent from `package.json`). Adding PDF extraction requires a new dependency.

### Category taxonomy (fixed enums, enforced server-side)

| Context | Values |
|---|---|
| `teacher_queries.category` | `absenteeism`, `misconduct`, `insubordination`, `negligence`, `poor_performance`, `other` |
| `student_disciplinary_letters.offense_category` | `lateness_absenteeism`, `fighting_assault`, `exam_malpractice`, `substance_use`, `insubordination`, `theft_damage`, `bullying_harassment`, `indecent_behavior`, `vandalism`, `other` |
| `student_disciplinary_letters.letter_type` | `warning`, `final_warning`, `suspension`, `dismissal`, `other` |

The AI-block list (sensitive categories that never reach the model at all) is a subset: `exam_malpractice`, `substance_use`, `fighting_assault`, `bullying_harassment`, `indecent_behavior`, `other` offense categories, and `suspension`/`dismissal` letter types. Policy grounding therefore only needs to cover the **non-blocked** categories.

---

## Schema

### `policy_documents`

Stores the source document (GES codes and school-specific rules).

```sql
CREATE TABLE policy_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE CASCADE,
  -- NULL = platform-level (GES codes); non-NULL = school-specific rules

  title         TEXT NOT NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('ges_teacher_code','ges_student_code','school_rules')),

  -- Optional: original source file stored in Supabase for audit trail
  source_url    TEXT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_documents_school ON policy_documents(school_id);
```

**Multi-tenancy rule:** `school_id IS NULL` = shared across all schools (super_admin manages). `school_id = <uuid>` = visible only to that school.

### `policy_clauses`

The unit of injection: one clause, one or more tagged categories.

```sql
CREATE TABLE policy_clauses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,

  section_ref   TEXT NOT NULL,
  -- e.g. "Section 4.2.1", "Rule 7(b)", "School Rules § 12"
  -- entered manually by the admin; not parsed from the PDF

  clause_text   TEXT NOT NULL,
  -- The verbatim (or lightly formatted) clause text

  applicable_to TEXT[] NOT NULL DEFAULT '{}',
  -- Subset of: 'teacher_query', 'student_letter'
  -- Controls which session types this clause can be injected into

  categories    TEXT[] NOT NULL DEFAULT '{}',
  -- Subset of the fixed category enums above
  -- For teacher_query: absenteeism, misconduct, insubordination, negligence, poor_performance
  -- For student_letter: lateness_absenteeism, insubordination, theft_damage, vandalism
  -- (sensitive categories excluded — they never reach AI anyway)

  display_order INTEGER NOT NULL DEFAULT 0,
  -- Within a document, lower = more prominent; injected in this order

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_policy_clauses_document   ON policy_clauses(document_id);
CREATE INDEX idx_policy_clauses_categories ON policy_clauses USING GIN(categories);
```

**Clause retrieval query** (used at session start):

```sql
SELECT pc.section_ref, pc.clause_text, pd.title, pd.document_type
FROM policy_clauses pc
JOIN policy_documents pd ON pd.id = pc.document_id
WHERE pd.is_active = true
  AND (pd.school_id IS NULL OR pd.school_id = $1)   -- platform + school-specific
  AND pc.applicable_to @> ARRAY[$2]                  -- 'teacher_query' or 'student_letter'
  AND pc.categories @> ARRAY[$3]                     -- the session's category value
ORDER BY
  pd.school_id NULLS LAST,   -- GES clauses first, then school-specific supplements
  pc.display_order ASC
LIMIT 6;
-- Hard cap at 6 clauses per category to prevent system-prompt bloat
```

---

## Ingestion Approach

### Phase 1: Manual paste (build this first)

Admin opens a "Policy Documents" screen (admin portal), creates a document record, then adds clauses one by one: paste the clause text, enter the section reference, tick which categories apply.

**Why manual paste first:**
- Zero new dependencies
- Forces a human to read and verify each clause before it enters the system
- Produces clean, purposeful text — no extraction noise
- GES codes are not large documents; the relevant clauses for discipline are a small subset

**UI sketch:** A document manager page (`/settings/policy-documents`) accessible to `admin` and `super_admin`. Super_admin creates GES-level docs (school_id NULL); admin creates school-specific docs.

### Phase 2: PDF upload + extraction-assisted entry (add later)

When an admin uploads a PDF, the backend extracts the full text with **`pdf-parse`** (the standard Node.js library: no native dependencies, simple Buffer → text API), displays it in a large editable textarea, and the admin cuts the relevant clause out, pastes it into the clause form, and edits as needed. The raw extracted text is never saved — only the reviewed, manually-confirmed clause.

**This is a convenience import tool, not an automated pipeline.** The extraction saves copy-typing from a PDF viewer; it does not auto-populate clauses or bypass human review.

`pdf-parse` is added as a new `npm` dependency. No other extraction library is needed.

**What is NOT proposed:** fully automated semantic segmentation of a PDF into clauses, or automatic category tagging. That path has too many failure modes for content that ends up cited in signed documents.

---

## Category Mapping: Manual Tagging

The design spec asked whether to recommend manual tagging (admin links clauses to categories) or automatic semantic matching. **Manual tagging is correct here, and I agree with the recommendation.** Reasons:

1. **Auditable:** you can inspect exactly which clause was injected for a given category without running an embedding query.
2. **Deterministic:** the same category always retrieves the same set of clauses; no embedding model drift or cosine-threshold tuning.
3. **The domain is narrow:** there are at most 9 non-sensitive offense categories and 5 query categories — a total of 14 slots. Tagging 14 category-to-clause mappings is a one-time 30-minute task, not a scalability problem.
4. **Semantic matching fails at the wrong moment:** if it surfaces the wrong clause, the error is invisible to the user until the letter is drafted and the principal reviews it.

One design note: the `categories` column is an array, so a single clause can cover multiple categories (e.g., a general GES misconduct clause covering both `insubordination` and `misconduct`). This is preferable to duplicating clause records.

---

## Drafting Integration (letter-chat.js)

### At `POST /api/letter-chat/start`

After the `isBlocked` guard passes and before the session row is inserted:

```js
// Pull applicable clauses for this category and document type
const { rows: clauses } = await pool.query(`
  SELECT pc.section_ref, pc.clause_text, pd.title
  FROM policy_clauses pc
  JOIN policy_documents pd ON pd.id = pc.document_id
  WHERE pd.is_active = true
    AND (pd.school_id IS NULL OR pd.school_id = $1)
    AND pc.applicable_to @> ARRAY[$2]
    AND pc.categories @> ARRAY[$3]
  ORDER BY pd.school_id NULLS LAST, pc.display_order ASC
  LIMIT 6
`, [schoolId, documentType, category]);

// Store clause count in session metadata for audit
// Clauses are injected into the system prompt at message time (not stored in session)
```

### System prompt injection (in `buildSystemPrompt`)

When clauses are found, append a grounded-rules block:

```
APPLICABLE RULES — CITE ONLY FROM THESE:
────────────────────────────────────────
[GES Code of Conduct for Students]
• Section 4.2.1: "A student who is found guilty of lateness on more than
  three occasions in a term shall be given a written warning…"

[Riverside Academy School Rules]
• Rule 12: "Students arriving after 7:30 AM without a valid excuse
  shall be recorded as late…"
────────────────────────────────────────
CITATION INSTRUCTIONS:
- You may cite or closely paraphrase the clauses above, referencing their
  section numbers exactly as written.
- Do NOT cite, quote, or reference any rule, section number, or policy
  that is not in the block above — even if you believe it exists.
- If no relevant rule is listed above, draft the letter without a citation.
  Do not invent a section reference.
```

When no clauses are found for the category, the grounded-rules block is omitted entirely and no citation instruction is added. The model drafts normally. This is preferable to a "no rules found — proceed" instruction, which could prompt the model to substitute recalled knowledge.

### Session record

The injected clauses are **not stored in the session's `messages` JSONB** (they're ephemeral system-prompt context, rebuilt on each turn from the live DB). This means:
- If a clause is edited after a session is started, subsequent turns in that session will reflect the updated text.
- The audit trail lives in the `policy_clauses` table, not in the chat history.

---

## Multi-Tenancy Summary

| Who manages | `school_id` | Visible to |
|---|---|---|
| Super admin | `NULL` | All schools (read-only for their admins) |
| School admin | `<school_uuid>` | That school only |

School admins cannot edit or delete GES-level documents. They can only add school-specific supplements. The retrieval query returns GES clauses first, school-specific clauses after — so if both cover a category, GES appears first in the draft.

---

## Open Questions

1. **Super admin UX:** Is the super admin managing GES codes via the existing super admin portal, or does that require a new screen? The portal currently manages plans and schools, not content.

2. **Clause versioning:** If GES publishes an updated code, old drafted letters should still be traceable to the version in effect at draft time. Current design has no version history — updating a clause silently changes what future drafts cite. A `valid_from` date on clauses would address this, at the cost of more complex retrieval.

3. **Clause visibility to the user:** Should the admin see which clause(s) were injected before the chat starts? A "Grounding context" disclosure at chat-open time would let the admin verify before drafting. Currently the design injects silently.

4. **Supplement vs. override:** If a school-specific rule contradicts a GES clause for the same category, both are injected. The model may need explicit guidance on precedence (school rules supplement GES, not replace it). This should be stated in the system prompt.

5. **Token budget:** Six clauses per category is a rough cap. If clauses are long (100–200 words each), six clauses add 600–1200 tokens to an already-long system prompt. This should be validated against the Haiku context window in practice.

6. **`other` category:** Admins can specify free-text offense descriptions when `offense_category = 'other'`. No clause can be pre-tagged to an open-ended category. The design correctly produces no citation for `other` — confirm this is acceptable.

---

## Phased Build Order

### Phase 5a — Schema + manual clause entry
- Migrations: `policy_documents`, `policy_clauses`
- Admin portal: policy document manager UI (create doc, add/edit/delete clauses, tag categories)
- Super admin portal: GES doc management (same UI, `school_id = NULL`)
- No changes to letter-chat yet; clauses sit in DB unused

### Phase 5b — Drafting integration
- `buildSystemPrompt` queries `policy_clauses` and injects grounded-rules block
- Citation-safety instruction added to system prompt
- Session metadata records clause count (for future audit)
- End-to-end test: draft a lateness query letter and verify citation matches the stored clause

### Phase 5c — PDF-assisted import
- Add `pdf-parse` to `backend/package.json`
- New endpoint: `POST /api/policy-documents/:id/extract-pdf` — receives a PDF upload (multer), extracts text, returns raw text for admin to review in the UI
- Admin edits, selects the relevant clause, submits via existing clause-creation endpoint
- The extracted text is never persisted; only the manually-confirmed clause record is saved
