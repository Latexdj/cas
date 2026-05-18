const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@yourschool.edu.gh';

// Transporter is null when credentials are not configured — functions silently no-op.
const transporter = (GMAIL_USER && GMAIL_PASS)
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      tls: { rejectUnauthorized: false },
    })
  : null;

async function sendMail(opts) {
  if (!transporter) return { skipped: true };
  return transporter.sendMail({ from: `"CAS Attendance" <${GMAIL_USER}>`, ...opts });
}

async function sendAbsenceNotification(lesson, date) {
  await sendMail({
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
}

async function sendRemedialScheduledNotification(remedial, teacherName, adminEmail) {
  await sendMail({
    to: adminEmail || ADMIN_EMAIL,
    subject: `Remedial Lesson Scheduled: ${teacherName}`,
    text: `REMEDIAL LESSON SCHEDULED

Teacher         : ${teacherName}
Subject         : ${remedial.subject}
Class           : ${remedial.class_name}
Original Absence: ${remedial.original_absence_date}
Remedial Date   : ${remedial.remedial_date}
Remedial Time   : ${remedial.remedial_time}`,
  });
}

async function sendDailyAbsenceReport(absences, date) {
  if (!absences.length) return;
  const lines = absences
    .map(
      (a, i) =>
        `${i + 1}. ${a.teacher_name} — ${a.subject} — ${a.class_name}\n   Period: ${a.scheduled_period}\n   Reason: ${a.reason || 'Not provided'}`
    )
    .join('\n\n');

  await sendMail({
    to: ADMIN_EMAIL,
    subject: `Daily Absence Report — ${date}`,
    text: `DAILY ABSENCE REPORT\nDate: ${date}\nTotal: ${absences.length}\n\n${lines}`,
  });
}

async function sendTeacherCredentials(teacher, school, pin) {
  if (!teacher.email) throw new Error('Teacher has no email address on record.');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your CAS Login Details</title></head>
<body style="margin:0;padding:0;background:#F4EFE6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E2D9CC;">

        <!-- Header -->
        <tr><td style="background:#0B3D2E;padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${school.name}</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.65);">Classroom Attendance System</p>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0;font-size:15px;color:#2C2218;">Dear <strong>${teacher.name}</strong>,</p>
          <p style="margin:12px 0 0;font-size:14px;color:#5C4F42;line-height:1.6;">
            Your login credentials for the <strong>CAS Teacher App</strong> are ready.
            Use the details below to set up the app on your phone.
          </p>
        </td></tr>

        <!-- Credentials box -->
        <tr><td style="padding:20px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE6;border-radius:12px;border:1px solid #E2D9CC;overflow:hidden;">
            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid #E2D9CC;">
                <p style="margin:0;font-size:11px;font-weight:700;color:#8C7E6E;text-transform:uppercase;letter-spacing:0.6px;">School Code</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#0B3D2E;letter-spacing:2px;font-family:monospace;">${school.code}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px;border-bottom:1px solid #E2D9CC;">
                <p style="margin:0;font-size:11px;font-weight:700;color:#8C7E6E;text-transform:uppercase;letter-spacing:0.6px;">Teacher ID</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#0B3D2E;letter-spacing:2px;font-family:monospace;">${teacher.teacher_code}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 20px;">
                <p style="margin:0;font-size:11px;font-weight:700;color:#8C7E6E;text-transform:uppercase;letter-spacing:0.6px;">Password / PIN</p>
                <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#DC2626;letter-spacing:4px;font-family:monospace;">${pin}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Steps -->
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#8C7E6E;text-transform:uppercase;letter-spacing:0.6px;">How to get started</p>
          ${[
            'Download the <strong>CAS Teacher App</strong> on your Android phone.',
            'Open the app and enter the <strong>School Code</strong> above.',
            'Log in with your <strong>Teacher ID</strong> and <strong>Password</strong>.',
            'Go to <strong>Profile → Change Password</strong> to set your own PIN.',
          ].map((step, i) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
            <tr>
              <td width="28" valign="top" style="padding-top:1px;">
                <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#0B3D2E;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:22px;">${i + 1}</span>
              </td>
              <td style="font-size:13px;color:#4A3F32;line-height:1.5;">${step}</td>
            </tr>
          </table>`).join('')}
        </td></tr>

        <!-- Security note -->
        <tr><td style="padding:16px 32px;background:#FFF8F0;border-top:1px solid #F5E6D0;">
          <p style="margin:0;font-size:12px;color:#92400E;line-height:1.6;">
            Keep this email private. Do not share your password with anyone.
            Contact your school admin if you need a reset.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #E2D9CC;">
          <p style="margin:0;font-size:11px;color:#A09282;">${school.name}</p>
          <p style="margin:6px 0 0;font-size:10px;color:#C4B8AC;">
            Designed by <strong style="color:#0B3D2E;">LatexTech</strong> · +233 24 8234 649
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendMail({
    to: teacher.email,
    subject: `Your CAS Login Details — ${school.name}`,
    html,
    text: `Your CAS Teacher App Login Details\n\nSchool: ${school.name}\n\nSCHOOL CODE : ${school.code}\nTEACHER ID  : ${teacher.teacher_code}\nPASSWORD    : ${pin}\n\nSteps:\n1. Download the CAS Teacher App on Android.\n2. Open the app and enter the School Code.\n3. Log in with your Teacher ID and Password.\n4. Change your password in Profile after first login.\n\nKeep this email private.\n\n${school.name} · Designed by LatexTech`,
  });
}

async function sendTestEmail() {
  if (!transporter) return { skipped: true, reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not set' };
  await transporter.verify();
  await sendMail({
    to: GMAIL_USER,
    subject: 'CAS Email Test',
    text: 'SMTP connection from Render is working correctly.',
  });
  return { ok: true, sentTo: GMAIL_USER };
}

module.exports = {
  sendAbsenceNotification,
  sendRemedialScheduledNotification,
  sendDailyAbsenceReport,
  sendTeacherCredentials,
  sendTestEmail,
};
