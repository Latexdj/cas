'use strict';
const cron = require('node-cron');
const pool = require('../config/db');
const { createNotification, sendTeacherEmail } = require('../services/notification.service');
const { sendSms } = require('../services/sms.service');

// Reminds both sides of an open lesson-observation action item: the teacher
// (who owns closing it out) and the observer (who set it, so they can follow
// up or schedule a re-observation) — see design doc §3e/§9. Pinged once when
// due in 2 days, and once the day after it goes overdue; not a daily nag.
async function notifyBoth(schoolId, observationId, description, dueDate, teacher, observer, label) {
  const title = `Lesson Observation Action ${label}`;
  const teacherMsg  = `Your action item "${description}" (due ${dueDate}) is ${label.toLowerCase()}.`;
  const observerMsg = `The action item "${description}" (due ${dueDate}) you set for ${teacher.name} is ${label.toLowerCase()}.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, teacherMsg),
    sendTeacherEmail(teacher.email, title, `Dear ${teacher.name},\n\n${teacherMsg}\n\n— CAS`),
    teacher.phone ? sendSms(teacher.phone, teacherMsg) : Promise.resolve(),
    createNotification(schoolId, observer.id, title, observerMsg),
    sendTeacherEmail(observer.email, title, `Dear ${observer.name},\n\n${observerMsg}\n\n— CAS`),
    observer.phone ? sendSms(observer.phone, observerMsg) : Promise.resolve(),
  ]);
}

async function runObservationActionReminders() {
  try {
    for (const [interval, label] of [["+2 days", 'Due Soon'], ["-1 days", 'Overdue']]) {
      const { rows } = await pool.query(
        `SELECT a.id, a.description, a.due_date::text AS due_date, o.school_id,
                t.id AS teacher_id, t.name AS teacher_name, t.email AS teacher_email, t.phone AS teacher_phone,
                ob.id AS observer_id, ob.name AS observer_name, ob.email AS observer_email, ob.phone AS observer_phone
         FROM lesson_observation_actions a
         JOIN lesson_observations o ON o.id = a.observation_id
         JOIN teachers t  ON t.id = o.observed_teacher_id
         JOIN teachers ob ON ob.id = o.observer_id
         WHERE a.status = 'Open' AND a.due_date = (CURRENT_DATE + $1::interval)::date`,
        [interval]
      );
      for (const row of rows) {
        await notifyBoth(
          row.school_id, row.id, row.description, row.due_date,
          { id: row.teacher_id, name: row.teacher_name, email: row.teacher_email, phone: row.teacher_phone },
          { id: row.observer_id, name: row.observer_name, email: row.observer_email, phone: row.observer_phone },
          label
        );
      }
    }
  } catch (err) {
    console.error('[observationActionReminders] Error:', err.message);
  }
}

// Daily at 7:30 AM (Africa/Accra = UTC+0)
function startObservationActionReminderJob() {
  cron.schedule('30 7 * * *', runObservationActionReminders, { timezone: 'Africa/Accra' });
}

module.exports = { startObservationActionReminderJob, runObservationActionReminders };
