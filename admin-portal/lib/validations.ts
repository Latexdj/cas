export const PHONE_RE      = /^0\d{9}$/;
export const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;
export const NTC_RE        = /^PT\/\d{6}\/\d{4}$/;
export const SSF_RE        = /^[A-Za-z]{2}\d{11}$/;

export const PHONE_MSG      = 'Must be 10 digits starting with 0 (e.g. 0207440175)';
export const GHANA_CARD_MSG = 'Format: GHA-XXXXXXXXX-X (e.g. GHA-715422858-2)';
export const NTC_MSG        = 'Format: PT/XXXXXX/XXXX (e.g. PT/010060/2009)';
export const SSF_MSG        = '2 letters + 11 digits, total 13 chars (e.g. KO18602160034)';

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

/** Returns a map of field → error message for any invalid populated fields. */
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
  return errors;
}

export function validateStudentForm(form: Record<string, string>): Record<string, string> {
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
  return errors;
}
