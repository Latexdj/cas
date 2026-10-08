'use strict';
const ExcelJS = require('exceljs');
const { WAEC_GRADE_CODES, normalizeSubjectName } = require('./waecSubjects');

const GRADES = WAEC_GRADE_CODES.filter(g => g !== 'X'); // A1..F9, in order

// Resolves a cell to plain text, unwrapping rich-text runs. Does NOT try
// to resolve formulas to text (callers that need a formula's value use
// cellNumber below) — a formula cell is never a label we need to match.
function cellText(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && Array.isArray(v.richText)) v = v.richText.map(r => r.text).join('');
  return (v === null || v === undefined) ? '' : String(v).trim();
}

// Resolves a cell to a number. Formula cells only carry a usable value
// when Excel cached a result on last save (`{formula, result}`); a
// formula with no cached result, or one that evaluated to an error
// (`{error: '#DIV/0!'}`, seen in a real sample for a 0-registered
// subject), has no numeric `result` and is treated as 0 rather than
// thrown on — these reports are being re-derived from raw counts anyway,
// not trusted for their own computed columns.
function cellNumber(cell) {
  const v = cell.value;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof v.result === 'number') return v.result;
  return 0;
}

// Finds the row/column of the "REGISTERED" header cell that anchors the
// whole table. Every sample studied has it at column 3, but we search
// rather than assume, so a layout with an extra/missing leading column
// still resolves correctly instead of silently misreading every field by
// one column.
function findHeaderAnchor(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(row.cellCount, 20); c++) {
      if (cellText(row.getCell(c)).toUpperCase() === 'REGISTERED') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function emptyGradeDistribution() {
  const dist = {};
  for (const g of GRADES) dist[g] = { boys: 0, girls: 0 };
  return dist;
}

function sumGradeCounts(dist) {
  return Object.values(dist).reduce((s, d) => s + d.boys + d.girls, 0);
}

// Scans every cell in the sheet for the Summary of Subjects Passed
// block's "LABEL   =N" free-text cells (e.g. "8 PASSES     =0",
// "FAILURES             =4") — position varies by file, so this is a
// full-sheet text scan, not anchored to a row range. ABSENT / RESULTS
// HELD / ENTIRE RESULTS CANCELLED all fold into noResultCandidates,
// mirroring how computeReport() itself pools every reason a candidate's
// whole result set is missing into one figure rather than a per-reason
// breakdown (which officialSummary, not available here, is for).
function scanSummaryOfPasses(ws) {
  const buckets = {};
  let failures = null, noResultCandidates = 0, foundAny = false;
  const PASS_RE = /^(\d{1,2})\s*PASSES?\s*=\s*(\d+)/i;
  const FAILURES_RE = /^FAILURES\s*=\s*(\d+)/i;
  const NO_RESULT_RES = [/^ABSENT\s*=\s*(\d+)/i, /^RESULTS\s*HELD\s*=\s*(\d+)/i, /^ENTIRE RESULTS CANCELLED\s*=\s*(\d+)/i];

  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell);
      if (!text) return;
      let m = text.match(PASS_RE);
      if (m) { buckets[parseInt(m[1], 10)] = parseInt(m[2], 10); foundAny = true; return; }
      m = text.match(FAILURES_RE);
      if (m) { failures = parseInt(m[1], 10); foundAny = true; return; }
      for (const re of NO_RESULT_RES) {
        m = text.match(re);
        if (m) { noResultCandidates += parseInt(m[1], 10); foundAny = true; return; }
      }
    });
  });

  return foundAny ? { buckets, failures: failures ?? 0, noResultCandidates } : null;
}

function scanDeclaredTotal(ws) {
  let found = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (found !== null) return;
      const m = cellText(cell).match(/TOTAL NUMBER OF CANDIDATES\s+(\d+)/i);
      if (m) found = parseInt(m[1], 10);
    });
  });
  return found;
}

function scanYear(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(row.cellCount, 10); c++) {
      const m = cellText(row.getCell(c)).match(/WASSCE\s+(\d{4})/i);
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
}

function scanSchoolName(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const row = ws.getRow(r);
    let sawLabel = false;
    for (let c = 1; c <= Math.min(row.cellCount, 20); c++) {
      const text = cellText(row.getCell(c));
      if (/^SCHOOL:?$/i.test(text)) { sawLabel = true; continue; }
      if (sawLabel && text) return text;
    }
  }
  return null;
}

// Parses one worksheet into { subjects, warnings } using the header
// anchor's column as the origin for every field group — each group
// (Registered/Presented/Absent/Cancelled/A1../F9) is a fixed +3 columns
// from the previous one, B then G (T is never read; always recomputed).
function parseSheet(ws) {
  const anchor = findHeaderAnchor(ws);
  if (!anchor) return null; // not a results-analysis sheet (e.g. a legend/code sheet)

  const subjectCol = anchor.col - 1;
  const regCol = anchor.col;
  const presCol = regCol + 3;
  const absCol = regCol + 6;
  const cancCol = regCol + 9;
  const gradeStartCol = regCol + 12; // A1 Boys; each subsequent grade is +3

  const warnings = [];
  const subjects = [];
  let section = null; // 'Core' | 'Elective' | null (not yet seen a marker)

  const dataStartRow = anchor.row + 2; // skip the B/G/T sub-header row
  for (let r = dataStartRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellText(row.getCell(subjectCol));
    if (!label) continue;
    const upper = label.toUpperCase();
    if (upper === 'CORE') { section = 'Core'; continue; }
    if (upper === 'ELECTIVE' || upper === 'ELECTIVES') { section = 'Elective'; continue; }
    if (upper === 'TOTAL') continue; // the in-table total row; we derive our own, never trust this
    // The Summary of Subjects Passed block (and its own "Total Number of
    // Candidates" label, sometimes stale — see scanDeclaredTotal) starts
    // below the subject table and is not subject data — stop here. A
    // real bug this guards: that label text once landed in the subject
    // column with a real number in an adjacent cell, which was read as a
    // bogus extra "subject" before this check existed.
    if (upper.startsWith('SUMMARY OF SUBJECT') || upper.includes('TOTAL NUMBER OF CANDIDATES')) break;

    const registered = { boys: cellNumber(row.getCell(regCol)), girls: cellNumber(row.getCell(regCol + 1)) };
    const presented = { boys: cellNumber(row.getCell(presCol)), girls: cellNumber(row.getCell(presCol + 1)) };
    const absent = { boys: cellNumber(row.getCell(absCol)), girls: cellNumber(row.getCell(absCol + 1)) };
    const cancelled = { boys: cellNumber(row.getCell(cancCol)), girls: cellNumber(row.getCell(cancCol + 1)) };
    const gradeDistribution = emptyGradeDistribution();
    GRADES.forEach((g, i) => {
      const col = gradeStartCol + i * 3;
      gradeDistribution[g] = { boys: cellNumber(row.getCell(col)), girls: cellNumber(row.getCell(col + 1)) };
    });

    const hasAnyData = registered.boys + registered.girls + presented.boys + presented.girls + sumGradeCounts(gradeDistribution) > 0;
    if (!hasAnyData) continue; // unused placeholder subject row in a long master template

    const { name, recognized } = normalizeSubjectName(label);
    if (!recognized) warnings.push({ type: 'unrecognized_subject', message: `"${label}" is not a recognized subject — imported as "${name}". Check the spelling matches other years if this subject should combine with them in Analytics.` });
    if (section === null) warnings.push({ type: 'no_section_marker', message: `"${name}" appeared before any "Core"/"Elective" section label — defaulted to Elective.` });

    subjects.push({ name, isCore: section === 'Core', registered, presented, absent, cancelled, gradeDistribution });
  }

  if (!subjects.length) return null; // header found but no real data (e.g. a blank master template)

  const presentedCoreTotal = subjects.find(s => s.isCore)?.presented;
  const derivedTotal = presentedCoreTotal ? presentedCoreTotal.boys + presentedCoreTotal.girls
    : Math.max(0, ...subjects.map(s => s.presented.boys + s.presented.girls));
  const declaredTotal = scanDeclaredTotal(ws);
  if (declaredTotal !== null && declaredTotal !== derivedTotal) {
    warnings.push({ type: 'count_mismatch', message: `This sheet's own "Total Number of Candidates" label says ${declaredTotal}, but the subject data works out to ${derivedTotal} — using ${derivedTotal} (the label is frequently left over from a different year's copy of this template).` });
  }

  return {
    sheetName: ws.name,
    detectedYear: scanYear(ws),
    schoolName: scanSchoolName(ws),
    totalCandidates: derivedTotal,
    subjects,
    summaryOfPasses: scanSummaryOfPasses(ws),
    warnings,
  };
}

// Parses an uploaded .xlsx Analysis Report workbook. Returns one entry per
// worksheet that actually looks like real analysis data (has the
// Registered/Presented/Absent header shape AND at least one subject row
// with real numbers) — a blank master-template sheet or an unrelated
// legend sheet (both seen in real samples) are silently excluded rather
// than reported as failed sheets.
async function parseAggregateWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = [];
  for (const ws of wb.worksheets) {
    const parsed = parseSheet(ws);
    if (parsed) sheets.push(parsed);
  }
  return { sheets };
}

module.exports = { parseAggregateWorkbook };
