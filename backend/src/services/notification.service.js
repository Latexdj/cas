const pool = require('../config/db');
const { sendSms } = require('./sms.service');

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

function formatProfileFieldNames(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field) => field.replace(/_/g, ' ')).join(', ');
}

async function notifyTeacherProfileRequestSubmitted(schoolId, teacher, request) {
  const fieldText = formatProfileFieldNames(request?.field_names || []);
  const title = 'Profile Change Submitted';
  const message = fieldText
    ? `Your requested change to ${fieldText} has been submitted and is awaiting administrative review.`
    : 'Your official profile change request has been submitted and is awaiting administrative review.';

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      'Profile Change Submitted',
      `Dear ${teacher.name},\n\nYour request to update ${fieldText || 'your official profile details'} has been submitted successfully and is now pending review by the school administration.\n\nWe will notify you once the request is approved or rejected.\n\n— CAS Administration`
    )
  ]);
}

async function notifyTeacherProfileRequestApproved(schoolId, teacher, request) {
  const fieldText = formatProfileFieldNames(request?.field_names || []);
  const title = 'Profile Change Approved';
  const message = fieldText
    ? `Your request to update ${fieldText} has been approved and the changes are now live on your profile.`
    : 'Your official profile change request has been approved and the changes are now live on your profile.';

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      'Profile Change Approved',
      `Dear ${teacher.name},\n\nYour requested update to ${fieldText || 'your official profile details'} has been approved by the school administrator.\n\nThe updated information is now live on your profile.\n\n— CAS Administration`
    )
  ]);
}

async function notifyTeacherProfileRequestRejected(schoolId, teacher, request, note) {
  const fieldText = formatProfileFieldNames(request?.field_names || []);
  const title = 'Profile Change Rejected';
  const message = note
    ? `Your request to update ${fieldText || 'your official profile details'} has been rejected. Review note: ${note}`
    : `Your request to update ${fieldText || 'your official profile details'} has been rejected. Please contact the administration for more information.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      'Profile Change Rejected',
      `Dear ${teacher.name},\n\nYour request to update ${fieldText || 'your official profile details'} has been rejected by the school administrator.\n\nReview Note: ${note || 'No additional note supplied.'}\n\nIf you need guidance, please contact the school administration.\n\n— CAS Administration`
    )
  ]);
}

async function notifyPendingAttendanceSubmitted(schoolId, teacher, kind, description, reason) {
  const title   = 'Submission Pending Review';
  const message = `Your ${kind} submission (${description}) could not be location-verified, so it has been sent for admin review instead of being rejected. Reason given: ${reason}. You will be notified once it's reviewed.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Submission Pending Review — ${description}`,
      `Dear ${teacher.name},\n\nYour ${kind} submission (${description}) could not be location-verified, so instead of being rejected it has been sent to the school administrator for review.\n\nReason given: ${reason}\n\nYou will not be marked present until this is approved. We'll notify you once a decision is made.\n\n— CAS Attendance`
    ),
  ]);
}

async function notifyPendingAttendanceApproved(schoolId, teacher, kind, description) {
  const title   = 'Submission Approved';
  const message = `Your ${kind} submission (${description}) has been reviewed and approved. You are now marked present.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Submission Approved — ${description}`,
      `Dear ${teacher.name},\n\nYour ${kind} submission (${description}), which was pending admin review, has been approved.\n\nYou are now marked present for this.\n\n— CAS Attendance`
    ),
  ]);
}

async function notifyPendingAttendanceRejected(schoolId, teacher, kind, description, reviewNote) {
  const title   = 'Submission Rejected';
  const message = reviewNote
    ? `Your ${kind} submission (${description}) was reviewed and rejected. Reason: ${reviewNote}. You have been marked absent for this.`
    : `Your ${kind} submission (${description}) was reviewed and rejected. You have been marked absent for this.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      `Submission Rejected — ${description}`,
      `Dear ${teacher.name},\n\nYour ${kind} submission (${description}), which was pending admin review, has been rejected.\n\nReview note: ${reviewNote || 'No additional note supplied.'}\n\nYou have been marked absent for this. If you believe this is an error, please contact your school administrator.\n\n— CAS Attendance`
    ),
  ]);
}

async function notifyTeacherObservationScheduled(schoolId, teacher, observation) {
  const when = observation.scheduled_at
    ? new Date(observation.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'soon';
  const lessonDesc = observation.subject ? `your ${observation.subject}${observation.class_names ? ` (${observation.class_names})` : ''} lesson` : 'your lesson';
  const title   = 'Lesson Observation Scheduled';
  const message = `${observation.observer_name || 'Your HOD/management'} will observe ${lessonDesc} on ${when}.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      title,
      `Dear ${teacher.name},\n\n${observation.observer_name || 'A member of management'} has scheduled a lesson observation for ${lessonDesc} on ${when}.\n\nThis is a routine part of our teaching quality process — no preparation beyond your normal lesson plan is needed.\n\n— CAS`
    ),
    teacher.phone ? sendSms(teacher.phone, message) : Promise.resolve(),
  ]);
}

async function notifyTeacherObservationFeedbackReady(schoolId, teacher, observation) {
  const title   = 'Lesson Observation Feedback Ready';
  const message = `Feedback from your ${observation.subject || 'recent'} lesson observation is ready. Open it to see what went well and what to work on.`;

  await Promise.all([
    createNotification(schoolId, teacher.id, title, message),
    sendTeacherEmail(
      teacher.email,
      title,
      `Dear ${teacher.name},\n\nFeedback from your recent lesson observation${observation.subject ? ` (${observation.subject})` : ''} is now ready to view.\n\nPlease log in to review what went well and what to work on, and acknowledge once you've read it.\n\n— CAS`
    ),
    teacher.phone ? sendSms(teacher.phone, message) : Promise.resolve(),
  ]);
}

module.exports = {
  createNotification,
  sendTeacherEmail,
  notifyTeacherAttendanceRevoked,
  notifyTeacherAttendanceDeleted,
  notifyTeacherAbsenceDeleted,
  notifyTeacherProfileRequestSubmitted,
  notifyTeacherProfileRequestApproved,
  notifyTeacherProfileRequestRejected,
  notifyPendingAttendanceSubmitted,
  notifyPendingAttendanceApproved,
  notifyPendingAttendanceRejected,
  notifyTeacherObservationScheduled,
  notifyTeacherObservationFeedbackReady,
};
