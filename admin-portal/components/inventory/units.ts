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
  // raw:false keeps long IMEIs as written instead of turning them into 3.5E+14.
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][];
}

export function apiError(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { error?: string } } };
  return err.response?.data?.error ?? fallback;
}
