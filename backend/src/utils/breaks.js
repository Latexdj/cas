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

  for (const brk of breaks) {
    const bs = timeToMins(brk.start_time);
    const be = timeToMins(brk.end_time);
    const overlapStart = Math.max(start, bs);
    const overlapEnd   = Math.min(end,   be);
    if (overlapEnd > overlapStart) netMins -= (overlapEnd - overlapStart);
  }

  return Math.max(1, Math.round(netMins / periodMins));
}

module.exports = { fetchBreaks, effectivePeriods };
