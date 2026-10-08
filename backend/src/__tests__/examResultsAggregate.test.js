'use strict';
/**
 * computeReportFromAggregate (examResultsAggregate.js) — computes the
 * same Report shape computeReport() does, but from pre-aggregated
 * per-subject counts (an Excel Analysis Report's own columns) instead of
 * per-candidate grades. The core claim under test: grading an aggregate
 * against grade_boundaries must produce IDENTICAL percentagePass/
 * passCount to grading the equivalent candidates one by one — the two
 * are mathematically the same sum, computed two different ways.
 */

const { computeReport } = require('../utils/examResultsReport');
const { computeReportFromAggregate } = require('../utils/examResultsAggregate');

const WAEC_BOUNDARIES = [
  { grade: 'A1', remark: 'Excellent', sort_order: 9 },
  { grade: 'B2', remark: 'Very Good', sort_order: 8 },
  { grade: 'B3', remark: 'Good', sort_order: 7 },
  { grade: 'C4', remark: 'Credit', sort_order: 6 },
  { grade: 'C5', remark: 'Credit', sort_order: 5 },
  { grade: 'C6', remark: 'Credit', sort_order: 4 },
  { grade: 'D7', remark: 'Pass', sort_order: 3 },
  { grade: 'E8', remark: 'Pass', sort_order: 2 },
  { grade: 'F9', remark: 'Fail', sort_order: 1 },
];
const CORE_SUBJECTS = ['English Language', 'Mathematics'];

function candidate(indexNumber, gender, grades) {
  return { indexNumber, gender, grades: grades.map(([subjectName, grade]) => ({ subjectName, grade })) };
}

describe('computeReportFromAggregate — cross-checked against computeReport on an equivalent dataset', () => {
  // 6 candidates: Maths grades C6,C6,D7,F9,F9,E8 (boys: C6,D7,F9 / girls: C6,F9,E8)
  const candidates = [
    candidate('1', 'Male', [['Mathematics', 'C6']]),
    candidate('2', 'Male', [['Mathematics', 'D7']]),
    candidate('3', 'Male', [['Mathematics', 'F9']]),
    candidate('4', 'Female', [['Mathematics', 'C6']]),
    candidate('5', 'Female', [['Mathematics', 'F9']]),
    candidate('6', 'Female', [['Mathematics', 'E8']]),
  ];
  const candidateReport = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });

  // The exact same 6 grades, pre-aggregated the way an Excel report would print them.
  const aggregateSubjects = [{
    name: 'Mathematics', isCore: true,
    registered: { boys: 3, girls: 3 }, presented: { boys: 3, girls: 3 },
    absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 },
    gradeDistribution: {
      A1: { boys: 0, girls: 0 }, B2: { boys: 0, girls: 0 }, B3: { boys: 0, girls: 0 },
      C4: { boys: 0, girls: 0 }, C5: { boys: 0, girls: 0 }, C6: { boys: 1, girls: 1 },
      D7: { boys: 1, girls: 0 }, E8: { boys: 0, girls: 1 }, F9: { boys: 1, girls: 1 },
    },
  }];
  const aggregateReport = computeReportFromAggregate({
    subjects: aggregateSubjects, totalCandidates: 6, summaryOfPasses: null,
    gradeBoundaries: WAEC_BOUNDARIES, coreSubjects: CORE_SUBJECTS,
  });

  it('produces identical percentagePass to the candidate-level computation', () => {
    const fromCandidates = candidateReport.subjects.find(s => s.name === 'Mathematics').percentagePass;
    const fromAggregate = aggregateReport.subjects.find(s => s.name === 'Mathematics').percentagePass;
    expect(fromAggregate).toEqual(fromCandidates);
  });

  it('produces identical passCount to the candidate-level computation', () => {
    const fromCandidates = candidateReport.subjects.find(s => s.name === 'Mathematics').passCount;
    const fromAggregate = aggregateReport.subjects.find(s => s.name === 'Mathematics').passCount;
    expect(fromAggregate).toEqual(fromCandidates);
  });

  it('never trusts an Excel file\'s own %Pass column — recomputes from grade_boundaries like every other year', () => {
    // 2 of 3 boys passed (C6, D7, not F9) = 66.7%; 2 of 3 girls passed (C6, E8, not F9) = 66.7%
    expect(aggregateReport.subjects[0].percentagePass).toEqual({ boys: 66.7, girls: 66.7, total: 66.7 });
  });

  it('defaults summaryOfPasses to empty when the Excel had no Summary of Subjects Passed block', () => {
    expect(aggregateReport.summaryOfPasses).toEqual({ buckets: {}, failures: 0, noResultCandidates: 0 });
  });

  it('passes a provided summaryOfPasses through unchanged', () => {
    const withSummary = computeReportFromAggregate({
      subjects: aggregateSubjects, totalCandidates: 6,
      summaryOfPasses: { buckets: { 1: 2 }, failures: 1, noResultCandidates: 0 },
      gradeBoundaries: WAEC_BOUNDARIES, coreSubjects: CORE_SUBJECTS,
    });
    expect(withSummary.summaryOfPasses).toEqual({ buckets: { 1: 2 }, failures: 1, noResultCandidates: 0 });
  });

  it('officialSummary is always null — there is no listing to cross-check against', () => {
    expect(aggregateReport.officialSummary).toBeNull();
    expect(aggregateReport.summaryMismatches).toEqual([]);
  });

  it('orders Core subjects before Electives, same as computeReport()', () => {
    const subjects = [
      { name: 'Economics', isCore: false, registered: { boys: 1, girls: 1 }, presented: { boys: 1, girls: 1 }, absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 }, gradeDistribution: { C6: { boys: 1, girls: 1 } } },
      { name: 'Mathematics', isCore: true, registered: { boys: 1, girls: 1 }, presented: { boys: 1, girls: 1 }, absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 }, gradeDistribution: { C6: { boys: 1, girls: 1 } } },
    ];
    const report = computeReportFromAggregate({ subjects, totalCandidates: 2, summaryOfPasses: null, gradeBoundaries: WAEC_BOUNDARIES, coreSubjects: CORE_SUBJECTS });
    expect(report.subjects.map(s => s.name)).toEqual(['Mathematics', 'Economics']);
  });
});
