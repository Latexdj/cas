'use strict';
/**
 * LMS Overview seed: 5 help entries — 2 admin (LMS overview + Pasco bank
 * management), 1 teacher (My LMS Courses), 2 student (My Courses + Pasco
 * Practice drill).
 * Run once: node backend/seed-help-entries-lms-overview.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Admin entries ─────────────────────────────────────────────────────────────

  {
    feature_area: 'lms',
    applicable_roles: ['admin'],
    title: 'LMS Overview',
    body: `The LMS Overview page is the admin hub for the school's Learning Management System — online courses, lessons, assignments, quizzes, and the Pasco past-question bank. Go to LMS Overview in the left navigation to open it.

Page subtitle: "Manage courses, lessons, assignments, and the Pasco question bank."

A "Pasco Bank →" button in the top-right corner navigates to the Pasco question bank page.

Stats row:

Five summary cards appear at the top:
Active Courses — the number of published courses across all teachers.
Published Lessons — total published lessons in all courses.
Active Assignments — total live assignments students can currently submit.
Pending Grades — assignments that have been submitted but not yet graded. This card turns red when the count is greater than zero, drawing attention to ungraded work.
Pasco Questions — the total number of questions in the Pasco past-question bank.

Course table:

Below the stats, a table lists all courses across all teachers. Three filter controls appear above the table:

Academic Year — a dropdown of all academic years. Selecting a year limits the table to courses from that year.
Class — a text input. Type any part of a class name to filter the table (case-insensitive).
Semester — a dropdown: All Semesters, Semester 1, or Semester 2.

Table columns: Teacher, Subject, Class, Semester (shown as "Sem 1" / "Sem 2" or "—" if not set), Lessons (count), Assignments (count), Quizzes (count), Status, and Actions.

Status badges:
Draft (grey) — the course is not visible to students yet.
Published (green) — the course is live and students can access it.
Archived (orange) — the course is closed; students can no longer access it.

Actions:
For Draft or Published courses: a "Publish" or "Unpublish" link toggles the status between draft and published. An "Archive" link moves the course to archived status — use this at the end of a semester.
For Archived courses: a "Restore" link moves the course back to published status.

Creating a course:

Click "+ New Course" to open the New Course modal. Fields:
Teacher (required) — select the teacher who owns this course.
Subject (required) — select a subject from the school's subject list.
Class (required) — select the class the course is for.
Academic Year (required) — the year this course belongs to.
Semester (optional) — Semester 1, Semester 2, or leave blank for "any semester."
Description (optional) — a brief text description of the course.

Click "Create Course" to save. The course is created in Draft status and does not appear to students until published.

Note: adding lessons, assignments, and quizzes to a course is done from the teacher's portal, not from this overview page. This page is for course-level management (create, publish, archive) and monitoring.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['admin'],
    title: 'Pasco Bank — Admin Management',
    body: `The Pasco Bank is a shared question bank of Ghana SHS past-questions (WAEC/PASCO) organised by subject, year, topic, and difficulty. Teachers can draw from this bank when building quizzes, and students can practice with it independently. Access it from the LMS Overview page using the "Pasco Bank →" button in the top-right corner.

Page subtitle: "Ghana SHS past questions organised by subject, year, and topic."

Question table:

All questions are displayed in a table with these columns: Subject, Year, Source (e.g. "WAEC 2022"), Topic (e.g. "Algebra"), Difficulty (Easy / Medium / Hard badge), Question (the question text, truncated to 80 characters — hover to see the full text), and Actions (Edit / Delete).

Difficulty badge colours:
Easy — green badge
Medium — yellow badge
Hard — red badge

Filters:

Four filter controls appear above the table:
Subject — a dropdown of all subjects. Filter to see only questions for a specific subject.
Difficulty — Easy, Medium, or Hard.
Year — a dropdown of all years present in the bank.
Search — a text box that searches question text and topic simultaneously.

Adding a question:

Click "+ Add Question." A modal opens with these fields:

Subject (required) — select from the school's subject list. New subjects are pulled from the admin's Subjects page.
Year (required) — the exam year the question is from (defaults to the current year).
Difficulty (required) — Easy, Medium, or Hard.
Source (optional) — the exam series the question came from, e.g. "WAEC 2022" or "BECE 2019."
Topic (optional) — the curriculum topic, e.g. "Photosynthesis" or "Linear equations."
Question Text (required) — the full question as it appears in the past paper.
Options A, B, C, D (all required) — enter all four answer choices. Click the radio button to the left of the correct answer to mark it.
Explanation (optional) — an explanation of why the correct answer is right. Shown to students after they answer.

Click "Add Question" to save.

Editing a question:

Click Edit on any row to reopen the same form with the question's current values. Make your changes and click "Save Changes."

Deleting a question:

Click Delete on a row. A confirmation modal appears: "Delete Question? This action cannot be undone." Confirm to permanently remove the question from the bank and from any quiz that referenced it.`,
  },

  // ── Teacher entry ─────────────────────────────────────────────────────────────

  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'My LMS Courses',
    body: `The My LMS Courses page is where you manage your online courses — the lessons, assignments, and quizzes you publish to students. Open it from the LMS section of the teacher portal navigation.

Page title: "My LMS Courses." Subtitle: "Manage your online courses."

Filters:

Two filters at the top let you narrow the course list:
Academic Year — a dropdown defaulting to the current year.
Semester — All Semesters, Semester 1, or Semester 2.

Changing either filter reloads the list immediately.

Course cards:

Your courses are shown as cards in a grid (one, two, or three columns depending on screen width). Each card shows:

A coloured top stripe in your school's colour.
Subject name in bold at the top, with a status badge (Draft, Published, or Archived) in the top-right corner.
Chips below the subject: the class name (grey), and an optional Semester chip.
A summary line: "N lessons · N assignments · N quizzes."
A "pending" badge in red if students have submitted work that you have not yet graded — this draws attention to ungraded submissions.

Two buttons at the bottom of each card:
"Open Course" — navigates into the course detail page where you manage lessons, assignments, and quizzes.
"Publish" / "Unpublish" — toggles the course between published (visible to students) and draft (hidden from students).

Creating a new course:

Click "+ New Course" in the top-right corner. A modal opens. The Subject and Class dropdowns are populated from your timetable assignments — only the subjects and classes the admin has assigned to you in the timetable are available. If you have no timetable assignments yet, a warning appears asking you to contact the admin.

Fields:
Subject (required) — one of your timetable subjects.
Class (required) — one of your timetable classes.
Academic Year — defaults to the current year; change if creating a course for a different year.
Semester (optional) — Semester 1, Semester 2, or leave blank.
Description (optional) — a brief summary of the course.

Click "Create Course." The course is created in Draft status. It does not appear to students until you publish it.

If no courses exist for the selected filters, an empty state is shown with a "Create your first course" button.`,
  },

  // ── Student entries ───────────────────────────────────────────────────────────

  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'My Courses (LMS)',
    body: `The My Courses page shows all the online courses your teachers have published for your class. Open it from the LMS or Courses section of the student portal navigation.

Page title: "My Courses."

At the top-right, two dropdowns let you choose the Academic Year and Semester to view. The page defaults to the current year and semester automatically. Change these to browse courses from past semesters.

Your courses are shown as cards. Each card displays:

A coloured top stripe in your school's colour.
The subject name in bold at the top.
A "N pending" badge in red if you have assignments you have not yet submitted — this alerts you to overdue or upcoming work.
Your teacher's name below the subject.
Three count chips: "N Lessons," "N Assignments," and "N Quizzes."
An "Open" button at the bottom.

Click "Open" to enter the course and access its lessons, assignments, and quizzes.

If no courses appear for the selected year and semester, the page shows: "No courses for this period. Try a different year or semester, or check with your teachers."

Courses are only visible here when your teacher has published them. If you expect to see a course but it is not listed, your teacher may not have published it yet.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Pasco Practice',
    body: `Pasco Practice is an interactive past-question drill using Ghana WAEC past-question papers. Use it to prepare for exams by practising multiple-choice questions filtered by subject, difficulty, and year. Open it from the Pasco or Practice section of the student portal.

Page subtitle: "Ghana WAEC past questions drill."

Setting up a session:

Choose your options on the setup screen:

Subject — select the subject you want to practise. The list shows the subjects your school has configured.

Difficulty — choose from four buttons: All (any difficulty), Easy, Medium, or Hard. Your selection is highlighted.

Year (optional) — type a specific past-paper year (e.g. 2019) to practise only questions from that year. Leave blank to draw from all available years.

Click "Start Practice." Up to 20 questions are loaded at random from the matching questions in the Pasco Bank.

Answering questions:

Each question is shown on a card with the year badge and difficulty badge at the top, followed by the question text. Below, four answer buttons are shown: A, B, C, D.

Tap any option to select it. The answer is revealed immediately — you cannot change your selection after tapping. Feedback is shown:
Correct answer — highlighted green (green border, green label, green checkmark icon).
Your wrong selection — highlighted red (red border, red label, red X icon).
Other options — faded.

A feedback panel below the options confirms: "Correct!" or "Incorrect. The correct answer is X." followed by an explanation of the correct answer (if your school's admin has provided one).

Your running score (correct answers so far / questions answered) is shown in the top-right corner. A progress bar at the top of the page shows how far through the session you are.

Click "Next Question" to continue. If it is the last question, the button shows "See Results."

Session results:

When all questions are answered, the results screen shows:
Your score as a fraction (e.g. 16/20) and percentage.
A grade badge: Excellent (≥ 80%), Good (≥ 60%), Pass (≥ 40%), or Needs Work (< 40%).

Two buttons let you continue:
"Try Again" — reloads a fresh set of 20 random questions with the same filters.
"Change Subject" — returns to the setup screen so you can choose different filters.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} LMS overview help entries…\n`);
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
      console.log(`  ✓  ${e.title}`);
    } else {
      skipped++;
      console.log(`  –  ${e.title} (already exists)`);
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
