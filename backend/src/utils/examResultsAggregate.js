'use strict';

// Computes the same Report shape computeReport() (examResultsReport.js)
// returns, but from already-aggregated per-subject counts (an Excel
// Analysis Report's own Registered/Presented/Absent/Cancelled + grade
// columns — see waecExcelAggregateParser.js) rather than per-candidate
// grades. percentagePass/passCount are derived from gradeDistribution
// against this school's own grade_boundaries using the exact same
// `remark.toUpperCase() !== 'FAIL'` threshold computeReport() uses, so a
// year imported this way is graded identically to a listing-derived
// year, not trusted on the Excel's own (frequently stale — see the
// parser) percentage columns, which this function never reads at all.
function computeReportFromAggregate({ subjects, totalCandidates, summaryOfPasses, gradeBoundaries, coreSubjects }) {
  const boundaryByGrade = new Map(gradeBoundaries.map(b => [b.grade, b]));
  const isPassingGrade = (grade) => {
    const b = boundaryByGrade.get(grade);
    return Boolean(b) && (b.remark || '').toUpperCase() !== 'FAIL';
  };
  const coreSet = new Set(coreSubjects);

  const orderedSubjects = [
    ...subjects.filter(s => coreSet.has(s.name) || s.isCore),
    ...subjects.filter(s => !(coreSet.has(s.name) || s.isCore)),
  ];

  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  const reportSubjects = orderedSubjects.map(s => {
    const passCount = { boys: 0, girls: 0 };
    for (const [grade, counts] of Object.entries(s.gradeDistribution || {})) {
      if (isPassingGrade(grade)) { passCount.boys += counts.boys; passCount.girls += counts.girls; }
    }
    const presented = { ...s.presented, total: s.presented.boys + s.presented.girls };

    return {
      name: s.name,
      isCore: coreSet.has(s.name) || s.isCore,
      registered: { ...s.registered, total: s.registered.boys + s.registered.girls },
      presented,
      absent: { ...s.absent, total: s.absent.boys + s.absent.girls },
      cancelled: { ...s.cancelled, total: s.cancelled.boys + s.cancelled.girls },
      gradeDistribution: s.gradeDistribution,
      passCount: { ...passCount, total: passCount.boys + passCount.girls },
      percentagePass: {
        boys: pct(passCount.boys, s.presented.boys),
        girls: pct(passCount.girls, s.presented.girls),
        total: pct(passCount.boys + passCount.girls, presented.total),
      },
    };
  });

  return {
    totalCandidates,
    subjects: reportSubjects,
    summaryOfPasses: summaryOfPasses || { buckets: {}, failures: 0, noResultCandidates: 0 },
    officialSummary: null,
    summaryMismatches: [],
  };
}

module.exports = { computeReportFromAggregate };
