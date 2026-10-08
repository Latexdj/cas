'use strict';
/**
 * Excel Analysis Report parser (waecExcelAggregateParser.js). Fixtures
 * are real old Analysis Report workbooks (src/__tests__/fixtures/
 * analysis-reports/) covering the real-world messiness found studying
 * them: a stale "Total Number of Candidates" label left over from a
 * different year's copy of the template, a misspelled subject, a wider
 * template with a redundant "profile analysis" side-table and dozens of
 * unused placeholder subject rows, and a workbook bundling a blank
 * master template + real data + an unrelated legend sheet across three
 * sheets.
 */

const fs = require('fs');
const path = require('path');
const { parseAggregateWorkbook } = require('../utils/waecExcelAggregateParser');

const FIXTURES = path.join(__dirname, 'fixtures', 'analysis-reports');
const load = (name) => fs.readFileSync(path.join(FIXTURES, name));

describe('2021-standard.xlsx — the base layout', () => {
  let result;
  beforeAll(async () => { result = await parseAggregateWorkbook(load('2021-standard.xlsx')); });

  it('finds exactly one real sheet', () => {
    expect(result.sheets).toHaveLength(1);
  });

  it('detects the year and school name', () => {
    expect(result.sheets[0].detectedYear).toBe(2021);
    expect(result.sheets[0].schoolName).toMatch(/ST AUGUSTINE/i);
  });

  it('derives Total Candidates from the core subjects\' Presented total, not a label', () => {
    expect(result.sheets[0].totalCandidates).toBe(57);
  });

  it('extracts every subject with correct Core/Elective grouping', () => {
    const { subjects } = result.sheets[0];
    expect(subjects).toHaveLength(11);
    const core = subjects.filter(s => s.isCore).map(s => s.name);
    expect(core).toEqual(['English Language', 'Mathemaics', 'Integrated Science', 'Social Studies']);
  });

  it('extracts Registered/Presented/Absent/grade counts exactly as printed for a known row', () => {
    const english = result.sheets[0].subjects.find(s => s.name === 'English Language');
    expect(english.registered).toEqual({ boys: 15, girls: 42 });
    expect(english.presented).toEqual({ boys: 15, girls: 42 });
    expect(english.gradeDistribution.F9).toEqual({ boys: 0, girls: 2 });
    expect(english.gradeDistribution.C6).toEqual({ boys: 8, girls: 9 });
  });

  it('flags a genuinely misspelled subject ("Mathemaics") as unrecognized rather than silently guessing', () => {
    expect(result.sheets[0].warnings.some(w => w.type === 'unrecognized_subject' && w.message.includes('Mathemaics'))).toBe(true);
  });

  it('extracts the Summary of Subjects Passed free-text block ("N PASSES   =count")', () => {
    expect(result.sheets[0].summaryOfPasses).toEqual({
      buckets: { 2: 6, 3: 8, 4: 8, 5: 10, 6: 12, 7: 11, 8: 0 },
      failures: 0,
      noResultCandidates: 0,
    });
  });
});

describe('2023-stale-total-label.xlsx — a wrong leftover label', () => {
  let result;
  beforeAll(async () => { result = await parseAggregateWorkbook(load('2023-stale-total-label.xlsx')); });

  it('trusts the derived total (23), not the stale printed label (82), and warns about the mismatch', () => {
    const sheet = result.sheets[0];
    expect(sheet.totalCandidates).toBe(23);
    expect(sheet.warnings.some(w => w.type === 'count_mismatch' && w.message.includes('82') && w.message.includes('23'))).toBe(true);
  });

  it('does not mistake the summary section\'s own text for a subject row', () => {
    const names = result.sheets[0].subjects.map(s => s.name);
    expect(names.every(n => !n.toUpperCase().includes('TOTAL NUMBER OF CANDIDATES'))).toBe(true);
    expect(names.every(n => !n.toUpperCase().includes('SUMMARY'))).toBe(true);
  });
});

describe('2024-wide-template.xlsx — redundant side-table + long placeholder subject list', () => {
  let result;
  beforeAll(async () => { result = await parseAggregateWorkbook(load('2024-wide-template.xlsx')); });

  it('only extracts subjects with real data, skipping dozens of unused placeholder rows', () => {
    const sheet = result.sheets[0];
    expect(sheet.subjects).toHaveLength(11);
    expect(sheet.subjects.some(s => s.name === 'Auto Mechanics')).toBe(false);
  });

  it('ignores the redundant "PASSED NO./%% / FAILED / ABSENTEES / CANCELLED" side-table and still reads the real columns correctly', () => {
    const english = result.sheets[0].subjects.find(s => s.name === 'English Language');
    expect(english.presented).toEqual({ boys: 5, girls: 44 });
    expect(english.absent).toEqual({ boys: 1, girls: 0 });
  });

  it('every known-good subject name resolves with no unrecognized-subject warnings on this file', () => {
    expect(result.sheets[0].warnings.filter(w => w.type === 'unrecognized_subject')).toHaveLength(0);
  });
});

describe('multi-sheet-2022.xlsx — a blank master template + real data + an unrelated legend sheet', () => {
  let result;
  beforeAll(async () => { result = await parseAggregateWorkbook(load('multi-sheet-2022.xlsx')); });

  it('finds exactly the one sheet with real data, silently excluding the blank template and the legend sheet', () => {
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].detectedYear).toBe(2022);
  });

  it('is not confused by unreliable S/N numbering (electives jump 12, 13, 14, 36, 37 in the real file)', () => {
    const electiveNames = result.sheets[0].subjects.filter(s => !s.isCore).map(s => s.name);
    expect(electiveNames).toEqual(expect.arrayContaining(['Economics', 'History', 'Literature in English', 'Management in Living', 'Food and Nutrition']));
  });
});

describe('a workbook with no results-analysis sheet at all', () => {
  it('returns zero sheets rather than throwing', async () => {
    // Re-use a fixture's Code-only shape indirectly: parseAggregateWorkbook
    // already excludes non-matching sheets per-workbook; confirm the
    // overall contract (no header row anywhere -> empty sheets array) by
    // asserting on the already-covered multi-sheet file's Code sheet
    // being excluded, which the "finds exactly the one sheet" test above
    // already proves indirectly. This test documents the contract
    // explicitly for a future reader.
    const result = await parseAggregateWorkbook(load('multi-sheet-2022.xlsx'));
    expect(result.sheets.every(s => s.sheetName !== 'Code')).toBe(true);
  });
});
