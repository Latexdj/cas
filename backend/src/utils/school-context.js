'use strict';
const pool = require('../config/db');

/**
 * Returns the current academic year, semester, and non-school-day status for
 * a given date (defaults to today). When the date is a non-school day the
 * reason and label are populated so callers that need to distinguish calendar
 * events from vacation periods can do so without a second query.
 *
 * @param {string} schoolId
 * @param {string|null} [date] ISO date string (YYYY-MM-DD). Defaults to today.
 * @returns {{
 *   academicYearId: string|null,
 *   semester: number|null,
 *   isNonSchoolDay: boolean,
 *   nonSchoolReason: 'calendar'|'vacation'|null,
 *   nonSchoolLabel: string|null,
 *   nonSchoolEventType: string|null,
 *   nonSchoolVacationName: string|null,
 *   nonSchoolVacationKind: string|null,
 * }}
 */
async function getCurrentSchoolContext(schoolId, date = null) {
  const checkDate = date ?? new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(`
    SELECT
      ay.id               AS academic_year_id,
      ay.current_semester AS semester,
      cal.name            AS cal_name,
      cal.type            AS cal_type,
      vac.name            AS vac_name,
      vac.kind            AS vac_kind
    FROM academic_years ay
    LEFT JOIN LATERAL (
      SELECT name, type FROM school_calendar
      WHERE school_id  = $1
        AND date       = $2::date
        AND start_time IS NULL
        AND type IN ('Holiday', 'Closed Day', 'School Event')
      LIMIT 1
    ) cal ON true
    LEFT JOIN LATERAL (
      SELECT name, kind FROM school_vacation_periods
      WHERE school_id  = $1
        AND start_date <= $2::date
        AND end_date   >= $2::date
      LIMIT 1
    ) vac ON true
    WHERE ay.school_id = $1 AND ay.is_current = true
    ORDER BY ay.name DESC
    LIMIT 1
  `, [schoolId, checkDate]);

  if (!rows.length) {
    return { academicYearId: null, semester: null, isNonSchoolDay: false,
             nonSchoolReason: null, nonSchoolLabel: null, nonSchoolEventType: null,
             nonSchoolVacationName: null, nonSchoolVacationKind: null };
  }

  const row            = rows[0];
  const isCalendar     = !!row.cal_name;
  const isVacation     = !isCalendar && !!row.vac_kind;
  const isNonSchoolDay = isCalendar || isVacation;

  return {
    academicYearId:       row.academic_year_id,
    semester:             row.semester,
    isNonSchoolDay,
    nonSchoolReason:      isNonSchoolDay ? (isCalendar ? 'calendar' : 'vacation') : null,
    // calendar: human-readable event name; vacation: kind string ('vacation'|'exam')
    nonSchoolLabel:       isCalendar ? row.cal_name : isVacation ? row.vac_kind : null,
    nonSchoolEventType:   isCalendar ? row.cal_type : null,
    // vacation-specific fields for consumers that need both name and kind separately
    nonSchoolVacationName: isVacation ? row.vac_name : null,
    nonSchoolVacationKind: isVacation ? row.vac_kind : null,
  };
}

/**
 * Lighter variant for callers that only need year + semester (no holiday check).
 *
 * @param {string} schoolId
 * @returns {{ yearId: string|null, sem: number|null }}
 */
async function getCurrentYearSem(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, current_semester FROM academic_years
     WHERE school_id = $1 AND is_current = true ORDER BY name DESC LIMIT 1`,
    [schoolId]
  );
  return { yearId: rows[0]?.id ?? null, sem: rows[0]?.current_semester ?? null };
}

module.exports = { getCurrentSchoolContext, getCurrentYearSem };
