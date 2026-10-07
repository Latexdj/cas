'use strict';
const ExcelJS = require('exceljs');

// CAS brand palette (see the design-rules memory: deep forest green is the
// primary brand color, warm gold the accent, and the status trio is
// brand-calibrated rather than Tailwind's default green/amber/red).
const BRAND_DARK    = 'FF0B3D2E'; // deep forest green — header bands
const BRAND_MID     = 'FF145C44'; // mid green — subtitle text
const BRAND_GOLD     = 'FFC8973A'; // warm gold — accents/dividers
const GOLD_TINT     = 'FFF6E9CF'; // light gold tint — section bands
const WARM_ZEBRA    = 'FFFAF7F1'; // warm near-white — alternating rows
const BORDER_COLOR  = 'FFD9D2C4'; // warm light border, not cold gray
const STATUS_GOOD   = 'FF2D7A4F';
const STATUS_WARN   = 'FFC8780A';
const STATUS_BAD    = 'FFB83232';
const MUTED_TEXT     = 'FF6B6358';

const GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
const THIN = { style: 'thin', color: { argb: BORDER_COLOR } };
const CELL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const TOTAL_COLS = 1 + 3 * 3 + GRADE_ORDER.length * 3 + 3; // Subject + Reg/Pres/Abs + grades + %Pass = 40

function passRateColor(pct) {
  if (pct >= 75) return STATUS_GOOD;
  if (pct >= 50) return STATUS_WARN;
  return STATUS_BAD;
}

function forEachCol(row, count, fn) {
  for (let c = 1; c <= count; c++) fn(row.getCell(c), c);
}

// Writes a label/value "card" (title bar + key-value rows) starting at an
// explicit row/column rather than via ws.addRow() — two cards are placed
// side by side at the SAME startRow with different columns, which
// addRow()'s always-append-at-the-end behavior can't do.
function drawSummaryCard(ws, { startRow, labelCol, labelSpan, valueCol, title, rows }) {
  const labelEnd = labelCol + labelSpan - 1;
  ws.mergeCells(startRow, labelCol, startRow, valueCol);
  const titleCell = ws.getRow(startRow).getCell(labelCol);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  for (let c = labelCol; c <= valueCol; c++) ws.getRow(startRow).getCell(c).border = CELL_BORDER;
  ws.getRow(startRow).height = 30;

  rows.forEach(([label, value], i) => {
    const r = ws.getRow(startRow + 1 + i);
    if (labelSpan > 1) ws.mergeCells(r.number, labelCol, r.number, labelEnd);
    r.getCell(labelCol).value = label;
    r.getCell(labelCol).alignment = { horizontal: 'left' };
    r.getCell(valueCol).value = value;
    r.getCell(valueCol).alignment = { horizontal: 'right' };
    r.getCell(valueCol).font = { bold: true };
    const fill = i % 2 === 1 ? WARM_ZEBRA : 'FFFFFFFF';
    for (let c = labelCol; c <= valueCol; c++) {
      r.getCell(c).border = CELL_BORDER;
      r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
  });
  return startRow + rows.length; // last row this card occupies
}

// Builds the GES-template-shaped Analysis Report workbook, styled with the
// CAS brand palette (deep-green header bands, warm-gold section accents,
// status-tiered % Pass coloring) instead of ExcelJS's plain default fills —
// see the PDF twin of this layout in pdf.service.js's
// buildExamAnalysisReportHTML for the same design applied to the PDF export.
function buildExamAnalysisWorkbook(report, school) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CAS Services';
  wb.created = new Date();

  const ws = wb.addWorksheet('Analysis Report', {
    properties: { tabColor: { argb: BRAND_DARK } },
  });

  // ── Letterhead ────────────────────────────────────────────────────────
  const nameRow = ws.addRow([school.name]);
  ws.mergeCells(nameRow.number, 1, nameRow.number, TOTAL_COLS);
  nameRow.getCell(1).font = { bold: true, size: 16, color: { argb: BRAND_DARK } };
  nameRow.getCell(1).alignment = { horizontal: 'center' };
  nameRow.height = 24;

  const subtitleRow = ws.addRow([`${report.examBody} ${report.year} School Result Analysis`]);
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, TOTAL_COLS);
  subtitleRow.getCell(1).font = { size: 12, color: { argb: BRAND_MID } };
  subtitleRow.getCell(1).alignment = { horizontal: 'center' };

  const metaRow = ws.addRow([]);
  const half = Math.floor(TOTAL_COLS / 2);
  ws.mergeCells(metaRow.number, 1, metaRow.number, half);
  ws.mergeCells(metaRow.number, half + 1, metaRow.number, TOTAL_COLS);
  metaRow.getCell(1).value = report.schoolNumber ? `School # ${report.schoolNumber}` : '';
  metaRow.getCell(1).alignment = { horizontal: 'left' };
  metaRow.getCell(half + 1).value = `Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  metaRow.getCell(half + 1).alignment = { horizontal: 'right' };
  forEachCol(metaRow, TOTAL_COLS, cell => {
    cell.font = { size: 9, color: { argb: MUTED_TEXT } };
    cell.border = { bottom: { style: 'medium', color: { argb: BRAND_GOLD } } };
  });

  ws.addRow([]);

  // ── Table header (two rows: group labels, then B/G/T) ────────────────
  const headerRow1 = ws.addRow(['Subject', 'Registered', '', '', 'Presented', '', '', 'Absent', '', '',
    ...GRADE_ORDER.flatMap(g => [g, '', '']), '% Pass', '', '']);
  const headerRow2 = ws.addRow(['', 'B', 'G', 'T', 'B', 'G', 'T', 'B', 'G', 'T',
    ...GRADE_ORDER.flatMap(() => ['B', 'G', 'T']), 'B', 'G', 'T']);
  ws.mergeCells(headerRow1.number, 1, headerRow2.number, 1); // "Subject" spans both header rows
  let col = 2;
  for (const span of [3, 3, 3, ...GRADE_ORDER.map(() => 3), 3]) {
    ws.mergeCells(headerRow1.number, col, headerRow1.number, col + span - 1);
    col += span;
  }
  [headerRow1, headerRow2].forEach(r => {
    forEachCol(r, TOTAL_COLS, cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = CELL_BORDER;
    });
  });
  headerRow1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  // ── Subject rows, by Core/Elective, zebra-striped ────────────────────
  let zebraIndex = 0;
  const addSection = (title, subjects) => {
    if (!subjects.length) return;
    const bandRow = ws.addRow([title]);
    ws.mergeCells(bandRow.number, 1, bandRow.number, TOTAL_COLS);
    forEachCol(bandRow, TOTAL_COLS, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_TINT } };
      cell.border = CELL_BORDER;
    });
    bandRow.getCell(1).font = { bold: true, color: { argb: BRAND_DARK } };
    bandRow.getCell(1).alignment = { horizontal: 'left' };

    for (const s of subjects) {
      const row = ws.addRow([
        s.name,
        s.registered.boys, s.registered.girls, s.registered.total,
        s.presented.boys, s.presented.girls, s.presented.total,
        s.absent.boys, s.absent.girls, s.absent.total,
        ...GRADE_ORDER.flatMap(g => {
          const d = s.gradeDistribution[g];
          return [d?.boys || 0, d?.girls || 0, d ? d.boys + d.girls : 0];
        }),
        s.percentagePass.boys, s.percentagePass.girls, s.percentagePass.total,
      ]);
      const fill = zebraIndex % 2 === 1 ? WARM_ZEBRA : null;
      forEachCol(row, TOTAL_COLS, cell => {
        cell.border = CELL_BORDER;
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      });
      row.getCell(1).alignment = { horizontal: 'left' };
      for (let c = 2; c <= TOTAL_COLS; c++) row.getCell(c).alignment = { horizontal: 'center' };
      [TOTAL_COLS - 2, TOTAL_COLS - 1, TOTAL_COLS].forEach(c => { row.getCell(c).numFmt = '0.0"%"'; });
      // Only the Total % Pass column is color-coded — a performance signal
      // worth flagging at a glance, not decoration applied to every cell.
      row.getCell(TOTAL_COLS).font = { bold: true, color: { argb: passRateColor(s.percentagePass.total) } };
      zebraIndex++;
    }
  };
  addSection('Core Subjects', report.subjects.filter(s => s.isCore));
  addSection('Elective Subjects', report.subjects.filter(s => !s.isCore));

  // ── Summary of Subjects Passed — two cards side by side ──────────────
  ws.addRow([]);
  const summaryStartRow = ws.lastRow.number + 1;

  const maxBucket = Math.max(0, ...Object.keys(report.summaryOfPasses.buckets).map(Number));
  const computedRows = [['Total Number of Candidates', report.totalCandidates]];
  for (let n = maxBucket; n >= 1; n--) computedRows.push([`${n} Pass${n === 1 ? '' : 'es'}`, report.summaryOfPasses.buckets[n] || 0]);
  computedRows.push(['Failures', report.summaryOfPasses.failures]);
  computedRows.push(['No Result (Absent/Cancelled/Withheld)', report.summaryOfPasses.noResultCandidates]);

  let endRow = drawSummaryCard(ws, {
    startRow: summaryStartRow, labelCol: 1, labelSpan: 1, valueCol: 2,
    title: 'Summary of Subjects Passed (computed)', rows: computedRows,
  });

  if (report.officialSummary) {
    const os = report.officialSummary;
    const osMaxBucket = Math.max(0, ...Object.keys(os.buckets || {}).map(Number));
    const officialRows = [['Total Number of Candidates', os.totalCandidates]];
    for (let n = osMaxBucket; n >= 1; n--) officialRows.push([`${n} Pass${n === 1 ? '' : 'es'}`, os.buckets[n] || 0]);
    officialRows.push(['Failures', os.failures ?? 0]);
    officialRows.push(['Absent', os.absent ?? 0]);
    officialRows.push(['Entire Results Withheld', os.entireResultsWithheld ?? 0]);
    officialRows.push(['Entire Results Pending', os.entireResultsPending ?? 0]);
    officialRows.push(['Candidate Owing Fees', os.candidateOwingFees ?? 0]);
    officialRows.push(['Entire Results Blocked', os.entireResultsBlocked ?? 0]);
    officialRows.push(['Entire Results Cancelled', os.entireResultsCancelled ?? 0]);

    const officialEndRow = drawSummaryCard(ws, {
      // Columns 10-14 sit under the grade-code columns in the table above
      // (narrow, 7.5 each) — merging 5 of them for the label gives ~37
      // width units without widening those columns globally. Column 1 is
      // already 28-wide (the Subject column), so the computed card just
      // uses it directly instead of a multi-column merge.
      startRow: summaryStartRow, labelCol: 10, labelSpan: 5, valueCol: 15,
      title: "WAEC's Own Printed Summary", rows: officialRows,
    });
    endRow = Math.max(endRow, officialEndRow);
  }

  if (report.summaryMismatches && report.summaryMismatches.length) {
    const noteRow = ws.getRow(endRow + 2);
    noteRow.getCell(1).value = `Note: ${report.summaryMismatches.join(' ')}`;
    ws.mergeCells(noteRow.number, 1, noteRow.number, TOTAL_COLS);
    noteRow.getCell(1).font = { italic: true, color: { argb: STATUS_WARN } };
    noteRow.getCell(1).border = { left: { style: 'medium', color: { argb: STATUS_WARN } } };
    noteRow.getCell(1).alignment = { indent: 1, wrapText: true };
  }

  // ── Column widths, freeze panes, print setup ─────────────────────────
  ws.getColumn(1).width = 28;
  for (let c = 2; c <= TOTAL_COLS; c++) ws.getColumn(c).width = 7.5;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: headerRow2.number, showGridLines: false }];
  ws.pageSetup = {
    orientation: 'landscape', paperSize: 8 /* A3 */, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    printTitlesRow: `${headerRow1.number}:${headerRow2.number}`,
  };

  return wb;
}

module.exports = { buildExamAnalysisWorkbook };
