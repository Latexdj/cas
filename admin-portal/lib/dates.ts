// Shared date-parsing/formatting helpers for values coming back from the API.
//
// Root cause this exists to guard against: several DATE columns are read
// from Postgres without an explicit ::text cast, so node-pg hands back a
// native JS Date object, which then round-trips through JSON as a full ISO
// datetime string ("2026-09-05T00:00:00.000Z") instead of a plain
// "YYYY-MM-DD" string. Naively concatenating 'T00:00:00' onto whatever
// arrives breaks on that shape. parseApiDate normalises all three possible
// shapes (Date object, full ISO string, plain date string) plus null/
// undefined into a real local-midnight Date or null, so callers never have
// to think about this again.
//
// The backend has its own equivalent in backend/src/services/pdf.service.js
// (can't share one module across the frontend/backend package boundary) --
// keep that version in sync if you change the parsing logic here.
export function parseApiDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const isoDatePart = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const parsed = new Date(isoDatePart + 'T00:00:00');
  return isNaN(parsed.getTime()) ? null : parsed;
}

// "05 Sep 2026" (en-GB) — used by the teacher and student attendance pages,
// which had two byte-identical copies of this exact formatter.
export function fmtDateShort(d: string | Date | null | undefined): string {
  const parsed = parseApiDate(d);
  return parsed ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

// "05 Sep 2026" (default/browser locale) — used by academic years and the
// school calendar, which had the same format spec with only a null-check
// difference between them.
export function fmtDateDefault(d: string | Date | null | undefined): string {
  const parsed = parseApiDate(d);
  return parsed ? parsed.toLocaleDateString('default', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
