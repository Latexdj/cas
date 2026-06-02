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

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

// Bulk-fetch all attendance records for a school+date and return a fast lookup function.
// Replaces per-class DB queries (N+1) with a single query + in-memory check.
async function buildAttendanceLookup(schoolId, date) {
  const { rows } = await pool.query(
    `SELECT teacher_id, subject, class_names FROM attendance WHERE school_id = $1 AND date = $2`,
    [schoolId, date]
  );

  // Map: "teacherId:subjectLower" → flattened array of individual class names (lowercased)
  const index = new Map();
  for (const row of rows) {
    const key = `${row.teacher_id}:${row.subject.toLowerCase()}`;
    const classes = row.class_names.split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
    const existing = index.get(key);
    if (existing) existing.push(...classes);
    else index.set(key, classes);
  }

  return function hasAttendance(teacherId, subject, className) {
    const key = `${teacherId}:${subject.toLowerCase()}`;
    const recorded = index.get(key);
    if (!recorded) return false;
    const target = className.trim().toLowerCase();
    return recorded.some(c => c === target || c.includes(target) || target.includes(c));
  };
}

// Core absence-check logic — scoped to a single school.
// Exported so it can be triggered manually from the admin route.
async function runAbsenceCheck(schoolId) {
  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = getAccraDayOfWeek();
  const now       = new Date().toTimeString().slice(0, 5);

  console.log(`[AbsenceCheck] school=${schoolId} date=${today} day=${dayOfWeek} time=${now}`);

  // Fetch school's period duration for periods_lost calculation
  const { rows: schoolSettingRows } = await pool.query(
    'SELECT period_duration_minutes FROM schools WHERE id = $1', [schoolId]
  );
  const periodMins = schoolSettingRows[0]?.period_duration_minutes ?? 60;

  // Skip entirely if today is a school holiday or event
  const { rows: calRows } = await pool.query(
    `SELECT name, type FROM school_calendar WHERE school_id = $1 AND date = $2 LIMIT 1`,
    [schoolId, today]
  );
  if (calRows.length) {
    console.log(`[AbsenceCheck] Skipping — ${calRows[0].type}: "${calRows[0].name}"`);
    return { date: today, schoolId, newAbsences: 0, skipped: calRows[0].name };
  }

  // Fetch approved teacher excuses covering today
  const { rows: excuseRows } = await pool.query(
    `SELECT DISTINCT teacher_id FROM teacher_excuses
     WHERE school_id = $1 AND status = 'Approved'
       AND date_from <= $2 AND date_to >= $2`,
    [schoolId, today]
  );
  const excusedTeacherIds = new Set(excuseRows.map(r => r.teacher_id));
  if (excusedTeacherIds.size) {
    console.log(`[AbsenceCheck] ${excusedTeacherIds.size} teacher(s) excused today`);
  }

  // Fetch all lessons today
  const { rows: lessons } = await pool.query(`
    SELECT
      tt.id           AS slot_id,
      tt.start_time::text,
      tt.end_time::text,
      tt.subject,
      tt.class_names,
      te.id           AS teacher_id,
      te.name         AS teacher_name,
      te.email        AS teacher_email
    FROM timetable tt
    JOIN teachers te ON te.id = tt.teacher_id AND te.status = 'Active'
    WHERE tt.school_id = $1 AND tt.day_of_week = $2
  `, [schoolId, dayOfWeek]);

  console.log(`[AbsenceCheck] ${lessons.length} timetable slot(s) for school ${schoolId}`);

  // Single bulk query replaces per-class hasAttendance() calls
  const hasAttendance = await buildAttendanceLookup(schoolId, today);

  const newAbsences = [];

  for (const lesson of lessons) {
    if (excusedTeacherIds.has(lesson.teacher_id)) {
      console.log(`[AbsenceCheck] Excused: ${lesson.teacher_name}`);
      continue;
    }

    const individualClasses = lesson.class_names
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);

    for (const className of individualClasses) {
      try {
        if (hasAttendance(lesson.teacher_id, lesson.subject, className)) continue;

        const lessonMins  = timeToMinutes(lesson.end_time) - timeToMinutes(lesson.start_time);
        const periodsLost = Math.max(1, Math.round(lessonMins / periodMins));
        const { rows: inserted } = await pool.query(`
          INSERT INTO absences
            (school_id, date, detected_at, teacher_id, subject, class_name,
             scheduled_period, status, is_auto_generated, reason, periods_lost)
          VALUES
            ($1, $2, $3::time, $4, $5, $6, $7, 'Absent', true, 'Daily automated check', $8)
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
          className,
          `${lesson.start_time}–${lesson.end_time}`,
          periodsLost,
        ]);

        if (inserted.length) {
          console.log(`[AbsenceCheck] ABSENT: ${lesson.teacher_name} — ${lesson.subject} — ${className}`);
          const absenceEntry = { ...lesson, class_name: className, day_name: getDayName(dayOfWeek) };
          newAbsences.push(absenceEntry);
          await sendAbsenceNotification(absenceEntry, today);
        }
      } catch (err) {
        console.error(`[AbsenceCheck] Error processing ${lesson.teacher_name} / ${className}:`, err.message);
      }
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

// Per-lesson check: marks absent only for lessons whose grace period (end + 30 min) has passed.
async function runPerLessonCheck(schoolId) {
  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = getAccraDayOfWeek();
  const now       = new Date().toTimeString().slice(0, 5);
  const nowMins   = timeToMinutes(now);

  const { rows: schoolSettingRows } = await pool.query(
    'SELECT period_duration_minutes FROM schools WHERE id = $1', [schoolId]
  );
  const periodMins = schoolSettingRows[0]?.period_duration_minutes ?? 60;

  const { rows: calRows } = await pool.query(
    `SELECT name FROM school_calendar WHERE school_id = $1 AND date = $2 LIMIT 1`,
    [schoolId, today]
  );
  if (calRows.length) return;

  const { rows: excuseRows } = await pool.query(
    `SELECT DISTINCT teacher_id FROM teacher_excuses
     WHERE school_id = $1 AND status = 'Approved'
       AND date_from <= $2 AND date_to >= $2`,
    [schoolId, today]
  );
  const excusedIds = new Set(excuseRows.map(r => r.teacher_id));

  const { rows: lessons } = await pool.query(`
    SELECT tt.start_time::text, tt.end_time::text, tt.subject, tt.class_names,
           te.id AS teacher_id, te.name AS teacher_name, te.email AS teacher_email
    FROM timetable tt
    JOIN teachers te ON te.id = tt.teacher_id AND te.status = 'Active'
    WHERE tt.school_id = $1 AND tt.day_of_week = $2
  `, [schoolId, dayOfWeek]);

  // Single bulk query replaces per-class hasAttendance() calls
  const hasAttendance = await buildAttendanceLookup(schoolId, today);

  for (const lesson of lessons) {
    if (excusedIds.has(lesson.teacher_id)) continue;
    if (timeToMinutes(lesson.end_time) + 30 > nowMins) continue;

    const individualClasses = lesson.class_names.split(',').map(c => c.trim()).filter(Boolean);
    for (const className of individualClasses) {
      try {
        if (hasAttendance(lesson.teacher_id, lesson.subject, className)) continue;

        const lessonMins  = timeToMinutes(lesson.end_time) - timeToMinutes(lesson.start_time);
        const periodsLost = Math.max(1, Math.round(lessonMins / periodMins));
        await pool.query(`
          INSERT INTO absences
            (school_id, date, detected_at, teacher_id, subject, class_name,
             scheduled_period, status, is_auto_generated, reason, periods_lost)
          VALUES ($1,$2,$3::time,$4,$5,$6,$7,'Absent',true,'Grace period expired — no attendance submitted',$8)
          ON CONFLICT (date, teacher_id, subject, class_name)
            WHERE is_auto_generated = true
          DO NOTHING
        `, [schoolId, today, now, lesson.teacher_id, lesson.subject, className,
            `${lesson.start_time}–${lesson.end_time}`, periodsLost]);
      } catch (err) {
        console.error(`[PerLessonCheck] Error: ${lesson.teacher_name} / ${className}:`, err.message);
      }
    }
  }
}

// PLC absence check — flags teachers who missed a scheduled PLC session.
async function runPlcAbsenceCheck(schoolId) {
  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = getAccraDayOfWeek();
  const now       = new Date().toTimeString().slice(0, 5);

  // Skip on school holidays
  const { rows: calRows } = await pool.query(
    'SELECT name FROM school_calendar WHERE school_id = $1 AND date = $2 LIMIT 1',
    [schoolId, today]
  );
  if (calRows.length) return;

  // Get today's active PLC session (if any)
  const { rows: sessions } = await pool.query(
    `SELECT id, title, start_time::text, end_time::text
     FROM plc_sessions
     WHERE school_id = $1 AND day_of_week = $2 AND is_active = true`,
    [schoolId, dayOfWeek]
  );
  if (!sessions.length) return;

  // Fetch approved excuses
  const { rows: excuseRows } = await pool.query(
    `SELECT DISTINCT teacher_id FROM teacher_excuses
     WHERE school_id = $1 AND status = 'Approved'
       AND date_from <= $2 AND date_to >= $2`,
    [schoolId, today]
  );
  const excusedIds = new Set(excuseRows.map(r => r.teacher_id));

  // All active teachers in the school
  const { rows: teachers } = await pool.query(
    `SELECT id, name FROM teachers WHERE school_id = $1 AND status = 'Active'`,
    [schoolId]
  );

  for (const session of sessions) {
    // Teachers who have already submitted for this session today
    const { rows: submitted } = await pool.query(
      `SELECT teacher_id FROM plc_attendance
       WHERE session_id = $1 AND date = $2`,
      [session.id, today]
    );
    const submittedIds = new Set(submitted.map(r => r.teacher_id));

    for (const teacher of teachers) {
      if (excusedIds.has(teacher.id) || submittedIds.has(teacher.id)) continue;
      try {
        await pool.query(
          `INSERT INTO plc_absences
             (school_id, session_id, teacher_id, date, status, detected_at, reason)
           VALUES ($1, $2, $3, $4, 'Absent', $5::time, 'Daily automated check')
           ON CONFLICT (session_id, teacher_id, date) DO NOTHING`,
          [schoolId, session.id, teacher.id, today, now]
        );
      } catch (err) {
        console.error(`[PlcAbsenceCheck] Error: ${teacher.name} / ${session.title}:`, err.message);
      }
    }
    console.log(`[PlcAbsenceCheck] Checked ${teachers.length} teachers for "${session.title}" on ${today}`);
  }
}

// Meeting absence check — flags teachers who missed a scheduled meeting.
async function runMeetingAbsenceCheck(schoolId) {
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toTimeString().slice(0, 5);

  const { rows: calRows } = await pool.query(
    'SELECT name FROM school_calendar WHERE school_id = $1 AND date = $2 LIMIT 1',
    [schoolId, today]
  );
  if (calRows.length) return;

  const { rows: meetings } = await pool.query(
    `SELECT id, title FROM meetings
     WHERE school_id = $1 AND date = $2 AND is_active = true`,
    [schoolId, today]
  );
  if (!meetings.length) return;

  const { rows: excuseRows } = await pool.query(
    `SELECT DISTINCT teacher_id FROM teacher_excuses
     WHERE school_id = $1 AND status = 'Approved'
       AND date_from <= $2 AND date_to >= $2`,
    [schoolId, today]
  );
  const excusedIds = new Set(excuseRows.map(r => r.teacher_id));

  const { rows: teachers } = await pool.query(
    `SELECT id, name FROM teachers WHERE school_id = $1 AND status = 'Active'`,
    [schoolId]
  );

  for (const meeting of meetings) {
    const { rows: submitted } = await pool.query(
      'SELECT teacher_id FROM meeting_attendance WHERE meeting_id = $1 AND date = $2',
      [meeting.id, today]
    );
    const submittedIds = new Set(submitted.map(r => r.teacher_id));

    for (const teacher of teachers) {
      if (excusedIds.has(teacher.id) || submittedIds.has(teacher.id)) continue;
      try {
        await pool.query(
          `INSERT INTO meeting_absences
             (school_id, meeting_id, teacher_id, date, status, detected_at, reason)
           VALUES ($1, $2, $3, $4, 'Absent', $5::time, 'Daily automated check')
           ON CONFLICT (meeting_id, teacher_id, date) DO NOTHING`,
          [schoolId, meeting.id, teacher.id, today, now]
        );
      } catch (err) {
        console.error(`[MeetingAbsenceCheck] Error: ${teacher.name} / ${meeting.title}:`, err.message);
      }
    }
    console.log(`[MeetingAbsenceCheck] Checked ${teachers.length} teachers for "${meeting.title}" on ${today}`);
  }
}

// Cron: runs at 16:00 every day across all active/trial schools.
// Africa/Accra is UTC+0, so "0 16 * * *" is correct.
function startAbsenceCheckJob() {
  const getSchools = async () => {
    const { rows } = await pool.query(`
      SELECT s.id FROM schools s
      JOIN subscriptions sub ON sub.school_id = s.id
      WHERE sub.status IN ('active', 'trial')
        AND (sub.ends_at IS NULL OR sub.ends_at > now())
    `);
    return rows;
  };

  // Every 5 minutes: per-lesson grace period check
  cron.schedule('*/5 * * * *', async () => {
    try {
      const schools = await getSchools();
      for (const school of schools) {
        try { await runPerLessonCheck(school.id); }
        catch (err) { console.error(`[PerLessonCheck] school ${school.id}:`, err.message); }
      }
    } catch (err) { console.error('[PerLessonCheck] Fatal:', err.message); }
  });

  // Daily 16:00 sweep: catches any missed lessons + PLC sessions (safety net)
  cron.schedule('0 16 * * *', async () => {
    try {
      const schools = await getSchools();
      console.log(`[AbsenceCheck] Running for ${schools.length} active/trial school(s)`);
      for (const school of schools) {
        try { await runAbsenceCheck(school.id); }
        catch (err) { console.error(`[AbsenceCheck] Failed for school ${school.id}:`, err.message); }
        try { await runPlcAbsenceCheck(school.id); }
        catch (err) { console.error(`[PlcAbsenceCheck] Failed for school ${school.id}:`, err.message); }
        try { await runMeetingAbsenceCheck(school.id); }
        catch (err) { console.error(`[MeetingAbsenceCheck] Failed for school ${school.id}:`, err.message); }
      }
    } catch (err) { console.error('[AbsenceCheck] Fatal error:', err.message); }
  });

  console.log('[AbsenceCheck] Jobs scheduled — per-lesson every 5 min + daily sweep at 16:00');
}

module.exports = { startAbsenceCheckJob, runAbsenceCheck, runPlcAbsenceCheck, runMeetingAbsenceCheck };
