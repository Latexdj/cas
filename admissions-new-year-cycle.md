# Starting a New Admission Year: Current Behaviour & Process

**CAS — Admissions Module**  
*September 2026 · Based on code audit — not inferred · For supervisor / school admin review*

---

## Contents

1. [Admission number sequence — does it auto-reset?](#1-admission-number-sequence--does-it-auto-reset)
2. [Placement list — upload mechanism and year scoping](#2-placement-list--upload-mechanism-and-year-scoping)
3. [The `is_registered` flag — what it means, what it doesn't reset](#3-the-is_registered-flag--what-it-means-what-it-doesnt-reset)
4. [End-to-end: what an admin must do right now](#4-end-to-end-what-an-admin-must-do-right-now)
5. [Flagged gaps — decision list for the supervisor](#5-flagged-gaps--decision-list-for-the-supervisor)

---

## 1. Admission number sequence — does it auto-reset?

**No. The sequence never resets automatically.** There is no code anywhere in the system that resets `next_sequence` at the start of a new year, at a deadline, or on any trigger.

The only write to `next_sequence` in the entire codebase is this atomic increment, which fires every time a student first registers through the portal or a direct admission is created:

```sql
UPDATE school_admission_settings
   SET next_sequence = next_sequence + 1
 WHERE school_id = $1
RETURNING next_sequence - 1 AS seq, admission_prefix, admission_year
```

The admission number format is: **`{prefix}{seq padded to 4 digits}{2-digit year}`**

Example with prefix *SASHTS*, year *25*: `SASHTS000125`, `SASHTS000225`, …

**Concretely:** if last year's cycle ended at sequence 312, this year's first student gets `SASHTS031326` — not `SASHTS000126` — unless the counter is manually reset. The year suffix changes correctly because `admission_year` is a separate field the admin updates in Settings, but the sequence itself is unbounded and monotonically increasing.

> ⛔ **No admin-facing reset tool exists.**  
> The Settings page lets an admin change `admission_year` and `admission_prefix`, but there is no field or button for `next_sequence`. Resetting it currently requires a direct database query:
> ```sql
> UPDATE school_admission_settings
>    SET next_sequence = 1
>  WHERE school_id = '<your-school-uuid>';
> ```

### Format overflow at sequence 10 000

Confirmed by live test: `padStart(4, '0')` does not truncate — it only pads if the string is shorter than 4 characters. At sequence 10 000 the number silently grows from 9 characters to 10 (`SASHTS999925` → `SASHTS1000025`). The format extends gracefully rather than corrupting data, but the change in length is invisible in the UI and could surprise anything that assumes a fixed-length code (e.g. physical printed forms). Practically, a school reaching 10 000 admissions in a single year is not realistic, so this is informational only.

---

## 2. Placement list — upload mechanism and year scoping

**There is an existing admin upload tool.** Go to *Admissions → Placement* in the admin portal and upload an Excel or CSV file. The expected columns are:

```
IndexNo   FullName   DOB   Gender   Aggregate   Programme   ResidentialStatus
```

The system reads the file, validates that each index number is exactly 12 characters, and upserts on `(school_id, index_number)`. A student already in the table is updated in place; a new student is inserted. Errors per-row are reported back; valid rows always go through.

> ⛔ **The table is NOT year-scoped.**  
> There is no `year` column on `admission_placement`. All rows for a school live in one flat list. When a student hits the public portal's `/check` endpoint, the lookup is simply:
> ```sql
> SELECT * FROM admission_placement
>  WHERE school_id = $1 AND index_number = $2
> ```
> This means last year's uncleared rows remain visible to this year's portal.

> ⚠️ **No "clear all" button exists.**  
> The UI's Remove button only appears on rows where `is_registered = false`. Registered rows (students who already started their application last year) cannot be deleted via the UI at all. To fully clear the list before a new year, a direct DB query is required:
> ```sql
> DELETE FROM admission_placement
>  WHERE school_id = '<your-school-uuid>';
> ```
> After that, upload the new year's CSSPS file through the Placement page as normal.

**Practical implication:** Because CSSPS assigns new index numbers each year, there is no realistic risk of a student from last year's list matching this year's. The main danger is leaving old rows in place and seeing inflated counts in the stats dashboard (*"X placed, Y registered"* would count all-time rows, not just this cycle's).

---

## 3. The `is_registered` flag — what it means, what it doesn't reset

`is_registered` is set to `true` on a placement row the moment a student successfully hits the portal's check endpoint and an application row is created for them. It is only ever written in one place in the entire codebase:

```sql
UPDATE admission_placement
   SET is_registered = true
 WHERE school_id = $1 AND index_number = $2
```

It is **never reset**. There is no endpoint and no UI control for this. The flag's purpose is to indicate "this placement slot has been claimed" and to let the admin track how many placed students actually started their applications (surfaced in stats as *Total Registered*).

> ✅ **Not a problem if you clear the placement table each year.**  
> If the old placement rows are deleted and fresh ones uploaded, the `is_registered` flags on the new rows all start as `false`. The flag does not need a separate reset step — clearing the table handles it implicitly.

The only scenario where it matters independently is if an admin wants to re-open a specific student's registration without deleting them from the placement list (e.g. the student accidentally submitted too early). There is no UI for that; it would require a direct update.

---

## 4. End-to-end: what an admin must do right now

Legend:  
- 🔴 **DB only** — requires a direct database query, no admin UI  
- 🟡 **Manual** — can be done via UI but has no dedicated convenience action  
- 🟢 **Admin UI** — fully covered by the existing interface

---

**Step 1 — Reset the admission number sequence** 🔴 DB only

Run this directly on the production database. Without it, this year's numbers continue from where last year's left off.

```sql
UPDATE school_admission_settings
   SET next_sequence = 1
 WHERE school_id = '<your-school-uuid>';
```

---

**Step 2 — Update portal settings for the new year** 🟢 Admin UI

Go to *Admissions → Settings*. Update:
- `admission_year` (e.g. `26` for 2026)
- `admission_prefix` if it changes
- `application_deadline`
- `admission_reporting_date`
- Website content (title, tagline, welcome text, banner image, colours)
- The letter template body if it needs updating

Keep `is_portal_open` set to **Off** until ready.

---

**Step 3 — Clear last year's placement list** 🔴 DB only

The UI only deletes rows where `is_registered = false`. Run this to wipe everything cleanly before uploading the new year's CSSPS file:

```sql
DELETE FROM admission_placement
 WHERE school_id = '<your-school-uuid>';
```

*Alternatively*, skip this and upload the new file on top — existing index numbers are updated, new ones inserted. But old unregistered rows from last year remain and inflate the stats. The cleaner approach is always a fresh delete first.

---

**Step 4 — Upload the new CSSPS placement list** 🟢 Admin UI

Go to *Admissions → Placement*. Upload the CSSPS Excel file. Required columns:

```
IndexNo   FullName   DOB   Gender   Aggregate   Programme   ResidentialStatus
```

The system reports how many rows were inserted and flags any errors (index numbers that aren't 12 characters, duplicate rows, etc.).

---

**Step 5 — Verify houses are configured** 🟢 Admin UI

Check that the school's houses are set up under *General Settings → Houses*. The house assignment algorithm uses whatever is in the `houses` table at the time of each submission — no year-specific setup needed, but if house names change year to year, update them before opening the portal.

---

**Step 6 — Upload prospectus PDFs if they've changed** 🟢 Admin UI

Go to *Admissions → Prospectus*. Upload PDFs filtered by program, gender, and residential status as needed. Existing files from last year remain visible to students unless deleted manually here.

---

**Step 7 — Open the portal** 🟢 Admin UI

Go to *Admissions → Settings → Portal Access* and flip `is_portal_open` to On. Students can now enter their index numbers at the public portal URL. Close it again with the same toggle when the intake period ends.

---

**Step 8 — Process direct / walk-in admissions** 🟢 Admin UI

Go to *Admissions → Applications → Add Direct Admission*. Fill in the student's details and reason. The system assigns an admission number from the same sequence and assigns a house automatically.

---

**Step 9 — Mark students as Reported, then migrate to student records** 🟢 Admin UI

As students report in person, change their application status to *Reported* in *Admissions → Applications*. Once all reporting is done, run the bulk migration (one button in the admin panel) to move all reported applicants into the main students table. The system uses the current `admission_year` setting as their year of admission. After migration, student profiles appear under the Students module.

---

## 5. Flagged gaps — decision list for the supervisor

| Gap | Severity | Current workaround | What to build (if decided) |
|-----|----------|--------------------|---------------------------|
| No UI to reset `next_sequence` | **High** | Direct DB query by a developer each cycle | Add a "Reset sequence to 1" button in Admissions → Settings with a confirmation dialog. Could also let the admin set it to any starting value. |
| No "Clear placement list" button | **High** | Direct DB query; or upload on top and accept inflated stats | Add a "Clear all" action on the Placement page, behind a confirm dialog. Or automatically clear on each new file upload (destructive, would need a warning). |
| Registered placement rows can't be deleted via UI | **Medium** | DB query, or rely on the bulk-clear above | Allow admin to delete any placement row regardless of `is_registered`, with a warning that the linked application will lose its placement record. |
| No single "Start new cycle" action | **Medium** | Manual 9-step process above | A guided "New Academic Year" wizard: (1) update year + prefix, (2) reset sequence, (3) clear placement, (4) confirm portal is closed. Optional — not strictly necessary if the admin is comfortable running the steps individually. |
| Placement list has no year column | **Low** | Clear the table between cycles | Add an `admission_year` column to `admission_placement` so multiple years can coexist for historical reporting. Significant schema change — only worth it if multi-year history in placement is a real requirement. |
| Settings page updates year but not sequence atomically | **Low** | Do them as separate steps | Minor: expose `next_sequence` as an editable field in Settings so both can be saved in one form submission. |

---

### What works well and needs nothing

The CSSPS upload mechanism, the public portal flow, house assignment, direct admissions, letter generation, and the student migration are all fully functional with existing UI. The sequence counter itself is race-condition-free (confirmed by live concurrency tests: 25 concurrent requests → 25 unique numbers, no collisions).

The only missing pieces are two administrative lifecycle actions — resetting the counter and clearing the placement list — which are needed once per year and currently require developer-level database access.
