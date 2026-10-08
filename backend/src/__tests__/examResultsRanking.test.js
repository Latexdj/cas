'use strict';

const { computeGradePoints, computeBestSixAggregate } = require('../utils/examResultsRanking');

const WAEC_BOUNDARIES = [
  { grade: 'A1', sort_order: 9 }, { grade: 'B2', sort_order: 8 }, { grade: 'B3', sort_order: 7 },
  { grade: 'C4', sort_order: 6 }, { grade: 'C5', sort_order: 5 }, { grade: 'C6', sort_order: 4 },
  { grade: 'D7', sort_order: 3 }, { grade: 'E8', sort_order: 2 }, { grade: 'F9', sort_order: 1 },
];

describe('computeGradePoints', () => {
  it('maps the best grade (highest sort_order) to point 1, worst to point N', () => {
    const points = computeGradePoints(WAEC_BOUNDARIES);
    expect(points.A1).toBe(1);
    expect(points.F9).toBe(9);
    expect(points.C6).toBe(6);
  });

  it('works regardless of input order, since it sorts by sort_order itself', () => {
    const shuffled = [...WAEC_BOUNDARIES].reverse();
    expect(computeGradePoints(shuffled)).toEqual(computeGradePoints(WAEC_BOUNDARIES));
  });
});

describe('computeBestSixAggregate', () => {
  const points = computeGradePoints(WAEC_BOUNDARIES);

  it('sums the 6 lowest-point (best) grades when more than 6 subjects were sat', () => {
    const grades = [
      { subjectName: 'English Language', grade: 'A1' }, { subjectName: 'Mathematics', grade: 'B2' },
      { subjectName: 'Integrated Science', grade: 'B3' }, { subjectName: 'Social Studies', grade: 'C4' },
      { subjectName: 'Economics', grade: 'C5' }, { subjectName: 'Geography', grade: 'C6' },
      { subjectName: 'Government', grade: 'F9' }, // worst subject, excluded from the best 6
    ];
    const result = computeBestSixAggregate(grades, points);
    expect(result.subjectsCounted).toBe(6);
    expect(result.aggregate).toBe(1 + 2 + 3 + 4 + 5 + 6); // 21
  });

  it('uses however many scoreable subjects exist when fewer than 6', () => {
    const grades = [{ subjectName: 'English Language', grade: 'A1' }, { subjectName: 'Mathematics', grade: 'C6' }];
    const result = computeBestSixAggregate(grades, points);
    expect(result.subjectsCounted).toBe(2);
    expect(result.aggregate).toBe(1 + 6);
  });

  it('excludes X (cancelled) grades from scoring', () => {
    const grades = [{ subjectName: 'English Language', grade: 'A1' }, { subjectName: 'Mathematics', grade: 'X' }];
    const result = computeBestSixAggregate(grades, points);
    expect(result.subjectsCounted).toBe(1);
    expect(result.aggregate).toBe(1);
  });

  it('returns null for a candidate with no scoreable subjects (wholly absent/cancelled)', () => {
    const grades = [{ subjectName: 'English Language', grade: 'X' }, { subjectName: 'Mathematics', grade: 'X' }];
    expect(computeBestSixAggregate(grades, points)).toBeNull();
  });

  it('returns null for a candidate with zero grades at all', () => {
    expect(computeBestSixAggregate([], points)).toBeNull();
  });
});
