export interface SlRecipient {
  id: string;
  name: string;
  student_code?: string;
  class_name?: string;
  gender?: string;
  residential_status?: string;
  program_name?: string;
  teacher_code?: string;
  department?: string;
  dept_name?: string;
}

export interface SlSchool {
  name?: string;
  address?: string;
  logo_url?: string;
}

export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSignListHtml(opts: {
  title: string;
  itemName: string;
  issueDate: string;
  qtyPerPerson: string;
  notes: string;
  recipientType: 'students' | 'teachers';
  filterLabel: string;
  recipients: SlRecipient[];
  school: SlSchool;
}): string {
  const { title, itemName, issueDate, qtyPerPerson, notes, recipientType, filterLabel, recipients, school } = opts;
  const isStudents = recipientType === 'students';
  const colCount = isStudents ? 6 : 5;

  const bodyRows = recipients.map((r, i) => `
    <tr>
      <td class="no">${i + 1}</td>
      <td>${escHtml(r.name)}</td>
      <td>${isStudents
        ? escHtml(`${r.student_code ?? ''} / ${r.class_name ?? ''}`)
        : escHtml(`${r.teacher_code ?? ''} / ${r.dept_name ?? r.department ?? ''}`)}</td>
      ${isStudents ? `<td>${escHtml(r.residential_status ?? '')}</td>` : ''}
      <td style="text-align:center">${escHtml(qtyPerPerson)}</td>
      <td></td>
    </tr>`).join('');

  const logoHtml = school.logo_url
    ? `<img class="logo" src="${escHtml(school.logo_url)}" alt="">`
    : `<div style="width:64px;height:64px;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center">LOGO</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escHtml(title || 'Sign List')}</title>
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
.notes-box { border: 1px solid #ddd; padding: 6px 10px; margin-bottom: 10px; font-size: 11px; background: #f8f8f8; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
thead th { background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 6px 8px; text-align: left; font-size: 11px; font-weight: 700; }
tbody td { border: 1px solid #bbb; padding: 4px 8px; font-size: 11px; height: 28px; vertical-align: middle; }
tbody tr:nth-child(even) td { background: #fafafa; }
.no { width: 32px; text-align: center; }
.sig { width: 140px; }
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

<div class="doc-title">Item Issue Sign List</div>

<div class="meta">
  <div class="mr"><span class="ml">Title:&nbsp;</span>${escHtml(title || '—')}</div>
  <div class="mr"><span class="ml">Date:&nbsp;</span>${escHtml(issueDate)}</div>
  <div class="mr"><span class="ml">Item / Reference:&nbsp;</span>${escHtml(itemName || '—')}</div>
  <div class="mr"><span class="ml">Qty per Person:&nbsp;</span>${escHtml(qtyPerPerson)}</div>
  <div class="mr"><span class="ml">Recipients:&nbsp;</span>${escHtml(filterLabel)}</div>
  <div class="mr"><span class="ml">Total Count:&nbsp;</span>${recipients.length} person${recipients.length === 1 ? '' : 's'}</div>
</div>

${notes ? `<div class="notes-box"><b>Notes:</b> ${escHtml(notes)}</div>` : ''}

<table>
  <thead>
    <tr>
      <th class="no">#</th>
      <th>Full Name</th>
      <th>${isStudents ? 'ID / Class' : 'ID / Department'}</th>
      ${isStudents ? '<th>Residential</th>' : ''}
      <th style="width:50px;text-align:center">Qty</th>
      <th class="sig">Signature</th>
    </tr>
  </thead>
  <tbody>
    ${bodyRows || `<tr><td colspan="${colCount}" style="text-align:center;color:#999;padding:16px">No recipients found.</td></tr>`}
  </tbody>
</table>

<div class="footer">
  <div class="fb">
    <div class="sl">Name:&nbsp;________________________________</div>
    <div class="fl">Store Officer / Issuer</div>
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
