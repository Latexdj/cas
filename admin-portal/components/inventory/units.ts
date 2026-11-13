// Shared helpers for items tracked by unit (tablets, laptops): each unit has
// its own tag number, IMEI and serial.

export interface InvUnit {
  id: string; item_id: string; tag_number: string; imei: string | null; serial_number: string | null;
  condition: 'Good' | 'Damaged'; status: 'in_store' | 'issued' | 'lost' | 'written_off'; notes: string | null;
  loan_id?: string | null; borrower_type?: 'student' | 'teacher' | null; borrower_name?: string | null;
  borrower_detail?: string | null; issued_at?: string | null; due_date?: string | null; is_overdue?: boolean | null;
}

export interface UnitRow { tag_number: string; imei: string; serial_number: string; notes?: string }

export const UNIT_STATUS_LABEL: Record<InvUnit['status'], string> = {
  in_store: 'In store', issued: 'On loan', lost: 'Lost', written_off: 'Written off',
};

const HEADER_KEYS: Record<string, keyof UnitRow> = {
  tag: 'tag_number', 'tag number': 'tag_number', 'tag no': 'tag_number', 'tag no.': 'tag_number', 'asset tag': 'tag_number',
  imei: 'imei', 'imei number': 'imei', 'imei no': 'imei',
  serial: 'serial_number', 'serial number': 'serial_number', 'serial no': 'serial_number', sn: 'serial_number',
  notes: 'notes', note: 'notes', remarks: 'notes',
};

// Turns a grid of cells (from a pasted block or a spreadsheet) into unit rows.
// A first row naming the columns (Tag, IMEI, Serial…) is honoured; otherwise
// the columns are read as Tag, IMEI, Serial in that order.
export function gridToUnits(grid: unknown[][]): UnitRow[] {
  const rows = grid
    .map(r => (r ?? []).map(c => String(c ?? '').trim()))
    .filter(r => r.some(c => c));
  if (!rows.length) return [];
  let cols: (keyof UnitRow | null)[] = ['tag_number', 'imei', 'serial_number'];
  const head = rows[0].map(c => c.toLowerCase().replace(/[:#]/g, '').trim());
  if (head.some(h => HEADER_KEYS[h])) {
    cols = head.map(h => HEADER_KEYS[h] ?? null);
    rows.shift();
  }
  return rows.map(r => {
    const u: UnitRow = { tag_number: '', imei: '', serial_number: '', notes: '' };
    cols.forEach((k, i) => { if (k) u[k] = r[i] ?? ''; });
    return u;
  });
}

export function textToGrid(text: string): string[][] {
  return text.split(/\r?\n/).map(line => (line.includes('\t') ? line.split('\t') : line.split(',')));
}

export async function fileToGrid(file: File): Promise<unknown[][]> {
  if (/\.(csv|txt)$/i.test(file.name)) return textToGrid(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Read raw values: a 15-digit IMEI that Excel stored as a number would
  // otherwise come back formatted as 3.56789E+14. Whole numbers are written
  // out in full (IMEIs fit exactly in a JS number).
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
  return grid.map(row => (row ?? []).map(c =>
    typeof c === 'number' ? (Number.isInteger(c) ? c.toFixed(0) : String(c)) : c));
}

// An empty spreadsheet with the columns the upload expects. The IMEI and tag
// columns are formatted as text so Excel keeps long IMEIs exactly as typed
// (otherwise 356789104512345 becomes 3.56789E+14).
export async function downloadUnitsTemplate(itemName: string) {
  const XLSX = await import('xlsx');
  const head = ['Tag Number', 'IMEI', 'Serial Number', 'Notes'];
  const ws = XLSX.utils.aoa_to_sheet([head]);
  for (let r = 1; r <= 1000; r++) {
    for (const c of [0, 1, 2]) ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: '', z: '@' };
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: 3 } });
  ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 30 }];
  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in this template'],
    [`Item: ${itemName}`],
    [],
    ['1. On the Units sheet, enter one row per unit (one tablet, laptop, etc.).'],
    ['2. Tag Number is required and must be different for every unit, e.g. TAB-001.'],
    ['3. IMEI is optional but recommended for tablets and phones. Type it in full; the column is already set to text.'],
    ['4. Serial Number and Notes are optional.'],
    ['5. Keep the first row (the column names). Leave any unused rows empty.'],
    ['6. Save the file, then in CAS open the item, choose Units, Add units, Upload spreadsheet, and pick this file.'],
  ]);
  help['!cols'] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Units');
  XLSX.utils.book_append_sheet(wb, help, 'Instructions');
  const safe = itemName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'Item';
  XLSX.writeFile(wb, `${safe}_units_template.xlsx`);
}

// A pairing sheet for bulk issue: everyone being issued, with an empty Tag
// Number column to fill in and upload back.
export async function downloadPairingTemplate(people: { code: string; name: string; detail?: string | null }[], itemName: string) {
  const XLSX = await import('xlsx');
  const rows: string[][] = [['ID', 'Name', 'Class / Department', 'Tag Number']];
  for (const p of people) rows.push([p.code, p.name, p.detail ?? '', '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r < rows.length; r++) {
    ws[XLSX.utils.encode_cell({ r, c: 0 })].z = '@';
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { t: 's', v: '', z: '@' };
  }
  ws['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pairing');
  const safe = itemName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'Item';
  XLSX.writeFile(wb, `${safe}_pairing_sheet.xlsx`);
}

export function apiError(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { error?: string } } };
  return err.response?.data?.error ?? fallback;
}
