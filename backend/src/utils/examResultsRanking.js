'use strict';

// Converts this school's grade_boundaries (sort_order: higher = better,
// e.g. A1=9 ... F9=1) into a 1-based point scale where 1 is the best
// grade — the conventional WASSCE "aggregate" direction (lower total =
// better), regardless of how many grades are configured or their raw
// sort_order values.
function computeGradePoints(gradeBoundaries) {
  const best_first = [...gradeBoundaries].sort((a, b) => b.sort_order - a.sort_order);
  const points = {};
  best_first.forEach((b, i) => { points[b.grade] = i + 1; });
  return points;
}

// Sums the best (lowest-point) 6 subjects a candidate has a real grade
// in — X (cancelled) and anything not in gradePoints is excluded, same as
// "no result" elsewhere in this module. Returns null for a candidate with
// no scoreable subjects at all (wholly absent/cancelled), so callers can
// drop them from a ranking rather than showing a meaningless 0.
function computeBestSixAggregate(grades, gradePoints) {
  const scored = grades
    .map(g => gradePoints[g.grade])
    .filter(p => p != null)
    .sort((a, b) => a - b);
  if (!scored.length) return null;
  const best = scored.slice(0, 6);
  return { aggregate: best.reduce((s, p) => s + p, 0), subjectsCounted: best.length };
}

module.exports = { computeGradePoints, computeBestSixAggregate };
