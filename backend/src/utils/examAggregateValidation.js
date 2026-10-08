'use strict';
const { WAEC_CORE_SUBJECTS } = require('./waecSubjects');

function sumGradesByGender(gradeDistribution, gender) {
  return Object.values(gradeDistribution || {}).reduce((s, d) => s + (d[gender] || 0), 0);
}

// Hard blocks — violating any of these means the data can't be saved at
// all (returns a list of blocking messages; empty = ok). Enforced
// server-side because, unlike the PDF/paste path (which re-parses
// raw_text as the source of truth), there is no independent source to
// re-derive an aggregate report from — the submitted numbers ARE the
// data, so obviously-broken ones can't just be silently accepted.
function validateAggregateReportHard({ totalCandidates, subjects }) {
  const errors = [];
  if (!Array.isArray(subjects) || subjects.length === 0) {
    errors.push('At least one subject is required.');
    return errors;
  }
  const seenNames = new Set();
  for (const s of subjects) {
    const name = (s.name || '').trim();
    if (!name) { errors.push('Every subject needs a name.'); continue; }
    const key = name.toLowerCase();
    if (seenNames.has(key)) errors.push(`"${name}" appears more than once.`);
    seenNames.add(key);

    for (const field of [s.registered, s.presented, s.absent, s.cancelled]) {
      if (field && (field.boys < 0 || field.girls < 0)) errors.push(`"${name}" has a negative number.`);
    }
    for (const g of Object.values(s.gradeDistribution || {})) {
      if (g.boys < 0 || g.girls < 0) { errors.push(`"${name}" has a negative grade count.`); break; }
    }
  }
  if (typeof totalCandidates === 'number' && totalCandidates < 0) errors.push('Total Candidates cannot be negative.');
  return errors;
}

// Soft warnings — informational only, never block saving. Same
// { type, message } shape waecParser.js's warnings use. Mirrored
// (deliberately duplicated, not shared) by the frontend so the review
// table can re-check live as the admin edits — see
// admin-portal/app/(dashboard)/waec-results/import/page.tsx's
// computeLiveWarnings.
function validateAggregateReportSoft({ totalCandidates, subjects, summaryOfPasses }) {
  const warnings = [];

  for (const s of subjects) {
    const name = s.name || '(unnamed)';
    const presentedB = s.presented?.boys || 0, presentedG = s.presented?.girls || 0;
    const cancelledB = s.cancelled?.boys || 0, cancelledG = s.cancelled?.girls || 0;
    const gradeSumB = sumGradesByGender(s.gradeDistribution, 'boys');
    const gradeSumG = sumGradesByGender(s.gradeDistribution, 'girls');
    const bOff = presentedB !== gradeSumB + cancelledB;
    const gOff = presentedG !== gradeSumG + cancelledG;
    if (bOff || gOff) {
      // Per-gender, not just totals — two genders can be off by equal and
      // opposite amounts (seen in a real file: Boys short by 1, Girls over
      // by 1, so the totals alone looked fine) and a totals-only message
      // would hide exactly the kind of error worth flagging.
      const parts = [];
      if (bOff) parts.push(`Boys: Presented ${presentedB} vs grade counts + Cancelled ${gradeSumB + cancelledB}`);
      if (gOff) parts.push(`Girls: Presented ${presentedG} vs grade counts + Cancelled ${gradeSumG + cancelledG}`);
      warnings.push({ type: 'presented_mismatch', message: `"${name}": ${parts.join('; ')}.` });
    }

    const registeredB = s.registered?.boys || 0, registeredG = s.registered?.girls || 0;
    const absentB = s.absent?.boys || 0, absentG = s.absent?.girls || 0;
    if (registeredB !== presentedB + absentB || registeredG !== presentedG + absentG) {
      warnings.push({
        type: 'registered_mismatch',
        message: `"${name}": Registered (${registeredB + registeredG}) doesn't equal Presented + Absent (${presentedB + absentB + presentedG + absentG}).`,
      });
    }
  }

  const coreSubjects = subjects.filter(s => WAEC_CORE_SUBJECTS.includes(s.name) || s.isCore);
  if (coreSubjects.length === 0) {
    warnings.push({ type: 'no_core_subjects', message: 'None of the four WASSCE core subjects (English Language, Mathematics, Integrated Science, Social Studies) are present.' });
  } else {
    const presentedTotals = coreSubjects.map(s => (s.presented?.boys || 0) + (s.presented?.girls || 0));
    const maxP = Math.max(...presentedTotals), minP = Math.min(...presentedTotals);
    if (maxP !== minP) {
      warnings.push({ type: 'core_subject_mismatch', message: `The core subjects don't all have the same Presented total (ranges from ${minP} to ${maxP}) — every candidate sits all four.` });
    }
    if (totalCandidates !== maxP) {
      warnings.push({ type: 'total_mismatch', message: `Total Candidates (${totalCandidates}) doesn't match the core subjects' own Presented total (${maxP}).` });
    }
  }

  if (summaryOfPasses) {
    const bucketSum = Object.values(summaryOfPasses.buckets || {}).reduce((a, b) => a + b, 0);
    const summarySum = bucketSum + (summaryOfPasses.failures || 0) + (summaryOfPasses.noResultCandidates || 0);
    if (summarySum !== totalCandidates) {
      warnings.push({ type: 'summary_mismatch', message: `Summary of Subjects Passed totals ${summarySum} candidates, but Total Candidates is ${totalCandidates}.` });
    }
  }

  return warnings;
}

module.exports = { validateAggregateReportHard, validateAggregateReportSoft };
