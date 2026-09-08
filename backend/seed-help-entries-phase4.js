'use strict';
/**
 * Phase 4 seed: comprehensive help entries covering all four portals.
 * Run once: node backend/seed-help-entries-phase4.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ══════════════════════════════════════════════════════════════════
  // ADMIN — 23 new entries (Phase 4)
  // ══════════════════════════════════════════════════════════════════

  {
    feature_area: 'student_attendance',
    applicable_roles: ['admin'],
    title: 'Viewing Student Attendance Records (Admin)',
    body: `Student attendance is submitted by teachers through the teacher portal. Admins view the submitted records under ATTENDANCE → Student Attendance.

Filter by teacher, class, date range, or subject to narrow the list. Click a session row to see the full student list with each student's status (Present or Absent) for that lesson.

Teachers can correct a record within 30 minutes of the lesson end time. After that window the record is locked. If a correction is needed after the window has closed, the admin must revoke the record from this page — a written reason is required.

The student attendance report under REPORTING shows total absence counts per student across a selected date range, which is useful for identifying students with persistent absences.`,
  },

  {
    feature_area: 'absences',
    applicable_roles: ['admin'],
    title: 'Managing Teacher Absence Records',
    body: `Teacher absences are generated automatically when a teacher does not submit attendance for a scheduled lesson. All absence records appear under ATTENDANCE → Absences.

What you can do from this page:
- Add or update the absence reason (sick leave, compassionate, official duty, etc.)
- Change the absence status (pending, excused, unexcused)
- Enter a manual absence record with "+ Manual Absence" for a lesson that was not captured automatically

Conflict detection: if the system finds inconsistencies (for example, an attendance record and an absence record for the same teacher and period), they appear in the Absence Conflicts panel. Review and clear each conflict.

Absence reports by teacher or department are available under REPORTING → Absences.`,
  },

  {
    feature_area: 'timetable',
    applicable_roles: ['admin'],
    title: 'Setting Up the Timetable',
    body: `The timetable is managed under SCHEDULING → Timetable. It maps each teacher to a class and subject for every period in the week.

Bulk upload: click "Download Template" to get the Excel file. Fill in the columns (day, period, teacher, class, subject, location, start time, end time) then upload the file. Existing slots for the same day, period, and class are replaced.

Adding a single slot: click "+ Add Slot", choose the day, period, teacher, class, subject, and location, then save.

Class-subject links: the timetable upload creates class-subject assignments automatically. You can also manage them manually on the Class Subjects tab, or use "Seed from Timetable" to generate links from an already-uploaded timetable.

Coverage check: click the Coverage button to see which class-period combinations have no teacher assigned, so you can spot gaps before the term starts.

Bulk update: use the Bulk Update template to change many slots at once without re-uploading the entire timetable.`,
  },

  {
    feature_area: 'classes',
    applicable_roles: ['admin'],
    title: 'Managing Classes, Subjects, Programs, and Departments',
    body: `Classes: go to PEOPLE → Classes. Click "+ Add Class" and enter the class name (e.g. Form 3A), the year level, and an optional program. To edit a class, click its row.

Subjects: go to CURRICULUM → Subjects. Click "+ Add Subject" to create a subject. Subjects can be uploaded in bulk using a template.

Programs: go to CURRICULUM → Curriculum. A program (e.g. General Arts, Business, Home Economics) groups students by academic track. Click "+ Add Program". You can set a shortened display name for ID cards under the program record.

Departments: go to CURRICULUM → Departments. Departments group subjects and staff by faculty. To create a department, click "+ Add Department", assign a Head of Department (HOD), then use the Subjects and Teachers tabs on the department row to link subjects and staff to it. Removing or changing the HOD is done from the same row.`,
  },

  {
    feature_area: 'houses',
    applicable_roles: ['admin'],
    title: 'Managing Houses and Boarding Room Assignments',
    body: `Houses are managed under PEOPLE → Houses. A house is a boarding unit grouping residential students.

To create a house: click "+ Add House", give it a name, and assign a housemaster (a teacher). Save.

A student is linked to a house via their student record. Open the student record, set the House field, and save. The house name appears on the student's ID card.

Room management: once a house exists, the assigned housemaster can create rooms and assign students to rooms from the teacher portal. Admins can view all houses, their student counts, and occupancy from the Houses → All Students view.

To edit or delete a house: click its row in the house list. Deleting a house that still has students assigned will unlink those students from the house — reassign them before deleting.`,
  },

  {
    feature_area: 'discipline',
    applicable_roles: ['admin'],
    title: 'How the AI Drafting Assistant Works for Discipline Letters',
    body: `When creating a discipline letter or teacher query, clicking "Draft with AI" opens a multi-turn chat-based drafting session. Describe the situation to the assistant and it writes the letter in a formal school tone.

Policy grounding: the assistant searches your uploaded policy documents for clauses relevant to the offense or query subject. It cites the specific clause references in the draft, so you can verify the procedural basis of the letter before issuing it.

Revising a draft: if the first draft needs adjusting, describe the change (for example, "add the clause about suspension procedures" or "make the tone firmer"). The assistant revises and you can keep iterating until satisfied, then click "Use This Draft" to load the text into the letter body.

If no policy documents have been uploaded and processed, the assistant still produces a draft but without citations. Upload and process documents under SETTINGS → Policy Documents for citations to work.

Suspension and Dismissal letters cannot be AI-drafted. Write those manually. Letters of type Suspension or Dismissal require principal approval regardless of how they were drafted.`,
  },

  {
    feature_area: 'id_cards',
    applicable_roles: ['admin'],
    title: 'Generating an Individual Student ID Card',
    body: `Open the student's record under PEOPLE → Students. Scroll to the ID Card section.

To generate a card: set the Issue Date (defaults to today) and Expiry Date (defaults to the end of the current academic year), then click "Download PDF". This produces a two-sided CR80 card PDF — the front shows the student photo, name, class, house, program, and issue date; the back shows the school's vision, mission, values, and headmaster details.

If an active card already exists, the date fields pre-fill from the stored card dates. To regenerate with updated information or new dates, click "Reissue Card".

PNG download: click "Download PNG" to get a high-resolution image of the card front only. This button is only available when an active card exists.

The student must have a profile photo uploaded before generating the card. Upload the photo on the student record page using the profile picture field. Cards generated without a photo show a placeholder.

To revoke a card: click "Revoke Card". The card's QR scan page immediately shows the card as invalid. Revoking does not delete the student record.`,
  },

  {
    feature_area: 'id_cards',
    applicable_roles: ['admin'],
    title: 'Generating ID Cards in Batch for a Class or the Whole School',
    body: `Batch generation produces an A4 duplex-ready PDF containing multiple ID cards formatted for double-sided printing with long-edge flip.

To start a batch: go to PEOPLE → Students. Use the ID Cards batch panel to select the target class or choose all students. Set the Issue Date and Expiry Date that will apply to every card in the batch. Click "Generate Batch".

The system queues a background job. A progress indicator updates while the batch runs. When complete, a download link appears for the generated PDF.

Missing photos: students without a profile photo are still included in the batch, but their card shows a placeholder. Before running the batch, click "Missing Photos" to see the list of students who still need photos uploaded.

The batch PDF is also uploaded to school storage so it can be downloaded again later without regenerating.`,
  },

  {
    feature_area: 'id_cards',
    applicable_roles: ['admin'],
    title: 'Verifying a Student ID Card by QR Scan',
    body: `Each student ID card has a QR code on the front. Scanning it with any phone camera opens a verification page showing the student's photo, name, class, house, and card status (Active or Revoked). No login is required to view the verification page.

Scan history: on the student's record page, the Scan History section shows every time the card QR was scanned, with the date, time, and approximate location. Use this to track gate entry.

Anomaly detection: the system flags suspicious scan patterns, for example the same card scanned at two distant locations within an impossibly short time. Review flagged anomalies from the ID Cards management area.

Revoking a card: open the student record and click "Revoke Card". Any subsequent QR scan shows the card as invalid immediately.`,
  },

  {
    feature_area: 'school_calendar',
    applicable_roles: ['admin'],
    title: 'Managing the School Calendar and Vacation Periods',
    body: `The school calendar is under SCHEDULING → School Calendar. It tells the attendance system which dates are active school days and which are not.

Adding an event: click "+ Add Event", choose the date, select the event type (public holiday, school activity, etc.), add a label, and save. Events appear on the calendar view and in the student portal calendar.

Vacation periods: click the Vacations tab to add named vacation blocks (e.g. Mid-Term Break, End-of-Term Holidays). Set a start date, end date, and name. Days within a vacation period are treated as non-school days by the attendance system.

School Breaks (SCHEDULING → School Breaks) are a related feature for configuring fixed inter-term break periods. Breaks set there are also excluded from attendance calculations.

Reapply calendar: if you change an event that has already been applied to existing attendance records, use the Reapply button on the event row to propagate the change.`,
  },

  {
    feature_area: 'notices',
    applicable_roles: ['admin'],
    title: 'Posting Notices and Announcements',
    body: `Notices are managed under CORRESPONDENCE → Notice Board. They appear as a feed for teachers and students in their respective portals.

To create a notice: click "+ New Notice", enter a title and body text, set an expiry date (after which the notice is automatically hidden), and choose the audience (all staff, all students, or all users). Click Save to publish immediately.

To edit a notice: click the notice row, make changes, and save. To remove a notice before its expiry date: click the delete button on the row.

Notices are informal announcements. They are not the same as discipline letters or general letters, and they do not require principal approval.`,
  },

  {
    feature_area: 'assessments',
    applicable_roles: ['admin'],
    title: 'Setting Up Assessment Modes',
    body: `Assessment Modes define the components of Continuous Assessment and their relative weights. Common examples are Class Test (20%), Mid-Term (30%), and End-of-Term Project (50%). Set them up under ASSESSMENT → Assessment Modes.

Click "+ Add Mode", enter the name, the maximum possible score for that component, and the weight as a percentage. Weights across all active modes should add up to 100% of the CA total.

Assessment Modes are school-wide — once created, teachers choose from these modes when creating their assessment records. If a mode needs to change mid-term, contact teachers who have already used it, as existing scores will be affected.`,
  },

  {
    feature_area: 'assessments',
    applicable_roles: ['admin'],
    title: 'Viewing and Managing CA Assessment Scores (Admin)',
    body: `Continuous Assessment scores entered by teachers are viewable under ASSESSMENT → Assessments. Filter by class, subject, or academic year.

To view scores for an assessment: click the assessment row, then open the Scores tab. You can see each student's score and edit individual entries if corrections are needed.

Assessment Tracker (ASSESSMENT → Assessment Tracker): shows which teachers have submitted CA scores for each class and subject combination. Use this to follow up with teachers who have outstanding entries before the results submission deadline.

Outstanding Submissions (ASSESSMENT → Outstanding Submissions): lists teachers who have not yet submitted results for the current semester, grouped by class and subject.`,
  },

  {
    feature_area: 'exam_scores',
    applicable_roles: ['admin'],
    title: 'Entering and Managing Exam Scores (Admin)',
    body: `Exam scores are separate from CA scores and are managed under ASSESSMENT → Exam Scores.

To add scores in bulk: click "Download Template" to get the Excel file pre-filled with class and student information, enter scores in the score column, and upload it. Any errors (score out of allowed range, unrecognised student code) are reported and you can correct and re-upload.

To add a score manually: click "+ Add Exam Score", select the student, subject, academic year, semester, and enter the score.

Admin edit and delete: if a submitted score needs correction, use the edit or delete action on the score row. All admin edits are logged in the audit trail.

Exam scores combine with CA scores in the results calculation. Once results are published, scores are locked.`,
  },

  {
    feature_area: 'results',
    applicable_roles: ['admin'],
    title: 'The Results Submission and Publication Workflow',
    body: `Results move through four stages before students can see them.

Stage 1 — Teacher submission: teachers enter CA and exam scores, then submit using the Submit Results action in their portal. Unsubmitted teachers appear under ASSESSMENT → Outstanding Submissions.

Stage 2 — HOD review: each Head of Department sees submitted scores for their department subjects. The HOD can approve or send back for correction.

Stage 3 — Admin final review: ASSESSMENT → Result Approvals shows submissions that passed HOD review. Review and approve each one.

Stage 4 — Publish: once all required subjects are approved, click "Publish Results" to make results visible to students. Publication is per academic year and semester. Students cannot see results until you publish.

To allow a teacher to edit scores after they have submitted: use the Unlock action on the Result Approvals page for that teacher's submission.`,
  },

  {
    feature_area: 'grade_boundaries',
    applicable_roles: ['admin'],
    title: 'Setting Up Grade Boundaries',
    body: `Grade boundaries map score ranges to letter grades and descriptive remarks that appear on report cards (for example, 80-100 maps to grade A1 with the remark "Excellent").

Go to ASSESSMENT → Grade Boundaries. Click "+ Add Boundary" and set the minimum score, maximum score, grade label, and remark text. Repeat for each grade band.

Click "Seed Defaults" to populate the standard Ghana GES grading scale if you have not set custom boundaries.

The boundaries apply to all future result calculations. Previously published results used the boundaries that were active at the time of publication and are not retroactively updated.`,
  },

  {
    feature_area: 'remedial',
    applicable_roles: ['admin'],
    title: 'Managing Remedial Classes',
    body: `Remedial sessions are supplementary lessons for students needing extra support. They are tracked under ATTENDANCE → Remedials.

To create a remedial session: click "+ New Remedial", select the teacher, class, subject, date, and time slot, and save. The session is assigned to that teacher.

The teacher then submits the attendance register through their portal, marking each student as present or absent. Once submitted, the status changes to Submitted.

Admin review: click Verify to confirm a submitted remedial, or Reject to return it to the teacher for correction. Verified remedials appear in the teacher's history and feed into attendance reporting.

Status flow: Pending (assigned, not yet submitted) → Submitted → Verified or Rejected.`,
  },

  {
    feature_area: 'exeat',
    applicable_roles: ['admin'],
    title: 'Configuring Exeat Settings and Viewing Student Exeat Requests',
    body: `Exeat settings are at ATTENDANCE → Exeat. The settings panel lets you configure the maximum number of internal and external exeats a student may have per semester. Save after making changes.

Viewing requests: the main exeat page lists all pending and active exeat requests across every house. Filter by status (Pending, Active, Returned, Overdue) or by house to focus on specific groups.

Approving requests: housemasters approve and reject exeat requests for their own house from the teacher portal. Admins can also approve or reject from this page using the action buttons on each request row. A reason is required when rejecting.

Overdue exeats (student has not returned by the expected time) are highlighted. Contact the relevant housemaster to follow up.`,
  },

  {
    feature_area: 'settings',
    applicable_roles: ['admin'],
    title: 'Configuring School Settings: Logo, Signature, and Letterhead',
    body: `School settings are at SETTINGS → Settings. Changes here affect ID cards, letter headers, and printed reports.

School Info tab: edit the school name, address, phone, email, and motto.

Logo: upload the school logo (PNG or JPG, minimum 200x200 pixels). It appears on ID cards and in letter headers.

Headmaster Signature: upload a PNG of the headmaster's signature. It appears on the back of ID cards and on formal letters. Crop the image tightly to just the signature, with a white or transparent background.

Letterhead: upload a PDF or image to use as the background for printed letters. If none is uploaded, CAS uses a plain layout with the school name and logo.

Scheduling: set the teacher attendance submission window (how many minutes before and after lesson start/end a teacher can submit) and the number of lesson periods per day.`,
  },

  {
    feature_area: 'management_users',
    applicable_roles: ['admin'],
    title: 'Setting Up Principal and Vice-Principal Accounts',
    body: `Management accounts give access to the principal portal, which is separate from the admin portal. Create them under SETTINGS → Management Users.

Click "+ Add Management User", enter the person's name and email, choose their role (Principal or Vice Principal), and set a temporary password. Click Save.

The management user logs in at the principal portal login page using their email and password. They are prompted to change the password on first login.

To reset a password: click "Reset Password" on their row and set a new temporary password.

Management accounts cannot access the admin portal. If someone needs both admin and principal portal access, they need two separate accounts — one as a teacher marked as admin, one as a management user.`,
  },

  {
    feature_area: 'admissions',
    applicable_roles: ['admin'],
    title: 'Managing the Admissions Portal',
    body: `Admissions are managed under FINANCES → Admissions. The module has four tabs.

Applications: shows all applications submitted through the public admissions portal. Click an application to read the details and uploaded documents. Set the status (shortlisted, interviewed, admitted, rejected) — the applicant is notified by email when status changes.

Placement: upload a CSV or Excel file of placement results. The system matches applicants by index number and updates their application status automatically.

Prospectus: upload the school prospectus PDF that prospective students can download from the admissions portal.

Settings: configure the admissions portal open and close dates and the programmes accepting applications.

Migrating admitted students: once a cohort is confirmed, use "Migrate to Students" on the Applications tab to convert admitted application records into full student records in CAS.`,
  },

  {
    feature_area: 'library',
    applicable_roles: ['admin'],
    title: 'Managing the Library: Books, Loans, and Overdue Items',
    body: `The library module is under FINANCES → Library.

Books: click "+ Add Book" with title, author, ISBN, and category. Each book record can have multiple physical copies — click "Copies" on a book row to add copies, each with a condition and copy number.

Issuing a loan: in the Loans section, click "+ Issue Loan", scan or type the student's ID code, select the book copy, and set the due date. The copy is marked on loan.

Returning a book: find the loan in Active Loans and click "Return". If the book is overdue, the system calculates a fine. Mark the fine as Paid or use Waive to remove it.

Overdue tab: shows all loans past their due date sorted by how overdue they are, useful for follow-up.

Digital resources: upload PDFs or link URLs under Resources. Students can access these through the student portal without borrowing a physical copy.

Library staff: assign staff accounts to library duty under Library → Staff.`,
  },

  {
    feature_area: 'primary_school',
    applicable_roles: ['admin'],
    title: 'Primary School Module Overview',
    body: `The primary school module is a dedicated management area for primary-level students and staff, separate from the secondary school sections.

Terms: define academic terms with start and end dates, and mark the current term. Primary school uses terms instead of semesters.

Students and Classes: manage primary students and class assignments separately from secondary students. Students are promoted to the next class at year end using the Promotions screen.

Scores and Reports: class teachers enter CA scores and the system generates term reports. Reports go through a submit-and-approve workflow — the teacher submits, the admin approves before printing. Approved reports include AI-generated or manually entered remarks.

Teacher Attendance: primary teachers clock in and out using GPS from their portal. Admins view the clock-in history and can run an absence check to flag teachers who have not clocked in.

Cashbook: the primary cashbook records income and expenditure for the primary section. Entries are categorised and a summary shows the net financial position for the term.

Teacher Excuses: primary teachers submit excuse requests for absences. Admins review and approve or reject these from the Teacher Excuses page.`,
  },

  // ══════════════════════════════════════════════════════════════════
  // TEACHER — 5 new entries (Phase 4)
  // ══════════════════════════════════════════════════════════════════

  {
    feature_area: 'assessments',
    applicable_roles: ['teacher'],
    title: 'Creating and Entering CA Assessment Scores (Teacher Portal)',
    body: `Go to Assessments in the sidebar. The page lists all assessments you have created.

To create an assessment: tap "+ New Assessment". Choose the subject, class, academic year, semester, and the assessment mode (for example, Class Test or Project). Give it a title and tap Save.

To enter scores: tap "Scores" on an assessment card. Your students are listed. Type each student's score in the field beside their name, then tap "Save Scores".

Bulk upload: tap "Download Score Template" on the assessment to get an Excel file pre-filled with student names. Enter the scores in the score column, then upload the file with "Upload Scores". Errors such as scores above the maximum or unrecognised student codes are shown and you can correct and re-upload.

Once you have entered all CA and exam scores for the semester, go to Results in the sidebar and use "Submit Results" to signal that your scores are ready for HOD review.`,
  },

  {
    feature_area: 'exam_scores',
    applicable_roles: ['teacher'],
    title: 'Entering Exam Scores (Teacher Portal)',
    body: `Go to Assessments, then tap the Exam Scores tab. Exam scores are separate from CA scores and cover end-of-semester exam results.

To upload scores in bulk: tap "Download Template" to get an Excel file, enter each student's score, and upload the file. Errors are shown and you can correct and re-upload.

To add a score manually: tap "+ Add Score", select the student, subject, academic year, and semester, then enter the score.

You can edit or delete a score you have entered — but only before results are locked. Once the admin publishes results for the semester, scores are locked and only the admin can make corrections.`,
  },

  {
    feature_area: 'leaves',
    applicable_roles: ['teacher'],
    title: 'Submitting a Leave Request (Teacher Portal)',
    body: `Go to Absences in the sidebar, then tap the Leaves tab.

Tap "+ New Request" and fill in the leave type (sick leave, annual leave, compassionate, study leave, or other), the start and end dates, and the reason. Tap Submit.

Your request goes to the principal for approval. You are notified when the principal approves or rejects it. A rejection includes a reason.

Approved leave is reflected in the attendance system automatically — you will not be marked absent on approved leave days. If a request is rejected and you believe it was in error, contact your admin directly.`,
  },

  {
    feature_area: 'remedial',
    applicable_roles: ['teacher'],
    title: 'Submitting Remedial Class Registers (Teacher Portal)',
    body: `Go to Remedials in the sidebar (shown as Absences → Remedials on some setups). This page shows remedial sessions assigned to you by the admin.

Outstanding sessions appear at the top with the scheduled date and subject. Tap "Take Register" to open the attendance form. Mark each listed student as Present or Absent and tap Submit.

Once submitted, the session status changes to Submitted and it awaits admin verification. Check back to see whether it was Verified or Rejected. If rejected, open the session to see the reason and resubmit with corrections.`,
  },

  {
    feature_area: 'results',
    applicable_roles: ['teacher'],
    title: 'Submitting Results and Checking Your Submission Status (Teacher Portal)',
    body: `Go to Results in the sidebar. This page shows the classes you teach and your submission status for the current semester.

The status card at the top shows whether you have submitted, and whether your HOD has reviewed your submission.

To submit: once you have entered all CA and exam scores for the semester, tap "Submit Results". This signals that your data is complete and ready for HOD review. After submitting, you cannot edit scores unless the admin unlocks them.

Viewing results: tap a class row to see the result table showing each student's CA total, exam score, final total, grade, and class position.

Subject remarks: tap the Subject Remarks tab to add a general note about the class's performance for the term. This remark appears on the class-level report.`,
  },

  // ══════════════════════════════════════════════════════════════════
  // STUDENT — 4 new entries (Phase 4)
  // ══════════════════════════════════════════════════════════════════

  {
    feature_area: 'timetable',
    applicable_roles: ['student'],
    title: 'Viewing Your Timetable',
    body: `Go to Timetable in the sidebar or from the Home screen. Your timetable shows which subject is scheduled for each period of each day, along with the teacher's name and the room.

The timetable is set by your school's admin. If a period is missing or a subject is wrong, speak to your class teacher or contact the school administrator.

If a day is marked as a holiday or special event on the school calendar, the timetable page shows a notice that the school is not in regular session that day.`,
  },

  {
    feature_area: 'attendance',
    applicable_roles: ['student'],
    title: 'Viewing Your Attendance Record',
    body: `Go to Attendance in the sidebar. This page shows your attendance history across all lessons submitted by your teachers.

Each row shows the subject, date, teacher, and whether you were marked Present or Absent for that lesson.

Your overall attendance rate is shown at the top as a percentage. A low attendance rate may affect your eligibility for end-of-term exams — check your school's policy.

You cannot change your own attendance record. If you believe you were incorrectly marked absent for a lesson, speak to the teacher who submitted that record as soon as possible.`,
  },

  {
    feature_area: 'fees',
    applicable_roles: ['student'],
    title: 'Viewing Your Fee Balance and Payment History',
    body: `Go to Fees in the sidebar. This page shows your current fee status for the academic year.

Outstanding balance: the total amount owed across all fee items appears at the top.

Bills: the list shows each fee charged to your account, the amount, the semester, and whether it is paid or outstanding. Fee items include tuition, boarding, PTA levy, and any other charges set by your school.

Payments tab: shows all payments recorded against your account, with dates and amounts.

Payments must be made at the school accounts office. Once the accounts office logs a payment, it appears in the portal. If a payment you made is not showing, bring your receipt to the accounts office.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Accessing LMS Courses and Submitting Assignments',
    body: `Go to Courses or LMS in the sidebar. This shows all published courses your teachers have made available to you.

To open a course: tap its card. Inside you will find three types of content.

Lessons: reading materials and notes. Tap a lesson to read it.

Assignments: written tasks with a due date and instructions. Tap an assignment to read what is required, then tap "Submit" to type your answer or upload a file as your response.

Quizzes: timed or untimed question sets. Tap "Start Quiz" to begin. Answer all questions and tap Submit before the timer runs out. Quiz scores show immediately after submission if your teacher has set them to do so. Assignment grades appear once your teacher has marked your submission.

If a course you expected to see is not listed, your teacher may not have published it yet. Ask your teacher directly.`,
  },

  // ══════════════════════════════════════════════════════════════════
  // MANAGEMENT — 3 new entries (Phase 4)
  // ══════════════════════════════════════════════════════════════════

  {
    feature_area: 'principal_attendance',
    applicable_roles: ['management'],
    title: 'Viewing Teacher Attendance from the Management Portal',
    body: `Select "Teacher Attendance" from the left sidebar in the Principal Portal.

The page shows today's attendance rate across all teaching staff, with a breakdown by department. Each row shows the teacher's name, department, and whether they have submitted attendance today.

Attendance data updates throughout the day as teachers submit. If a teacher has not yet submitted but is present, they may still do so within the submission window.

Tap a teacher's row to see their submission history, including which lesson periods they submitted and any that are missing. Use this for pastoral oversight and for following up with department heads when attendance rates are low.`,
  },

  {
    feature_area: 'principal_fees',
    applicable_roles: ['management'],
    title: 'Viewing the School Financial Summary',
    body: `Select "Fees" from the left sidebar in the Principal Portal.

The summary shows total fee income collected for the current semester, total expenditure, and the net balance. A chart shows the income-versus-expenditure trend over time.

Class breakdown: a table shows expected fee income per class, the amount collected, the number of students with outstanding balances, and total arrears by class.

This view is read-only. Fee transactions, expenses, and bill generation are managed from the admin portal. If a figure appears incorrect, contact your school administrator.`,
  },

  {
    feature_area: 'principal_occupancy',
    applicable_roles: ['management'],
    title: 'Viewing House Occupancy',
    body: `Select "Occupancy" from the left sidebar in the Principal Portal.

The page shows each boarding house with its student count, room count, and occupancy rate relative to the configured maximum capacity. A progress bar for each house makes overcrowding visible at a glance.

Use this view before admitting new boarding students to identify houses with available capacity.

Room capacities and maximum limits are configured by housemasters and admins from the admin portal under Houses.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} Phase 4 help entries…\n`);
  let inserted = 0;
  let skipped  = 0;

  for (const e of ENTRIES) {
    const { rowCount } = await pool.query(
      `INSERT INTO help_entries (school_id, feature_area, applicable_roles, title, body, is_active)
       SELECT NULL, $1, $2, $3, $4, true
       WHERE NOT EXISTS (
         SELECT 1 FROM help_entries WHERE school_id IS NULL AND title = $3
       )`,
      [e.feature_area, e.applicable_roles, e.title, e.body]
    );
    if (rowCount > 0) {
      inserted++;
      console.log(`  ✓  [${e.applicable_roles[0].padEnd(10)}]  ${e.title}`);
    } else {
      skipped++;
      console.log(`  –  [${e.applicable_roles[0].padEnd(10)}]  ${e.title} (already exists)`);
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);

  const { rows } = await pool.query(
    `SELECT applicable_roles[1] AS role, COUNT(*) AS n
     FROM help_entries WHERE school_id IS NULL AND is_active = true
     GROUP BY 1 ORDER BY 1`
  );
  console.log('\nTotal active global entries by role:');
  rows.forEach(r => console.log(`  ${r.role.padEnd(12)} ${r.n}`));

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
