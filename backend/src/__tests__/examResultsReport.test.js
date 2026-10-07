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

describe('Per-candidate N-Passes — same "not F9" threshold as percentagePass', () => {
  // Corrected after live verification against a real school's full
  // 23-candidate 2023 dataset: a D7/E8 DOES count toward the N-Passes
  // bucket (same threshold as the subject-level Percentage Pass), not
  // just C6-or-better — hand-tallying non-F9 counts across all 23 real
  // candidates reproduced WAEC's own printed bucket counts exactly,
  // which a stricter credits-only threshold does not.
  it('a D7 counts toward the pass bucket, same as a C6', () => {
    const candidates = [
      candidate('1', 'Male', [['Mathematics', 'C6'], ['English Language', 'D7']]),
    ];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.buckets).toEqual({ 2: 1 });
    expect(report.summaryOfPasses.failures).toBe(0);
  });

  it('only F9s lands a candidate in FAILURES, not a "0" bucket', () => {
    const candidates = [candidate('1', 'Male', [['Mathematics', 'F9'], ['English Language', 'F9']])];
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.buckets).toEqual({});
    expect(report.summaryOfPasses.failures).toBe(1);
  });
});

describe('remark comparison is case-insensitive', () => {
  // A real school's grade_boundaries were found storing remark as
  // "FAIL"/"CREDIT" (all caps) rather than the title-case seed default —
  // a case-sensitive check silently matched nothing, so every grade
  // counted as a pass (100% for everyone). This must not regress.
  const ALL_CAPS_BOUNDARIES = WAEC_BOUNDARIES.map(b => ({ ...b, remark: b.remark.toUpperCase() }));

  it('still correctly excludes F9 from Percentage Pass when remark is upper-cased', () => {
    const candidates = [
      candidate('1', 'Male', [['Mathematics', 'C6']]),
      candidate('2', 'Male', [['Mathematics', 'F9']]),
    ];
    const report = computeReport({ candidates, gradeBoundaries: ALL_CAPS_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const maths = report.subjects.find(s => s.name === 'Mathematics');
    expect(maths.percentagePass.total).toBe(50);
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

describe('Real dataset regression — 2023 WAEC listing, 23 candidates', () => {
  // Grades exactly as parsed from the real 2023 PDF (see
  // waecParser.test.js) — subjects in listing order: Social Studies,
  // English Language, Mathematics, Integrated Science, [Christian
  // Religious Studies/Biology], Economics, [History/Food and Nutrition],
  // [Literature in English/Management in Living]. Expected bucket counts
  // below are WAEC's own printed "SUMMARY OF SUBJECT PASSES" for this
  // exact listing — this is the test that would have caught both bugs
  // fixed above (the all-caps remark comparison and the wrong credits-
  // only N-Passes threshold).
  const GRADE_ROWS = [
    ['Female', 'C6,D7,E8,F9,F9,D7,F9,F9'],
    ['Female', 'E8,F9,F9,F9,F9,F9,D7,D7'],
    ['Female', 'E8,F9,F9,F9,C6,F9,C6,C6'],
    ['Female', 'C6,F9,E8,E8,C6,C6,C4,B3'],
    ['Female', 'D7,D7,F9,F9,E8,D7,F9,F9'],
    ['Female', 'C6,D7,F9,F9,D7,F9,C6,C5'],
    ['Female', 'C4,C6,F9,E8,C6,F9,B3,C4'],
    ['Female', 'C6,E8,F9,F9,C5,E8,C6,C5'],
    ['Female', 'F9,F9,F9,F9,E8,F9,C6,C6'],
    ['Female', 'E8,F9,F9,F9,D7,F9,C6,C6'],
    ['Female', 'F9,F9,F9,F9,F9,F9,F9,F9'],
    ['Female', 'F9,F9,F9,F9,F9,F9,F9,E8'],
    ['Female', 'C5,F9,F9,F9,E8,D7,C6,C4'],
    ['Female', 'F9,F9,F9,F9,F9,F9,F9,E8'],
    ['Female', 'E8,F9,F9,F9,E8,F9,C6,D7'],
    ['Female', 'E8,F9,F9,F9,E8,F9,C6,C6'],
    ['Female', 'F9,F9,F9,F9,F9,E8,F9,F9'],
    ['Female', 'F9,F9,F9,F9,F9,F9,C6,C6'],
    ['Female', 'F9,E8,F9,F9,F9,F9,C6,C6'],
    ['Female', 'F9,F9,F9,F9,E8,F9,C5,C6'],
    ['Female', 'F9,F9,F9,F9,E8,F9,D7,C6'],
    ['Female', 'F9,F9,F9,F9,F9,F9,F9,E8'],
    ['Male',   'C5,C5,E8,F9,E8,D7,E8,F9'],
  ];
  const candidates = GRADE_ROWS.map(([gender, csv], i) =>
    candidate(String(i), gender, csv.split(',').map((grade, j) => [`Subject${j}`, grade]))
  );

  it("reproduces WAEC's own printed N-Passes bucket counts exactly", () => {
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    expect(report.summaryOfPasses.buckets).toEqual({ 1: 4, 2: 1, 3: 5, 4: 6, 5: 2, 6: 3, 7: 1 });
  });

  it("reproduces the hand-verified English-Language-position (index 1) percentage pass: 100/27/30", () => {
    const report = computeReport({ candidates, gradeBoundaries: WAEC_BOUNDARIES, registeredData: null, coreSubjects: CORE_SUBJECTS });
    const subject1 = report.subjects.find(s => s.name === 'Subject1');
    // 1 boy (C5, a pass) + 22 girls, of whom 6 have a non-F9 grade -> 100% / 27% / 30%.
    expect(subject1.percentagePass.boys).toBe(100);
    expect(Math.round(subject1.percentagePass.girls)).toBe(27);
    expect(Math.round(subject1.percentagePass.total)).toBe(30);
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
