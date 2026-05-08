// =============================================================
// CAS Data Migration — Google Sheets CSV → PostgreSQL
// Run from inside the backend/ folder: node migrate.js
// Put exported CSVs in ../migration/data/ before running
// =============================================================
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse }  = require('csv-parse/sync');
const { Pool }   = require('pg');
const bcrypt     = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DATA_DIR   = path.join(__dirname, '..', 'migration', 'data');
const DEFAULT_PIN = process.env.DEFAULT_TEACHER_PIN || '1234';

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function readCSV(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠  ${filename} not found — skipping`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

// Return null for blank / N/A values
function n(val) {
  if (val === undefined || val === null) return null;
  const s = val.toString().trim();
  return (s === '' || s === 'N/A' || s === 'n/a' || s === '#N/A') ? null : s;
}

// Try several possible header names for the same field
function col(row, ...keys) {
  for (const k of keys) {
    const v = n(row[k]);
    if (v !== null) return v;
  }
  return null;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseTime(val) {
  if (!val) return null;
  const m = val.toString().match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3];
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parseBool(val) {
  if (!val) return false;
  return ['yes', 'true', '1', 'y'].includes(val.toString().trim().toLowerCase());
}

function parseSemester(val) {
  if (!val) return null;
  const s = val.toString();
  if (s.includes('1')) return 1;
  if (s.includes('2')) return 2;
  return null;
}

// ─────────────────────────────────────────────────────────────
// 1. Teachers  (Staff sheet)
// ─────────────────────────────────────────────────────────────
async function migrateTeachers() {
  console.log('\n[1/7] Migrating teachers...');
  const rows = readCSV('staff.csv');
  if (!rows.length) return {};

  const pinHash = await bcrypt.hash(DEFAULT_PIN, 12);
  const teacherMap = {};
  let inserted = 0, skipped = 0;

  for (const row of rows) {
    const name = col(row, 'Name', 'name', 'TEACHER NAME', 'Teacher', 'teacher', 'TEACHER', 'Staff Name');
    if (!name) { skipped++; continue; }

    const email      = col(row, 'Email', 'email', 'EMAIL', 'E-mail');
    const phone      = col(row, 'Phone', 'phone', 'PHONE', 'Phone Number', 'Contact');
    const department = col(row, 'Department', 'department', 'DEPARTMENT', 'Dept');
    const status     = col(row, 'Status', 'status', 'STATUS') || 'Active';
    const notes      = col(row, 'Notes', 'notes', 'NOTES', 'Remarks');

    try {
      const { rows: r } = await pool.query(
        `INSERT INTO teachers (name, email, phone, department, status, notes, pin_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (LOWER(name)) DO UPDATE
           SET email      = COALESCE(EXCLUDED.email, teachers.email),
               phone      = COALESCE(EXCLUDED.phone, teachers.phone),
               department = COALESCE(EXCLUDED.department, teachers.department),
               status     = EXCLUDED.status,
               notes      = COALESCE(EXCLUDED.notes, teachers.notes)
         RETURNING id, name`,
        [name, email, phone, department, status, notes, pinHash]
      );
      teacherMap[name.toLowerCase()] = r[0].id;
      inserted++;
    } catch (err) {
      console.log(`  ✗ Teacher "${name}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ ${inserted} teachers migrated, ${skipped} skipped`);
  return teacherMap;
}

// ─────────────────────────────────────────────────────────────
// 2. Academic Years  (AcademicYear sheet)
// ─────────────────────────────────────────────────────────────
async function migrateAcademicYears() {
  console.log('\n[2/7] Migrating academic years...');
  const rows = readCSV('academic_years.csv');
  if (!rows.length) return {};

  const yearMap = {};
  let inserted = 0, skipped = 0;
  let currentYearSet = false;

  for (const row of rows) {
    const name = col(row, 'Year', 'year', 'Academic Year', 'AcademicYear', 'YEAR', 'academic_year');
    if (!name) { skipped++; continue; }

    const yearStatus     = (col(row, 'Year Status', 'YearStatus', 'Status', 'status') || '').toLowerCase();
    const semesterRaw    = col(row, 'Semester', 'semester', 'SEMESTER');
    const semesterStatus = (col(row, 'Semester Status', 'SemesterStatus') || '').toLowerCase();

    const isCurrent = yearStatus === 'current' && !currentYearSet;
    if (isCurrent) currentYearSet = true;

    let currentSemester = null;
    if (isCurrent && semesterStatus === 'current') {
      currentSemester = parseSemester(semesterRaw);
    }

    try {
      const { rows: r } = await pool.query(
        `INSERT INTO academic_years (name, is_current, current_semester)
         VALUES ($1,$2,$3)
         ON CONFLICT (name) DO UPDATE
           SET is_current       = EXCLUDED.is_current,
               current_semester = COALESCE(EXCLUDED.current_semester, academic_years.current_semester)
         RETURNING id, name`,
        [name.trim(), isCurrent, currentSemester]
      );
      yearMap[name.trim().toLowerCase()] = r[0].id;
      inserted++;
    } catch (err) {
      console.log(`  ✗ Year "${name}": ${err.message}`);
      skipped++;
    }
  }

  // If no current year was found in the CSV, mark the latest one as current
  if (!currentYearSet && Object.keys(yearMap).length) {
    await pool.query(
      `UPDATE academic_years SET is_current = true
       WHERE id = (SELECT id FROM academic_years ORDER BY name DESC LIMIT 1)`
    );
    console.log('  ℹ  No current year found in CSV — marked latest year as current');
  }

  console.log(`  ✓ ${inserted} academic years migrated, ${skipped} skipped`);
  return yearMap;
}

// ─────────────────────────────────────────────────────────────
// 3. Locations  (Classes sheet)
// ─────────────────────────────────────────────────────────────
async function migrateLocations() {
  console.log('\n[3/7] Migrating locations...');
  const rows = readCSV('classes.csv');
  const locationMap = {};
  let inserted = 0, skipped = 0;

  // Merge sheet rows with built-in special locations
  const special = [
    { name: 'Catering Hall', type: 'CateringHall' },
    { name: 'Library',       type: 'Library' },
    { name: 'ICT Lab',       type: 'ICTLab' },
  ];

  const allRows = [
    ...rows.map(r => ({
      name:      col(r, 'Name', 'name', 'Class', 'ClassName', 'class_name', 'Location', 'location', 'Room'),
      type:      col(r, 'Type', 'type', 'TYPE') || 'Classroom',
      latitude:  col(r, 'Latitude', 'latitude', 'Lat', 'lat'),
      longitude: col(r, 'Longitude', 'longitude', 'Lng', 'lng', 'Long', 'lon'),
      radius:    col(r, 'Radius', 'radius', 'Radius (m)', 'radius_meters') || '30',
    })),
    ...special,
  ];

  for (const loc of allRows) {
    if (!loc.name) { skipped++; continue; }

    const lat       = parseFloat(loc.latitude) || null;
    const lng       = parseFloat(loc.longitude) || null;
    const hasCoords = !!(lat && lng);

    try {
      const { rows: r } = await pool.query(
        `INSERT INTO locations (name, type, latitude, longitude, radius_meters, has_coordinates)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (name) DO UPDATE
           SET type            = EXCLUDED.type,
               latitude        = COALESCE(EXCLUDED.latitude, locations.latitude),
               longitude       = COALESCE(EXCLUDED.longitude, locations.longitude),
               radius_meters   = EXCLUDED.radius_meters,
               has_coordinates = EXCLUDED.has_coordinates
         RETURNING id, name`,
        [loc.name.trim(), loc.type, lat, lng, parseInt(loc.radius) || 30, hasCoords]
      );
      locationMap[loc.name.trim().toLowerCase()] = r[0].id;
      inserted++;
    } catch (err) {
      console.log(`  ✗ Location "${loc.name}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ ${inserted} locations migrated, ${skipped} skipped`);
  return locationMap;
}

// ─────────────────────────────────────────────────────────────
// 4. Timetable  (Timetable sheet)
// ─────────────────────────────────────────────────────────────
async function migrateTimetable(teacherMap) {
  console.log('\n[4/7] Migrating timetable...');
  const rows = readCSV('timetable.csv');
  if (!rows.length) return;

  let inserted = 0, skipped = 0;

  for (const row of rows) {
    const day         = parseInt(col(row, 'Day', 'day', 'DAY', 'DayOfWeek', 'day_of_week') || 0);
    const startTime   = parseTime(col(row, 'Start Time', 'StartTime', 'start_time', 'Start', 'From'));
    const endTime     = parseTime(col(row, 'End Time', 'EndTime', 'end_time', 'End', 'To'));
    const teacherName = col(row, 'Teacher', 'teacher', 'TEACHER', 'TeacherName', 'teacher_name');
    const subject     = col(row, 'Subject', 'subject', 'SUBJECT');
    const className   = col(row, 'Class', 'class', 'ClassName', 'class_name', 'CLASS', 'Room');

    if (!day || !startTime || !endTime || !teacherName || !subject || !className) {
      skipped++;
      continue;
    }

    const teacherId = teacherMap[teacherName.toLowerCase()];
    if (!teacherId) {
      console.log(`  ⚠  Timetable: teacher not found — "${teacherName}"`);
      skipped++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO timetable (day_of_week, start_time, end_time, teacher_id, subject, class_name)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [day, startTime, endTime, teacherId, subject.trim(), className.trim()]
      );
      inserted++;
    } catch (err) {
      console.log(`  ✗ Timetable row: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ ${inserted} timetable entries migrated, ${skipped} skipped`);
}

// ─────────────────────────────────────────────────────────────
// 5. Attendance  (FormData sheet)
// ─────────────────────────────────────────────────────────────
async function migrateAttendance(teacherMap, yearMap, locationMap) {
  console.log('\n[5/7] Migrating attendance records...');
  const rows = readCSV('form_data.csv');
  if (!rows.length) return;

  // Cache current year as fallback
  const { rows: cy } = await pool.query(
    `SELECT id, current_semester FROM academic_years WHERE is_current = true LIMIT 1`
  );
  const fallbackYearId  = cy[0]?.id || null;
  const fallbackSemester = cy[0]?.current_semester || 1;

  let inserted = 0, skipped = 0;

  for (const row of rows) {
    const date        = parseDate(col(row, 'Date', 'date', 'DATE'));
    const teacherName = col(row, 'Name', 'name', 'Teacher', 'teacher', 'TEACHER', 'NAME', 'TEACHER NAME');
    const subject     = col(row, 'Subject', 'subject', 'SUBJECT');
    const classNames  = col(row, 'Class', 'class', 'ClassNames', 'class_names', 'CLASS', 'Classes');
    const periodsRaw  = col(row, 'Periods', 'periods', 'PERIODS', 'Period');

    if (!date || !teacherName || !subject || !classNames) { skipped++; continue; }

    const teacherId = teacherMap[teacherName.toLowerCase()];
    if (!teacherId) {
      console.log(`  ⚠  Attendance: teacher not found — "${teacherName}"`);
      skipped++;
      continue;
    }

    const yearName   = col(row, 'Academic Year', 'AcademicYear', 'academic_year', 'Year');
    const semRaw     = col(row, 'Semester', 'semester', 'SEMESTER');
    const yearId     = (yearName && yearMap[yearName.toLowerCase()]) || fallbackYearId;
    const semester   = parseSemester(semRaw) || fallbackSemester;

    if (!yearId) { skipped++; continue; }

    const periods     = Math.max(1, parseInt(periodsRaw) || 1);
    const topic       = col(row, 'Topic', 'topic', 'TOPIC');
    const gps         = col(row, 'GPS', 'gps', 'GPSCoordinates', 'gps_coordinates', 'GPS Coordinates');
    const photoUrl    = col(row, 'Photo URL', 'PhotoURL', 'photo_url', 'Picture URL', 'PictureURL', 'Image');
    const weekNumber  = parseInt(col(row, 'Week', 'week', 'WeekNumber', 'week_number', 'Week Number') || 0) || null;
    const locName     = col(row, 'Location', 'location', 'TeachingLocation', 'teaching_location', 'Teaching Location');
    const locMsg      = col(row, 'Location Verification', 'LocationVerification', 'location_verification_message');
    const locationId  = locName ? (locationMap[locName.toLowerCase()] || null) : null;
    const verified    = !!(locMsg && locMsg.includes('✓'));

    // Build submitted_at from date + time if available
    const time        = col(row, 'Time', 'time', 'TIME');
    const submittedAt = time ? `${date}T${time}` : date;

    try {
      await pool.query(
        `INSERT INTO attendance
           (date, submitted_at, academic_year_id, semester, teacher_id,
            subject, class_names, periods, topic,
            gps_coordinates, photo_url, week_number,
            location_id, location_name, location_verified, location_verification_message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT DO NOTHING`,
        [
          date, submittedAt, yearId, semester, teacherId,
          subject, classNames, periods, topic,
          gps, photoUrl, weekNumber,
          locationId, locName, verified, locMsg,
        ]
      );
      inserted++;
    } catch (err) {
      console.log(`  ✗ Attendance "${teacherName}" ${date}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ ${inserted} attendance records migrated, ${skipped} skipped`);
}

// ─────────────────────────────────────────────────────────────
// 6. Absences  (Absences sheet)
// ─────────────────────────────────────────────────────────────
async function migrateAbsences(teacherMap) {
  console.log('\n[6/7] Migrating absences...');
  const rows = readCSV('absences.csv');
  if (!rows.length) return {};

  const absenceMap = {};
  let inserted = 0, skipped = 0;
  const validStatuses = ['Absent', 'Remedial Scheduled', 'Made Up', 'Cleared', 'Verified'];

  for (const row of rows) {
    const date        = parseDate(col(row, 'Date', 'date', 'DATE'));
    const teacherName = col(row, 'Teacher', 'teacher', 'TEACHER', 'Teacher Name');
    const subject     = col(row, 'Subject', 'subject', 'SUBJECT');
    const className   = col(row, 'Class', 'class', 'ClassName', 'class_name', 'CLASS');

    if (!date || !teacherName || !subject || !className) { skipped++; continue; }

    const teacherId = teacherMap[teacherName.toLowerCase()];
    if (!teacherId) {
      console.log(`  ⚠  Absence: teacher not found — "${teacherName}"`);
      skipped++;
      continue;
    }

    const time      = parseTime(col(row, 'Time', 'time', 'TIME'));
    const period    = col(row, 'Scheduled Period', 'ScheduledPeriod', 'scheduled_period', 'Period', 'period');
    let   status    = col(row, 'Status', 'status', 'STATUS') || 'Absent';
    if (!validStatuses.includes(status)) status = 'Absent';
    const autoGen   = parseBool(col(row, 'Auto Generated', 'AutoGenerated', 'auto_generated', 'Automated') || 'Yes');
    const reason    = col(row, 'Reason', 'reason', 'REASON');

    try {
      const { rows: r } = await pool.query(
        `INSERT INTO absences
           (date, detected_at, teacher_id, subject, class_name,
            scheduled_period, status, is_auto_generated, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (date, teacher_id, subject, class_name)
           WHERE is_auto_generated = true
         DO UPDATE SET
           status = EXCLUDED.status,
           reason = COALESCE(EXCLUDED.reason, absences.reason)
         RETURNING id`,
        [date, time, teacherId, subject, className, period, status, autoGen, reason]
      );
      const key = `${date}|${teacherId}|${subject.toLowerCase()}|${className.toLowerCase()}`;
      if (r.length) absenceMap[key] = r[0].id;
      inserted++;
    } catch (err) {
      // Non-auto-generated absences won't hit the partial unique index — insert directly
      try {
        const { rows: r } = await pool.query(
          `INSERT INTO absences
             (date, detected_at, teacher_id, subject, class_name,
              scheduled_period, status, is_auto_generated, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [date, time, teacherId, subject, className, period, status, autoGen, reason]
        );
        const key = `${date}|${teacherId}|${subject.toLowerCase()}|${className.toLowerCase()}`;
        if (r.length) absenceMap[key] = r[0].id;
        inserted++;
      } catch {
        skipped++;
      }
    }
  }

  console.log(`  ✓ ${inserted} absences migrated, ${skipped} skipped`);
  return absenceMap;
}

// ─────────────────────────────────────────────────────────────
// 7. Remedial Lessons  (RemedialLessons sheet)
// ─────────────────────────────────────────────────────────────
async function migrateRemedialLessons(teacherMap, locationMap, absenceMap) {
  console.log('\n[7/7] Migrating remedial lessons...');
  const rows = readCSV('remedial_lessons.csv');
  if (!rows.length) return;

  let inserted = 0, skipped = 0;
  const validStatuses = ['Scheduled', 'Completed', 'Verified', 'Cancelled'];

  for (const row of rows) {
    const teacherName  = col(row, 'Teacher', 'teacher', 'TEACHER');
    const origDate     = parseDate(col(row, 'Original Absence Date', 'OriginalAbsenceDate', 'original_absence_date'));
    const subject      = col(row, 'Subject', 'subject', 'SUBJECT');
    const className    = col(row, 'Class', 'class', 'ClassName', 'class_name');
    const remedialDate = parseDate(col(row, 'Remedial Date', 'RemedialDate', 'remedial_date'));
    const remedialTime = parseTime(col(row, 'Remedial Time', 'RemedialTime', 'remedial_time'));

    if (!teacherName || !origDate || !subject || !className || !remedialDate || !remedialTime) {
      skipped++;
      continue;
    }

    const teacherId = teacherMap[teacherName.toLowerCase()];
    if (!teacherId) {
      console.log(`  ⚠  Remedial: teacher not found — "${teacherName}"`);
      skipped++;
      continue;
    }

    // Best-effort link back to the absence record
    const absenceKey = `${origDate}|${teacherId}|${subject.toLowerCase()}|${className.toLowerCase()}`;
    const absenceId  = absenceMap[absenceKey] || null;

    const duration  = parseInt(col(row, 'Duration (periods)', 'Duration', 'duration_periods') || 0) || null;
    const topic     = col(row, 'Topic to Cover', 'Topic', 'topic');
    const locName   = col(row, 'Location', 'location', 'LOCATION');
    const locationId = locName ? (locationMap[locName.toLowerCase()] || null) : null;
    const photoUrl  = col(row, 'Photo URL', 'PhotoURL', 'photo_url');
    const gps       = col(row, 'GPS Coordinates', 'GPS', 'gps_coordinates');
    let   status    = col(row, 'Status', 'status') || 'Scheduled';
    if (!validStatuses.includes(status)) status = 'Scheduled';
    const verifiedBy   = col(row, 'Verified By', 'VerifiedBy', 'verified_by');
    const verifiedDate = parseDate(col(row, 'Verified Date', 'VerifiedDate', 'verified_date'));
    const notes        = col(row, 'Notes', 'notes');

    try {
      await pool.query(
        `INSERT INTO remedial_lessons
           (teacher_id, absence_id, original_absence_date, subject, class_name,
            remedial_date, remedial_time, duration_periods, topic,
            location_id, location_name, photo_url, gps_coordinates,
            status, verified_by, verified_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT DO NOTHING`,
        [
          teacherId, absenceId, origDate, subject, className,
          remedialDate, remedialTime, duration, topic,
          locationId, locName, photoUrl, gps,
          status, verifiedBy, verifiedDate, notes,
        ]
      );
      inserted++;
    } catch (err) {
      console.log(`  ✗ Remedial "${teacherName}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`  ✓ ${inserted} remedial lessons migrated, ${skipped} skipped`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n================================================');
  console.log('  CAS MIGRATION — Google Sheets → PostgreSQL');
  console.log('================================================');

  try {
    await pool.query('SELECT 1');
    console.log('✓ Database connected\n');

    const teacherMap  = await migrateTeachers();
    const yearMap     = await migrateAcademicYears();
    const locationMap = await migrateLocations();
    await migrateTimetable(teacherMap);
    await migrateAttendance(teacherMap, yearMap, locationMap);
    const absenceMap  = await migrateAbsences(teacherMap);
    await migrateRemedialLessons(teacherMap, locationMap, absenceMap);

    // Final counts
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM teachers)::int         AS teachers,
        (SELECT COUNT(*) FROM academic_years)::int   AS academic_years,
        (SELECT COUNT(*) FROM locations)::int        AS locations,
        (SELECT COUNT(*) FROM timetable)::int        AS timetable_entries,
        (SELECT COUNT(*) FROM attendance)::int       AS attendance_records,
        (SELECT COUNT(*) FROM absences)::int         AS absences,
        (SELECT COUNT(*) FROM remedial_lessons)::int AS remedial_lessons
    `);

    console.log('\n================================================');
    console.log('  MIGRATION COMPLETE — Final record counts:');
    console.log('================================================');
    Object.entries(rows[0]).forEach(([table, count]) => {
      console.log(`  ${table.padEnd(22)} ${String(count).padStart(6)} records`);
    });
    console.log('================================================\n');

  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
