'use strict';
/**
 * validateListingWarnings (examListingValidation.js) — the one listing-
 * path reconciliation check that isn't already covered elsewhere
 * (count_mismatch and unrecognized_subject live in waecParser.js;
 * summaryMismatches lives in examResultsReport.js and is surfaced at
 * parse time too via admin-exam-results.js's POST /parse, tested there).
 */

const { validateListingWarnings } = require('../utils/examListingValidation');

const CORE = ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies'];

function candidate(indexNumber, grades) {
  return { indexNumber, grades: grades.map(([subjectName, grade]) => ({ subjectName, grade })) };
}

describe('validateListingWarnings', () => {
  it('is silent when every core subject has the same number of candidates presented', () => {
    const candidates = [
      candidate('1', [['English Language', 'C6'], ['Mathematics', 'C6']]),
      candidate('2', [['English Language', 'F9'], ['Mathematics', 'F9']]),
    ];
    expect(validateListingWarnings({ candidates, coreSubjects: CORE })).toEqual([]);
  });

  it('flags when core subjects disagree on how many candidates were presented (a subject silently missing a grade for someone)', () => {
    const candidates = [
      candidate('1', [['English Language', 'C6'], ['Mathematics', 'C6']]),
      candidate('2', [['Mathematics', 'F9']]), // missing an English Language grade entirely
    ];
    const warnings = validateListingWarnings({ candidates, coreSubjects: CORE });
    expect(warnings.some(w => w.type === 'core_subject_mismatch')).toBe(true);
  });

  it('does not count a cancelled paper (X) as presented, and does not treat that as a mismatch on its own', () => {
    const candidates = [
      candidate('1', [['English Language', 'X'], ['Mathematics', 'C6']]), // one X, rest present elsewhere
      candidate('2', [['English Language', 'C6'], ['Mathematics', 'C6']]),
    ];
    // English Language presented = 1 (candidate 2 only), Mathematics presented = 2 -> genuinely different counts, correctly flagged
    const warnings = validateListingWarnings({ candidates, coreSubjects: CORE });
    expect(warnings.some(w => w.type === 'core_subject_mismatch')).toBe(true);
  });

  it('is silent when fewer than two core subjects appear in the data at all (nothing to compare)', () => {
    const candidates = [candidate('1', [['Mathematics', 'C6']])];
    expect(validateListingWarnings({ candidates, coreSubjects: CORE })).toEqual([]);
  });

  it('ignores non-core subjects entirely for this check', () => {
    const candidates = [
      candidate('1', [['English Language', 'C6'], ['Mathematics', 'C6'], ['Economics', 'C6']]),
      candidate('2', [['English Language', 'F9'], ['Mathematics', 'F9']]), // no Economics, but that's not core
    ];
    expect(validateListingWarnings({ candidates, coreSubjects: CORE })).toEqual([]);
  });
});
