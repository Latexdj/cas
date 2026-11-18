'use strict';
// Learning games in the student app: when they may be played (outside the
// class's lessons), scores and weekly leaderboards.
//
// Games lock while the student's class has a timetabled lesson. Breaks, after
// school, weekends, whole-day calendar entries (holidays) and vacation periods
// are open. Leaderboards are weekly (they reset on Monday), per class and per
// school, and rank each student's best score of the week.

const pool = require('../config/db');
const { getCurrentYearSem } = require('../utils/school-context');

const GAMES = new Set(['wassce-arena', 'bece-challenge', 'tool-id', 'right-order']);
const MAX_SCORE = 100000;

const hhmm = (t) => String(t).slice(0, 5);

/** Lessons for every class: { "1A": { "1": [["08:00","09:00"], ...], ... }, ... } (1 = Monday). */
async function lessonsByClass(schoolId) {
  const { yearId, sem } = await getCurrentYearSem(schoolId);
  if (!yearId) return {};
  const { rows } = await pool.query(
    `SELECT day_of_week, start_time::text AS s, end_time::text AS e, class_names FROM timetable
      WHERE school_id=$1 AND academic_year_id=$2 AND semester=$3 AND start_time IS NOT NULL AND end_time IS NOT NULL`,
    [schoolId, yearId, sem]);
  const out = {};
  for (const r of rows) {
    for (const cls of String(r.class_names || '').split(',').map(x => x.trim()).filter(Boolean)) {
      const day = String(r.day_of_week);
      ((out[cls] ??= {})[day] ??= []).push([hhmm(r.s), hhmm(r.e)]);
    }
  }
  for (const days of Object.values(out)) for (const d of Object.keys(days)) days[d].sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

/** Days with no lessons coming up: whole-day calendar entries and vacation periods. */
async function offDays(schoolId) {
  const [{ rows: cal }, { rows: vac }] = await Promise.all([
    pool.query(`SELECT date::text AS d FROM school_calendar
                 WHERE school_id=$1 AND start_time IS NULL AND date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 200`, [schoolId]),
    pool.query(`SELECT start_date::text AS s, end_date::text AS e FROM school_vacation_periods
                 WHERE school_id=$1 AND end_date >= CURRENT_DATE - 1 AND start_date <= CURRENT_DATE + 200`, [schoolId]),
  ]);
  return { dates: [...new Set(cal.map(r => r.d))], ranges: vac.map(r => [r.s, r.e]) };
}

async function scheduleFor(schoolId, className) {
  const [all, off] = await Promise.all([lessonsByClass(schoolId), offDays(schoolId)]);
  return { class_name: className || null, lessons: (className && all[className]) || {}, off, tz: 'Africa/Accra', at: new Date().toISOString() };
}

/** Saves scores (each with its own id from the device, so sending twice is harmless). */
async function saveScores(schoolId, rows) {
  let saved = 0;
  for (const r of rows) {
    if (!GAMES.has(r.game)) continue;
    const score = Math.round(Number(r.score));
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) continue;
    const at = new Date(r.played_at);
    if (Number.isNaN(at.getTime()) || at > new Date(Date.now() + 5 * 60 * 1000)) continue;
    const { rowCount } = await pool.query(
      `INSERT INTO game_scores (id, school_id, student_id, game, score, detail, played_at)
       SELECT $1, $2, s.id, $4, $5, $6, $7 FROM students s WHERE s.id=$3 AND s.school_id=$2
       ON CONFLICT (id) DO NOTHING`,
      [r.id, schoolId, r.student_id, r.game, score, r.detail ? JSON.stringify(r.detail).slice(0, 2000) : null, at]);
    saved += rowCount;
  }
  return saved;
}

// "Ama Owusu" -> "Ama O."
const shortName = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || 'Student';
};

/** This week's board for one game: top 10, the student's own place, and their best ever. */
async function leaderboard(schoolId, game, studentId, scope) {
  const { rows: [me] } = await pool.query(`SELECT class_name FROM students WHERE id=$1 AND school_id=$2`, [studentId, schoolId]);
  const byClass = scope === 'class' && me?.class_name;
  const { rows } = await pool.query(
    `WITH best AS (
       SELECT g.student_id, MAX(g.score) AS score
         FROM game_scores g JOIN students s ON s.id = g.student_id
        WHERE g.school_id=$1 AND g.game=$2 AND g.played_at >= date_trunc('week', now())
          ${byClass ? 'AND s.class_name = $3' : ''}
        GROUP BY g.student_id)
     SELECT b.student_id, b.score, s.name, s.class_name,
            RANK() OVER (ORDER BY b.score DESC) AS rank
       FROM best b JOIN students s ON s.id = b.student_id
      ORDER BY b.score DESC, s.name LIMIT 500`,
    byClass ? [schoolId, game, me.class_name] : [schoolId, game]);
  const view = (r) => ({ rank: Number(r.rank), name: shortName(r.name), class_name: r.class_name, score: Number(r.score), me: r.student_id === studentId });
  const mine = rows.find(r => r.student_id === studentId);
  const { rows: [pb] } = await pool.query(`SELECT MAX(score) AS best FROM game_scores WHERE student_id=$1 AND game=$2`, [studentId, game]);
  return {
    scope: byClass ? 'class' : 'school', class_name: me?.class_name || null,
    week_start: (await pool.query(`SELECT date_trunc('week', now())::date::text AS d`)).rows[0].d,
    players: rows.length, top: rows.slice(0, 10).map(view), me: mine ? view(mine) : null,
    personal_best: pb?.best != null ? Number(pb.best) : null,
  };
}

/** This week's scores at a school, for its school server's offline leaderboards. */
async function weekScores(schoolId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.student_id, g.game, g.score, g.played_at FROM game_scores g
      WHERE g.school_id=$1 AND g.played_at >= date_trunc('week', now()) ORDER BY g.played_at LIMIT 20000`, [schoolId]);
  return rows.map(r => ({ ...r, score: Number(r.score) }));
}

module.exports = { GAMES, lessonsByClass, offDays, scheduleFor, saveScores, leaderboard, weekScores, shortName };
