'use strict';

// Computes the GES-style Analysis Report from a batch's parsed candidates
// and this school's grade_boundaries. Two distinct pass thresholds are in
// play here, both verified against real Analysis Report numbers (see the
// WAEC Results Analysis plan doc) rather than assumed:
//   - Per-subject "Percentage Pass": any grade except F9 (remark != 'Fail').
//   - Per-candidate "N Passes" summary: C6 or better (the standard
//     "number of credits" metric) — grade_boundaries' sort_order for C6
//     is the cutoff, read from the table rather than hardcoded, so a
//     school's own customization of their boundaries stays consistent
//     with the rest of the app.
function computeReport({ candidates, gradeBoundaries, registeredData, coreSubjects }) {
  const boundaryByGrade = new Map(gradeBoundaries.map(b => [b.grade, b]));
  const creditSortOrder = boundaryByGrade.get('C6')?.sort_order ?? 4;
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
      const boundary = boundaryByGrade.get(g.grade);
      if (boundary && boundary.remark !== 'Fail') passCount[key]++;
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
  const buckets = {};
  let failures = 0;
  let entireResultsCancelled = 0;
  for (const c of candidates) {
    const realGrades = c.grades.filter(g => g.grade !== 'X');
    if (c.grades.length > 0 && realGrades.length === 0) { entireResultsCancelled++; continue; }
    const creditCount = realGrades.filter(g => {
      const b = boundaryByGrade.get(g.grade);
      return b && b.sort_order >= creditSortOrder;
    }).length;
    if (creditCount === 0) failures++;
    else buckets[creditCount] = (buckets[creditCount] || 0) + 1;
  }

  return {
    totalCandidates: candidates.length,
    subjects,
    summaryOfPasses: { buckets, failures, entireResultsCancelled },
  };
}

module.exports = { computeReport };
