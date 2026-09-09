'use strict';
/**
 * LMS Course Detail seed: 6 help entries covering the teacher Course Studio
 * (lessons, assignments, quizzes, question builder, submissions, announcements)
 * and the student course view + quiz room.
 * Run once: node backend/seed-help-entries-lms-course.js
 * Safe to re-run: INSERT ... WHERE NOT EXISTS keyed on (school_id IS NULL, title).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ENTRIES = [

  // ── Teacher entries ───────────────────────────────────────────────────────────

  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'Course Studio — Lessons',
    body: `Opening a course from your My LMS Courses list brings you to the Course Studio. The header shows the subject name, class, status badge (Draft / Published / Archived), and the course description if one was set.

The Studio has five tabs: Lessons, Assignments, Quizzes, Submissions, and Announcements.

Lessons tab:

The Lessons tab is where you add the teaching content students will study. A count line shows how many lessons exist, and a "+ Add Lesson" button opens the lesson form.

Each lesson in the list shows:
Its position number, the lesson title, a content-type badge, a Published/Draft toggle, and Edit + Del buttons.

Content type badges:
Text — grey badge, lesson body is typed directly.
File — green badge, an image or PDF uploaded from your device.
YouTube — red badge, an embedded YouTube video.
Link — warm badge, an external URL (opens in a new tab for the student).

Adding or editing a lesson (modal):

Title (required).

Content Type — four toggle buttons. Click the type that matches your content:
Text → a text area appears where you type or paste the lesson body.
YouTube → a URL field for the YouTube link (e.g. https://youtu.be/...).
Link → a URL field for any external web address.
File → a file picker for an image (JPEG/PNG/etc.) or PDF. Images are automatically compressed to a maximum of 1200 × 1200 pixels to keep file sizes small. A confirmation "File ready to upload" appears when the file is loaded.

Sort Order — a number field controlling where the lesson appears in the list. Lower numbers come first. This lets you reorder lessons without deleting and recreating them.

Published checkbox — untick to save the lesson as a draft (invisible to students). Tick to make it visible.

Click "Save Lesson" to save. The lesson list updates immediately.

Managing lessons:

Click the Published / Draft badge on a lesson row to toggle visibility without opening the edit form.
Click Edit to reopen the form with the lesson's current values.
Click Del and confirm the browser prompt to permanently delete a lesson.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'Course Studio — Assignments',
    body: `The Assignments tab is where you create and manage written assignments that students submit through the portal.

Each assignment row shows: the title, max score, due date, submission count, graded count, and CA assessment mode if linked. A green "Synced" timestamp appears if scores have been pushed to the CA register.

Adding or editing an assignment (modal):

Title (required).

Instructions (optional) — detailed instructions for the student, shown on their assignment card.

Max Score (required) — the maximum marks available. Students' scores are entered up to this value.

Due Date (optional) — a date and time picker. If set, students see the due date and a red "Overdue" indicator after the deadline passes. If the assignment allows late submissions, students can still submit after the due date.

Count for CA (optional) — a dropdown listing your school's assessment modes (e.g. "Class Test 1 (20%)"). Linking an assignment to a CA mode lets you sync graded scores directly to the continuous assessment register with one click.

Allow Late checkbox — when ticked, students can submit after the due date. The submission is marked with an orange "Late" badge in your Submissions view.

Published checkbox — controls whether students can see and submit the assignment. Assignments default to Published when created.

Click "Save Assignment."

Syncing scores to CA:

After grading submissions, if the assignment is linked to a CA mode, a "Sync CA" button appears on the assignment row. Click it and confirm to push all graded scores to the CA register. A timestamp is shown after a successful sync.

To grade submissions, go to the Submissions tab.

Deleting an assignment:

Click Del and confirm the browser prompt. All submissions for that assignment are also deleted.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'Course Studio — Quizzes and Question Builder',
    body: `The Quizzes tab lets you create timed or untimed online quizzes that are auto-marked for MCQ questions.

Quiz list:

Each quiz row shows: title, question count, total marks, time limit (if set), CA mode (if linked), a Published/Draft toggle, a "Sync CA" button (if a CA mode is linked), Edit, Questions, and Del buttons.

Creating a quiz:

Click "+ New Quiz." A modal opens with the quiz settings:

Title (required).

Instructions (optional) — guidance shown to the student before they start.

Time Limit (mins, optional) — if set, a countdown timer runs during the quiz. The quiz auto-submits when time runs out. Leave blank for no time limit.

Max Attempts — how many times a student may take the quiz (default is 1). Setting this to 2 or more allows retakes; the student's best score is shown in their course view.

Count for CA (optional) — link to an assessment mode to enable "Sync CA" after the quiz closes.

Show Answers After Submit — when ticked, students see which answers were correct (and any explanations) immediately after submitting. When unticked, they only see their score.

Published checkbox — untick to keep the quiz hidden until you are ready.

Click "Next: Add Questions →" to save the settings and immediately open the Question Builder.

Question Builder:

The Question Builder replaces the tab content with a full question editor. Click "← Back" to return to the quiz list without losing saved questions; click "Save Questions" to save and return.

Each question card shows:
A Q# label, the question text area, an X button to remove the question.
Type dropdown: MCQ (multiple choice) or Short Answer.
Marks field: how many marks this question is worth.

For MCQ questions:
Four option fields (A, B, C, D). Click the radio button to the left of the correct answer to mark it.
An Explanation field (optional) — shown to the student after submission if "Show Answers After Submit" is enabled.

For Short Answer questions:
No options are shown. Students type a free-text answer. Short answer questions are not auto-marked — you must grade them manually.

Click "+ Add Question" (dashed button at the bottom) to add another question. Click "Save Questions" when finished.

Editing an existing quiz's questions:

Click the "Questions" button on any quiz row to open the Question Builder for that quiz.

Syncing quiz scores to CA:

After students have completed the quiz, click "Sync CA" on the quiz row and confirm. All students' best scores are pushed to the CA register.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['teacher'],
    title: 'Course Studio — Submissions and Announcements',
    body: `Submissions tab:

The Submissions tab is where you grade student assignment work. It lists all assignments in the course as accordion rows. Each row shows the assignment title, max score, and total submission count.

Click an assignment row to expand it and see the submitted work. A filter bar at the top lets you switch between All, Ungraded, and Graded submissions.

Each submission card shows:
The student's name, class, and submission timestamp.
An orange "Late" badge if the student submitted after the due date.
A Score input (number, 0 to the assignment's max score).
A Feedback textarea.
A "Save" button.

Enter a score and optional feedback, then click "Save." The submission moves from "Ungraded" to "Graded" in the student's view, and the student can see their score and feedback on their assignment card. You can update a score later by expanding the assignment again and saving new values.

After grading, use the "Sync CA" button on the Assignments tab to push scores to the CA register if the assignment is linked to an assessment mode.

Announcements tab:

The Announcements tab lets you post notices to the course. Announcements appear in the student's course view under their Announcements tab.

Announcement list:

Each announcement card shows the title, a "Pinned" badge (yellow) if pinned, a two-line preview of the body, the date posted, and a Del button.

Posting an announcement:

Click "+ New Announcement." A modal opens with:
Title (required).
Body (required) — the full text of the announcement.
"Pin this announcement" checkbox — pinned announcements are sorted to the top of the student's announcement list regardless of when they were posted.

Click "Post Announcement" to publish immediately.

Deleting an announcement:

Click Del on an announcement card and confirm the browser prompt. Deletion is permanent.

Note: there is no Edit button for announcements — to correct a posted announcement, delete it and repost with the corrected text.`,
  },

  // ── Student entries ───────────────────────────────────────────────────────────

  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Course View — Lessons and Assignments',
    body: `Opening a course from My Courses brings you to the Course View. A back arrow at the top returns you to the course list. The course name (subject) and your teacher's name are shown in the header.

The course has four tabs: Lessons, Assignments, Quizzes, and Announcements.

Lessons tab:

Lessons are shown as a list of expandable rows. Each row has a content icon on the left showing what type of content it contains:
Grey document icon — text lesson.
Red YouTube icon — video lesson.
Blue link icon — external link.
Amber paperclip icon — file (image or PDF).

Tap a lesson row to expand it and see the content:
Text lessons — the lesson body is displayed in a warm-coloured box.
YouTube lessons — a video player is embedded directly in the page.
Link lessons — a blue "Open Link" button opens the external page in a new browser tab.
File lessons — an amber "Download / View File" button opens the file (image or PDF) in a new tab.

Tap the row again to collapse it.

Assignments tab:

Each assignment appears as a card showing the title, due date, and maximum score. An "Overdue" label appears in red if the due date has passed and you have not yet submitted.

Status badges:
Not Submitted (amber) — you have not yet submitted.
Submitted (blue) — your work has been received and is waiting to be graded.
Graded: N/M (green) — your teacher has graded your submission. The score and any feedback your teacher left appear in a green panel on the card.

Submitting an assignment:

On an unsubmitted card, a text area appears for you to write your answer. You may also attach a file by clicking "Attach file." The "Submit Assignment" button is disabled until you have entered text or selected a file. Click it to submit.

Resubmitting:

If your submission has not yet been graded, a "Resubmit" button appears on the card. Click it to open the submission form again and replace your previous submission. You cannot resubmit after the teacher has graded your work.`,
  },

  {
    feature_area: 'lms',
    applicable_roles: ['student'],
    title: 'Taking a Course Quiz',
    body: `Course quizzes are accessed from the Quizzes tab inside a course. Each quiz card shows the title, number of questions, total marks, time limit (if any), and how many attempts you have used.

Status badges on quiz cards:
Not Attempted — grey badge, you have not started this quiz.
Best: N/M — blue badge showing your best score from previous attempts.
Max Attempts — red badge, you have used all allowed attempts and cannot retake the quiz.

Click "Start Quiz" (or "Retake Quiz" for a second attempt) to enter the quiz room.

Start screen:

A summary shows the number of questions, the time limit (∞ if unlimited), and the total marks available. If your teacher has added instructions, they appear in an amber box. Click "Start Quiz" to begin.

Answering questions:

A progress bar across the top fills as you move through questions. The current question number and quiz title are shown in the header.

Timer: if the quiz has a time limit, a countdown is shown in the top-right corner. It turns red when less than 60 seconds remain. The quiz submits automatically when the timer reaches zero.

Each question shows the question text and the marks it is worth. Below the question:

MCQ questions — four option buttons (A, B, C, D). Tap your chosen option to select it (highlighted in your school's colour). Tap a different option to change your answer.

Short Answer questions — a text area where you type your response. The border turns your school's colour when text has been entered.

Use the "Previous" and "Next" buttons to move between questions. You can also jump directly to any question by tapping its dot in the question-dot bar at the bottom of the screen. Answered dots turn green; unanswered dots stay grey.

Review and submit:

On the last question, "Next" is replaced by "Review & Submit." Click it to go to the review screen, which lists all questions, showing which are answered (green circle) and which are skipped (amber circle). Unanswered questions will score zero. Click any question in the list to go back and answer it. When ready, click "Submit Quiz."

Results:

After submitting, the results screen shows your score, percentage, and a grade badge (Excellent ≥ 80%, Good ≥ 60%, Pass ≥ 40%, Fail < 40%).

If your teacher has enabled "Show Answers After Submit," a question breakdown appears below your score. Each question shows whether you answered correctly (green ✓) or incorrectly (red ✗), your answer, the correct answer, and any explanation your teacher provided. Click "Back to Course" to return to the course view.`,
  },

];

async function run() {
  console.log(`Seeding ${ENTRIES.length} LMS course detail help entries…\n`);
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
