'use strict';

// Pure SVG string generator for a subject-pass-rate bar chart — no DOM, no
// canvas, no new dependency. Reused two ways: inlined directly into an
// HTML page that Puppeteer renders to PDF (an SVG embeds and prints as
// crisp vector graphics with zero extra work), and wrapped in its own tiny
// HTML page and screenshotted to PNG for embedding as an Excel image
// (ExcelJS has no native chart object, only addImage — see
// pdf.service.js's generateChartPngBuffer).
//
// Same status-tiered color thresholds as the PDF/Excel report tables'
// % Pass column (pdf.service.js's examPassRateColor / examAnalysisWorkbook
// .js's passRateColor) so a reader sees the same green/amber/red judgment
// on the chart as on the table next to it.
const STATUS_GOOD = '#2D7A4F';
const STATUS_WARN = '#C8780A';
const STATUS_BAD  = '#B83232';
const GRID_COLOR  = '#E2D9CC';
const AXIS_TEXT   = '#8C7E6E';
const LABEL_TEXT  = '#2C2218';

function barColor(pct) {
  if (pct >= 75) return STATUS_GOOD;
  if (pct >= 50) return STATUS_WARN;
  return STATUS_BAD;
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// subjects: the report's `subjects` array (each with .name and
// .percentagePass.total, 0-100). Renders every subject passed in — the
// caller decides whether to cap the list for a school with an unusually
// large subject count.
function renderSubjectPassRateChartSVG(subjects, { width = 820, height = 380 } = {}) {
  const padding = { top: 24, right: 20, bottom: 110, left: 46 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const n = Math.max(subjects.length, 1);
  const slot = chartW / n;
  const barW = Math.max(6, Math.min(44, slot * 0.6));

  const gridLines = [0, 25, 50, 75, 100].map((pct) => {
    const y = padding.top + chartH - (pct / 100) * chartH;
    return `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${(padding.left + chartW).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1"/>` +
      `<text x="${padding.left - 8}" y="${(y + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="${AXIS_TEXT}" font-family="Arial, sans-serif">${pct}%</text>`;
  }).join('');

  const bars = subjects.map((s, i) => {
    const pct = Math.max(0, Math.min(100, s.percentagePass?.total ?? 0));
    const barH = (pct / 100) * chartH;
    const x = padding.left + i * slot + (slot - barW) / 2;
    const y = padding.top + chartH - barH;
    const color = barColor(pct);
    const labelX = (x + barW / 2).toFixed(1);
    const labelY = (padding.top + chartH + 14).toFixed(1);
    const name = s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name;
    return `<g>` +
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(barH, 0).toFixed(1)}" fill="${color}" rx="2"/>` +
      `<text x="${labelX}" y="${(y - 5).toFixed(1)}" font-size="10" font-weight="bold" text-anchor="middle" fill="${LABEL_TEXT}" font-family="Arial, sans-serif">${pct}%</text>` +
      `<text x="${labelX}" y="${labelY}" font-size="9" text-anchor="end" fill="${AXIS_TEXT}" font-family="Arial, sans-serif" transform="rotate(-50 ${labelX} ${labelY})">${escapeXml(name)}</text>` +
      `</g>`;
  }).join('');

  const axisLine = `<line x1="${padding.left}" y1="${(padding.top + chartH).toFixed(1)}" x2="${(padding.left + chartW).toFixed(1)}" y2="${(padding.top + chartH).toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1.5"/>`;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>` +
    `<text x="${padding.left}" y="16" font-size="12" font-weight="bold" fill="${LABEL_TEXT}" font-family="Arial, sans-serif">Percentage Pass by Subject</text>` +
    gridLines + axisLine + bars +
    `</svg>`;
}

module.exports = { renderSubjectPassRateChartSVG };
