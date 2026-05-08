const cron = require('node-cron');
const pool = require('../config/db');
const { sendAbsenceNotification, sendDailyAbsenceReport } = require('../services/email.service');

// Africa/Accra = UTC+0 (no DST), so new Date() == Accra time.
// Returns 1=Monday … 7=Sunday to match timetable.day_of_week.
function getAccraDayOfWeek() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function getDayName(dayOfWeek) {
  return ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayOfWeek];
}

async function hasAttendance(schoolId, teacherId, subject, className, date) {
  const { rows } = await pool.query(
    `SELECT class_names FROM attendance
     WHERE school_id = $1 AND date = $2 AND teacher_id = $3 AND LOWER(subject) = LOWER($4)`,
    [schoolId, date, teacherId, subject]
  );

  const target = className.trim().toLowerCase();
  for (const row of rows) {
    const classes = row.class_names.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    if (classes.some(c => c === target || c.includes(target) || target.includes(c))) {
      return true;
    }
  }
  return false;
}

// Core absence-check logic — scoped to a single school.
// Exported so it can be triggered manually from the admin route.
async function runAbsenceCheck(schoolId) {
  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = getAccraDayOfWeek();
  const now       = new Date().toTimeString().slice(0, 5);

  console.log(`[AbsenceCheck] school=${schoolId} date=${today} day=${dayOfWeek} time=${now}`);

  const { rows: lessons } = await pool.query(`
    SELECT
      tt.id       AS slot_id,
      tt.start_time::text,
      tt.end_time::text,
      tt.subject,
      tt.class_name,
      te.id       AS teacher_id,
      te.name     AS teacher_name,
      te.email    AS teacher_email
    FROM timetable tt
    JOIN teachers te ON te.id = tt.teacher_id AND te.status = 'Active'
    WHERE tt.school_id = $1 AND tt.day_of_week = $2
  `, [schoolId, dayOfWeek]);

  console.log(`[AbsenceCheck] ${lessons.length} lessons scheduled for school ${schoolId}`);

  const newAbsences = [];

  for (const lesson of lessons) {
    try {
      const present = await hasAttendance(schoolId, lesson.teacher_id, lesson.subject, lesson.class_name, today);

      if (present) continue;

      const { rows: inserted } = await pool.query(`
        INSERT INTO absences
          (school_id, date, detected_at, teacher_id, subject, class_name,
           scheduled_period, status, is_auto_generated, reason)
        VALUES
          ($1, $2, $3::time, $4, $5, $6, $7, 'Absent', true, 'Daily automated check')
        ON CONFLICT (date, teacher_id, subject, class_name)
          WHERE is_auto_generated = true
        DO NOTHING
        RETURNING id
      `, [
        schoolId,
        today,
        now,
        lesson.teacher_id,
        lesson.subject,
        lesson.class_name,
        `${lesson.start_time}–${lesson.end_time}`,
      ]);

      if (inserted.length) {
        console.log(`[AbsenceCheck] ABSENT: ${lesson.teacher_name} — ${lesson.subject} — ${lesson.class_name}`);
        newAbsences.push({ ...lesson, day_name: getDayName(dayOfWeek) });
        await sendAbsenceNotification({ ...lesson, day_name: getDayName(dayOfWeek) }, today);
      }
    } catch (err) {
      console.error(`[AbsenceCheck] Error processing ${lesson.teacher_name}:`, err.message);
    }
  }

  if (newAbsences.length) {
    const reportRows = newAbsences.map(a => ({
      teacher_name:     a.teacher_name,
      subject:          a.subject,
      class_name:       a.class_name,
      scheduled_period: `${a.start_time}–${a.end_time}`,
      reason:           null,
    }));
    await sendDailyAbsenceReport(reportRows, today);
  }

  console.log(`[AbsenceCheck] Done for school ${schoolId}. ${newAbsences.length} new absence(s).`);
  return { date: today, schoolId, newAbsences: newAbsences.length };
}

// Cron: runs at 16:00 every day across all active schools.
// Africa/Accra is UTC+0, so "0 16 * * *" is correct.
function startAbsenceCheckJob() {
  cron.schedule('0 16 * * *', async () => {
    try {
      const { rows: schools } = await pool.query(`
        SELECT s.id
        FROM schools s
        JOIN subscriptions sub ON sub.school_id = s.id
        WHERE sub.status = 'active'
      `);

      console.log(`[AbsenceCheck] Running for ${schools.length} active school(s)`);
      for (const school of schools) {
        try {
          await runAbsenceCheck(school.id);
        } catch (err) {
          console.error(`[AbsenceCheck] Failed for school ${school.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[AbsenceCheck] Fatal error:', err.message);
    }
  });
  console.log('[AbsenceCheck] Cron job scheduled — runs daily at 16:00 Accra time');
}

module.exports = { startAbsenceCheckJob, runAbsenceCheck };
