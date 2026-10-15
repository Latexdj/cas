'use strict';

// Shared across students.js, primary.js, teachers.js, admissions.js and
// admin-admissions.js — every place a date_of_birth gets written. Catches
// the single most common data-entry mistake (typing today's date, or
// another implausibly recent date, as someone's birthday) without needing
// each route to reimplement age math.
function calcAge(dob, asOf = new Date()) {
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Returns an error message if `dateOfBirth` is missing/invalid as a minimum
 * age check, or null if it passes (including when dateOfBirth is empty —
 * callers decide separately whether the field is required at all).
 */
function minAgeError(dateOfBirth, minYears, label = 'Date of birth') {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null; // malformed date — not this helper's job to catch
  const today = new Date();
  if (dob.getTime() > today.getTime()) return `${label} cannot be in the future.`;
  const age = calcAge(dob, today);
  if (age < minYears) {
    return `${label} implies an age of ${Math.max(age, 0)}, which is under the minimum of ${minYears} years.`;
  }
  return null;
}

module.exports = { minAgeError, calcAge };
