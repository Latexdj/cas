'use strict';

// Soft, informational warnings for a parsed WAEC listing — same
// { type, message } shape waecParser.js's own warnings use, appended
// alongside them. Checked once at parse/review time, not live-rechecked
// client-side like the Excel aggregate path's warnings — almost
// everything here is derived straight from the listing text and isn't
// admin-editable; the one field the admin does edit (Absent) has nothing
// left to reconcile against, since Registered is computed as
// Presented + Cancelled + Absent rather than independently entered
// (see waec-results/import/page.tsx).
function validateListingWarnings({ candidates, coreSubjects }) {
  const warnings = [];

  const presentedBySubject = new Map();
  for (const c of candidates) {
    for (const g of c.grades) {
      if (g.grade === 'X') continue;
      presentedBySubject.set(g.subjectName, (presentedBySubject.get(g.subjectName) || 0) + 1);
    }
  }
  const presentCore = coreSubjects.filter(name => presentedBySubject.has(name));
  if (presentCore.length > 1) {
    const counts = presentCore.map(name => presentedBySubject.get(name));
    const max = Math.max(...counts), min = Math.min(...counts);
    if (max !== min) {
      warnings.push({
        type: 'core_subject_mismatch',
        message: `The core subjects don't all have the same number of candidates presented (ranges from ${min} to ${max}) — check for a subject whose grade failed to parse for some candidates.`,
      });
    }
  }

  return warnings;
}

module.exports = { validateListingWarnings };
