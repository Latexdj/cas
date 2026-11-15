'use strict';
/**
 * Principal portal seed: management-role help entries for the pages that had
 * none (Classroom Occupancy, Roll Call, Personnel Records, Entry Grades,
 * Exam Performance, WAEC Results, and the Discipline tabs).
 * Run: node backend/seed-help-entries-principal.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 * Also retires 'Viewing House Occupancy', which described the wrong page.
 */
const { runSeed } = require('./help-seed-runner');

const M = ['management'];

const ENTRIES = [
  {
    feature_area: 'principal_occupancy', applicable_roles: M,
    title: 'Classroom Occupancy (Principal Portal)',
    body: `Monitoring → Classroom Occupancy shows every timetabled lesson for a day and whether a teacher is in it. It opens on today; use the date box to look at another day.

The count chips at the top total the lessons by status:
- Confirmed: the teacher has submitted attendance for the lesson.
- Ongoing: the lesson is happening now.
- Upcoming: the lesson has not started yet.
- Not Submitted: the lesson has ended and the teacher has not recorded it.
- Absent: the teacher was marked absent for the lesson.
- On Leave: the teacher has approved leave; the leave type is shown.

Lessons are grouped by time slot. Each card shows the class, subject, teacher name and code, and the teacher's phone number with a Call button so you can reach anyone whose class is unattended.

If the day is a holiday or vacation, the page says so instead of listing lessons. If no lessons appear on a school day, a timetable has probably not been uploaded for the current academic year and semester.`,
  },
  {
    feature_area: 'roll_call', applicable_roles: M,
    title: 'Taking a Roll Call (Principal Portal)',
    body: `Boarding → Roll Call is for checking boarders at assembly, prep or night roll call.

1. Tap "Start roll call". Give it an optional title (for example "Evening roll call"), the date and an optional location (for example "Assembly Hall"), and save.
2. Open the roll call from the "This semester" list. Choose a class (or All Classes) and tap "Add boarding students" to put the boarders on the list. Everyone starts as Present.
3. Mark each student Present, Absent or Break Bounds, add a note where needed, and tap Save.

Each roll call in the list shows its Present and Absent counts. To delete one, tap the trash icon and then "Tap again to delete"; this removes the roll call and all its entries.`,
  },
  {
    feature_area: 'personnel', applicable_roles: M,
    title: 'Personnel Records (Principal Portal)',
    body: `Records → Personnel Records lists your students or your teachers. Switch between Students and Teachers at the top.

For students, filter by class and by status (Active, Inactive or Graduated); the list shows each student's programme, gender, residential status and guardian. For teachers, filter by department and status; the list shows rank, email and phone. Type in the search box to find a person by name.

Tap Export Excel to download the current list, with your filters applied, as an Excel file.`,
  },
  {
    feature_area: 'entry_grades', applicable_roles: M,
    title: 'Entry Grades (BECE Aggregates)',
    body: `Records → Entry Grades analyses the BECE aggregate each student came in with. A lower aggregate is better (6 is the best possible).

Choose which students to include: Active, Graduated or All Students. The charts show:
- Aggregate distribution: how many students fall in each aggregate range.
- Average aggregate by programme, best to worst.
- Average aggregate by entry year, so you can see whether intake quality is rising or falling.

If a chart is empty, entry grades have not been recorded for those students. The admin enters them on each student's record.`,
  },
  {
    feature_area: 'exam_performance', applicable_roles: M,
    title: 'Exam Performance (Principal Portal)',
    body: `Records → Exam Performance shows how the school did in a term. Choose the academic year, the semester and which students to include (Active, Graduated or All Students).

- Performance trend: the terminal exam average for every term on record (exam scores only, not blended with continuous assessment).
- Grade distribution: how many students got each overall grade this term.
- Subject performance: the average score per subject, best to worst.
- Class performance: the average score per class, best to worst.

"No results recorded for this term yet" means results have not been compiled for that term.`,
  },
  {
    feature_area: 'waec_results', applicable_roles: M,
    title: 'WAEC Results (Principal Portal)',
    body: `Records → WAEC Results shows the WASSCE results the admin has imported, with four tabs.

- Year Report: choose a year to see the WASSCE analysis for it: total candidates, how many presented, absent or had results cancelled or withheld, the pass rate, the summary of subjects passed, and WAEC's own printed summary where it was imported. Filter by subject or gender.
- Analytics Trends: performance across every year on record, overall and subject by subject.
- Rankings: candidates ranked by their best-6 aggregate.
- Student Lookup: search by name or index number to see one candidate's grades.

If the page says no WASSCE results have been imported, ask the admin to import the results file.`,
  },
  {
    feature_area: 'discipline', applicable_roles: M,
    title: 'Teacher Queries and Flagged Students (Principal Portal)',
    body: `Actions → Discipline has three tabs.

Pending Approval holds disciplinary letters waiting for you. Open one to read the letter and the watermarked draft PDF. Approve it to issue the final PDF, or return it for correction with a reason (required); the teacher fixes it and resubmits.

Teacher Queries lists the queries issued to teachers, with their status (Open, Responded, Acknowledged, Escalated, Resolved, Overdue or Voided). Search by teacher, department, subject or reference number, and filter by category and status. Open a query to read it and the teacher's response.

Flagged Students lists students who match the school's detection rules, with the reason for each flag: repeat offence, escalating severity, many offences in one category, several offences in a short time, or a serious case left without action. It also flags teachers with escalated or repeated queries. Use it to step in early. The admin sets the rules.`,
  },
];

runSeed('principal portal', ENTRIES, { retire: ['Viewing House Occupancy'] })
  .catch(err => { console.error(err); process.exit(1); });
