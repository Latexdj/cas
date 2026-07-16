'use strict';
const cron = require('node-cron');
const pool = require('../config/db');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM    = process.env.SMTP_FROM || 'noreply@cas.edu.gh';

async function sendMail(to, subject, text) {
  if (!BREVO_API_KEY || !to) return;
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: EMAIL_FROM, name: 'School Library' },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });
  } catch { /* non-fatal */ }
}

async function runLibraryNotifications() {
  try {
    // 1. Due-date reminders: loans due in the next 2 days
    const { rows: dueSoon } = await pool.query(
      `SELECT ll.id, ll.due_date, lb.title, s.name AS student_name, s.student_code,
              sch.name AS school_name,
              ss.email AS staff_email, ss.name AS staff_name
       FROM library_loans ll
       JOIN library_books lb ON lb.id = ll.book_id
       JOIN students s ON s.id = ll.student_id
       JOIN schools sch ON sch.id = ll.school_id
       -- notify the school's library staff accounts
       JOIN school_staff ss ON ss.school_id = ll.school_id
       JOIN school_staff_roles ssr ON ssr.staff_id = ss.id AND ssr.role = 'library'
       WHERE ll.status = 'active'
         AND ll.due_date = CURRENT_DATE + INTERVAL '2 days'
         AND ss.is_active = true`
    );

    // Group by staff email to send one email per staff per school
    const dueSoonByStaff = new Map();
    for (const row of dueSoon) {
      const key = row.staff_email;
      if (!dueSoonByStaff.has(key)) dueSoonByStaff.set(key, { ...row, items: [] });
      dueSoonByStaff.get(key).items.push(row);
    }
    for (const [, info] of dueSoonByStaff) {
      const lines = info.items.map(i =>
        `  • ${i.student_name} (${i.student_code}) — "${i.title}" due ${new Date(i.due_date).toLocaleDateString('en-GB')}`
      ).join('\n');
      await sendMail(
        info.staff_email,
        `Library Due-Date Reminder — ${info.items.length} book(s) due in 2 days`,
        `Dear ${info.staff_name},\n\nThe following books are due back in 2 days:\n\n${lines}\n\nPlease remind the students to return their books on time to avoid fines.\n\n— ${info.school_name} Library System`
      );
    }

    // 2. Overdue escalation notices (day 1, 7, 14 overdue)
    const escalationDays = [1, 7, 14];
    for (const days of escalationDays) {
      const { rows: overdueRows } = await pool.query(
        `SELECT ll.id, ll.due_date, lb.title, s.name AS student_name, s.student_code, s.class_name,
                ll.fine_amount,
                sch.name AS school_name,
                ss.email AS staff_email, ss.name AS staff_name
         FROM library_loans ll
         JOIN library_books lb ON lb.id = ll.book_id
         JOIN students s ON s.id = ll.student_id
         JOIN schools sch ON sch.id = ll.school_id
         JOIN school_staff ss ON ss.school_id = ll.school_id
         JOIN school_staff_roles ssr ON ssr.staff_id = ss.id AND ssr.role = 'library'
         WHERE ll.status = 'active'
           AND (CURRENT_DATE - ll.due_date)::int = $1
           AND ss.is_active = true`,
        [days]
      );

      const byStaff = new Map();
      for (const row of overdueRows) {
        if (!byStaff.has(row.staff_email)) byStaff.set(row.staff_email, { ...row, items: [] });
        byStaff.get(row.staff_email).items.push(row);
      }
      for (const [, info] of byStaff) {
        const lines = info.items.map(i =>
          `  • ${i.student_name} (${i.student_code}, ${i.class_name}) — "${i.title}" — ${days} day(s) overdue`
        ).join('\n');
        const urgency = days >= 14 ? 'URGENT: ' : days >= 7 ? 'Follow-up: ' : '';
        await sendMail(
          info.staff_email,
          `${urgency}Library Overdue Notice — ${info.items.length} book(s) ${days} day(s) overdue`,
          `Dear ${info.staff_name},\n\nThe following books are ${days} day(s) overdue. Please follow up with the students:\n\n${lines}\n\nFines are accruing at the configured daily rate. You can manage these loans from the Library portal.\n\n— ${info.school_name} Library System`
        );
      }
    }
  } catch (err) {
    console.error('[libraryNotifications] Error:', err.message);
  }
}

// Run daily at 8:00 AM (Africa/Accra = UTC+0)
function startLibraryNotificationJob() {
  cron.schedule('0 8 * * *', runLibraryNotifications, { timezone: 'Africa/Accra' });
}

module.exports = { startLibraryNotificationJob };
