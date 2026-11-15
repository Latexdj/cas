'use strict';
/**
 * Lesson Observation seed: help entries for observing lessons and reading feedback.
 *   admin, management — observing, the rubric, publishing, analytics
 *   teacher           — HOD observations; reading and acknowledging your own feedback
 * Run: node backend/seed-help-entries-lesson-observation.js  (or node backend/seed-help-all.js)
 * Safe to re-run: inserts new entries and updates existing ones by title.
 */
const { runSeed } = require('./help-seed-runner');

const OBSERVE = `To start an observation, tap "+ New Observation". Choose:
- Teacher (required).
- Type: Drop-in (a lesson happening now) or Scheduled (a planned visit, with a date and time).
- Academic year and semester.
- Lesson: pick the subject and class from the teacher's timetable.
- Entry mode: Live (score now, or later in the app) or Entered from paper form.
Tap Create & Continue.

On the observation record, score each area of the rubric from 1 (Ineffective) to 4 (Highly Effective), or leave it as Not Observed, and add a note where it helps. Then write What Went Well, What to Work On and a Recommended Action (all three are required to publish). Observer Notes are private and never shown to the teacher. You can add evidence photos and follow-up action items with due dates.

Tap Save Draft to finish later, or Publish to Teacher when you are done; the teacher can then read it in their portal. Close Observation marks it fully done. Download Blank Form (PDF) prints a paper form to fill in during the lesson and enter later.`;

const ENTRIES = [
  {
    feature_area: 'lesson_observation', applicable_roles: ['admin'],
    title: 'Lesson Observation (Admin)',
    body: `Lesson Observation (Administrative → Lesson Observation) records observations of teachers' lessons with a rubric, written feedback and follow-up actions. Heads of department observe their department's teachers; the principal and management can observe anyone. The Lesson Observation module must be enabled for your school.

${OBSERVE}

The Observations tab lists every observation with the teacher, observer, lesson and status (on a phone, swipe the table to reach Open). Analytics shows open, closed and overdue action items and a Coverage list of who has not been observed yet this year.`,
  },
  {
    feature_area: 'lesson_observation', applicable_roles: ['management'],
    title: 'Lesson Observation (Principal Portal)',
    body: `Open Monitoring → Lesson Observation. The Observations tab lists all observations of your teachers, with the observer and the scores; on a phone, swipe the table sideways and tap Open to read one.

Analytics shows open, closed and overdue action items, and Coverage lists the teachers who have not been observed yet this year, least-observed first.

${OBSERVE}`,
  },
  {
    feature_area: 'lesson_observation', applicable_roles: ['teacher'],
    title: 'Observing Lessons as Head of Department',
    body: `Heads of department find Observations under Responsibilities in the teacher portal, for observing teachers in their department.

${OBSERVE}`,
  },
  {
    feature_area: 'lesson_observation', applicable_roles: ['teacher'],
    title: 'Reading Feedback on Your Observed Lessons',
    body: `Open Administrative → My Observations to see the observations of your own lessons once they are published. Open one to read your scores for each area, What Went Well, What to Work On and the Recommended Action (the observer's private notes are not shown to you).

Add an optional comment (to give context or disagree) and tap Acknowledge to confirm you have read it. If follow-up action items were set, mark each one Done when you have completed it.`,
  },
];

runSeed('lesson observation', ENTRIES).catch(err => { console.error(err); process.exit(1); });
