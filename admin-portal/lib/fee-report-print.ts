import { escHtml, type SlSchool } from './sign-list-print';

export interface FeeStatusRow {
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  total_billed: number;
  total_paid: number;
}

export interface BilledItem {
  id: string;
  name: string;
}

export interface BilledItemsRow {
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  amounts: Record<string, number>;
  total: number;
}

export function computePaymentStatus(row: { total_billed: number; total_paid: number }): 'Paid' | 'Partial' | 'Unpaid' {
  if (row.total_paid <= 0) return 'Unpaid';
  if (row.total_billed > 0 && row.total_paid < row.total_billed) return 'Partial';
  return 'Paid';
}

function fmtGHS(n: number): string {
  return `GH₵ ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Printable student payment-status list — follows the exact visual/structural
// convention established in sign-list-print.ts (logo header, .doc-title,
// .meta box, dark-header zebra table, footer signature lines) for consistency
// across every printable report in the app.
export function buildFeePaymentListHtml(opts: {
  title: string;
  filterLabel: string;
  asOfDate: string;
  rows: FeeStatusRow[];
  school: SlSchool;
}): string {
  const { title, filterLabel, asOfDate, rows, school } = opts;
  const colCount = 7;

  const totalBilled = rows.reduce((s, r) => s + Number(r.total_billed), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.total_paid), 0);

  const bodyRows = rows.map((r, i) => {
    const status = computePaymentStatus(r);
    const statusColor = status === 'Paid' ? '#166534' : status === 'Partial' ? '#92400e' : '#991b1b';
    return `
    <tr>
      <td class="no">${i + 1}</td>
      <td>${escHtml(r.student_name)}</td>
      <td>${escHtml(r.student_code ?? '')}</td>
      <td>${escHtml(r.class_name ?? '')}</td>
      <td style="text-align:right">${fmtGHS(Number(r.total_billed))}</td>
      <td style="text-align:right">${fmtGHS(Number(r.total_paid))}</td>
      <td style="text-align:center;font-weight:700;color:${statusColor}">${status}</td>
    </tr>`;
  }).join('');

  const logoHtml = school.logo_url
    ? `<img class="logo" src="${escHtml(school.logo_url)}" alt="">`
    : `<div style="width:64px;height:64px;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center">LOGO</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(title || 'Fee Payment Status')}</title>
<style>
@page { size: A4 portrait; margin: 1.5cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
.hdr { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; margin-bottom: 14px; }
.logo { width: 64px; height: 64px; object-fit: contain; }
.school-name { font-size: 16px; font-weight: 700; }
.school-addr { font-size: 10px; color: #555; margin-top: 3px; }
.doc-title { text-align: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; border: 1px solid #ddd; padding: 8px 10px; background: #f8f8f8; margin-bottom: 10px; }
.mr { display: flex; gap: 4px; font-size: 11px; }
.ml { font-weight: 700; color: #444; flex-shrink: 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
thead th { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 6px 8px; text-align: left; font-size: 11px; font-weight: 700; }
tbody td { border: 1px solid #bbb; padding: 4px 8px; font-size: 11px; height: 26px; vertical-align: middle; }
tbody tr:nth-child(even) td { background: #fafafa; }
tfoot td { border: 1px solid #333; padding: 6px 8px; font-size: 11px; font-weight: 700; background: #f0f0f0; }
.no { width: 32px; text-align: center; }
.footer { display: flex; gap: 32px; margin-top: 16px; }
.fb { flex: 1; }
.fl { font-size: 10px; color: #555; margin-top: 4px; }
.sl { border-top: 1px solid #333; margin-top: 36px; padding-top: 3px; }
.stamp { width: 70px; height: 70px; border: 1px solid #bbb; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #999; margin-top: 8px; }
@media print {
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
</style>
</head>
<body>
<div class="hdr">
  ${logoHtml}
  <div>
    <div class="school-name">${escHtml(school.name ?? '')}</div>
    ${school.address ? `<div class="school-addr">${escHtml(school.address)}</div>` : ''}
  </div>
</div>

<div class="doc-title">Student Fee Payment Status</div>

<div class="meta">
  <div class="mr"><span class="ml">Title:&nbsp;</span>${escHtml(title || '—')}</div>
  <div class="mr"><span class="ml">As of:&nbsp;</span>${escHtml(asOfDate)}</div>
  <div class="mr"><span class="ml">Filter:&nbsp;</span>${escHtml(filterLabel)}</div>
  <div class="mr"><span class="ml">Total Count:&nbsp;</span>${rows.length} student${rows.length === 1 ? '' : 's'}</div>
</div>

<table>
  <thead>
    <tr>
      <th class="no">#</th>
      <th>Full Name</th>
      <th>Student ID</th>
      <th>Class</th>
      <th style="text-align:right">Amount Billed</th>
      <th style="text-align:right">Amount Paid</th>
      <th style="width:70px;text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td colspan="${colCount}" style="text-align:center;color:#999;padding:16px">No students found.</td></tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="4" style="text-align:right">Totals</td>
      <td style="text-align:right">${fmtGHS(totalBilled)}</td>
      <td style="text-align:right">${fmtGHS(totalPaid)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <div class="fb">
    <div class="sl">Name:&nbsp;________________________________</div>
    <div class="fl">Prepared By (Accounts)</div>
  </div>
  <div class="fb">
    <div class="sl">Signature:&nbsp;___________________________</div>
    <div class="fl">Date:&nbsp;____________________</div>
  </div>
  <div class="fb" style="flex:0 0 auto">
    <div class="stamp">STAMP</div>
  </div>
</div>
</body>
</html>`;
}

// A blank paper backup of the billed-items sheet: student/class/item
// amounts are pre-filled from what's actually been billed (so the
// accountant knows what each line owes at a glance), but Date and
// Transaction ID are left empty for handwriting payments in as they come
// in — same table convention as the PTA-contributions spreadsheet this
// mirrors (one column per billed item, a running total column), reusing
// this file's established print-page CSS rather than a second style block.
export function buildBlankPaymentTemplateHtml(opts: {
  title: string;
  filterLabel: string;
  asOfDate: string;
  items: BilledItem[];
  rows: BilledItemsRow[];
  school: SlSchool;
}): string {
  const { title, filterLabel, asOfDate, items, rows, school } = opts;
  const colCount = 5 + items.length + 1;

  const itemTotals = items.map(it => rows.reduce((s, r) => s + Number(r.amounts[it.id] || 0), 0));
  const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);

  const bodyRows = rows.map((r, i) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td>${escHtml(r.student_name)}</td>
      <td>${escHtml(r.student_code ?? '')}</td>
      <td>${escHtml(r.class_name ?? '')}</td>
      <td class="blank"></td>
      <td class="blank"></td>
      ${items.map(it => `<td style="text-align:right">${fmtGHS(Number(r.amounts[it.id] || 0))}</td>`).join('')}
      <td style="text-align:right;font-weight:700">${fmtGHS(Number(r.total))}</td>
    </tr>`).join('');

  const logoHtml = school.logo_url
    ? `<img class="logo" src="${escHtml(school.logo_url)}" alt="">`
    : `<div style="width:64px;height:64px;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center">LOGO</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(title || 'Billed Items Payment Template')}</title>
<style>
@page { size: A4 landscape; margin: 1.2cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
.hdr { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #111; margin-bottom: 14px; }
.logo { width: 64px; height: 64px; object-fit: contain; }
.school-name { font-size: 16px; font-weight: 700; }
.school-addr { font-size: 10px; color: #555; margin-top: 3px; }
.doc-title { text-align: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; border: 1px solid #ddd; padding: 8px 10px; background: #f8f8f8; margin-bottom: 10px; }
.mr { display: flex; gap: 4px; font-size: 11px; }
.ml { font-weight: 700; color: #444; flex-shrink: 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
thead th { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 6px 6px; text-align: left; font-size: 10.5px; font-weight: 700; }
tbody td { border: 1px solid #bbb; padding: 4px 6px; font-size: 11px; height: 30px; vertical-align: middle; }
tbody td.blank { background: #fff; }
tbody tr:nth-child(even) td { background: #fafafa; }
tbody tr:nth-child(even) td.blank { background: #fcfcfc; }
tfoot td { border: 1px solid #333; padding: 6px 6px; font-size: 11px; font-weight: 700; background: #f0f0f0; }
.no { width: 28px; text-align: center; }
.footer { display: flex; gap: 32px; margin-top: 16px; }
.fb { flex: 1; }
.fl { font-size: 10px; color: #555; margin-top: 4px; }
.sl { border-top: 1px solid #333; margin-top: 36px; padding-top: 3px; }
.stamp { width: 70px; height: 70px; border: 1px solid #bbb; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #999; margin-top: 8px; }
@media print {
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
</style>
</head>
<body>
<div class="hdr">
  ${logoHtml}
  <div>
    <div class="school-name">${escHtml(school.name ?? '')}</div>
    ${school.address ? `<div class="school-addr">${escHtml(school.address)}</div>` : ''}
  </div>
</div>

<div class="doc-title">Billed Items — Payment Recording Sheet</div>

<div class="meta">
  <div class="mr"><span class="ml">Title:&nbsp;</span>${escHtml(title || '—')}</div>
  <div class="mr"><span class="ml">As of:&nbsp;</span>${escHtml(asOfDate)}</div>
  <div class="mr"><span class="ml">Filter:&nbsp;</span>${escHtml(filterLabel)}</div>
  <div class="mr"><span class="ml">Total Count:&nbsp;</span>${rows.length} student${rows.length === 1 ? '' : 's'}</div>
</div>

<table>
  <thead>
    <tr>
      <th class="no">#</th>
      <th>Name of Student</th>
      <th>Student ID</th>
      <th>Class</th>
      <th>Date</th>
      <th>Transaction ID</th>
      ${items.map(it => `<th style="text-align:right">${escHtml(it.name)}</th>`).join('')}
      <th style="text-align:right">T. Amount</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td colspan="${colCount}" style="text-align:center;color:#999;padding:16px">No billed students found.</td></tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="6" style="text-align:right">Totals</td>
      ${itemTotals.map(t => `<td style="text-align:right">${fmtGHS(t)}</td>`).join('')}
      <td style="text-align:right">${fmtGHS(grandTotal)}</td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <div class="fb">
    <div class="sl">Name:&nbsp;________________________________</div>
    <div class="fl">Prepared By (Accounts)</div>
  </div>
  <div class="fb">
    <div class="sl">Signature:&nbsp;___________________________</div>
    <div class="fl">Date:&nbsp;____________________</div>
  </div>
  <div class="fb" style="flex:0 0 auto">
    <div class="stamp">STAMP</div>
  </div>
</div>
</body>
</html>`;
}
