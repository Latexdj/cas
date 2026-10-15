export const PHONE_RE      = /^0\d{9}$/;
export const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;
export const NTC_RE        = /^PT\/\d{6}\/\d{4}$/;
export const SSF_RE        = /^[A-Za-z]\d{12}$/;

export const PHONE_MSG      = 'Must be 10 digits starting with 0 (e.g. 0207440175)';
export const GHANA_CARD_MSG = 'Format: GHA-XXXXXXXXX-X (e.g. GHA-715422858-2)';
export const NTC_MSG        = 'Format: PT/XXXXXX/XXXX (e.g. PT/010060/2009)';
export const SSF_MSG        = '1 letter + 12 digits, total 13 chars (e.g. K000000000000)';

export function validatePhone(v?: string | null): string | null {
  if (!v) return null;
  return PHONE_RE.test(v) ? null : PHONE_MSG;
}
export function validateGhanaCard(v?: string | null): string | null {
  if (!v) return null;
  return GHANA_CARD_RE.test(v) ? null : GHANA_CARD_MSG;
}
export function validateNTC(v?: string | null): string | null {
  if (!v) return null;
  return NTC_RE.test(v) ? null : NTC_MSG;
}
export function validateSSF(v?: string | null): string | null {
  if (!v) return null;
  return SSF_RE.test(v) ? null : SSF_MSG;
}

/** Returns an error message if `dob` implies an age under `minYears`, or is in the future. */
export function validateMinAge(dob?: string | null, minYears = 0, label = 'Date of birth'): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  if (d.getTime() > today.getTime()) return `${label} cannot be in the future.`;
  let age = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age--;
  if (age < minYears) return `${label} implies an age of ${Math.max(age, 0)}, which is under the minimum of ${minYears} years.`;
  return null;
}

/** Returns a map of field → error message for any invalid populated fields. */
// Staff must be at least 18 — same floor for both the SHS and Primary portals.
const TEACHER_MIN_AGE_YEARS = 18;

export function validateTeacherForm(form: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  const checks: [string, (v: string) => string | null][] = [
    ['phone',                   validatePhone],
    ['emergency_contact_phone', validatePhone],
    ['ghana_card_number',       validateGhanaCard],
    ['ntc_number',              validateNTC],
    ['ssf_number',              validateSSF],
  ];
  for (const [field, fn] of checks) {
    const err = fn(form[field]);
    if (err) errors[field] = err;
  }
  const dobErr = validateMinAge(form.date_of_birth, TEACHER_MIN_AGE_YEARS, "Staff member's date of birth");
  if (dobErr) errors.date_of_birth = dobErr;
  return errors;
}

/** minAgeYears: 10 for SHS students (default), 2 for Primary students. */
export function validateStudentForm(form: Record<string, string>, minAgeYears = 10): Record<string, string> {
  const errors: Record<string, string> = {};
  const checks: [string, (v: string) => string | null][] = [
    ['mobile_number',   validatePhone],
    ['guardian_mobile', validatePhone],
    ['ghana_card_number', validateGhanaCard],
  ];
  for (const [field, fn] of checks) {
    const err = fn(form[field]);
    if (err) errors[field] = err;
  }
  const dobErr = validateMinAge(form.date_of_birth, minAgeYears, "Student's date of birth");
  if (dobErr) errors.date_of_birth = dobErr;
  return errors;
}
