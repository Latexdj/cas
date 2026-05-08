const { Resend } = require('resend');

// If no API key is configured, email functions silently no-op.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'attendance@yourschool.edu.gh';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@yourschool.edu.gh';

async function sendAbsenceNotification(lesson, date) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `Absence Alert: ${lesson.teacher_name} — ${date}`,
      text: `ATTENDANCE SYSTEM ALERT

Teacher : ${lesson.teacher_name}
Subject : ${lesson.subject}
Class   : ${lesson.class_name}
Date    : ${date} (${lesson.day_name})
Period  : ${lesson.start_time} – ${lesson.end_time}
Status  : Marked absent (automated)

Please follow up with the teacher if necessary.`,
    });
  } catch (err) {
    // Email failure must never break the absence-recording flow
    console.error('Failed to send absence notification:', err.message);
  }
}

async function sendRemedialScheduledNotification(remedial, teacherName, adminEmail) {
  if (!resend) return;
  try {
    const target = adminEmail || ADMIN_EMAIL;
    await resend.emails.send({
      from: FROM,
      to: target,
      subject: `Remedial Lesson Scheduled: ${teacherName}`,
      text: `REMEDIAL LESSON SCHEDULED

Teacher         : ${teacherName}
Subject         : ${remedial.subject}
Class           : ${remedial.class_name}
Original Absence: ${remedial.original_absence_date}
Remedial Date   : ${remedial.remedial_date}
Remedial Time   : ${remedial.remedial_time}`,
    });
  } catch (err) {
    console.error('Failed to send remedial notification:', err.message);
  }
}

async function sendDailyAbsenceReport(absences, date) {
  if (!resend || !absences.length) return;
  try {
    const lines = absences
      .map(
        (a, i) =>
          `${i + 1}. ${a.teacher_name} — ${a.subject} — ${a.class_name}\n   Period: ${a.scheduled_period}\n   Reason: ${a.reason || 'Not provided'}`
      )
      .join('\n\n');

    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `Daily Absence Report — ${date}`,
      text: `DAILY ABSENCE REPORT\nDate: ${date}\nTotal: ${absences.length}\n\n${lines}`,
    });
  } catch (err) {
    console.error('Failed to send daily absence report:', err.message);
  }
}

module.exports = {
  sendAbsenceNotification,
  sendRemedialScheduledNotification,
  sendDailyAbsenceReport,
};
