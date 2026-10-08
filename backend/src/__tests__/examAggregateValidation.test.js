'use strict';
/**
 * examAggregateValidation.js — hard/soft validation for an Excel-sourced
 * aggregate report. Hard blocks are enforced server-side at save time
 * (POST /batches); soft warnings are advisory, shown on the review screen
 * and re-checked live client-side as the admin edits (see
 * waec-results/import/page.tsx's computeLiveWarnings, deliberately
 * mirrored rather than shared across the Node/browser boundary).
 */

const { validateAggregateReportHard, validateAggregateReportSoft } = require('../utils/examAggregateValidation');

function consistentSubject(overrides = {}) {
  return {
    name: 'Mathematics', isCore: true,
    registered: { boys: 10, girls: 10 }, presented: { boys: 10, girls: 10 },
    absent: { boys: 0, girls: 0 }, cancelled: { boys: 0, girls: 0 },
    gradeDistribution: { C6: { boys: 10, girls: 10 } },
    ...overrides,
  };
}

describe('validateAggregateReportHard', () => {
  it('blocks an empty subjects array', () => {
    expect(validateAggregateReportHard({ totalCandidates: 0, subjects: [] })).toEqual(['At least one subject is required.']);
  });

  it('blocks a blank subject name', () => {
    const errors = validateAggregateReportHard({ totalCandidates: 10, subjects: [consistentSubject({ name: '' })] });
    expect(errors).toContain('Every subject needs a name.');
  });

  it('blocks a duplicate subject name', () => {
    const errors = validateAggregateReportHard({
      totalCandidates: 20,
      subjects: [consistentSubject({ name: 'Mathematics' }), consistentSubject({ name: 'Mathematics' })],
    });
    expect(errors.some(e => e.includes('Mathematics') && e.includes('more than once'))).toBe(true);
  });

  it('blocks a negative number in Registered/Presented/Absent/Cancelled', () => {
    const errors = validateAggregateReportHard({ totalCandidates: 10, subjects: [consistentSubject({ absent: { boys: -1, girls: 0 } })] });
    expect(errors.some(e => e.includes('negative number'))).toBe(true);
  });

  it('blocks a negative grade count', () => {
    const errors = validateAggregateReportHard({
      totalCandidates: 10,
      subjects: [consistentSubject({ gradeDistribution: { C6: { boys: -1, girls: 10 } } })],
    });
    expect(errors.some(e => e.includes('negative grade count'))).toBe(true);
  });

  it('passes clean, consistent data with no errors', () => {
    expect(validateAggregateReportHard({ totalCandidates: 20, subjects: [consistentSubject()] })).toEqual([]);
  });
});

describe('validateAggregateReportSoft', () => {
  const coreQuartet = (presented) => [
    consistentSubject({ name: 'English Language', presented, registered: presented, gradeDistribution: { C6: presented } }),
    consistentSubject({ name: 'Mathematics', presented, registered: presented, gradeDistribution: { C6: presented } }),
    consistentSubject({ name: 'Integrated Science', presented, registered: presented, gradeDistribution: { C6: presented } }),
    consistentSubject({ name: 'Social Studies', presented, registered: presented, gradeDistribution: { C6: presented } }),
  ];

  it('flags the Presented vs grade-counts+cancelled mismatch (the reported scenario: 20 presented, fewer graded)', () => {
    const subject = consistentSubject({
      presented: { boys: 10, girls: 10 }, // 20 total
      gradeDistribution: { C6: { boys: 10, girls: 8 } }, // only 18 graded (girls short by 2)
      cancelled: { boys: 0, girls: 0 },
    });
    const warnings = validateAggregateReportSoft({ totalCandidates: 20, subjects: [subject], summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'presented_mismatch' && w.message.includes('Girls') && w.message.includes('10') && w.message.includes('8'))).toBe(true);
  });

  it('flags a per-gender mismatch even when the totals happen to agree (boys short by 1, girls over by 1)', () => {
    const subject = consistentSubject({
      presented: { boys: 15, girls: 42 }, // 57 total
      gradeDistribution: { C6: { boys: 16, girls: 41 } }, // also 57 total, but swapped between genders
      cancelled: { boys: 0, girls: 0 },
    });
    const warnings = validateAggregateReportSoft({ totalCandidates: 57, subjects: [subject], summaryOfPasses: null });
    const w = warnings.find(x => x.type === 'presented_mismatch');
    expect(w).toBeDefined();
    expect(w.message).toContain('Boys');
    expect(w.message).toContain('Girls');
  });

  it('does not flag a mismatch when Presented = grade counts + Cancelled', () => {
    const subject = consistentSubject({
      presented: { boys: 10, girls: 9 },
      gradeDistribution: { C6: { boys: 10, girls: 8 } },
      cancelled: { boys: 0, girls: 1 }, // the missing one girl is accounted for by a cancelled paper
    });
    const warnings = validateAggregateReportSoft({ totalCandidates: 19, subjects: [subject], summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'presented_mismatch')).toBe(false);
  });

  it('flags Registered ≠ Presented + Absent', () => {
    const subject = consistentSubject({ registered: { boys: 12, girls: 10 }, presented: { boys: 10, girls: 10 }, absent: { boys: 0, girls: 0 } });
    const warnings = validateAggregateReportSoft({ totalCandidates: 20, subjects: [subject], summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'registered_mismatch')).toBe(true);
  });

  it('flags when the four core subjects don\'t share the same Presented total', () => {
    const subjects = coreQuartet({ boys: 10, girls: 10 });
    subjects[1].presented = { boys: 9, girls: 10 }; // Mathematics is short one
    const warnings = validateAggregateReportSoft({ totalCandidates: 20, subjects, summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'core_subject_mismatch')).toBe(true);
  });

  it('flags when Total Candidates disagrees with the core subjects\' own Presented total', () => {
    const subjects = coreQuartet({ boys: 10, girls: 10 });
    const warnings = validateAggregateReportSoft({ totalCandidates: 25, subjects, summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'total_mismatch' && w.message.includes('25') && w.message.includes('20'))).toBe(true);
  });

  it('flags when no core subject is present at all', () => {
    const warnings = validateAggregateReportSoft({ totalCandidates: 10, subjects: [consistentSubject({ name: 'Economics', isCore: false })], summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'no_core_subjects')).toBe(true);
  });

  it('flags a Summary of Subjects Passed that doesn\'t sum to Total Candidates', () => {
    const subjects = coreQuartet({ boys: 10, girls: 10 });
    const warnings = validateAggregateReportSoft({
      totalCandidates: 20, subjects,
      summaryOfPasses: { buckets: { 1: 5, 2: 5 }, failures: 2, noResultCandidates: 0 }, // sums to 12, not 20
    });
    expect(warnings.some(w => w.type === 'summary_mismatch' && w.message.includes('12') && w.message.includes('20'))).toBe(true);
  });

  it('is silent (no warnings) when everything is internally consistent', () => {
    const subjects = coreQuartet({ boys: 10, girls: 10 });
    const warnings = validateAggregateReportSoft({
      totalCandidates: 20, subjects,
      summaryOfPasses: { buckets: { 1: 20 }, failures: 0, noResultCandidates: 0 },
    });
    expect(warnings).toEqual([]);
  });

  it('skips the Summary of Subjects Passed check entirely when none was provided', () => {
    const subjects = coreQuartet({ boys: 10, girls: 10 });
    const warnings = validateAggregateReportSoft({ totalCandidates: 20, subjects, summaryOfPasses: null });
    expect(warnings.some(w => w.type === 'summary_mismatch')).toBe(false);
  });
});
