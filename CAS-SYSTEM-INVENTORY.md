# CAS System Inventory

> Read-only audit report · Generated 2026-09-03  
> Repo: `c:\Users\Administrator\Desktop\cas`

---

## 1. Tech Stack and Architecture

### Repository structure

| Directory | Type | Description |
|---|---|---|
| `backend/` | Node.js REST API | Express server, raw PostgreSQL via node-postgres, Supabase storage |
| `admin-portal/` | Next.js 16.2.6 | Multi-portal web app — admin, teacher, student, principal, primary, super-admin, staff, admissions |
| `teacher-app/` | Expo React Native 54 | Android teacher mobile app (attendance, absences, assessments, meetings, PLC) |
| `student-app/` | Expo React Native 54 | Android student mobile app (dashboard, results, attendance, LMS, library) |

### Backend key dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | 4.19.2 | HTTP framework |
| `pg` | 8.12.0 | PostgreSQL driver — raw SQL, no ORM |
| `jsonwebtoken` | 9.0.2 | JWT auth |
| `bcrypt` | 5.1.1 | Password hashing |
| `@supabase/supabase-js` | 2.45.0 | Supabase Storage (file/photo uploads) |
| `node-cron` | 4.6.0 | Scheduled jobs |
| `multer` | 2.1.1 | CSV/Excel file upload parsing (memory storage only) |
| `exceljs / xlsx / csv-parse` | — | Spreadsheet import/export |
| `qrcode` | 1.5.4 | QR code generation for classroom check-in |
| `helmet / express-rate-limit` | — | Security hardening |

> **Email provider mismatch:** `.env.example` documents `RESEND_API_KEY` but the actual implementation uses `BREVO_API_KEY`. New deployments following the example file will silently skip all email.

### Hosting

| Layer | Service | Notes |
|---|---|---|
| Backend | Render | Explicit in code comments (`index.js` line 73: "Trust Render's reverse proxy") |
| Frontend | Vercel | `vercel.json` present; URL hardcoded in email templates |
| Database | Supabase PostgreSQL | |
| File storage | Supabase Storage | Bucket `attendance-photos`, configurable via `STORAGE_BUCKET` |
| Mobile | EAS Build (Android) | Both apps have `eas.json` |

### Multi-tenancy

Row-level multi-tenancy. Every tenant-scoped table carries `school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE`. Every authenticated request extracts `req.schoolId` from the JWT; all queries are filtered by it. Three tables are global: `plans`, `super_admin_credentials`, `audit_logs`.

### Auth model

| Role | Source table | Token expiry | Notes |
|---|---|---|---|
| `super_admin` | `super_admin_credentials` | 24h | Single global record; invalidated by `updated_at` vs token `iat` |
| `admin` | `teachers (is_admin=true)` | — | Falls through teacher login path |
| `teacher` | `teachers` | — | Status re-checked on every request |
| `student` | `students` | — | Default password `Student123` hardcoded; not configurable |
| `staff` | `school_staff` | 12h | JWT embeds `staffRoles[]` array for clearance/library/inventory access |
| `management` | `teachers (management_role)` | 7d | Principal/VP path; separate `management_users` table also exists but is unused by auth |

Subscription gating via `requireActiveSubscription` middleware checks the `subscriptions` table with a 5-minute in-memory cache. Login rate-limited: 10 attempts for teachers, 5 for super-admin.

---

## 2. Module Inventory

Status: **Active** = currently being developed · **Stable** = low churn, works · **Fragile** = recurring bugs/fixes · **Unclear** = half-built or anomalous

### Backend Routes (58 files)

| File | API prefix | Purpose | Status | LOC |
|---|---|---|---|---|
| `primary.js` | `/api/primary` | Full primary school subsystem: terms, students, classes, subjects, scores, daily attendance, teacher GPS clock-in, cashbook, promotions, report remarks | Active | 2786 |
| `result-submissions.js` | `/api/result-submissions` | Result approval state machine: draft → submitted → hod_approved → final_approved → published → rejected | Fragile | 968 |
| `principal.js` | `/api/principal` | Principal portal: dashboard snapshot, teacher/student attendance, absences, fees, exeats, classroom occupancy | Fragile | 1421 |
| `lms.js` | `/api/lms` | Learning Management System: courses, lessons, assignments, submissions, quizzes, PASCo past questions, announcements | Active | 1050 |
| `teachers.js` | `/api/teachers` | Teacher CRUD, bulk CSV/Excel import, credential emails, photo upload, department/subject assignment | Stable | 1037 |
| `meetings.js` | `/api/meetings` | Staff meeting management: CRUD, attendance, absences, minutes upload, check-in, per-teacher stats | Active | 978 |
| `exams.js` | `/api/exams` | Exam sessions, invigilator pool, invigilation duties (auto-assign), check-ins, student exam attendance | Active | 968 |
| `assessments.js` | `/api/assessments` | CA score entry, bulk Excel import, assessment CRUD, score audit log, LMS quiz sync | Active | 961 |
| `student.js` | `/api/student` | Student portal: profile, timetable, attendance history, results, LMS, library, fees, exeat | Active | 904 |
| `timetable.js` | `/api/timetable` | Timetable CRUD, bulk Excel import, coverage queries, class-subject allocations | Fragile | 880 |
| `reports.js` | `/api/reports` | Report card generation, transcripts, attendance analytics, PDF-ready data | Stable | 859 |
| `admin.js` | `/api/admin` | Admin dashboard stats, absence analytics, school settings, module gating, QR secret rotation | Active | 844 |
| `students.js` | `/api/students` | Student CRUD, bulk CSV/Excel import, photo upload, admission migration | Active | 805 |
| `results.js` | `/api/results` | Computed results: CA + exam score aggregation, grade calculation, subject/report remarks | Active | 756 |
| `library.js` | `/api/library` | Student library: search books, check loans, download resources | Stable | 618 |
| `remedial.js` | `/api/remedial` | Remedial lesson scheduling, photo/GPS verification, admin approval | Active | 610 |
| `inventory.js` | `/api/inventory` | Inventory: categories, items, transactions (issue/return/damage), departmental ownership | Stable | 602 |
| `fees.js` | `/api/fees` | Fee items, schedules, student bills, payment recording, expense tracking. No payment gateway. | Stable | 554 |
| `plc.js` | `/api/plc` | PLC session management, attendance, absences, per-teacher stats | Stable | 549 |
| `schools.js` | `/api/schools` | School profile, logo, module settings, subscription status, QR secret | Stable | 516 |
| `houses.js` | `/api/houses` | Boarding house management, room management, student room assignments | Stable | 496 |
| `exam-scores.js` | `/api/exam-scores` | Exam score entry, bulk Excel import, submission tracking | Active | 494 |
| `exeat.js` | `/api/exeat` | Exeat pass management: grant/return/reject, SMS to parent via Arkesel | Stable | 480 |
| `hod.js` | `/api/hod` | HoD portal: result review/approval, department teacher lists, submission status | Fragile | 478 |
| `clearanceAdmin.js` | `/api/clearance-admin` | Admin clearance: offices, staff assignments, initiate/track student clearances | Stable | 470 |
| `libraryAdmin.js` | `/api/library-admin` | Library admin: book/copy CRUD, loan management, overdue/fines, resources upload | Stable | 438 |
| `attendance.js` | `/api/attendance` | Teacher lesson attendance: submit, list, analytics, per-teacher drilldown | Fragile | 423 |
| `departments.js` | `/api/departments` | Department CRUD, head teacher assignment, teacher membership | Stable | 410 |
| `discipline.js` | `/api/discipline` | Teacher queries and student disciplinary letters: issue, respond, resolve | Stable | 407 |
| `admin-admissions.js` | `/api/admin/admissions` | Admin admissions: portal settings, placement upload, application review, migrate to student | Active | 403 |
| `resumption.js` | `/api/resumption` | Boarding resumption: semester config, student arrival recording, late-arrival flags | Active | 348 |
| `student-attendance.js` | `/api/student-attendance` | Student lesson attendance: session-based recording, bulk submit | Active | 358 |
| `school-calendar.js` | `/api/school-calendar` | School calendar events (holidays, closed days, events), vacation periods | Active | 342 |
| `auth.js` | `/api/auth` | Login (all roles), change-password, school code lookup | Stable | 302 |
| `admissions.js` | `/api/admissions` | Public admissions portal: placement lookup, application form fill/resume | Active | 275 |
| `absences.js` | `/api/absences` | Absence list, status/reason update, manual absence check trigger | Fragile | 260 |
| `schoolStaff.js` | `/api/school-staff` | Non-teaching staff accounts (clearance/library/inventory roles): CRUD, credential email | Stable | 244 |
| `form-teacher.js` | `/api/form-teacher` | Form teacher (homeroom) assignments by class and academic year | Stable | 241 |
| `teacher-excuses.js` | `/api/teacher-excuses` | Teacher leave/excuse requests: CRUD, approval workflow | Stable | 234 |
| `roll-call.js` | `/api/roll-call` | Roll call sessions and entries (Present/Absent/Break Bounds) | Active | 185 |
| `academicYears.js` | `/api/academic-years` | Academic year CRUD, current-year management, semester date records | Fragile | 191 |
| `assessment-monitoring.js` | `/api/assessment-monitoring` | Assessment submission monitoring for admin | Stable | 162 |
| `clearanceStaff.js` | `/api/clearance` | Staff-facing clearance portal: view assigned students, approve/reject items | Stable | 159 |
| `classroom-qr.js` | `/api/classroom-qr` | QR code generation/validation for classroom check-in | Stable | 122 |
| `subjects.js` | `/api/subjects` | Subject CRUD, bulk CSV import | Stable | 121 |
| `notices.js` | `/api/notices` | School notice board (admin-created, priority levels). Self-heals own table at startup. | Stable | 113 |
| `grade-boundaries.js` | `/api/grade-boundaries` | WAEC/CTVET grade boundary configuration | Stable | 111 |
| `responsibilities.js` | `/api/responsibilities` | Teacher responsibility definitions and assignments | Stable | 113 |
| `management-users.js` | `/api/admin/management-users` | Management user account management. Dual-path with `teachers.management_role` — purpose unclear. | Unclear | 73 |
| `school-breaks.js` | `/api/school-breaks` | School break time slots (daily schedule breaks) | Stable | 92 |
| `programs.js` | `/api/programs` | Academic programmes/tracks | Stable | 63 |
| `locations.js` | `/api/locations` | GPS-enabled locations for QR/attendance verification | Stable | 63 |
| `notifications.js` | `/api/notifications` | Teacher in-app notification inbox | Stable | 54 |
| `principal-auth.js` | `/api/principal/auth` | Principal/VP login and session validation | Stable | 91 |
| `audit-log.js` | `/api/audit-log` | School-level audit log queries | Stable | 38 |
| `classes.js` | `/api/classes` | Class list management | Stable | 67 |
| `superAdmin.js` | `/api/super-admin` | Super-admin: school CRUD, subscription management, stats, audit log | Stable | 95 |
| `assessment-modes.js` | `/api/assessment-modes` | Assessment mode (CA type) definitions | Stable | 73 |

### Admin Portal Pages

**Admin (dashboard) portal** — `app/(dashboard)/` — 49 page sections: absences, academic-years, admissions, assessment-tracker, assessments, attendance, audit-log, classes, classroom-qr, clearance, curriculum, dashboard, departments, discipline, exam-scores, exams, exeat, fees, form-teachers, houses, inventory, library, lms, locations, management, manual-entry, meetings, notice-board, outstanding-submissions, plc, remedials, reports, responsibilities, result-approvals, results, resumption, roll-call, school-breaks, school-calendar, settings, staff-accounts, student-attendance, students, subjects, teachers, timetable, transcript.

**Teacher portal** — `app/teacher/` — 26 sections: absences, assessments (scores/subject/exam), clearance, conduct, form-class, history, hod, house-students, invigilation, library, lms, meetings, notifications, plc, profile, results, resumption, roll-call, setup, student-attendance, submit, timetable.

**Student portal** — `app/student/` — 17 sections: attendance, calendar, clearance, conduct, exeat, fees, library, lms (with courseId and quiz sub-routes), profile, results, timetable.

**Principal portal** — `app/principal/` — 15 sections: attendance, clearance, exeats, fees, leaves, occupancy, personnel, reports, resumption, roll-call.

**Staff portal** — `app/staff-portal/page.tsx` — Single 1086-line combined UI for clearance, library, and inventory staff.

**Admissions portal** — `app/admissions/[slug]/` — Public placement check and multi-step application form.

**Primary portals** — `app/primary/admin/` (20 sections) and `app/primary/teacher/` (11 sections).

**Super-admin** — `app/super-admin/` — schools, subscriptions, audit, stats.

### Mobile Apps

**Teacher app** (`teacher-app/`): home/dashboard, attendance submission (GPS + photo), absence management, CA score entry, history, meetings, PLC, notifications, results, timetable. Uses `expo-location`, `expo-camera`, `expo-image-manipulator`.

**Student app** (`student-app/`): dashboard, attendance records, LMS courses, library materials, results, fees, clearance, exeat, timetable, calendar. Uses `expo-av` for audio.

---

## 3. Data Model Overview

> Architecture note: Row-level multi-tenancy declared in `db/schema.sql` opening comment. 101 tables total created across `backend/src/index.js` `runMigrations()` and self-healing IIFEs in route files.

### Global tables (no school_id)

| Table | Contents |
|---|---|
| `plans` | Subscription plan types (trial/paid) |
| `super_admin_credentials` | Single-row super-admin credential store |
| `audit_logs` | Global audit trail |

### Core infrastructure (tenant-scoped)

| Table | Contents |
|---|---|
| `schools` | Tenant records: type, category, level, motto, region, district, logo, GPS coords, letterhead settings |
| `subscriptions` | School subscription records with plan, status, ends_at |
| `school_modules` | Per-school feature flag registry (14–15 module keys) |
| `school_audit_logs` | School-level audit trail |
| `programs` | Academic programmes/tracks (Science, Business, etc.) |
| `departments / department_teachers` | Academic departments and their teacher membership |
| `academic_years` | School years with `is_current` flag and `current_semester` int |
| `semesters` | Explicit semester date ranges; currently empty in production — not read by attendance queries |
| `locations` | GPS-enabled locations for QR/attendance verification |

### Attendance and scheduling

| Table | Contents |
|---|---|
| `timetable` | Weekly lesson schedule with `academic_year_id`, `semester`, `day_of_week` |
| `class_subjects` | Class-subject allocation with periods per week |
| `attendance` | Teacher lesson attendance records with `academic_year_id` and `semester` |
| `absences` | Auto-generated and manual absence records. Has NO `academic_year_id` or `semester` — scoped only by date. Critical mismatch with attendance table scoping. |
| `remedial_lessons` | Make-up lessons for absences |
| `school_breaks` | Daily break time slots |
| `school_calendar` | Calendar events (holidays, events) with optional time ranges for partial-day events |
| `school_vacation_periods` | Vacation/exam period date ranges (kind: 'vacation'\|'exam') |
| `teacher_notifications / notifications` | Two separate notification tables — former for teachers only, latter has `user_type` enum |

### Full table listing by module

| Module | Tables |
|---|---|
| Staff | `teachers`, `teacher_responsibilities`, `teacher_responsibility_assignments`, `teacher_excuses`, `teacher_queries`, `school_staff`, `school_staff_roles`, `management_users` |
| PLC & Meetings | `plc_sessions`, `plc_attendance`, `plc_absences`, `meetings`, `meeting_attendance`, `meeting_absences` |
| Students | `students`, `student_attendance_sessions`, `form_teacher_assignments` |
| Boarding/Houses | `houses`, `house_rooms`, `house_room_assignments` |
| Exeat | `exeats`, `exeat_settings` |
| Clearance | `clearance_offices`, `clearance_office_staff`, `student_clearances`, `student_clearance_items` |
| Library | `library_settings`, `library_books`, `library_copies`, `library_loans`, `library_resources` |
| Assessments/Results | `assessment_modes`, `assessments`, `assessment_scores`, `exam_scores`, `grade_boundaries`, `results_import`, `result_submissions`, `report_remarks`, `subject_remarks`, `score_audit_log` |
| Exams/Invigilation | `exam_sessions`, `exam_invigilator_pool`, `invigilation_duties`, `invigilation_check_ins`, `exam_student_attendance` |
| Fees | `fee_items`, `fee_schedules`, `student_bills`, `fee_payments`, `school_expenses` |
| Admissions | `school_admission_settings`, `admission_placement`, `admission_applications`, `admission_prospectus` |
| Inventory | `inventory_categories`, `inventory_items`, `inventory_transactions` |
| Discipline | `student_disciplinary_letters` |
| LMS | `lms_courses`, `lms_lessons`, `lms_assignments`, `lms_submissions`, `lms_quizzes`, `lms_quiz_questions`, `lms_quiz_attempts`, `lms_quiz_answers`, `lms_pasco_questions`, `lms_announcements` |
| Roll call/Resumption | `semester_config`, `student_arrivals`, `resumption_flags`, `roll_calls`, `roll_call_entries` |
| Notice board | `notices` |
| Primary school | `primary_terms`, `primary_students`, `primary_class_teachers`, `primary_subjects`, `primary_subject_catalog`, `primary_scores`, `primary_assessments`, `primary_assessment_scores`, `primary_assessment_modes`, `primary_daily_attendance`, `primary_teacher_attendance`, `primary_teacher_self_attendance`, `primary_teacher_excuses`, `primary_report_remarks`, `primary_grade_scale`, `primary_classes`, `primary_cashbooks`, `primary_cashbook_entries` |

### Schema anomalies

1. **`absences` has no `academic_year_id` or `semester`.** All other core tables are semester-scoped. Absences rely on date-range joins against the `attendance` table's min/max dates to scope to a period. This indirect scoping has already caused phantom absence data surfacing in wrong semesters.

2. **`management_users` dual-path.** The `management_users` table exists and is managed via `management-users.js`, but the active principal/VP authentication path runs through `teachers.management_role`. The table is created in `index.js` migrations but appears unused by the login flow.

3. **`student_attendance_sessions` FK without migration.** Referenced in foreign keys (`resumption_flags.session_id`) and route code, but its `CREATE TABLE` lives only in `db/schema.sql`, not in `runMigrations()`. Deployments that skip `schema.sql` will have a broken FK.

4. **Two notification tables.** `teacher_notifications` and `notifications` coexist with overlapping purpose. Similarly, `school_audit_logs` and `audit_logs` both exist.

5. **`semesters` table is empty in production.** Created and managed via API but no queries read from it. The system derives period boundaries from `attendance` MIN/MAX dates instead.

---

## 4. Cross-cutting Concerns

### Background jobs — `backend/src/jobs/`

| Job | Schedule | What it does |
|---|---|---|
| Per-lesson absence check | `*/5 * * * *` | Every 5 minutes: scans all active/trial schools for lessons whose end time + 30 min has passed with no attendance submitted. Inserts into `absences`. Skips calendar holidays; previously did not skip vacation periods (bug fixed 2026-09-03). |
| Daily absence sweep | `0 16 * * *` (UTC) | 16:00 UTC sweep: runs absence check + PLC absence check + meeting absence check + primary absence check for every active/trial school. Sends Brevo email notifications. |
| Subscription expiry | `0 * * * *` + startup | Hourly: finds paid subscriptions past `ends_at`, marks them `expired`, creates 14-day trial fallback subscription. |
| Library notifications | `0 8 * * *` (Africa/Accra) | Daily 8 AM: sends due-date reminders (2 days out) and overdue escalation notices (day 1/7/14) to library staff via Brevo. |

### academic_years / is_current / current_semester touchpoints

Read in at least 15 backend route files. The canonical query pattern:

```sql
SELECT id, current_semester FROM academic_years
WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1
```

**Historically non-deterministic.** The `LIMIT 1` without `ORDER BY` returned random results when two rows had `is_current = true` simultaneously (a data integrity bug confirmed in production as recently as 2026-09-03). Fixed by adding `ORDER BY name DESC` across all 15 files and adding a partial unique index:

```sql
CREATE UNIQUE INDEX academic_years_one_current ON academic_years (school_id) WHERE is_current = true
```

### Email and notifications

| | |
|---|---|
| Provider | Brevo HTTP API at `https://api.brevo.com/v3/smtp/email`, configured via `BREVO_API_KEY` |
| From address | `SMTP_FROM` env var, defaults to `staugustineshts@gmail.com` — a specific school's email hardcoded as fallback for all tenants |
| Admin alert | `ADMIN_EMAIL` env var, defaults to `admin@yourschool.edu.gh` |
| Key files | `backend/src/services/email.service.js`, `notification.service.js`, `jobs/libraryNotifications.js` |
| In-app | `teacher_notifications` table; separate `notifications` table with `user_type` enum |

### File storage

| | |
|---|---|
| Provider | Supabase Storage, bucket `attendance-photos` (configurable via `STORAGE_BUCKET`) |
| Upload method | Base64 data URIs decoded to Buffer, uploaded via Supabase JS client. No disk writes. |
| Multer | Used for CSV/Excel parsing only (memory storage). 10MB limit in most routes, 20MB in admissions. |
| Body limit | 50MB JSON body (`express.json({ limit: '50mb' })`) to handle base64 photos and PDF uploads |

### Third-party integrations

| Service | Purpose | Scope |
|---|---|---|
| Brevo | Transactional email (absence alerts, credentials, library notices) | All schools |
| Arkesel (Ghana SMS) | Exeat parent SMS notifications only | `exeat.js` only — silently no-ops if key not set |
| Supabase | PostgreSQL + file storage | All schools |
| Render | Backend hosting | Infra |
| Vercel | Frontend hosting | Infra |
| EAS Build | Expo mobile app build/distribution | Mobile |

No payment gateway integration. Fees are recorded manually. No external LMS/SIS integration.

---

## 5. Size and Complexity

### Most churned files — last 3 months

| File | Commits | Signal |
|---|---|---|
| `backend/src/routes/result-submissions.js` | 25 | Highest risk |
| `admin-portal/app/(dashboard)/results/page.tsx` | 24 | High |
| `admin-portal/components/layout/Sidebar.tsx` | 22 | |
| `backend/src/routes/principal.js` | 21 | |
| `backend/src/routes/student.js` | 19 | |
| `backend/src/routes/hod.js` | 18 | |
| `backend/src/routes/admin.js` | 17 | |
| `admin-portal/app/teacher/TeacherShell.tsx` | 17 | |
| `admin-portal/app/teacher/assessments/subject/page.tsx` | 16 | |
| `admin-portal/app/teacher/hod/page.tsx` | 15 | |
| `backend/src/routes/primary.js` | 14 | |
| `admin-portal/app/student/results/page.tsx` | 13 | |
| `backend/src/routes/assessments.js` | 12 | |
| `admin-portal/app/(dashboard)/assessment-tracker/page.tsx` | 12 | |
| `admin-portal/app/(dashboard)/exams/page.tsx` | 11 | |

### Largest files by LOC

| File | LOC |
|---|---|
| `backend/src/routes/primary.js` | 2786 |
| `backend/src/index.js` | 2318 |
| `admin-portal/app/(dashboard)/meetings/page.tsx` | 1564 |
| `admin-portal/app/(dashboard)/exams/page.tsx` | 1487 |
| `backend/src/routes/principal.js` | 1421 |
| `admin-portal/app/teacher/house-students/page.tsx` | 1199 |
| `admin-portal/app/staff-portal/page.tsx` | 1086 |
| `backend/src/routes/lms.js` | 1050 |
| `admin-portal/app/(dashboard)/discipline/page.tsx` | 1004 |
| `admin-portal/app/(dashboard)/curriculum/page.tsx` | 998 |

### Fix commit density

Out of the most recent 558 commits, approximately 49% match `fix|revert|broken|hotfix|bug` (case-insensitive). This is high for a production system and indicates significant ongoing instability, concentrated in the results/assessments/attendance cluster.

---

## 6. Known Issues

### No TODO/FIXME markers

No `TODO`, `FIXME`, `HACK`, or `XXX` comments found in `.js` or `.tsx` source files. Issues are surfaced exclusively through commit history and structural code patterns.

### Recurring failures — from git log

**Result submission non-submitters query (highest severity)**  
At least 9 commits fixing the query that determines which teachers have not submitted results: `d7565bf`, `57e92ce`, `ecf1478`, `d925f3f`, `52e9089`, `9e857d7`, `acb343b`, `144acc3`, `055ce4f`. This query has been broken and re-fixed more than any other in the codebase. File: `result-submissions.js` (also the most churned file: 25 commits in 3 months).

**Roll-call / resumption cascading migration failure**  
Commits `789cb95`, `3f227ad`, `e951e92`, `73da097`: `roll_calls` table was not being created because a `resumption_flags` migration failure blocked subsequent table creation in the same try block. Self-healing table creation is now split into separate try-catch blocks.

**Attendance and occupancy data integrity — wrong academic year**  
Commits `4717fc2`, `8638268`, `33fd861`: queries returning incorrect data due to non-deterministic current-year lookup (multiple `is_current = true` rows) and 365-day fallback in CTEs. Fixed 2026-09-03.

**Vacation absence generation — per-lesson job skipped holiday guard**  
The every-5-minute per-lesson check did not check `school_vacation_periods`, generating 656 false absence records for 45 teachers during the Aug–Sep 2026 vacation. The daily sweep had the guard; the cron job did not. Fixed 2026-09-03.

**Encoding corruption in teacher assessment portal**  
Commits `4f65475`, `eb13d2b`: UTF-8/Latin-1 encoding corruption producing mojibake (Â· characters) in the assessment subject page.

**Print / PDF blank images — three successive fixes**  
Commits `b938ae5`, `bdf333b`, `fbe096b`: CSS `left:-9999px` from the off-screen rendering pattern overrode print CSS, producing blank images and missing bar chart colors in printed report cards.

**Timetable day_of_week type mismatch**  
Commit `a1c77f3`: API returned `day_of_week` as a string name where the frontend expected an integer. Indicates the API contract between backend and frontend is not formally typed or validated.

### Structural issues

**Default student password hardcoded in source**  
`auth.js`: `const DEFAULT_STUDENT_PASSWORD = 'Student123'` used when `pin_hash` is null. Not configurable via env vars. Applies to all tenants.

**School-specific email hardcoded as system fallback**  
`email.service.js` defaults `EMAIL_FROM` to `staugustineshts@gmail.com`. If `SMTP_FROM` env var is not set, all tenant emails will appear to come from this school's address.

**Hardcoded Vercel URL in email templates**  
`email.service.js` line 183 hardcodes `https://admin-portal-eta-topaz.vercel.app/staff-portal/login` as the staff login link. All tenants will receive this URL regardless of their actual portal address.

**Self-healing DDL scattered across route files**  
`notices.js`, `exams.js`, `academicYears.js`, and several others run `CREATE TABLE IF NOT EXISTS` in IIFEs on module load. Table creation depends on which routes happen to be loaded, not solely on `runMigrations()` in `index.js`. This makes the migration dependency graph implicit and untestable.

**primary.js is a 2786-line monolith**  
The entire primary school subsystem lives in a single route file with no internal module boundaries. Covers terms, students, scoring, attendance, teacher GPS clock-in, cashbook, promotions, and report generation.

---

## Recommended Audit Order

_This section is editorial — it reflects the author's read of the evidence above, not a factual finding. Ordered by combination of risk (bugs already manifested), load-bearing nature, and complexity concentration._

**1. Result submission pipeline** — `result-submissions.js` + `(dashboard)/results/page.tsx` + `teacher/hod/page.tsx`  
Most churned backend file (25 commits in 3 months), at least 9 distinct fixes to the non-submitters query alone. The state machine (draft → submitted → hod_approved → final_approved → published → rejected) involves multiple actors and has broken repeatedly. Highest probability of further regressions.

**2. Academic year / semester scoping** — `academicYears.js`, `absenceCheck.js`, and the 15 route files that read `is_current`  
The `absences` table has no `academic_year_id` while the `attendance` table does — this asymmetry is the root of the phantom absence data bugs. The `semesters` table exists but is empty and unread. Period scoping is the most load-bearing invariant in the system and the most historically wrong.

**3. primary.js monolith** — `backend/src/routes/primary.js`  
2786-line single route file for the entire primary school subsystem. 14 commits in 3 months. No internal boundaries. Audit for correctness of the cashbook, GPS clock-in validation, and score aggregation logic — all buried in the same file.

**4. Attendance integrity (teacher and student)** — `attendance.js`, `absences.js`, `student-attendance.js`, `absenceCheck.js`  
The vacation/holiday guard was missing from the per-lesson cron job (not the daily sweep) — a parity bug. Two separate notification tables and two absence tables suggest the data model has grown without a unified design.

**5. Data model anomalies**  
Three specific issues: (a) `management_users` vs. `teachers.management_role` dual-path — determine which is authoritative and remove the other; (b) `student_attendance_sessions` FK without a migration — risk on fresh deployments; (c) the `semesters` table is created, managed via API, but nothing reads it.

**6. Self-healing DDL and migration strategy**  
Table creation split across `index.js` `runMigrations()` and IIFE blocks inside individual route files. The roll-call/resumption cascade failure shows this approach has already caused production bugs. Audit for which tables are only created by route-level IIFEs and consolidate into a single, ordered migration function.

**7. Hardcoded credentials and defaults**  
Three separate hardcoded values that affect all tenants: (a) student default password `Student123`; (b) `staugustineshts@gmail.com` as system email fallback; (c) Vercel URL hardcoded in email templates. Lower urgency than data bugs but a security and multi-tenancy correctness issue.
