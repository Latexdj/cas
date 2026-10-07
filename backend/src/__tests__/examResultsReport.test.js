'use strict';
/**
 * Report computation (examResultsReport.js). Uses the exact default WAEC
 * grade_boundaries seed values from grade-boundaries.js's /seed endpoint
 * (A1..F9, remark, sort_order) so these tests stay honest about what a
 * real school's boundaries look like, not an invented scale.
 */

const { computeReport } = require('../utils/examResultsReport');

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

describe('Per-subject percentage pass — A1 through E8 counts, only F9 fails', () => {
  it('matches the hand-verified threshold: remark != Fail', () => {
    const candidates = [
      candidate('1', 'Male', [['Mathematics', 'C6']]),   // Credit -> pass
      candidate('2', 'Male', [['Mathematics', 'D7']]),   // Pass (not credit) -> still counts as pass here
      candidate('3', 'Female', [['Mathematics', 'F9']]), // Fail
    ];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const maths = report.subjects.find(s => s.name === 'Mathematics');
    expect(maths.presented).toEqual({ boys: 2, girls: 1, total: 3 });
    expect(maths.percentagePass).toEqual({ boys: 100, girls: 0, total: 66.7 });
  });
});

describe('Per-candidate N-Passes — C6 or better only (credits)', () => {
  it('a D7 does not count toward the credit-pass bucket, a C6 does', () => {
    const candidates = [
      candidate('1', 'Male', [['Mathematics', 'C6'], ['English Language', 'D7']]),
    ];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.buckets).toEqual({ 1: 1 });
    expect(report.summaryOfPasses.failures).toBe(0);
  });

  it('zero credits lands a candidate in FAILURES, not a "0" bucket', () => {
    const candidates = [candidate('1', 'Male', [['Mathematics', 'D7'], ['English Language', 'F9']])];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.buckets).toEqual({});
    expect(report.summaryOfPasses.failures).toBe(1);
  });
});

describe('Cancelled grades (X)', () => {
  it('excludes X from a subject\'s Presented count and grade distribution', () => {
    const candidates = [
      candidate('1', 'Male', [['Mathematics', 'X']]),
      candidate('2', 'Male', [['Mathematics', 'C6']]),
    ];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const maths = report.subjects.find(s => s.name === 'Mathematics');
    expect(maths.presented).toEqual({ boys: 1, girls: 0, total: 1 });
    expect(maths.cancelled).toEqual({ boys: 1, girls: 0, total: 1 });
  });

  it('a candidate whose entire result set is X is counted separately, not as a FAILURE', () => {
    const candidates = [candidate('1', 'Male', [['Mathematics', 'X'], ['English Language', 'X']])];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.entireResultsCancelled).toBe(1);
    expect(report.summaryOfPasses.failures).toBe(0);
  });
});

describe('Subject ordering', () => {
  it('lists Core subjects before Electives', () => {
    const candidates = [candidate('1', 'Male', [['Economics', 'C6'], ['Mathematics', 'C6'], ['English Language', 'C6']])];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const names = report.subjects.map(s => s.name);
    expect(names.indexOf('Mathematics')).toBeLessThan(names.indexOf('Economics'));
    expect(names.indexOf('English Language')).toBeLessThan(names.indexOf('Economics'));
    expect(report.subjects.find(s => s.name === 'Mathematics').isCore).toBe(true);
    expect(report.subjects.find(s => s.name === 'Economics').isCore).toBe(false);
  });
});

describe('Registered/Absent — admin-entered, defaulting to Presented/0', () => {
  it('defaults Registered to Presented and Absent to 0 when no registeredData is given', () => {
    const candidates = [candidate('1', 'Male', [['Mathematics', 'C6']])];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const maths = report.subjects.find(s => s.name === 'Mathematics');
    expect(maths.registered).toEqual({ boys: 1, girls: 0, total: 1 });
    expect(maths.absent).toEqual({ boys: 0, girls: 0, total: 0 });
  });

  it('uses admin-entered registeredData when present, overriding the Presented default', () => {
    const candidates = [candidate('1', 'Male', [['Mathematics', 'C6']])];
    const registeredData = { Mathematics: { registeredBoys: 5, registeredGirls: 3, absentBoys: 1, absentGirls: 0 } };
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData, coreSubjects: CORE_SUBJECTS });
    const maths = report.subjects.find(s => s.name === 'Mathematics');
    expect(maths.registered).toEqual({ boys: 5, girls: 3, total: 8 });
    expect(maths.absent).toEqual({ boys: 1, girls: 0, total: 1 });
  });
});
