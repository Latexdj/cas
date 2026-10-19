'use strict';
const { resolveClassFromHistory } = require('../services/classHistory.service');

// Fixed reference points so periods are easy to reason about: each "year"
// below is just its ordinal ms, with semester as the tiebreaker, matching
// how getClassRoster/resolveStudentClassAtPeriod build [ordinalMs, semester]
// tuples from academic_years.start_date.
const YEAR_2024_START = new Date('2024-09-01').getTime();
const YEAR_2025_START = new Date('2025-09-01').getTime();
const YEAR_2026_START = new Date('2026-09-01').getTime();

describe('resolveClassFromHistory', () => {
  describe('no history rows (brand-new student)', () => {
    it('resolves to the current class when the student existed by targetPeriod', () => {
      const createdAt = new Date('2025-09-10').getTime();
      const resolved = resolveClassFromHistory(
        [], '1D', [YEAR_2025_START, 2], createdAt, YEAR_2026_START
      );
      expect(resolved).toBe('1D');
    });

    it('resolves to null when the student was created after the existence cutoff', () => {
      const createdAt = new Date('2026-09-21').getTime(); // after YEAR_2026_START
      const resolved = resolveClassFromHistory(
        [], '1D', [YEAR_2025_START, 2], createdAt, YEAR_2026_START
      );
      expect(resolved).toBeNull();
    });
  });

  describe('history rows present', () => {
    // Regression test for the real St. Augustine's incident: a student
    // admitted into 1E on 2026-10-02 (well into the 2026/2027 year), then
    // manually corrected to 1D on 2026-10-14 (a class_history row anchored
    // to 2026/2027 Sem 1). Querying their class as of 2025/2026 Sem 2 — a
    // period before the student existed at all — must return null, not the
    // history row's fromClass ("1E"), even though that row's period is
    // chronologically after the target period.
    it('returns null for a target period before the student existed, even with a later history row', () => {
      const createdAt = new Date('2026-10-02').getTime();
      const history = [
        { fromClass: '1E', toClass: '1D', source: 'manual_edit', period: [YEAR_2026_START, 1] },
      ];
      const resolved = resolveClassFromHistory(
        history, '1D', [YEAR_2025_START, 2], createdAt, YEAR_2026_START
      );
      expect(resolved).toBeNull();
    });

    it('still resolves a legitimate promotion for a student who existed by targetPeriod', () => {
      const createdAt = new Date('2024-09-15').getTime(); // existed well before either cutoff
      const history = [
        { fromClass: '1D', toClass: '2D', source: 'promotion', period: [YEAR_2025_START, 1] },
      ];
      // Resolving for 2024/2025 Sem 2 (before the promotion) -> still in 1D.
      expect(resolveClassFromHistory(history, '2D', [YEAR_2024_START, 2], createdAt, YEAR_2025_START)).toBe('1D');
      // Resolving for 2025/2026 Sem 1 (at/after the promotion) -> now in 2D.
      expect(resolveClassFromHistory(history, '2D', [YEAR_2025_START, 1], createdAt, YEAR_2026_START)).toBe('2D');
    });

    it('treats a backfill row boundary as exclusive (the anchor period itself resolves to the old class)', () => {
      const createdAt = new Date('2024-09-15').getTime();
      const history = [
        { fromClass: '1A', toClass: '2A', source: 'backfill', period: [YEAR_2025_START, 1] },
      ];
      // At the exact backfilled period, a backfill row is exclusive (cmp < 0,
      // not <= 0) so it resolves to the OLD class, not the new one — this is
      // what keeps a backfilled student's own evidence-bearing period
      // pointing at the class that evidence came from.
      expect(resolveClassFromHistory(history, '2A', [YEAR_2025_START, 1], createdAt, YEAR_2026_START)).toBe('1A');
    });

    it('resolves normally when createdAt/existenceCutoff are unavailable (pre-existing behavior unaffected)', () => {
      const history = [
        { fromClass: '1D', toClass: '2D', source: 'promotion', period: [YEAR_2025_START, 1] },
      ];
      expect(resolveClassFromHistory(history, '2D', [YEAR_2024_START, 2], null, null)).toBe('1D');
    });

    // Regression test for the second real St. Augustine's incident, found
    // while diagnosing why an imported 2024/2025 dataset was invisible: the
    // entire school's student population (active and graduated alike) was
    // bulk-migrated into the system in May 2026, including class_history
    // rows backfilled to reconstruct each student's placement in prior
    // years/semesters. Every one of those students' createdAt therefore
    // postdates the 2025/2026 cutoff, which — before this fix — made the
    // existence guard wrongly null out their 2024/2025 class even though a
    // 'backfill' row exists specifically to state what it was.
    it('trusts a backfill row over the existence guard, even when createdAt is from a later bulk migration', () => {
      const createdAt = new Date('2026-05-27').getTime(); // bulk-migration date, long after either year
      const history = [
        { fromClass: '2GEE', toClass: '3GEE', source: 'backfill', period: [YEAR_2025_START, 2] },
      ];
      // Target: 2024/2025 Sem 1 — before the backfilled transition, and
      // before the student's own createdAt. The live-sourced test above
      // returns null for exactly this createdAt/cutoff relationship; a
      // backfill-sourced row must not.
      const resolved = resolveClassFromHistory(
        history, '3GEE', [YEAR_2024_START, 1], createdAt, YEAR_2025_START
      );
      expect(resolved).toBe('2GEE');
    });

    it('still applies the existence guard when a live-sourced row is what decides the answer, even alongside an unrelated backfill row', () => {
      const createdAt = new Date('2026-10-02').getTime();
      const history = [
        { fromClass: '1E', toClass: '1D', source: 'manual_edit', period: [YEAR_2026_START, 1] },
      ];
      // Same shape as the first regression test — included here to make the
      // live-vs-backfill distinction explicit side by side with the test
      // above, rather than relying on a reader to cross-reference it.
      expect(resolveClassFromHistory(history, '1D', [YEAR_2025_START, 2], createdAt, YEAR_2026_START)).toBeNull();
    });
  });
});
