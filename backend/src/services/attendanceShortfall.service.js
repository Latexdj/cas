'use strict';

// Teacher attendance shortfalls across the six sources teachers are tracked
// against — classroom periods and five hardcoded meeting types (PLC,
// Morning Briefing, Staff Meeting, PTA, Other). Returns flat occurrence
// rows; grouping into per-teacher entries happens in the calling route
// (same division of labor as computeAssessmentMonitorRows: service
// computes, route groups).
//
// None of the three absence tables (absences, plc_absences,
// meeting_absences) carry a semester column, only academic_year_id — this
// mirrors the already-shipped precedent in principal.js's /plc-summary and
// /meetings-summary, which filter the absence side by academic_year_id
// only for the same reason. semester is intentionally not a parameter here.

const MEETING_TYPE_BY_SOURCE = {
  morning_briefing: 'Morning Briefing',
  staff_meeting:    'Staff Meeting',
  pta:              'PTA',
  other:            'Other',
};

async function computeAttendanceShortfallOccurrences(pool, schoolId, source, academicYearId) {
  if (source === 'classroom') {
    const { rows } = await pool.query(
      `SELECT ab.teacher_id, ab.date::text,
              (ab.subject || CASE WHEN ab.class_name IS NOT NULL THEN ' (' || ab.class_name || ')' ELSE '' END) AS occasion_title,
              ab.reason, ab.status
       FROM absences ab
       WHERE ab.school_id = $1 AND ab.academic_year_id = $2
         AND ab.status NOT IN ('Excused','Made Up','Verified')
       ORDER BY ab.teacher_id, ab.date`,
      [schoolId, academicYearId]
    );
    return rows;
  }

  if (source === 'plc') {
    // PLC attendance can be taken through either of two independent
    // subsystems — the dedicated plc_absences flow, or the generic
    // meetings flow with meeting_type='PLC'. A teacher's PLC absence can
    // land in either depending on how it was taken, so both are unioned —
    // same pattern already used by principal.js's GET /plc-summary.
    const { rows } = await pool.query(
      `WITH excused AS (
         SELECT teacher_id, date_from, date_to FROM teacher_excuses
         WHERE school_id = $1 AND status = 'Approved'
       ),
       plc_abs AS (
         SELECT ab.teacher_id, ab.date::text, ps.title AS occasion_title, ab.reason, ab.status
         FROM plc_absences ab
         JOIN plc_sessions ps ON ps.id = ab.session_id
         LEFT JOIN excused ex ON ex.teacher_id = ab.teacher_id AND ab.date BETWEEN ex.date_from AND ex.date_to
         WHERE ab.school_id = $1 AND ab.academic_year_id = $2 AND ex.teacher_id IS NULL
       ),
       mtg_abs AS (
         SELECT ab.teacher_id, ab.date::text, m.title AS occasion_title, ab.reason, ab.status
         FROM meeting_absences ab
         JOIN meetings m ON m.id = ab.meeting_id
         LEFT JOIN excused ex ON ex.teacher_id = ab.teacher_id AND ab.date BETWEEN ex.date_from AND ex.date_to
         WHERE ab.school_id = $1 AND m.meeting_type = 'PLC'
           AND ab.academic_year_id = $2 AND ex.teacher_id IS NULL
       )
       SELECT * FROM plc_abs
       UNION ALL
       SELECT * FROM mtg_abs
       ORDER BY teacher_id, date`,
      [schoolId, academicYearId]
    );
    return rows;
  }

  const meetingType = MEETING_TYPE_BY_SOURCE[source];
  if (!meetingType) return [];

  const { rows } = await pool.query(
    `WITH excused AS (
       SELECT teacher_id, date_from, date_to FROM teacher_excuses
       WHERE school_id = $1 AND status = 'Approved'
     )
     SELECT ab.teacher_id, ab.date::text, m.title AS occasion_title, ab.reason, ab.status
     FROM meeting_absences ab
     JOIN meetings m ON m.id = ab.meeting_id
     LEFT JOIN excused ex ON ex.teacher_id = ab.teacher_id AND ab.date BETWEEN ex.date_from AND ex.date_to
     WHERE ab.school_id = $1 AND m.meeting_type = $2
       AND ab.academic_year_id = $3 AND ex.teacher_id IS NULL
     ORDER BY ab.teacher_id, ab.date`,
    [schoolId, meetingType, academicYearId]
  );
  return rows;
}

module.exports = { computeAttendanceShortfallOccurrences };
