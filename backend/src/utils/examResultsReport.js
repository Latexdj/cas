'use strict';

// Computes the GES-style Analysis Report from a batch's parsed candidates
// and this school's grade_boundaries.
//
// Both the per-subject "Percentage Pass" AND the per-candidate "N Passes"
// summary use the SAME threshold: any grade except F9 (remark != 'Fail').
// This was corrected after live verification against a real school's full
// 23-candidate dataset — tallying each candidate's non-F9 subject count by
// hand reproduced WAEC's own printed "N PASSES" bucket counts exactly
// (all 7 non-empty buckets matched); a stricter "C6 or better" (credits)
// threshold, which an earlier single-candidate spot-check had seemed to
// confirm during planning, does not.
//
// WAEC's own printed "FAILURES" figure, however, does NOT match any
// grade-based definition we tried against that same 23-candidate dataset
// — not "zero non-F9 subjects" (gives 1, WAEC says 4), not "zero
// C6-or-better subjects" (gives 7), not "failed English or Maths" (gives
// ~20). Since we can't reverse-engineer WAEC's exact definition from the
// grades alone, `officialSummary` (parsed verbatim from the listing's own
// trailing "SUMMARY OF SUBJECT PASSES" block, see waecParser.js) is passed
// through unmodified on the report rather than forcing our own computed
// failures/absent figures to agree with it. The N-PASSES buckets DO agree
// exactly, which is the useful cross-check surfaced below.
//
// remark is compared case-insensitively: a real school's grade_boundaries
// were found storing it as "FAIL"/"CREDIT" (all caps) rather than the
// title-case seed default, and a case-sensitive check silently matched
// nothing, making every grade count as a pass.
function computeReport({ candidates, gradeBoundaries, registeredData, coreSubjects, officialSummary }) {
  const boundaryByGrade = new Map(gradeBoundaries.map(b => [b.grade, b]));
  const isPassingGrade = (grade) => {
    const b = boundaryByGrade.get(grade);
    return Boolean(b) && (b.remark || '').toUpperCase() !== 'FAIL';
  };
  const coreSet = new Set(coreSubjects);

  const subjectNames = [];
  for (const c of candidates) {
    for (const g of c.grades) {
      if (!subjectNames.includes(g.subjectName)) subjectNames.push(g.subjectName);
    }
  }
  const orderedSubjects = [
    ...subjectNames.filter(s => coreSet.has(s)),
    ...subjectNames.filter(s => !coreSet.has(s)),
  ];

  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  const subjects = orderedSubjects.map(name => {
    const presented = { boys: 0, girls: 0 };
    const cancelled = { boys: 0, girls: 0 };
    const passCount = { boys: 0, girls: 0 };
    const gradeDistribution = {};

    for (const c of candidates) {
      const g = c.grades.find(x => x.subjectName === name);
      if (!g) continue;
      const key = c.gender === 'Male' ? 'boys' : 'girls';
      if (g.grade === 'X') { cancelled[key]++; continue; }
      presented[key]++;
      if (!gradeDistribution[g.grade]) gradeDistribution[g.grade] = { boys: 0, girls: 0 };
      gradeDistribution[g.grade][key]++;
      if (isPassingGrade(g.grade)) passCount[key]++;
    }

    // Registered/Absent can't be derived from the listing (it only lists
    // candidates who have results) — always admin-entered, defaulting to
    // Presented/0 only as an editable starting point on the review screen,
    // never silently assumed here.
    const reg = (registeredData && registeredData[name]) || {};
    const registered = {
      boys: reg.registeredBoys ?? presented.boys,
      girls: reg.registeredGirls ?? presented.girls,
    };
    const absent = { boys: reg.absentBoys ?? 0, girls: reg.absentGirls ?? 0 };

    return {
      name,
      isCore: coreSet.has(name),
      registered: { ...registered, total: registered.boys + registered.girls },
      presented: { ...presented, total: presented.boys + presented.girls },
      absent: { ...absent, total: absent.boys + absent.girls },
      cancelled: { ...cancelled, total: cancelled.boys + cancelled.girls },
      gradeDistribution,
      percentagePass: {
        boys: pct(passCount.boys, presented.boys),
        girls: pct(passCount.girls, presented.girls),
        total: pct(passCount.boys + passCount.girls, presented.boys + presented.girls),
      },
    };
  });

  // Summary of Subjects Passed — per candidate, not per subject.
  //
  // noResultCandidates deliberately does NOT call itself "cancelled" —
  // an all-X candidate's grades alone don't say WHY every subject is X.
  // Confirmed against the real 2024 listing: its one all-X candidate
  // corresponds to officialSummary.absent = 1, with WAEC's own "Entire
  // Results Cancelled" category at 0 for that same listing — i.e. this
  // bucket was mostly catching an absence, not a malpractice cancellation,
  // even though "cancelled" is also a real, separate reason a candidate's
  // whole result set can be all-X. Labeling it "Entire Results Cancelled"
  // would mislead an admin reading the computed panel into assuming
  // malpractice specifically. officialSummary (when present) is the
  // authoritative breakdown by actual reason (absent vs withheld vs
  // blocked vs cancelled vs owing fees).
  const buckets = {};
  let failures = 0;
  let noResultCandidates = 0;
  for (const c of candidates) {
    const realGrades = c.grades.filter(g => g.grade !== 'X');
    if (c.grades.length > 0 && realGrades.length === 0) { noResultCandidates++; continue; }
    const passCount = realGrades.filter(g => isPassingGrade(g.grade)).length;
    if (passCount === 0) failures++;
    else buckets[passCount] = (buckets[passCount] || 0) + 1;
  }

  const summaryMismatches = [];
  if (officialSummary) {
    if (officialSummary.totalCandidates !== candidates.length) {
      summaryMismatches.push(`This listing's own summary declares ${officialSummary.totalCandidates} candidates, but ${candidates.length} were imported.`);
    }
    const officialBucketTotal = Object.values(officialSummary.buckets || {}).reduce((a, b) => a + b, 0);
    const computedBucketTotal = Object.values(buckets).reduce((a, b) => a + b, 0);
    if (officialBucketTotal !== computedBucketTotal) {
      summaryMismatches.push(`Our computed N-PASSES buckets total ${computedBucketTotal} candidates; this listing's own summary totals ${officialBucketTotal}.`);
    }
    const officialNoResultTotal = ['absent', 'entireResultsWithheld', 'entireResultsPending', 'entireResultsBlocked', 'entireResultsCancelled']
      .reduce((sum, key) => sum + (officialSummary[key] || 0), 0);
    if (officialNoResultTotal !== noResultCandidates) {
      summaryMismatches.push(`This listing's own summary counts ${officialNoResultTotal} candidate(s) as absent/withheld/pending/blocked/cancelled; ${noResultCandidates} candidate(s) here have every subject marked X.`);
    }
  }

  return {
    totalCandidates: candidates.length,
    subjects,
    summaryOfPasses: { buckets, failures, noResultCandidates },
    officialSummary: officialSummary || null,
    summaryMismatches,
  };
}

module.exports = { computeReport };
