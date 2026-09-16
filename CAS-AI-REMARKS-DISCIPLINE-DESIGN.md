# CAS AI-Assisted Remarks and Discipline: Design Document

Prepared for review with project supervisor before implementation begins.
Date: 2026-09-04

---

## Part 1 -- Codebase Research Findings

### 1.1 Report remarks data model

There are four remark-related tables. All remark text columns are unconstrained `TEXT`. No remark bank or standard-phrase table exists anywhere in the codebase.

**Primary school: `primary_report_remarks`**
(`index.js` lines 1498-1516)

One row per student per term (primary has 3 terms per year).

| Column | Type | Purpose |
|---|---|---|
| `class_teacher_remarks` | TEXT | Teacher-authored free text |
| `headmaster_remarks` | TEXT | Headmaster counter-remark, set during approval or rejection |
| `affective_ratings` | JSONB | Structured domain ratings (punctuality, neatness, co-operation, etc.) -- keys defined in frontend, not validated server-side |
| `status` | TEXT (CHECK) | `draft`, `submitted`, `approved`, `rejected` |

Four-state workflow enforced at DB level with a CHECK constraint and route-level guards:
- Class teacher: POST /api/primary/reports/remarks (creates/updates draft) -> PUT /reports/:id/submit
- Headmaster/admin: PUT /reports/:id/approve (adds headmaster_remarks) OR PUT /reports/:id/reject

**Secondary school overall: `report_remarks`**
(`index.js` lines 645-656)

One row per student per semester (2 semesters per year). No workflow state -- saved immediately on POST.

| Column | Type | Purpose |
|---|---|---|
| `attitude` | TEXT | Free-text string (not categorical despite the name) |
| `conduct` | TEXT | Free-text string |
| `general_remarks` | TEXT | Free-text overall teacher remark |

Two entry paths: `POST /api/form-teacher/remarks` (form teacher), `POST /api/results/remarks` (admin only).

**Secondary school per-subject: `subject_remarks`**
(`index.js` lines 1266-1279)

One row per student per subject per semester. No workflow state.

| Column | Type | Purpose |
|---|---|---|
| `remarks` | TEXT | Subject teacher's free-text remark for this student |

Entry path: `POST /api/assessments/subject-remarks` (assessments.js lines 198-244), runs inside a transaction.

**Imported results: `results_import`**
Contains a `remarks TEXT` column populated by CSV/Excel upload (e.g., "PASS", "CREDIT"). Not manually entered; out of scope for this feature.

**Grade labels: `grade_boundaries`**
Contains a `remark TEXT` column (e.g., "EXCELLENT") as a grade-band label. Not a per-student remark.

### 1.2 Current entry flows

**Primary** (primary.js lines 2041-2143): Full workflow. Teacher POSTs a draft with `{ student_id, term_id, class_teacher_remarks, affective_ratings }`. No validation on remark text beyond `|| null` coercion. Non-admin teachers must be the assigned class teacher for that student's class. Draft moves through submit -> approve/reject.

**Secondary overall** (form-teacher.js lines 188-212, results.js lines 477-494): Bulk upsert via an array `remarks: [{ student_id, attitude, conduct, general_remarks }]`. No validation on text. No workflow states; saved immediately. Form teacher for the class or admin only.

**Secondary per-subject** (assessments.js lines 198-244): Bulk upsert via `remarks: [{ student_id, remarks }]`. Runs inside a DB transaction. Non-admins validated as the teacher assigned to teach that subject to that class via the timetable table. No workflow states.

### 1.3 Data available for AI context

**Primary** -- all of the following are available in the student report GET response at remark-entry time:
- Subject scores per term: `class_score`, `exam_score`, `total`, `grade`, `position` (per subject)
- Overall class position and class size (computed at query time)
- Grand total across all subjects
- Term attendance: `present_days`, `absent_days`, `late_days`, `total_marked`
- Prior-term trend: NOT available (no cross-term query is made)
- Standard remark bank: does not exist

**Secondary overall** -- the form-teacher remarks GET returns only the existing attitude/conduct/general_remarks text. Scores, position, and attendance are NOT bundled; they require separate API calls.

**Secondary per-subject** -- subject-remarks GET returns only student code, name, and existing remarks text. Score for that subject is NOT bundled.

Implication for the AI drafting feature: the primary implementation already has what it needs at the point of remark entry. The secondary implementation needs a data-enrichment step (fetch scores + attendance alongside the remark entry view) before AI drafting can have useful context.

### 1.4 Discipline module -- what exists

The discipline module exists fully implemented as code. It has two tables and a full set of routes in `discipline.js` mounted at `/api/discipline`.

**`teacher_queries`** (index.js lines 2151-2174):
Formal written queries issued to teachers by administration.

| Column | Purpose |
|---|---|
| `category` | `absenteeism`, `misconduct`, `insubordination`, `negligence`, `poor_performance`, `other` |
| `subject` / `body` | Letter subject line and body text |
| `status` | `issued`, `acknowledged`, `responded`, `resolved`, `escalated` |
| `teacher_response_text` / `teacher_response_file_url` | Teacher's reply and uploaded response document |
| `resolution_notes` | Admin notes at resolution |
| `ref_number` / `issued_by_signature_url` | Auto-generated reference, signature |

**`student_disciplinary_letters`** (index.js lines 2179-2202):
Formal disciplinary letters issued to students.

| Column | Purpose |
|---|---|
| `letter_type` | `warning`, `final_warning`, `suspension`, `dismissal`, `other` |
| `offense_category` | `lateness_absenteeism`, `fighting_assault`, `exam_malpractice`, `substance_use`, `insubordination`, `theft_damage`, `bullying_harassment`, `indecent_behavior`, `vandalism`, `other` |
| `subject` / `body` | Letter subject line and body text |
| `status` | `issued`, `acknowledged`, `resolved` |
| `ref_number` | Auto-generated reference number |

Route access: `teacher_queries` accessible to admins (all) and the named teacher (own). `student_disciplinary_letters` are `adminOnly` for all operations including viewing.

What does NOT exist in the current discipline module:
- Bond of Undertaking / Undertaking form templates
- Incident log table (narrative per incident, separate from the formal letter)
- Suspension tracking (date, duration, return-to-school record)
- Pattern/escalation detection logic
- Student-facing view of their own letters

The Bond of Undertaking documents referenced in the brief are currently drafted outside the platform (presumably as standalone Word documents). Adding AI assist to that flow means first deciding whether the bond documents are generated from CAS or remain external.

### 1.5 AI API integration -- current state

CAS makes no AI API calls. No AI SDK of any kind is present in `backend/package.json`. The backend depends on: `@supabase/supabase-js`, `bcrypt`, `cors`, `csv-parse`, `dotenv`, `exceljs`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `multer`, `node-cron`, `pg`, `qrcode`, `xlsx`. This is a net-new integration for both features.

### 1.6 Document generation -- current state

CAS has no PDF or Word document generation capability. It does use `exceljs` and `xlsx` to generate downloadable `.xlsx` spreadsheets (result sheets, teacher completion reports). The system accepts uploads of `.pdf`, `.doc`, `.docx` files but does not generate them. Report cards are rendered client-side.

Implication: any Bond of Undertaking generation must also build a new document-generation pipeline (PDF via Puppeteer or similar). This is a separate engineering concern from the AI drafting feature; they can be decoupled.

---

## Part 2 -- Report Remarks: Design

### 2.1 Input and prompt design

The following data should be assembled and sent to the AI for one student's one remark. The window is always the current term or semester only -- no cross-period comparison until trend data is stored.

**For a primary school remark (class_teacher_remarks):**

```
Student: [name], Class: [class_name], Term: [term_name], Academic Year: [year_name]

Subject results this term:
[subject_name]: Class Score [x/30], Exam Score [y/70], Total [z/100], Grade [grade], Position [pos] of [class_size]
... (one line per subject)

Overall position: [pos] of [class_size]
Grand total: [total] / [max_possible]

Attendance this term:
Present: [n] days, Absent: [n] days, Late: [n] days, Total school days marked: [n]

Affective ratings (from form teacher):
[key]: [value], [key]: [value] ...

Previous approved remark (if any, for reference):
[text or "None"]
```

Crucially, attendance absence count should not appear in the draft remark text when it is zero or minimal -- only include when it is meaningful (e.g., absent_days >= 5 or late_days >= 5). Otherwise the AI will awkwardly commend punctuality for every student.

**For a secondary overall remark (general_remarks):**

This requires a backend data-enrichment change first: the form-teacher remark entry view needs to fetch scores and attendance alongside the existing remarks. Until that is built, the AI can only draft from name, class, and semester -- too thin to be useful. Recommendation: build the data-enrichment endpoint before wiring up AI for secondary overall remarks.

Input once enriched:
```
Student: [name], Class: [class_name], Semester: [semester], Year: [year]

Subjects and scores this semester:
[subject]: CA [ca_total], Exam [exam_score], Total [total], Grade [grade]
...

Estimated class position: [pos] of [class_size] (compute via existing results.js logic)

Attendance this semester:
Present: [n] days, Absent: [n] days

Previous semester general_remarks (if any):
[text or "None"]
```

**For a secondary per-subject remark:**

The input is narrower because it is a single-subject remark:
```
Subject: [subject_name], Class: [class_name], Semester: [semester]
Student: [name]
Score this semester: CA [ca_total], Exam [exam_score], Total [total], Grade [grade]
Class position for this subject: [pos] of [class_size]
Previous semester remark for this subject (if any):
[text or "None"]
```

**Tone and register for Ghanaian secondary school reports:**

The draft prompt should instruct the model to follow conventions common in Ghanaian secondary school report remarks:
- Third person, formal register: "John has demonstrated..." not "You have done well..."
- No direct reference to specific numeric scores in the remark text (the scores are visible on the report card separately)
- Constructive framing for struggling students -- identify one positive and one specific area to work on; avoid deficit language ("John struggles with..." -> "John is encouraged to deepen his engagement with...")
- Common acceptable phrases: "has shown commendable effort in", "is encouraged to", "has demonstrated aptitude in", "consistency will yield greater results", "additional revision practice is recommended"
- Do not reference personal or family circumstances -- the AI has no visibility into these and must not speculate
- Length: one to three sentences; report card remarks are brief

**Anchoring tone with example remarks:**

The system should let the school administrator supply 5-10 example remarks per track (primary / secondary overall / secondary per-subject) through a settings page. These examples are stored in the `schools` table or a small `remark_examples` table and included verbatim in the prompt as few-shot examples. Without school-supplied examples, the system falls back to a generic Ghanaian school tone guideline. The school's own historical approved remarks (pulled from `primary_report_remarks` where `status = 'approved'`) are the best source of examples and can be sampled automatically.

**Case coverage:**

The prompt must be designed to produce reasonable output for all four student profiles:

| Profile | Signals | Expected draft posture |
|---|---|---|
| Top student | Position 1-3, grand total in top 20%, no absences | Affirm achievement, note subject of particular strength, encourage maintenance |
| Average student | Mid-range position, consistent scores | Acknowledge effort and consistency, identify one subject with room to improve |
| Struggling student | Low position, one or more scores below 50% | Lead with a positive (attendance, effort in one subject), frame the underperformance as opportunity, avoid naming the failing subject explicitly in the remark -- the report card shows it already |
| Attendance problem | absent_days >= 10 or late_days >= 10 | Name attendance impact explicitly but constructively; do not speculate on cause; do not assign blame; suggest parental engagement indirectly ("active family support will help...") |
| No prior-term data | First term, no previous approved remark | Generate from current term data only; do not reference a trend |

The struggling-student case is where errors matter most. The prompt should include an instruction: "Do not use the words 'weak', 'poor', 'failed', 'disappointing', 'lazy', or 'struggling'. Frame all development areas as forward-looking opportunities."

### 2.2 Review flow and guardrails

**Request model, not auto-suggest:**

The AI draft should only be generated when a teacher explicitly clicks a "Draft with AI" button. The system must never:
- Pre-populate the remarks field with an AI-generated text on page load
- Save an AI draft to the database without the teacher having seen and edited it
- Allow a batch "generate remarks for all students" flow that skips per-student review

The reason for this constraint: the remarks appear on a student's official report card. Auto-generation without review creates the risk of a generic or inaccurate remark reaching the printed record.

**Review UI:**

When the teacher clicks "Draft with AI":
1. The text area shows a loading state (spinner)
2. The AI-generated draft appears in a visually distinct "Suggested draft" zone below the existing text area -- not inside it
3. The teacher sees: [Use this draft] [Edit before using] [Dismiss]
4. "Use this draft" copies the text into the editable field and focuses it -- the teacher can still edit before saving
5. The existing Save/Submit workflow is unchanged -- the teacher must still click Save

The remarks field must never have a `readonly` or `disabled` state after a draft is loaded. The teacher can always type freely over it.

**What the system must refuse to draft:**

The drafting endpoint must check the request context and refuse to generate with an error message in these cases:

- Request includes any discipline-related context (the two features are separate; the remarks endpoint must not accept discipline incident data as context)
- The `student_id` has an open disciplinary letter with `status IN ('issued', 'acknowledged')` in the current academic year -- in this case, show the teacher a notice: "This student has an open disciplinary matter. The remarks draft has been disabled; please author this remark personally." (This guard prevents the AI from inadvertently ignoring a known conduct situation.)
- Any field in the input context contains strings that suggest personal or medical circumstances (this is hard to check reliably, so the simpler guard above is preferred)

**No bleed-in from discipline to remarks:**

The remarks feature operates only from academic performance data (scores, position, attendance). Discipline incident data must not be sent to the AI for remarks, even when a student has an incident record.

### 2.3 Cost estimate

Using Claude Haiku 4.5 (cheapest capable model, $0.80/1M input tokens, $4.00/1M output tokens):

| Item | Tokens per call |
|---|---|
| System prompt + tone guidelines | ~400 tokens input |
| Student data payload | ~300 tokens input |
| Generated remark (2-3 sentences) | ~80 tokens output |

Cost per remark: ($0.70 / 1M) * 700 input + ($4.00 / 1M) * 80 output = ~$0.00056 + ~$0.00032 = **~$0.00088 per remark** (~0.09 GHS)

**One school, one year, realistic volume:**

- Primary: 400 students, 3 terms = 1,200 class_teacher_remarks
- Secondary overall: 600 students, 2 semesters = 1,200 general_remarks
- Secondary per-subject: 600 students x 8 subjects x 2 semesters = 9,600 subject remarks
- Total: ~12,000 drafts/year (assuming ~60% of teachers use the button)

Cost per school per year: 12,000 x $0.00088 = **~$10.56 USD/year** (~$140 GHS)

**Multi-tenant scale (100 schools):**

~$1,056 USD/year. Still negligible. The cost concern at this scale is not per-remark API fees but rather rate limiting (if a school generates all remarks simultaneously during report week) and latency. Recommend: per-school concurrency limit of 5 simultaneous remark drafts, with a queue for any beyond that.

**On-demand vs batch generation:**

| Approach | Pro | Con |
|---|---|---|
| On-demand (teacher clicks button per student) | Human must see every draft before it saves; zero chance of unseen batch generation reaching records | Slower for large classes; teacher must click per student |
| Batch generation (admin generates all, teachers review) | Faster data entry week | High risk of teachers rubber-stamping without reading; fundamentally misaligns with the review principle |

Recommendation: **on-demand only** for the initial implementation. If throughput becomes a complaint (a teacher with 40 students finds it too slow), consider a "generate all into draft" flow that still requires the teacher to open and explicitly save each student's remark individually -- but this adds complexity and should not be in the first build.

---

## Part 3 -- Discipline: Design by Sensitivity Category

The three categories below receive three distinct, explicit verdicts. They are not a combined recommendation.

### 3.1 Routine, low-sensitivity cases -- drafting verdict: YES, with a fixed allowlist

**Scope:** Offense categories that are definitional, recurring, and documented with standard language in Ghanaian schools. Specifically: `lateness_absenteeism`, `insubordination` (minor), `vandalism` (minor property damage), and simple `warning` letter types.

**Verdict:** AI drafting is appropriate for this tier, subject to the same review model as remarks -- draft on explicit request, staff reviews and edits before finalising, draft never reaches the student record unseen.

**Mechanism:** The school administrator configures a fixed, school-approved allowlist of (offense_category, letter_type) pairs for which AI drafting is enabled. Drafting is never enabled by default -- the school opts in per category. The AI receives:
- Student name, class, ID number
- Offense category (from the allowlist), letter_type
- Offense date, incident count this year for this student/category (pulled from `student_disciplinary_letters`)
- School name, ref_number (already auto-generated by the system)
- A few example letters from the school's own history for this category (optional, stored in a `letter_examples` table)

The AI generates: a draft subject line and body text, in formal letter register. The admin reads and edits before clicking Finalise.

**What stays the same:** The approval step on the existing route. The `status` lifecycle (`issued` -> `acknowledged` -> `resolved`). All signature and letterhead handling.

### 3.2 Serious and personal-circumstance cases -- drafting verdict: NO

**Scope:** Any case that involves personal, medical, family, or social circumstances:
- `suspension` and `dismissal` letter types (regardless of offense category)
- `other` offense category (by definition unknown)
- Any case involving pregnancy, health, family situation, child protection
- `exam_malpractice`, `substance_use`, `fighting_assault`, `bullying_harassment`, `indecent_behavior` offense categories

**Verdict:** AI must not draft any narrative content for this tier. The tool should still auto-populate the standard particulars (student name, ID, class, academic year, semester, ref number, school name) -- the structural fields that would otherwise be typed manually -- but the subject line and body text fields must be left blank, with a notice: "Narrative for this case type must be authored by the issuing officer."

**Why this boundary matters:** A suspension or dismissal letter is a formal administrative instrument with legal and social weight in the Ghanaian school context. A Bond of Undertaking for a pregnancy-management case involves the student's family, the school administration, and potentially welfare officers -- the language must be deliberately chosen by a named, accountable human. An AI draft in this tier risks: (a) generating legally inaccurate language, (b) imposing a framing the school does not intend, (c) creating a record that suggests the institution used automated tools for a decision affecting a minor's schooling status. The reputational and legal risk of getting this wrong is not recoverable by a subsequent edit.

This boundary also means: **sensitive case narratives never need to leave the school's infrastructure to reach an AI API.** Only the structural fields (name, ID, class, date, ref) are sent to populate the form -- and those are not sensitive. The rule that excludes drafting for sensitive cases is the same rule that keeps sensitive narrative off third-party servers.

### 3.3 Pattern and escalation detection -- verdict: YES, detection only, never consequences

**Scope:** Identify students with repeated incidents of the same or related offense category within a rolling window, and surface a flag to the appropriate staff role (form master, discipline committee, headmaster).

**Verdict:** Pattern detection is appropriate and valuable, with strict limits:
- Detection surfaces a flag to a named human role only
- The flag has no automated consequence (no letter is generated, no notification is sent to the student or family)
- The flag does not automatically appear on the student's record or report card
- A human must acknowledge or dismiss each flag
- Dismissed flags must be logged (who dismissed, when) so patterns are not silently suppressed

**Proposed thresholds (configurable by school admin):**
- 3 or more letters of any type in a single academic year -> flag to form master
- 2 or more `final_warning` letters in a single year -> flag to headmaster
- Same offense_category appearing 3 or more times in a year -> flag as category pattern

Implementation: this is a SQL-based detection job, not an AI task. The existing `student_disciplinary_letters` table has enough information. No LLM call is needed. Pattern detection should run on a daily cron (similar to the existing absence check cron) and write flags to a `discipline_flags` table that the headmaster dashboard reads.

### 3.4 Privacy, access, and approval

**Current access model:**

- `teacher_queries`: teacher sees their own records; admin sees all
- `student_disciplinary_letters`: `adminOnly` for all operations
- Students cannot view their own letters in CAS (no student-facing route exists)
- Parents have no access (no parent portal)

For the AI drafting feature, no new party gains visibility into discipline data beyond the existing admin-only access, provided:
- The AI API call is made server-side (the backend assembles the prompt and calls the API; the client never sees the raw case data)
- Sensitive cases are excluded from drafting (see 3.2), so their narrative never leaves the school's server

**Approval step:**

The current `student_disciplinary_letters` table has no multi-level approval workflow (unlike `primary_report_remarks`). For letter types `suspension`, `dismissal`, and `final_warning`, a secondary headmaster approval step should be added before the letter moves to `issued` status -- regardless of whether AI drafting is used. This is a workflow improvement the discipline module needs independently of the AI feature.

Proposed addition: add `approved_by UUID REFERENCES staff(id)`, `approved_at TIMESTAMPTZ`, and `requires_approval BOOLEAN` columns. The letter type determines whether approval is required. A pre-issuance route (`PATCH /discipline/letters/:id/approve`, headmaster-only) moves the status from `pending_approval` to `issued`.

**Retention:**

The `student_disciplinary_letters` table has no explicit retention policy (no `deleted_at`, no scheduled purge). Given that these are formal instruments:

- Routine warning letters: suggested retention of 2 academic years, then eligible for soft-delete by admin
- Serious letters (final_warning, suspension, dismissal): retain for the duration of the student's enrolment plus 3 years after graduation, or per applicable WAEC/GES guidance -- this is a policy question for school leadership

This is a policy decision, not a technical one. No automated deletion should be built until the school leadership specifies the retention periods they are legally required to observe.

---

## Open Questions

### Technical decisions (for the development team)

1. **AI provider and model.** Haiku 4.5 is recommended for cost and latency. Confirm whether the Anthropic API key will be a school-level setting (allowing schools to use their own billing) or a platform-level setting (CAS absorbs the cost). Platform-level is simpler but requires a cost recovery mechanism at scale.

2. **Rate limiting.** Concurrent remark drafts per school should be capped to prevent a single school's report week from consuming the platform's API quota. The recommended limit is 5 concurrent requests per school_id. Implement via a Redis-based or in-memory semaphore, or simply serialize drafts through a short queue.

3. **Secondary data enrichment endpoint.** Before AI drafting for secondary overall remarks is useful, a new endpoint (or an enriched version of the existing form-teacher GET) must bundle scores, position, and attendance. This is a prerequisite, not part of the AI feature itself.

4. **Example remark storage.** Decide whether the school-supplied tone examples for remarks are stored in: (a) a new `remark_examples` table keyed by `(school_id, track, category)`, or (b) as a JSON column on the `schools` table. A separate table is more flexible.

5. **Pattern detection storage.** The `discipline_flags` table needs design: columns for `student_id`, `school_id`, `flag_type`, `academic_year_id`, `triggered_at`, `acknowledged_by`, `acknowledged_at`, `dismissed_reason`. Decide whether to include the raw SQL query result that triggered the flag (useful for the headmaster to understand the basis).

6. **Document generation for bonds.** If Bond of Undertaking forms are to be generated in CAS, a PDF generation library must be added (`puppeteer` or `pdfkit`). This is a separate build from AI drafting. The discipline AI feature does not require document generation to function.

7. **Audit log.** Any AI-drafted text that is accepted and saved should log that it was AI-assisted. Add an `ai_drafted BOOLEAN DEFAULT false` column (or a metadata JSONB column) to `primary_report_remarks`, `report_remarks`, `subject_remarks`, and `student_disciplinary_letters`. This is important for the school to audit the extent of AI use and for any future regulatory review.

### Policy decisions (for supervisor and school leadership)

1. **Sensitive-case drafting boundary.** The recommendation in 3.2 is to exclude AI drafting entirely for `suspension`, `dismissal`, `exam_malpractice`, `substance_use`, `fighting_assault`, `bullying_harassment`, `indecent_behavior`, and `other` offense categories. School leadership must explicitly confirm or revise this list before implementation.

2. **Pattern detection thresholds.** The thresholds proposed in 3.3 (3 letters/year -> flag, 2 final warnings -> escalate to headmaster) are defaults. School leadership should set the actual thresholds to reflect their own discipline policy.

3. **Retention periods.** How long should routine warning letters be retained? How long for suspension/dismissal letters? Does GES or WAEC specify a minimum retention period that would override a school's preference?

4. **Who sees the discipline flag?** The recommended chain is: pattern flags go to form master first; escalation flags (2x final warning) go directly to headmaster. Is this the right role hierarchy for each school, or do some schools route all flags through an Assistant Headmaster?

5. **Student and parent access.** Currently neither students nor parents can view letters in CAS. Should parents be notified in-platform when a disciplinary letter is issued? This is a scope question for the parent portal, but it affects the discipline module's data model.

6. **Bond of Undertaking template ownership.** If bonds are eventually generated in CAS, who owns and can edit the template language? The headmaster? The administrator? A platform-level default? Schools in Ghana use somewhat different bond formats; a school-editable template is likely required.

7. **AI opt-in or opt-out.** Should AI drafting be enabled by default for all schools that have subscribed, or should a school administrator explicitly enable it? Recommendation from this design: opt-in, per feature (remarks separately from discipline), with the admin able to enable/disable at any time. But the final policy is a commercial/product decision.

---

## Proposed Phased Build Order

The order below prioritises: lowest sensitivity first, mature codebase first, prerequisites before features.

**Phase 1 -- Secondary school report remarks (form-teacher + subject remarks)**

Target: `report_remarks` and `subject_remarks` tables. These have no approval workflow and no headmaster layer -- the simplest possible remarks flow.

Steps:
1. Add `ai_drafted BOOLEAN DEFAULT false` column to `report_remarks` and `subject_remarks`
2. Build the secondary data-enrichment endpoint (scores + attendance + existing remarks in one response)
3. Add `remark_examples` table (school-level few-shot examples, optional)
4. Build the server-side `POST /api/ai/draft-remark` endpoint: assembles prompt, calls Anthropic API, returns draft text (never saves to DB -- saving is the existing workflow)
5. Add "Draft with AI" button to the form-teacher remarks UI and the subject-remarks UI
6. Acceptance criteria: draft appears in a separate zone; teacher must click "Use this draft" to copy it; existing Save button unchanged

**Phase 2 -- Primary school report remarks**

Target: `primary_report_remarks` table with existing 4-state workflow.

Steps:
1. Add `ai_drafted BOOLEAN DEFAULT false` to `primary_report_remarks`
2. Add the open disciplinary letter guard (check `student_disciplinary_letters` before enabling the draft button)
3. Wire the same `POST /api/ai/draft-remark` endpoint with the richer primary data payload (scores, positions, attendance, affective ratings context)
4. Add "Draft with AI" button to the primary remark entry UI
5. The existing submit/approve/reject workflow is unchanged

**Phase 3 -- Discipline: particulars autofill for all letter types**

Target: `student_disciplinary_letters`, letter creation form.

Steps:
1. Add the headmaster approval workflow (new `pending_approval` status, `approved_by`, `approved_at` columns, new approve route) -- this is needed regardless of AI
2. Auto-populate `ref_number`, `student_id`, `academic_year_id`, `semester`, `school_name` into the letter creation form (structural fields only)
3. This phase touches no AI API -- it is form pre-population from existing data

**Phase 4 -- Discipline: routine-case drafting for the allowlist**

Target: `student_disciplinary_letters` body and subject line, allowlist offense categories only.

Steps:
1. Admin settings page: enable/disable AI drafting per (offense_category, letter_type) pair
2. Build `POST /api/ai/draft-discipline-letter` endpoint: assembles prompt from allowlist-approved cases only; refuses to generate if category not on allowlist
3. Add "Draft with AI" button to the letter composition form; draft appears in a separate review zone before staff can accept it
4. Add `ai_drafted BOOLEAN DEFAULT false` to `student_disciplinary_letters`
5. Acceptance criteria: the endpoint hard-refuses (returns 403) for any category not on the school's configured allowlist

**Phase 5 -- Pattern and escalation detection**

Target: new `discipline_flags` table, daily cron.

Steps:
1. Design and migrate `discipline_flags` table
2. Build the detection cron (SQL-based, no AI API call)
3. Add a flag inbox to the headmaster/form-master dashboard
4. Acknowledge/dismiss UI with log

**Phase 6 -- Sensitive-case narrative drafting: excluded from roadmap**

This phase does not exist unless the supervisor and school leadership explicitly revisit the boundary defined in 3.2 and decide to include specific serious categories. Any future discussion should address the policy questions above (who owns the template, what legal review applies, what happens if an AI-drafted suspension letter is legally challenged) before a technical design is started.

---

## Combined Cost Estimate at Current Scale

**Remarks drafting (Phase 1 + 2):**
- Assuming 60% teacher adoption, ~12,000 draft requests/year for one school
- ~$10-11 USD/year per school at Claude Haiku pricing
- At 100 schools: ~$1,100 USD/year

**Discipline drafting (Phase 4):**
- Estimated 200-400 warning letters/year per school (routine allowlist cases only)
- Input: ~500 tokens (prompt + context), output: ~300 tokens (full letter body)
- Cost per letter: ~($0.80/1M * 500) + ($4.00/1M * 300) = ~$0.00040 + ~$0.00120 = ~$0.0016 per letter
- 400 letters x $0.0016 = **~$0.64 USD/year per school** (~$8.50 GHS)
- At 100 schools: ~$64 USD/year

**Total combined estimate: ~$11-12 USD/school/year, ~$1,200 USD/year at 100 schools.**

This is a negligible API cost relative to subscription revenue. The material cost of this feature is engineering time, not API fees.
