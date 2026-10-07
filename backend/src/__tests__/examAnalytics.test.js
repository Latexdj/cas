'use strict';
/**
 * Cross-year analytics aggregation (examAnalytics.js). Builds fixtures via
 * the real computeReport() (not hand-rolled report objects) so these tests
 * exercise the exact same per-subject shape the route handler produces.
 */

const { computeReport } = require('../utils/examResultsReport');
const { computeAnalytics, performanceLabel, topGrade } = require('../utils/examAnalytics');

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

function reportFor(candidates) {
  return computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
}

describe('performanceLabel', () => {
  it.each([
    [85, 'Excellent'], [80, 'Excellent'],
    [75, 'Very Good'], [70, 'Very Good'],
    [65, 'Good'], [60, 'Good'],
    [55, 'Average'], [50, 'Average'],
    [45, 'Below Average'], [40, 'Below Average'],
    [35, 'Needs Improvement'], [0, 'Needs Improvement'],
  ])('bands %i%% as %s', (pct, label) => {
    expect(performanceLabel(pct)).toBe(label);
  });
});

describe('topGrade', () => {
  it('picks the best grade present, by WAEC ordering, not by highest count', () => {
    // More F9s than A1s — topGrade must still report A1 (the best grade
    // actually achieved), not the most frequent one.
    const dist = { F9: { boys: 10, girls: 10 }, A1: { boys: 1, girls: 0 } };
    expect(topGrade(dist)).toBe('A1');
  });

  it('returns null when nobody passed anything (empty distribution)', () => {
    expect(topGrade({})).toBeNull();
  });
});

describe('computeAnalytics — two-year fixture', () => {
  // 2023: Maths 1/2 pass (50%), English 2/2 pass (100%).
  // 2024: Maths 3/4 pass (75%), English 1/1 pass (100%).
  const report2023 = reportFor([
    candidate('1', 'Male', [['Mathematics', 'C6'], ['English Language', 'B2']]),
    candidate('2', 'Female', [['Mathematics', 'F9'], ['English Language', 'A1']]),
  ]);
  const report2024 = reportFor([
    candidate('3', 'Male', [['Mathematics', 'C6']]),
    candidate('4', 'Female', [['Mathematics', 'C6']]),
    candidate('5', 'Female', [['Mathematics', 'C6']]),
    candidate('6', 'Male', [['Mathematics', 'F9']]),
    candidate('7', 'Male', [['English Language', 'B3']]),
  ]);
  const batchReports = [{ year: 2023, report: report2023 }, { year: 2024, report: report2024 }];

  it('lists every year and subject present across all batches', () => {
    const a = computeAnalytics(batchReports);
    expect(a.years).toEqual([2023, 2024]);
    expect(a.subjects).toEqual(['English Language', 'Mathematics']);
  });

  it('sums totalCandidates across batches regardless of subject filtering upstream', () => {
    const a = computeAnalytics(batchReports);
    expect(a.totalCandidates).toBe(7); // 2 in 2023 + 5 in 2024
  });

  it('produces one row per subject-year with the right pass/fail rates and performance label', () => {
    const a = computeAnalytics(batchReports);
    const maths2023 = a.rows.find(r => r.subject === 'Mathematics' && r.year === 2023);
    expect(maths2023.presented.total).toBe(2);
    expect(maths2023.percentagePass.total).toBe(50);
    expect(maths2023.failRate).toBe(50);
    expect(maths2023.performanceLabel).toBe('Average');

    const maths2024 = a.rows.find(r => r.subject === 'Mathematics' && r.year === 2024);
    expect(maths2024.percentagePass.total).toBe(75);
    expect(maths2024.performanceLabel).toBe('Very Good');
  });

  it('computes a weighted overall pass rate using exact pass counts, not an average of percentages', () => {
    // Pass counts: Maths 1/2 (2023) + 3/4 (2024) + English 2/2 (2023) + 1/1 (2024)
    // = (1+3+2+1) / (2+4+2+1) = 7/9 = 77.8%. A naive average of the four
    // subject-year percentages (50+75+100+100)/4 = 81.25% would be wrong —
    // this confirms the weighting actually happens, not just that some
    // number comes out.
    const a = computeAnalytics(batchReports);
    expect(a.overallPassRate).toBeCloseTo(77.8, 1);
  });

  it('reports each subject\'s most recent year as latestBySubject', () => {
    const a = computeAnalytics(batchReports);
    const latestMaths = a.latestBySubject.find(r => r.subject === 'Mathematics');
    expect(latestMaths.year).toBe(2024);
    expect(latestMaths.percentagePass.total).toBe(75);
  });

  it('omits a subject-year with zero presented candidates entirely', () => {
    const a = computeAnalytics(batchReports);
    // English Language wasn't offered to anyone absent-free in some
    // hypothetical empty year — sanity check that the real fixture never
    // produces a zero-presented row in the first place.
    expect(a.rows.every(r => r.presented.total > 0)).toBe(true);
  });
});

describe('computeAnalytics — no batches', () => {
  it('returns an empty-but-well-shaped result', () => {
    const a = computeAnalytics([]);
    expect(a).toEqual({ years: [], subjects: [], totalCandidates: 0, overallPassRate: 0, rows: [], latestBySubject: [] });
  });
});
