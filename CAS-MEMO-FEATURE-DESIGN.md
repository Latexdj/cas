# Memo Feature — Design Document

## Part 1 — Research: how the existing letter infrastructure actually works

### 1.1 The shared AI-chat drafting pipeline

One table, one route file, three document types today:

```sql
CREATE TABLE letter_draft_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('teacher_query','student_letter','general_letter')),
  metadata      JSONB NOT NULL DEFAULT '{}',
  messages      JSONB NOT NULL DEFAULT '[]',
  finalized_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

`backend/src/routes/letter-chat.js` is the single chat engine for all three:

- `POST /start` — validates `document_type`, runs a sensitivity gate (`isBlocked()` for student letters; a DB-read `is_sensitive` check for general letters), optionally fetches grounding (RAG or manually-tagged policy clauses — **skipped entirely for `general_letter`**, since it needs no policy citation), inserts the session row, returns an opening message built by `openingMessage(documentType, metadata)`.
- `POST /:session_id/message` — rebuilds the system prompt per-turn (`buildSystemPrompt`), calls `claude-haiku-4-5-20251001`, strips markdown and conversational framing (`stripMarkdown`, `stripConversationalFraming` — both regex-based cleanup the model still occasionally needs despite prompt instructions), appends to `messages` jsonb.
- `PATCH /:session_id/finalize` — freezes the session; no more messages accepted.

`buildSystemPrompt` has one branch per `document_type` (`student_letter`, `general_letter`, else `teacher_query`), each specifying: what context to inject, what the model must NOT include (date/ref/address/signature — "the system handles those"), what facts to gather before drafting, and a document-specific tone/safeguard. All three then get the same tail: a `returnReasonBlock` (if the letter was returned for correction, so the model sees why), a shared `formatAndToneRule` (no markdown, no em dashes, no AI-filler phrases), and shared `OUTPUT DISCIPLINE` rules (no "Here is the draft" lead-ins, no "Let me know if this works" sign-offs). `general_letter` additionally gets a `SENSITIVITY SAFEGUARD` clause telling the model to pause and ask the user to mark the letter sensitive if health/bereavement/safeguarding content surfaces.

**Memo reuses this file directly** — one more `document_type: 'memo'` branch in `buildSystemPrompt` and `openingMessage`, nothing structural changes.

### 1.2 The two existing letter tables and their status machine

`general_letters` (admin/management → student, teacher, parent, or external) and `student_disciplinary_letters` in `discipline.js` (admin → student, disciplinary) are separate tables but share one status machine: `draft → pending_approval | issued`, then optionally `→ returned → pending_approval` again via resubmission, or `pending_approval → issued` via approval.

For `general_letters`, whether approval is required is computed, not chosen:

```js
function computeRequiresApproval(classification, is_sensitive) {
  return classification === 'external_official' || is_sensitive === true;
}
```

So today, **3 of 4 general-letter classifications already skip approval entirely**: `parent_communication`, `internal_administrative`, and `other` all go straight from draft to `issued`. Only `external_official` (or anything manually flagged sensitive) requires a management sign-off. This matters directly for Memo's design (§2.3).

For `student_disciplinary_letters`, approval is required for `letter_type ∈ {suspension, dismissal, final_warning}` — sanctions carrying real weight. A `warning` letter, by contrast, issues immediately.

The return/resubmit machinery is shared, generic code, not duplicated per table: `backend/src/services/letterApproval.service.js` exports `returnLetterForCorrection`, `resubmitLetter`, `getReturnHistory`, each taking a `table` string literal and `documentType` string as parameters. Returning a letter also **revives its AI chat session** — extends `expires_at` if still alive, or seeds a brand-new session from the current draft body if the old one expired, so the issuer never lands on a dead session after correction is requested. All of this writes to one shared audit table:

```sql
CREATE TABLE letter_returns (
  ...
  document_type TEXT NOT NULL CHECK (document_type IN ('student_letter','general_letter')),
  letter_id     UUID NOT NULL,
  reason        TEXT NOT NULL,
  returned_by_name TEXT,
  ...
)
```

### 1.3 PDF generation

`backend/src/services/pdf.service.js`'s `buildLetterHTML({ letter, school, recipientType, letterKind, watermark })` is the single template function behind every letter PDF. It renders a shared letterhead (`renderLetterhead` — either the school's uploaded letterhead image, or a generated header from name/motto/address), a shared watermark ("PENDING APPROVAL", diagonal, only when `watermark: true`), then branches on `recipientType`:

- `'external'` — full business-letter block (name/title/org/address), `RE: {subject}` centered, optional salutation only if a personal name exists (a title-only addressee like "THE PTA CHAIRMAN" gets no forced "Dear Sir/Madam,").
- `'student'` / `'teacher'` (the only other branch today) — `To: {name}`, centered subject, `Dear {first name},`.

The signoff (`renderSignoff`) also branches on `letterKind`: `letterKind === 'general'` gets a right-aligned signature block with the issuer's personal title and optional `THROUGH:`/`cc:` lines (added for general correspondence specifically); anything else keeps the original flush-left "Yours faithfully, / [signature] / [Name] / [School Name]" block used by discipline/query letters. **Both branches print the headmaster's signature and name, never the actual drafting admin's** — `issued_by_signature_url` is set to `headmaster_signature_url` at creation time in every existing flow; the drafting admin's identity is tracked separately as `issued_by_name` for the in-app UI only.

`generateAndUploadPDF({ letter, school, recipientType, letterKind, watermark, pathPrefix })` wraps this with image resolution (signature/letterhead → data URIs) and a Puppeteer render-to-PDF-then-upload step, returning a Supabase public URL.

**Neither `recipientType` value fits a memo.** A memo has no single named addressee — it goes to an audience ("ALL STAFF", "MATHEMATICS DEPARTMENT"). This needs a new branch (§3.4), not a fit into the existing two.

### 1.4 Delivery — two notification systems exist, and only one is actually wired to what a teacher sees

This surprised me enough to flag explicitly. There are **two separate, non-overlapping notification tables**:

**`teacher_notifications`** (`school_id, teacher_id, title, message, read`) — written by `discipline.js` and `exam-scores.js`, read via `GET /api/notifications` (`backend/src/routes/notifications.js`). Simple, teacher-scoped only.

**`notifications`** (`school_id, user_id, user_type, message, link, is_read`) — the newer, general-purpose table. `user_type` supports `teacher|admin|student|management`, and it carries a `link` field for click-through navigation. It's read via `GET /api/result-submissions/notifications` (defined inside `result-submissions.js`, an organizational quirk — the route doesn't belong there by name, it's just where it happened to be added).

**`TeacherShell.tsx`'s bell icon polls the second one** (`/api/result-submissions/notifications`, confirmed from Phase 3 work this session) — not `teacher_notifications`. This means anything inserted into `teacher_notifications` today (discipline query notices, exam-score notices) is **not** surfaced through the teacher shell's actual visible bell UI unless something else also polls `/api/notifications` — worth a separate look outside this design doc's scope, but directly relevant to Memo: **Memo delivery must use the `notifications` table** (`user_type: 'teacher'`, `link` pointing at the memo), not `teacher_notifications`, or it will silently never appear to anyone.

### 1.5 Staff-grouping data already available

No new grouping concept is needed. Four usable primitives already exist:

- **`departments`** (`id, school_id, name, head_teacher_id, clearance_enabled`) + **`department_teachers`** (`department_id, teacher_id`, join table) — structured, explicit department membership. This is the right primitive for "specific department," not the looser free-text `teachers.department` column used elsewhere for display/reporting.
- **`teacher_responsibilities`** (`id, school_id, name, description, module_key`) + **`teacher_responsibility_assignments`** (`teacher_id, responsibility_id`) — role-based groupings (e.g. HOD, Housemaster, Librarian — this is the same table `isLibraryTeacher`/`isHod` checks in `TeacherShell.tsx` already read from, per this session's Phase 3 work).
- **`teachers.management_role`** — principal/vice_principal flag, usable for a "Management only" distribution if ever needed.
- Plain **`teachers`** rows filtered by `status = 'Active'` — the "all staff" case.

### 1.6 Module licensing

Already confirmed directly in code, not inferred from the registry description alone:

```js
// discipline.js, general-letters.js, letter-chat.js — all three:
router.use(authenticate, requireActiveSubscription, checkModuleAccess('discipline'));
```

`MODULE_REGISTRY`'s `discipline` entry is literally labeled `'Administration'`, described as `'Disciplinary letters, general letters, and letter drafting/chat'` — this key already is the "whole Administration product line" bucket, not a discipline-specific one that happens to also cover letters as an afterthought.

---

## Part 2 — What Memo actually needs

### 2.1 Fields

A memo has no external-recipient concept at all — no salutation, no `Through:`/`cc:`, no recipient address block. What it needs instead:

| Field | Notes |
|---|---|
| `distribution_type` | `'all' \| 'department' \| 'responsibility' \| 'specific'` |
| `distribution_ref` | department id / responsibility id / array of teacher ids, depending on type — `null` for `'all'` |
| `audience_label` | **frozen at issue time**, e.g. `"ALL STAFF"`, `"MATHEMATICS DEPARTMENT"`, `"ALL HOUSEMASTERS"` — printed on the PDF and shown in the admin list. Frozen so a later department rename or a teacher's later responsibility change never rewrites what a historical memo says it was addressed to (same principle `general_letters` already applies by freezing `ext_recipient_name`/`ext_recipient_org` rather than joining live to `external_contacts`). |
| `subject` | required, same as every other letter type |
| `body` | drafted via the shared AI chat, same as every other letter type |
| `issued_date` | same pattern as `general_letters.issued_date` |
| issuer identity | `issued_by_id`, `issued_by_name`, `issued_by_title` — **no signature image** (see below) |

**No signature image for memos — this is a deliberate departure from every other document type in this pipeline.** Every existing letter type (§1.3) prints the headmaster's signature regardless of who actually drafted it, because they're all headmaster-authorized correspondence. A memo is different: its entire point is knowing *which office* issued it — Accountant, Domestic Bursar, Assistant Headmaster Academics, Assistant Headmaster Administration, Assistant Headmaster Domestic, an HOD — not routing every internal circular through one signature that doesn't represent who actually sent it. So a memo's signoff is name + office/title only, no image, no `issued_by_signature_url` column at all.

**`issued_by_title`'s source — researched directly, not assumed.** No office like "Accountant" or "Domestic Bursar" is modeled anywhere in the system today:
- `teachers.management_role` exists, but the admin UI that sets it hard-types it to `'principal' | 'vice_principal'` only (`app/(dashboard)/management/page.tsx`) — never anything else in practice, despite the DB column itself having no CHECK constraint.
- `school_staff_roles.role` is CHECK-constrained to four *functional permission* keys — `'clearance','library','inventory','accounts'` — not display titles. `'accounts'` grants fee-collection access; it is not stored or shown anywhere as the string "Accountant."
- `teacher_responsibilities` is free-text per school, but scoped to cross-cutting duties (HOD, Housemaster) — not senior-office titles, and nothing in the schema associates one specific responsibility with one specific person the way a job title would.
- `general_letters.issued_by_title` — direct precedent for the fallback below — is captured fresh as a manual free-text field on every letter at creation time (`issued_by_title?.trim() || null` in `general-letters.js`'s `POST /`), never read from or written back to a persistent profile field.

**Recommendation**: auto-fill `issued_by_title` when the issuing user has a `management_role` (`'principal'` → "Principal", `'vice_principal'` → "Vice Principal", via the existing `getRoleLabel()`), otherwise fall back to a manual free-text field on the intake form — pre-filled with whatever was typed last time for that issuer, to avoid re-typing "Accountant" or "Domestic Bursar" on every memo, but always editable. Given the research above, the free-text fallback will in practice be the common path for exactly the offices named in this correction (Accountant, Domestic Bursar, the three Assistant Headmaster roles) — none of them has anything to auto-fill from today.

### 2.2 Who can issue

**Recommendation: admin or management — identical to `general_letters`.** Reuse the existing `adminOrManagement` middleware verbatim (it's a small inline function in `general-letters.js`; worth promoting to a shared helper the moment a third route needs it, which Memo now is — see §3.5). No reason for a memo to have a different issuer population than a general letter; both are "official word from the school administration to somebody," a memo just has a different somebody.

### 2.3 Approval — recommendation: no approval step at all

The instruction asks me to recommend, not leave open, so: **Memo publishes directly once finalized. No `pending_approval` state, no return-for-correction loop, no `letter_returns` integration.**

Reasoning: `general_letters`' own approval trigger is `classification === 'external_official' || is_sensitive`. A memo is internal by definition — it has no external-recipient concept to even classify as `external_official` (§2.1) — and is designed for routine staff circulars, not disciplinary sanctions or legally exposed correspondence. It sits squarely in the same bucket as `general_letters`' own `internal_administrative` classification, which **already skips approval today**. Building an approval path for Memo would be inventing stricter process for a document type that's structurally the least sensitive of the four (teacher_query, student_letter, general_letter, memo) — the opposite of what the risk profile calls for.

This has a real simplification payoff: no `letter_returns.document_type` CHECK constraint change needed, no session-revival wiring, no `resubmitLetter` integration, no "returned" UI state on the teacher-facing memo list. Status is just `draft → issued`.

*(If experience later shows a real need — e.g. a principal wanting sign-off before a memo goes out under their name — that's a small, additive change: add `requires_approval`/`pending_approval` following the exact `general_letters` pattern. Nothing in this design forecloses it; it's just not justified on day one.)*

### 2.4 Delivery

**Recommendation: both a teacher-facing "Memos" page and PDF, notification-driven, not PDF-only.**

- At issue time, resolve `distribution_type`/`distribution_ref` into a concrete list of active teacher IDs and insert one row per recipient into a new `memo_recipients` table (§3.2) — a snapshot, not a live-joined query, for the same historical-accuracy reason `audience_label` is frozen (§2.1).
- For each resolved recipient, insert one row into the **`notifications`** table (§1.4) — `user_type: 'teacher'`, `message: "New memo: {subject}"`, `link: /teacher/memos/{id}`. This is what actually reaches the bell icon teachers already look at; `teacher_notifications` would not.
- A new **"Memos"** nav item + page in the teacher shell, listing memos where the current teacher has a `memo_recipients` row, each offering "View" (in-app) and "View PDF."
- `memo_recipients.read_at` is set the first time a teacher actually opens a memo's detail view — deliberately separate from the notification's own `is_read` (dismissing the bell dropdown is not the same signal as "opened and read the circular," and a "163/180 staff have read this" receipt view is a natural, cheap thing to offer the issuer later since the join table already carries it for free).

---

## Part 3 — Schema design

### 3.1 New table: `memos`

Not a reuse of `general_letters` — the field shape genuinely diverges (§2.1: no recipient/salutation/Through/cc columns at all, plus `distribution_type`/`distribution_ref`/`audience_label` that `general_letters` has no equivalent of), and cramming both into one table means every memo row carries seven always-NULL external-recipient columns and every general-letter row carries three always-NULL distribution columns. A dedicated table is the cleaner option `general_letters` vs. `student_disciplinary_letters` already established as precedent — this codebase already prefers one table per document shape over one mega-table with optional columns.

```sql
CREATE TABLE memos (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  issued_by_id             UUID REFERENCES teachers(id) ON DELETE SET NULL,
  issued_by_name           TEXT,
  issued_by_title          TEXT,   -- auto-filled from management_role when present, else manual free text (§2.1)
  distribution_type        TEXT NOT NULL CHECK (distribution_type IN ('all','department','responsibility','specific')),
  distribution_ref         JSONB,             -- department id / responsibility id / teacher id array; null for 'all'
  audience_label           TEXT NOT NULL,     -- frozen display string, e.g. "ALL STAFF"
  subject                  TEXT NOT NULL,
  body                     TEXT NOT NULL DEFAULT '',
  issued_date              DATE,
  ref_number               TEXT,
  pdf_url                  TEXT,
  draft_session_id         UUID REFERENCES letter_draft_sessions(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Ref numbering: **its own counter**, `schools.memo_ref_counter` (mirroring `letter_ref_counter`), producing `{prefix}/MEMO/{year}/{seq}` — kept independent of `letter_ref_counter` so memo numbering runs its own sequence (the real-world convention: "Memo No. 4 of 2026" is its own series, not interleaved with official correspondence reference numbers).

### 3.2 New table: `memo_recipients`

```sql
CREATE TABLE memo_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id     UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (memo_id, teacher_id)
);
CREATE INDEX idx_memo_recipients_teacher ON memo_recipients(teacher_id);
```

### 3.3 One existing-schema migration required

`letter_draft_sessions.document_type` has a hard `CHECK` constraint limited to the three existing values. Adding `memo` needs an explicit migration, not just "pass a new string" — Postgres will reject the insert otherwise:

```sql
ALTER TABLE letter_draft_sessions DROP CONSTRAINT IF EXISTS letter_draft_sessions_document_type_check;
ALTER TABLE letter_draft_sessions ADD CONSTRAINT letter_draft_sessions_document_type_check
  CHECK (document_type IN ('teacher_query','student_letter','general_letter','memo'));
```

(Postgres's default auto-generated constraint name for an inline `CHECK` follows the `{table}_{column}_check` pattern, so this is safe without having to look up the live name first — but worth confirming against the actual DB before running it, the same way this session's earlier phases verified assumptions against real data before writing.)

Because Memo has no approval step (§2.3), **`letter_returns.document_type`'s CHECK constraint does not need to change.**

### 3.4 `pdf.service.js` changes

A memo isn't a letter-shaped document — it has no salutation and no single addressee — so `buildLetterHTML` needs a genuine third branch, not a variant of the `'student'`/`'teacher'` one:

```
TO:      {audience_label}
FROM:    {issued_by_name}{issued_by_title ? `, ${issued_by_title}` : ''}
DATE:    {issued_date}
REF:     {ref_number}
SUBJECT: {subject}
──────────────────────────
{body}
```

...followed by a new, minimal signoff — **not** `renderSignoff` reused, a fresh block, since every existing signoff branch prints "Yours faithfully," plus a signature image (§1.3), and a memo needs neither:

```
{issued_by_name}
{issued_by_title}
```

No "Yours faithfully" — that's a letter's complimentary close; a memo's TO: header block already establishes its own register, closing it with letter framing would read oddly. No signature image, by design (§2.1) — the office/title *is* the authority marker for a memo, the way a signature is for a letter. No personal salutation ("Dear X,") either — that's also a letter convention; the memo's TO: line already states the audience, matching how real interoffice memos are actually formatted (header block, not address-block-plus-greeting). This is a genuine, if small, new render path in `buildLetterHTML`, not a parameter tweak to an existing one — `recipientType` gains a `'staff'` value alongside `'external'`/`'student'`/`'teacher'`, and it does not call `renderSig`/`renderSignoff` at all.

### 3.5 Shared middleware promotion

`adminOrManagement` is currently a small private function inside `general-letters.js`. With a third file (`memos.js`) needing the identical check, it's worth promoting to `backend/src/middleware/auth.js` alongside the existing `adminOnly`/`managementOnly`/`adminOrManagement`-shaped exports (checked — `discipline.js`/`general-letters.js` currently each define their own local copy; a shared one removes the last duplication rather than adding a third). Small, mechanical, zero behavior change.

---

## Part 4 — Module licensing: recommendation

**Memo is gated by the existing `discipline` key. No new module key.**

`MODULE_REGISTRY`'s `discipline` entry is already labeled `'Administration'` and already described as covering "disciplinary letters, general letters, and letter drafting/chat" — Memo is the same product line, issued through the same chat engine, by the same admin/management population, under the same "Administration" umbrella a school already licenses as one unit. Splitting Memo into its own toggle would fragment one coherent, already-named product into two licensing decisions with no evident business reason — a school buying "Administration" reasonably expects memos included, the same way it expects general correspondence and discipline letters included. Add `router.use(authenticate, requireActiveSubscription, checkModuleAccess('discipline'))` to the new `memos.js` router, identical to the other three files — no registry change needed at all.

---

## Part 5 — AI-chat drafting: what's different for Memo

A new `document_type === 'memo'` branch in `buildSystemPrompt`, modeled directly on the `general_letter` branch's shape but simplified:

- **Context block**: audience (`audience_label`), subject — no recipient-type branching (a memo only ever has one shape of audience-description, not four like general letters' external/parent/student/teacher).
- **Role**: draft the body only, between the header block and sign-off — same "the system handles the rest" framing.
- **No grounding/RAG** — matches `general_letter`'s `mode: 'none'` exactly; a staff circular doesn't cite disciplinary policy clauses.
- **No sensitivity safeguard clause** — per the brief's own framing, and because a memo's very purpose (routine internal circulars: meeting schedules, policy reminders, holiday notices) makes it structurally unlikely to encounter personal/health/safeguarding content the way a letter *to* or *about* a specific person can. This is a low-stakes, reversible assumption — a one-line prompt addition later if real usage shows otherwise, not something to gate the whole design on.
- **Shared, unchanged**: `formatAndToneRule`, `OUTPUT DISCIPLINE` rules, `stripMarkdown`, `stripConversationalFraming`, `returnReasonBlock` (moot here since Memo has no return flow, but harmless to leave the shared tail as-is rather than special-casing its absence).

`isBlocked()` in `letterSensitivity.js` already returns `false` for any `documentType !== 'student_letter'` — **no change needed there at all**; Memo is automatically never blocked.

---

## Part 6 — Frontend

### 6.1 Admin/management issue flow

A new `memos.js` backend route file (mirroring `general-letters.js`'s route shape: `GET /`, `POST /` with `status: 'draft'` pre-create for the chat flow, `PATCH /:id/finalize`, `POST /:id/pdf`, `GET /:id`) and a new admin-portal page, `app/(dashboard)/memos/page.tsx`, structured like `general-letters/page.tsx`: an intake form (distribution picker + issuing title + subject) → chat drafting panel (reusing the same `letter-chat` calls) → finalize → PDF generation → list view.

- Distribution picker: All Staff / Department (dropdown from `departments`) / Responsibility (dropdown from `teacher_responsibilities`) / Specific staff (multi-select from `teachers`).
- Issuing title field: auto-filled and read-only when the issuer has a `management_role` (Principal/Vice Principal); otherwise a free-text input, pre-filled with that issuer's last-used value so "Accountant" or "Domestic Bursar" doesn't need retyping on every memo, but always editable (§2.1).
- No signature upload/selection step anywhere in this flow — there is nothing to pick.

### 6.2 Teacher-facing "Memos" page

New `app/teacher/memos/page.tsx` + nav item in `TeacherShell.tsx`'s `NAV_ITEMS`, tagged `module: 'discipline'` (consistent with this session's Phase 3 audit fix — every item gated by an actual `checkModuleAccess` call gets tagged, nothing else). Lists memos from `memo_recipients` joined to `memos` for the current teacher, each row offering "View" and "View PDF," marking `read_at` on open.

### 6.3 The final build phase: "Administrative Activities" sidebar grouping

Today `Sidebar.tsx`'s `Section` type (`{ label: string; items: NavItem[] }`) has **no collapse/expand state at all** — every section always renders fully open, a label is just a visual divider. Grouping Discipline + Correspondence + Memo under one collapsible "Administrative Activities" section is therefore a genuinely new interaction pattern for this sidebar, not a relabeling: `Section` needs an optional `collapsible?: boolean` (or a dedicated nested-group type) plus expand/collapse UI state, most simply `localStorage`-persisted per admin so the choice sticks across reloads (matching how this codebase already treats per-viewer UI preferences as local, disposable state rather than a server-side setting). Scoped correctly, this is a small, isolated change to `Sidebar.tsx` alone — no backend involvement — and ships last, once Memo itself is live and verified, per the brief's own framing.

---

## Proposed phased build order

1. **Schema**: `memos`, `memo_recipients` tables; `schools.memo_ref_counter` column; `letter_draft_sessions.document_type` CHECK migration (§3.3).
2. **Backend core**: `memos.js` route file (create-draft/finalize/list/get), distribution-resolution helper (`distribution_type`/`distribution_ref` → concrete teacher ID list + frozen `audience_label`), `memo_recipients` + `notifications` fan-out on issue.
3. **AI chat integration**: `memo` branch in `letter-chat.js`'s `buildSystemPrompt`/`openingMessage`; confirm `isBlocked()` needs no change (§5).
4. **PDF**: `'staff'` recipientType branch in `buildLetterHTML` (§3.4); wire `generateAndUploadPDF` call in `memos.js`.
5. **Admin frontend**: `app/(dashboard)/memos/page.tsx` (intake, chat, list) + Sidebar tag.
6. **Teacher frontend**: `app/teacher/memos/page.tsx` + `TeacherShell.tsx` nav item + notification link verified end-to-end (issue a memo → confirm it lands in the teacher's actual bell, not just the DB).
7. **Final pass**: "Administrative Activities" collapsible sidebar grouping (Discipline + Correspondence + Memo) in `Sidebar.tsx`.

---

## Open questions requiring your decision

1. **Approval workflow** (§2.3): recommendation is **no approval step, ever** — memo is structurally the least sensitive of the four document types and already matches `general_letters`' own no-approval majority case. Needs your sign-off since it's a process decision, not a technical one.
2. **Module licensing** (§4): recommendation is **reuse the existing `discipline` key**, no new registry entry. Flagging for sign-off since it's a monetization/bundling decision (does "Administration" as sold to schools include memos, or should it be priced/toggled separately later).
3. **Distribution types on day one**: this design proposes all four (`all`/`department`/`responsibility`/`specific`) at once, since the underlying data for all four already exists (§1.5) and none is harder to build than another. If you'd rather ship a narrower first cut (e.g. `all` + `department` only, `specific` added later), that's a scope call for you, not a technical constraint.
4. **Sensitivity safeguard in the AI prompt** (§5): recommendation is to omit it entirely for Memo. Low-stakes and reversible, but noting it since it's a deliberate omission from a pattern every other document type in this pipeline has.
5. **Read-receipt visibility**: `memo_recipients.read_at` (§2.4) makes a "163/180 staff have read this" view essentially free to add for the issuer. Not in the phased build order above since it wasn't asked for, but worth a yes/no now rather than retrofitting later, since it changes nothing about the schema either way — it's purely whether phase 5's admin UI surfaces that count.
