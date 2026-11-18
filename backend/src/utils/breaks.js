const pool = require('../config/db');

function timeToMins(t) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

/** Fetch breaks that apply to a given school and day (includes "all days" breaks). */
async function fetchBreaks(schoolId, dayOfWeek) {
  const { rows } = await pool.query(
    `SELECT start_time, end_time FROM school_breaks
     WHERE school_id = $1 AND (day_of_week IS NULL OR day_of_week = $2)`,
    [schoolId, dayOfWeek]
  );
  return rows;
}

/**
 * Calculate net periods for a lesson, subtracting any overlapping breaks.
 * periodMins: minutes per period for this school (default 60).
 * Returns at least 1.
 */
function effectivePeriods(startTime, endTime, breaks, periodMins = 60) {
  const start = timeToMins(startTime);
  const end   = timeToMins(endTime);
  let netMins = end - start;

  // The parts of the lesson covered by breaks, merged so overlapping breaks
  // (e.g. an all-days break and a Monday one) are not taken out twice.
  const spans = breaks
    .map(b => [Math.max(start, timeToMins(b.start_time)), Math.min(end, timeToMins(b.end_time))])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  let reachedTo = start;
  for (const [s, e] of spans) {
    const from = Math.max(s, reachedTo);
    if (e > from) { netMins -= e - from; reachedTo = e; }
  }

  return Math.max(1, Math.round(netMins / periodMins));
}

/** The school's minutes per period (Settings), 60 when unset. */
async function schoolPeriodMins(schoolId) {
  const { rows } = await pool.query('SELECT period_duration_minutes FROM schools WHERE id = $1', [schoolId]);
  return rows[0]?.period_duration_minutes || 60;
}

/** "09:30–15:00", "09:30:00-15:00:00" or "9:30 - 15:00" → { start, end }; null when not a time range. */
function parsePeriodRange(text) {
  const m = String(text || '').match(/(\d{1,2}:\d{2})(?::\d{2})?\s*[–—-]\s*(\d{1,2}:\d{2})(?::\d{2})?/);
  if (!m) return null;
  const pad = (t) => t.padStart(5, '0');
  const start = pad(m[1]), end = pad(m[2]);
  return timeToMins(end) > timeToMins(start) ? { start, end } : null;
}

/** Periods for one lesson on a day (1=Monday … 7=Sunday), breaks taken out. */
async function lessonPeriods(schoolId, dayOfWeek, startTime, endTime) {
  const [breaks, periodMins] = await Promise.all([fetchBreaks(schoolId, dayOfWeek), schoolPeriodMins(schoolId)]);
  return effectivePeriods(startTime, endTime, breaks, periodMins);
}

/** 1=Monday … 7=Sunday for a 'YYYY-MM-DD' date. */
function isoDayOfWeek(date) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

module.exports = { fetchBreaks, effectivePeriods, schoolPeriodMins, parsePeriodRange, lessonPeriods, isoDayOfWeek };
