# General Letter-Writing Module — Design Specification

**Module:** CAS Admin Portal — General Correspondence
**Version:** 0.1 (Draft — For Review)
**Date:** 2026-09-05

---

## Abstract

This document proposes a general correspondence module for CAS — covering parent communications, external bodies (GES, other schools, district offices), and any school-issued letter not covered by the discipline system's fixed taxonomy. It recommends extending the existing letter-chat session pattern and PrintLetterModal rather than building a parallel stack, and describes a sensitivity-handling approach that trades the discipline module's deterministic category blocklist for an explicit human declaration, with a best-effort model-side soft catch. Schema, approval routing, and a four-phase build order follow.

---

## 1. What Is Reused vs. Built New

The discipline module's capture bug was caused by a parallel implementation of related logic. This design avoids that by extending existing code where the extension is clean.

### Extend existing

- `letter_draft_sessions` table — add `document_type = 'general_letter'`; JSONB `metadata` already handles arbitrary recipient fields
- `letter-chat.js` — new branch in `buildSystemPrompt()` and `openingMessage()`, same pattern as adding `teacher_query` alongside `student_letter`
- `stripMarkdown()` — already in letter-chat.js, inherited for free
- `PrintLetterModal` — add `recipientType: 'external'` and an address block; existing HTML template handles letterhead/signature unchanged
- PDF route pattern (`/pdf` → Puppeteer) — copy the discipline route, not the template logic
- `requires_approval` / principal-approval pattern — copy as-is from `student_disciplinary_letters`
- Formatting and tone system-prompt rules — same block, same effect

### Build new

- `general_letters` table — different recipient model and status lifecycle from discipline tables; do not overload them
- `backend/src/routes/general-letters.js` — CRUD, PDF, approval endpoints
- Admin UI page (e.g. `/admin/correspondence`) — modal + list view
- General letter system-prompt variant in letter-chat.js
- Sensitivity declaration UI — checkbox + conditional disable of AI drafting
- External recipient address block in PrintLetterModal (small extension, not a rewrite)

---

## 2. Schema

A single `general_letters` table. The recipient model is a hybrid: a `recipient_type` enum controls whether the record uses a FK to an internal entity or free-text fields for an external party. This is simpler than a polymorphic junction table and appropriate for this scale.

### general_letters

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | `gen_random_uuid()` |
| `school_id` | `uuid FK` | `schools.id` — tenant boundary |
| `issued_by_id` | `uuid FK` | `teachers.id` — admin who issued |
| `issued_by_name` | `text NOT NULL` | Denormalised — survives staff changes |
| `issued_by_signature_url` | `text` | Copied from teacher profile at issue time |
| `classification` | `text NOT NULL` | `'parent_communication'` \| `'external_official'` \| `'internal_administrative'` \| `'other'` |
| `recipient_type` | `text NOT NULL` | `'student'` \| `'teacher'` \| `'parent'` \| `'external'` |
| `internal_recipient_id` | `uuid` | FK to students or teachers; null when `recipient_type = 'external'` |
| `internal_recipient_table` | `text` | `'students'` \| `'teachers'`; null when external. Avoids a polymorphic FK. |
| `ext_recipient_name` | `text` | Free text; required when `recipient_type = 'external'` |
| `ext_recipient_org` | `text` | Organisation / body name; optional |
| `ext_recipient_address` | `text` | Multi-line address block; optional |
| `subject` | `text NOT NULL` | Letter subject line |
| `body` | `text NOT NULL` | Letter body (between salutation and sign-off) |
| `is_sensitive` | `boolean NOT NULL` | Issuer declaration — see Section 3. Default false. |
| `issued_date` | `date NOT NULL` | Default `CURRENT_DATE` |
| `academic_year_id` | `uuid FK` | Optional; for record-keeping |
| `ref_number` | `text` | Auto-assigned on insert (trigger or app logic) |
| `status` | `text NOT NULL` | `'draft'` \| `'pending_approval'` \| `'issued'` \| `'archived'`. Default `'issued'`. |
| `requires_approval` | `boolean NOT NULL` | Set by app logic at creation — see Section 4 |
| `approved_by` | `uuid FK` | Headmaster/principal id |
| `approved_by_name` | `text` | Denormalised |
| `approved_at` | `timestamptz` | |
| `pdf_url` | `text` | Supabase Storage URL; null until generated |
| `created_at` | `timestamptz NOT NULL` | Default `now()` |
| `updated_at` | `timestamptz NOT NULL` | Default `now()` |

```sql
-- Abbreviated CREATE for review
CREATE TABLE general_letters (
  id                       UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                UUID     NOT NULL REFERENCES schools(id),
  classification           TEXT     NOT NULL CHECK (classification IN (
                             'parent_communication', 'external_official',
                             'internal_administrative', 'other')),
  recipient_type           TEXT     NOT NULL CHECK (recipient_type IN (
                             'student', 'teacher', 'parent', 'external')),
  internal_recipient_id    UUID,    -- null when recipient_type = 'external'
  internal_recipient_table TEXT,    -- 'students' | 'teachers'
  ext_recipient_name       TEXT,    -- required when external
  ext_recipient_org        TEXT,
  ext_recipient_address    TEXT,
  subject                  TEXT     NOT NULL,
  body                     TEXT     NOT NULL,
  is_sensitive             BOOLEAN  NOT NULL DEFAULT false,
  status                   TEXT     NOT NULL DEFAULT 'issued',
  requires_approval        BOOLEAN  NOT NULL DEFAULT false,
  -- ... audit/PDF/approval columns as above
  CONSTRAINT external_recipient_check CHECK (
    recipient_type != 'external' OR ext_recipient_name IS NOT NULL
  )
);
```

> **Rationale for free-text classification vs. discipline's fixed categories:** Discipline's categories are a structural input to approval gating, AI-drafting blocks, and policy grounding lookups. General letters need none of that machinery — classification is purely for record-keeping and a single approval routing rule. A loose enumeration (CHECK constraint, not a separate lookup table) is sufficient and avoids premature taxonomy. If reporting needs expand, a lookup table can be added later.

---

## 3. Sensitivity Handling

Discipline's sensitivity model is a deterministic category blocklist: if the offense is `exam_malpractice` or `suspension`, AI drafting simply does not start. That model works because discipline has a small, fixed taxonomy. General letters have no such taxonomy.

### Primary control: upfront issuer declaration

Before the letter creation form reaches the body/AI-drafting step, the issuer is presented with a required binary question:

> **"Does this letter concern a sensitive personal matter?"**
> Health condition or medical information — Bereavement or family crisis — Family legal proceedings — Safeguarding concern — Other matter the subject would not expect to be read by a wider audience.

- **If Yes:** `is_sensitive = true` is stored. The "Draft with AI" button is not rendered. The body textarea is shown directly for manual entry. A visible notice explains why: *"Sensitive letters must be written manually to ensure the content is reviewed and approved by a person."*
- **If No:** `is_sensitive = false`. AI drafting is available on the non-sensitive path.

This puts the decision at an **explicit human moment** rather than relying on keyword detection or model judgment. It also creates an audit trail: `is_sensitive` is stored on the record. If a letter is later found to have been mis-declared, the record shows the issuer made a conscious choice.

> **Honest caveat — this is not equivalent to discipline's deterministic backstop.** Discipline's category blocklist catches sensitive cases regardless of user intent. The declaration above does not. A user who genuinely misunderstands what "sensitive" means, or who deliberately mis-declares, will not be caught by the system. The design shifts moral responsibility to the issuer and creates an audit record, but provides no technical guarantee that sensitive content will not reach the AI. Supervisors should not read this as equivalent safety — it is a lower but more scalable control appropriate for an open-ended domain.

### Secondary safeguard: soft model-side catch

The general-letter system prompt will include an instruction:

```
If the conversation reveals health information, bereavement, family legal matters,
safeguarding concerns, or other deeply personal information about a named individual,
pause before drafting and respond: "This content may involve a sensitive personal matter.
If so, please close this session, re-open the letter, and select Yes at the sensitivity
question so the letter is composed manually." Do not produce a full draft until the user
has confirmed the matter is not sensitive.
```

This is explicitly best-effort. The model may not reliably detect all sensitive framings, especially when information is implied rather than stated directly. The instruction costs nothing and will catch obvious cases, but is not a guarantee and is not presented as one.

---

## 4. Approval Routing

The existing `requires_approval` column and principal-approval flow from the discipline module are reused unchanged. Logic for setting `requires_approval` at creation time:

| Classification | Recipient type | Approval required | Reasoning |
|---|---|---|---|
| `external_official` | external | **Yes** | Represents the school to GES, other schools, district office, inspectors. Can be cited; creates third-party paper trail. The headmaster should know about every one. |
| `parent_communication` | student / parent | **No** | Routine contact. Requiring approval for every parent letter creates meaningful overhead in a small school. Sensitive ones are manually drafted anyway. |
| `parent_communication` + `is_sensitive` | any | **Consider** | Open question — see Section 6. A case can be made that any sensitive letter warrants a review step; counter-argument is that manual drafting itself is the control. |
| `internal_administrative` | teacher / internal | **No** | Internal memo between staff. Low stakes; the issuer is accountable. |
| `other` | any | **No (default)** | Catch-all. Could expose a "flag for approval" checkbox at creation time if needed. |

The approval UI (pending_approval status badge, approve-and-issue button, principal view) is copied from the discipline letter detail panel. No new UI primitives are required.

---

## 5. Letterhead and PDF

The existing `PrintLetterModal` handles school letterhead, issued-by signature, and Puppeteer PDF generation. Two targeted changes are needed:

### 1. External recipient address block in PrintLetterModal

Add `recipientType: 'external'` to the union type. When external, render a formal address block above the salutation (recipient name, organisation, address, date), standard business-letter format. `buildLetterHTML()` gets one additional branch — no restructuring of the existing student/teacher branches.

### 2. Salutation logic

- Internal recipients: existing `"Dear [FirstName],"` logic.
- External: `"Dear [ext_recipient_name],"` falling back to `"Dear Sir/Madam,"` if name is absent. The `firstName()` helper is not appropriate for external recipients — a GES director should be addressed as `"Dear [Full Name],"` not `"Dear Kofi,"`.

### 3. PDF route

New route `POST /api/general-letters/:id/pdf` following the same Puppeteer pattern as discipline. The HTML template reuses the same `PrintLetterModal` `buildLetterHTML()` function — no duplication of letterhead rendering logic.

---

## 6. Build Order

Phased to get the data model right before adding AI or PDF complexity, and to allow early user testing of the core flow.

**Phase 1 — Schema + basic CRUD (no AI, no PDF)**
Create `general_letters` table. Backend CRUD route. Minimal UI: create/list/view letters with a plain body textarea. Sensitivity declaration field present and stored but AI path not yet wired. Purpose: validate the recipient model and classification schema against real admin use before building on top of it.

**Phase 2 — AI drafting (non-sensitive path)**
Extend `letter-chat.js` with `document_type = 'general_letter'`. Write the system prompt branch and opening message. Wire the "Draft with AI" button, gated on `is_sensitive = false`. Sensitivity declaration shown upfront with hard disable of AI when Yes. `stripMarkdown()` post-processor is inherited automatically.

**Phase 3 — PDF and letterhead**
Extend `PrintLetterModal` with external recipient type and address block. Add the PDF generation route. Salutation logic for external recipients. Preview-before-issue button in the letter detail view.

**Phase 4 — Approval workflow for external_official**
Set `requires_approval = true` for `external_official` classification at creation. Status transitions: `pending_approval → issued`. Principal view with approve-and-issue button. Copied from the discipline approval flow; no new primitives.

> **What is intentionally deferred:** RAG/policy grounding. The discipline module grounds AI drafts against GES policy passages — directly relevant when the AI is helping write a query about teacher absenteeism citing GES section numbers. General letters are situational correspondence where GES citation is rarely required. Grounding adds embedding cost and latency; defer until a concrete use case justifies it.

---

## 7. Open Questions — For Supervisor Review

1. **Sensitive letter approval:** Should `is_sensitive = true` letters require headmaster approval regardless of classification, or is manual drafting alone a sufficient control? If approval is added, this doubles the friction on an already-friction-heavy path (manual draft + approval), which may discourage proper flagging.

2. **Letter lifecycle for parent communications:** Teacher queries have an acknowledgement/response/resolve lifecycle. Should parent letters track acknowledgement (e.g. "parent received and signed")? If yes, this needs a status extension in Phase 1, not retrofitted later.

3. **External recipient directory:** Free-text external recipient fields are flexible but risk typos on official letters to GES or district offices. Should there be a lightweight saved-contacts list (name, org, address) the issuer can pick from? Recommended for Phase 1 consideration, not deferral — retrofitting a lookup into the creation flow after launch is disruptive.

4. **Email delivery:** Should letters be sendable directly from the system (email to parent or external party), or always print/download only? Email delivery requires integration with the existing email service and raises questions about delivery receipts and logged consent. Recommend explicitly out of scope for the initial build.

5. **Who can issue general letters:** Discipline letters are admin-only. Should general letters be issuable by form teachers (for parent communications) or only admins? The `adminOnly` middleware is one line — but the policy decision has implications for approval routing and audit.

---

*CAS Engineering — General Correspondence Module Design v0.1 — 2026-09-05*
