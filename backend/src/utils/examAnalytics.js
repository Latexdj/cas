'use strict';
const { WAEC_GRADE_CODES } = require('./waecSubjects');

// ≥80 Excellent / 70–79 Very Good / 60–69 Good / 50–59 Average /
// 40–49 Below Average / <40 Needs Improvement, applied to a subject-year's
// Percentage Pass (total). Matches the old Sheets tool's label set;
// band edges are a judgment call, not derived from WAEC's own data.
const PERFORMANCE_BANDS = [
  { min: 80, label: 'Excellent' },
  { min: 70, label: 'Very Good' },
  { min: 60, label: 'Good' },
  { min: 50, label: 'Average' },
  { min: 40, label: 'Below Average' },
  { min: 0, label: 'Needs Improvement' },
];

function performanceLabel(pct) {
  return PERFORMANCE_BANDS.find(b => pct >= b.min).label;
}

// Best grade actually achieved in a subject-year, by WAEC's own A1-is-best
// ordering (WAEC_GRADE_CODES is already ordered best-to-worst, with 'X'
// last) — not just "the highest-count grade".
function topGrade(gradeDistribution) {
  for (const g of WAEC_GRADE_CODES) {
    if (g === 'X') continue;
    const d = gradeDistribution[g];
    if (d && d.boys + d.girls > 0) return g;
  }
  return null;
}

// Aggregates multiple years' already-computed reports (one computeReport()
// result per batch, from examResultsReport.js) into a flat subject-year
// table plus the handful of summary numbers the Analytics page needs. Kept
// flat and un-opinionated about chart shape deliberately — the frontend
// derives the trend chart, grade-distribution chart(s), and table directly
// from `rows` rather than this function pre-shaping multiple chart-specific
// payloads that would all need to stay in sync.
function computeAnalytics(batchReports) {
  const rows = [];
  for (const { year, report } of batchReports) {
    for (const s of report.subjects) {
      if (s.presented.total === 0) continue; // nobody sat this subject this year
      rows.push({
        subject: s.name,
        year,
        isCore: s.isCore,
        presented: s.presented,
        percentagePass: s.percentagePass,
        failRate: Math.round((100 - s.percentagePass.total) * 10) / 10,
        topGrade: topGrade(s.gradeDistribution),
        gradeDistribution: s.gradeDistribution,
        performanceLabel: performanceLabel(s.percentagePass.total),
      });
    }
  }

  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => a - b);
  const subjects = [...new Set(rows.map(r => r.subject))].sort();

  const totalCandidates = batchReports.reduce((sum, { report }) => sum + report.totalCandidates, 0);

  // Weighted overall pass rate: sum of exact candidates-passed over sum of
  // exact candidates-presented, across every subject-year row — a subject
  // with more candidates pulls the average further than one with few,
  // matching the old tool's "weighted average" definition. Uses the exact
  // passCount from computeReport (not re-derived from the rounded
  // percentage) so this doesn't compound rounding error across years.
  let presentedSum = 0, passSum = 0;
  for (const { report } of batchReports) {
    for (const s of report.subjects) {
      presentedSum += s.presented.total;
      passSum += s.passCount.total;
    }
  }
  const overallPassRate = presentedSum > 0 ? Math.round((passSum / presentedSum) * 1000) / 10 : 0;

  const latestBySubject = subjects.map(subject => {
    const subjectRows = rows.filter(r => r.subject === subject).sort((a, b) => b.year - a.year);
    return subjectRows[0];
  });

  return { years, subjects, totalCandidates, overallPassRate, rows, latestBySubject };
}

module.exports = { computeAnalytics, performanceLabel, topGrade };
