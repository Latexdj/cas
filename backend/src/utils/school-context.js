'use strict';
const pool = require('../config/db');

/**
 * Returns the current academic year, semester, and whether today (or a given
 * date) is a non-school day (holiday, closed day, or vacation period).
 *
 * @param {string} schoolId
 * @param {string|null} [date] ISO date string (YYYY-MM-DD). Defaults to today.
 * @returns {{ academicYearId: string|null, semester: number|null, isNonSchoolDay: boolean }}
 */
async function getCurrentSchoolContext(schoolId, date = null) {
  const checkDate = date ?? new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(`
    SELECT
      ay.id                AS academic_year_id,
      ay.current_semester  AS semester,
      EXISTS (
        SELECT 1 FROM school_calendar
        WHERE school_id  = $1
          AND date       = $2::date
          AND start_time IS NULL
          AND type IN ('Holiday', 'Closed Day')
        UNION ALL
        SELECT 1 FROM school_vacation_periods
        WHERE school_id  = $1
          AND start_date <= $2::date
          AND end_date   >= $2::date
      ) AS is_non_school_day
    FROM academic_years ay
    WHERE ay.school_id = $1 AND ay.is_current = true
    ORDER BY ay.name DESC
    LIMIT 1
  `, [schoolId, checkDate]);

  if (!rows.length) return { academicYearId: null, semester: null, isNonSchoolDay: false };

  return {
    academicYearId: rows[0].academic_year_id,
    semester:       rows[0].semester,
    isNonSchoolDay: rows[0].is_non_school_day,
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
