export interface ExportRecipient {
  name: string; quantity: number; created_at: string; added_later: boolean;
  student_code: string | null; class_name: string | null; residential_status: string | null;
  teacher_code: string | null; department: string | null;
  tag_number?: string | null; imei?: string | null;
}
export interface ExportBatch {
  title: string; recipient_type: 'student' | 'teacher'; qty_per_person: number;
  recipient_count: number; total_quantity: number; filter_label: string | null;
  issued_at: string; created_by_name: string | null; due_date: string | null;
  item_name: string; asset_tag: string | null; is_returnable: boolean; track_units?: boolean;
  signed_list_url: string | null; signed_list_uploaded_at: string | null;
  school: { name?: string };
  recipients: ExportRecipient[];
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fileBase(b: ExportBatch) {
  const slug = b.title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Issue_Record';
  return `${slug}_${b.issued_at.slice(0, 10)}`;
}

function table(b: ExportBatch) {
  const students = b.recipient_type === 'student';
  if (b.track_units) {
    // Tracked units: each person's exact tag number and IMEI instead of a quantity.
    const head = students
      ? ['#', 'Name', 'Student ID', 'Class', 'Tag No.', 'IMEI', 'Date Collected']
      : ['#', 'Name', 'Teacher ID', 'Department', 'Tag No.', 'IMEI', 'Date Collected'];
    const body = b.recipients.map((r, i) => [
      i + 1, r.name, (students ? r.student_code : r.teacher_code) ?? '', (students ? r.class_name : r.department) ?? '',
      r.tag_number ?? '', r.imei ?? '', fmt(r.created_at),
    ]);
    return { head, body };
  }
  const head = students
    ? ['#', 'Name', 'Student ID', 'Class', 'Day/Boarding', 'Qty', 'Date Collected', 'Collection']
    : ['#', 'Name', 'Teacher ID', 'Department', 'Qty', 'Date Collected', 'Collection'];
  const body = b.recipients.map((r, i) => students
    ? [i + 1, r.name, r.student_code ?? '', r.class_name ?? '', r.residential_status ?? '', r.quantity, fmt(r.created_at), r.added_later ? 'Late' : 'On issue day']
    : [i + 1, r.name, r.teacher_code ?? '', r.department ?? '', r.quantity, fmt(r.created_at), r.added_later ? 'Late' : 'On issue day']);
  return { head, body };
}

function details(b: ExportBatch): [string, string][] {
  const rows: [string, string][] = [
    ['Item', `${b.item_name}${b.asset_tag ? ` (${b.asset_tag})` : ''}`],
    ['Recipients', b.filter_label ?? ''],
    ['Issued', `${fmt(b.issued_at)}${b.created_by_name ? ` by ${b.created_by_name}` : ''}`],
    ['Total', b.track_units
      ? `${b.recipient_count} ${b.recipient_type === 'student' ? 'student(s)' : 'teacher(s)'}, one each, by tag number`
      : `${b.recipient_count} ${b.recipient_type === 'student' ? 'student(s)' : 'teacher(s)'} × ${b.qty_per_person} = ${b.total_quantity}`],
    ['Signed sheet', b.signed_list_url
      ? `Attached${b.signed_list_uploaded_at ? ` (uploaded ${fmt(b.signed_list_uploaded_at)})` : ''}`
      : 'Not uploaded'],
  ];
  if (b.is_returnable) rows.push(['Returnable', b.due_date ? `Yes, due back ${fmt(b.due_date)}` : 'Yes']);
  return rows;
}

export async function exportIssueRecordExcel(b: ExportBatch) {
  const XLSX = await import('xlsx');
  const { head, body } = table(b);
  const aoa: (string | number)[][] = [
    [b.school.name ?? ''],
    [b.title],
    ...details(b),
    [],
    head,
    ...body,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = head.map((h, i) => ({ wch: i === 0 ? 5 : h === 'Name' ? 28 : h === 'IMEI' ? 20 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recipients');
  XLSX.writeFile(wb, `${fileBase(b)}.xlsx`);
}

export async function exportIssueRecordPdf(b: ExportBatch) {
  const { default: jsPDF } = await import('jspdf');
  // jspdf-autotable v5: call autoTable(doc, opts), not doc.autoTable(opts).
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait' });

  doc.setFontSize(13);
  doc.text(b.school.name ?? '', 14, 15);
  doc.setFontSize(11);
  doc.text(b.title, 14, 22);

  autoTable(doc, {
    startY: 26,
    body: details(b),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
  });

  const { head, body } = table(b);
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
    head: [head],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [20, 92, 68] },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${doc.getNumberOfPages()}, generated ${fmt(new Date().toISOString())}`, 14, pageH - 8);
      doc.setTextColor(0);
    },
  });

  doc.save(`${fileBase(b)}.pdf`);
}
