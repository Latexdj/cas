const pool = require('../config/db');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM    = process.env.SMTP_FROM || 'staugustineshts@gmail.com';

async function createNotification(schoolId, teacherId, title, message) {
  try {
    await pool.query(
      `INSERT INTO teacher_notifications (school_id, teacher_id, title, message)
       VALUES ($1, $2, $3, $4)`,
      [schoolId, teacherId, title, message]
    );
  } catch (err) {
    console.error('[Notification] DB insert failed:', err.message);
  }
}

async function sendTeacherEmail(teacherEmail, subject, body) {
  if (!BREVO_API_KEY || !teacherEmail) return;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'CAS Attendance', email: EMAIL_FROM },
        to: [{ email: teacherEmail }],
        subject,
        textContent: body,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Notification] Email failed:', err.message || res.status);
    }
  } catch (err) {
    console.error('[Notification] Email failed:', err.message);
  }
}

async function notifyTeacherAttendanceRevoked(schoolId, teacher, record, reason) {
  const title   = 'Attendance Record Revoked';
  const message = `Your attendance record for ${record.subject} — ${record.class_names} on ${record.date} has been removed by the administrator. Reason: ${reason}. You have been marked absent. Contact your administrator if you believe this is an error.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Attendance Revoked — ${record.date}`,
      `Dear ${teacher.name},\n\nYour attendance submission has been removed by the school administrator following a review.\n\nDetails:\n  Date    : ${record.date}\n  Subject : ${record.subject}\n  Class   : ${record.class_names}\n  Reason  : ${reason}\n\nYou have been marked absent for the affected class(es). If you believe this is an error, please contact your school administrator.\n\n— Attendance System`
    ),
  ]);
}

async function notifyTeacherAttendanceDeleted(schoolId, teacher, record) {
  const title   = 'Attendance Record Removed';
  const message = `Your attendance record for ${record.subject} — ${record.class_names} on ${record.date} has been removed by the administrator.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Attendance Record Removed — ${record.date}`,
      `Dear ${teacher.name},\n\nYour attendance submission for ${record.subject} — ${record.class_names} on ${record.date} has been removed by the school administrator.\n\nIf you have questions about this action, please contact your school administrator.\n\n— Attendance System`
    ),
  ]);
}

async function notifyTeacherAbsenceDeleted(schoolId, teacher, absence) {
  const title   = 'Absence Record Cleared';
  const message = `Your absence record for ${absence.subject} — ${absence.class_name} on ${absence.date} has been cleared by the administrator. You may now resubmit your attendance.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Absence Cleared — ${absence.date}`,
      `Dear ${teacher.name},\n\nYour absence record for ${absence.subject} — ${absence.class_name} on ${absence.date} has been cleared by the school administrator.\n\nYou may now resubmit your attendance for that lesson.\n\n— Attendance System`
    ),
  ]);
}

module.exports = {
  createNotification,
  sendTeacherEmail,
  notifyTeacherAttendanceRevoked,
  notifyTeacherAttendanceDeleted,
  notifyTeacherAbsenceDeleted,
};
