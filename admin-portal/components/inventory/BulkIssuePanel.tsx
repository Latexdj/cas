'use client';
import { useEffect, useMemo, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { buildSignListHtml, type SlRecipient, type SlSchool } from '@/lib/sign-list-print';
import { printHtml } from './print';

interface Item {
  id: string; name: string; asset_tag: string | null; quantity_available: number;
  quantity_total: number; condition: string; is_returnable: boolean;
}
interface Filters {
  classes: string[]; programs: { id: string; name: string }[];
  departments: { id: string; name: string }[]; years: (number | string)[];
}
type RecipType = 'student' | 'teacher';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const labelCls = 'text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3';

// Shared by the admin dashboard and the Staff Portal — each passes its own
// authenticated axios instance (same pattern as IdCardScanner).
export function BulkIssuePanel({
  apiClient, primary = '#145C44', onIssued,
}: {
  apiClient: AxiosInstance; primary?: string; onIssued: (batchId: string) => void;
}) {
  const [items,   setItems]   = useState<Item[]>([]);
  const [filters, setFilters] = useState<Filters>({ classes: [], programs: [], departments: [], years: [] });

  const [itemId,     setItemId]     = useState('');
  const [recipType,  setRecipType]  = useState<RecipType>('student');
  const [className,  setClassName]  = useState('');
  const [programId,  setProgramId]  = useState('');
  const [yearBatch,  setYearBatch]  = useState('');
  const [gender,     setGender]     = useState('');
  const [resStatus,  setResStatus]  = useState('');
  const [deptId,     setDeptId]     = useState('');

  const [recipients, setRecipients] = useState<SlRecipient[] | null>(null);
  const [school,     setSchool]     = useState<SlSchool>({});
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [listSearch, setListSearch] = useState('');
  const [listLoading, setListLoading] = useState(false);

  const [qty,     setQty]     = useState('1');
  const [dueDate, setDueDate] = useState('');
  const [title,   setTitle]   = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [notes,   setNotes]   = useState('');

  const [error,   setError]   = useState('');
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    apiClient.get<Item[]>('/api/inventory/items').then(r => setItems(r.data)).catch(() => {});
    apiClient.get<Filters>('/api/inventory/sign-list/filters').then(r => setFilters(r.data)).catch(() => {});
  }, [apiClient]);

  const issuable = items.filter(i => i.condition !== 'Written Off' && i.quantity_available > 0);
  const item = items.find(i => i.id === itemId) ?? null;

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (recipType === 'student') {
      parts.push(className || 'All Classes');
      const prog = filters.programs.find(p => p.id === programId);
      if (prog) parts.push(prog.name);
      if (yearBatch) parts.push(`${yearBatch} Batch`);
      if (gender) parts.push(gender);
      if (resStatus) parts.push(`${resStatus} Students`);
    } else {
      const dept = filters.departments.find(d => d.id === deptId);
      parts.push(dept ? dept.name : 'All Departments');
      if (gender) parts.push(gender);
      parts.push('Teachers');
    }
    return parts.join(', ');
  }, [recipType, className, programId, yearBatch, gender, resStatus, deptId, filters]);

  // Suggest a title until the user edits it themselves.
  useEffect(() => {
    if (!titleTouched) setTitle(item ? `${item.name} for ${filterLabel}` : '');
  }, [item, filterLabel, titleTouched]);

  // Changing who the list is for invalidates a loaded list.
  useEffect(() => { setRecipients(null); setSelected(new Set()); }, [recipType, className, programId, yearBatch, gender, resStatus, deptId]);

  function filterParams() {
    const p: Record<string, string> = { recipient_type: recipType === 'student' ? 'students' : 'teachers' };
    if (recipType === 'student') {
      if (className) p.class_name = className;
      if (programId) p.program_id = programId;
      if (yearBatch) p.year_of_admission = yearBatch;
      if (gender)    p.gender = gender;
      if (resStatus) p.residential_status = resStatus;
    } else {
      if (deptId) p.department_id = deptId;
      if (gender) p.gender = gender;
    }
    return p;
  }

  async function loadList() {
    setListLoading(true); setError('');
    try {
      const r = await apiClient.get<{ recipients: SlRecipient[]; school: SlSchool }>(
        '/api/inventory/sign-list/recipients', { params: filterParams() }
      );
      setRecipients(r.data.recipients);
      setSchool(r.data.school ?? {});
      setSelected(new Set(r.data.recipients.map(x => x.id)));
      if (!r.data.recipients.length) setError('Nobody matches these filters.');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not load the list.');
    } finally { setListLoading(false); }
  }

  const visible = (recipients ?? []).filter(r => {
    if (!listSearch.trim()) return true;
    const q = listSearch.trim().toLowerCase();
    return r.name.toLowerCase().includes(q)
      || (r.student_code ?? r.teacher_code ?? '').toLowerCase().includes(q);
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function setAllVisible(on: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      visible.forEach(r => { if (on) next.add(r.id); else next.delete(r.id); });
      return next;
    });
  }

  const qtyNum = parseInt(qty) || 0;
  const total = selected.size * qtyNum;
  const overStock = !!item && total > item.quantity_available;
  const chosen = (recipients ?? []).filter(r => selected.has(r.id));

  function printSheet() {
    if (!item || !chosen.length) return;
    const ok = printHtml(buildSignListHtml({
      title: title || item.name, itemName: item.name,
      issueDate: new Date().toISOString().slice(0, 10), qtyPerPerson: String(qtyNum || 1), notes,
      recipientType: recipType === 'student' ? 'students' : 'teachers',
      filterLabel, recipients: chosen, school,
    }));
    if (!ok) setError('Pop-ups are blocked. Allow pop-ups for this site and try again.');
  }

  async function issue() {
    if (!item) { setError('Select an item.'); return; }
    if (!chosen.length) { setError('Select at least one person.'); return; }
    if (qtyNum < 1) { setError('Quantity per person must be at least 1.'); return; }
    if (!title.trim()) { setError('Enter a title for this issue record.'); return; }
    if (overStock) { setError(`Not enough stock: ${total} needed, only ${item.quantity_available} available.`); return; }
    if (!confirm(`Issue ${qtyNum} × ${item.name} to ${chosen.length} ${recipType === 'student' ? 'student(s)' : 'teacher(s)'} (${total} in total)?`)) return;

    setIssuing(true); setError('');
    try {
      const r = await apiClient.post<{ id: string }>('/api/inventory/batches', {
        item_id: item.id, title: title.trim(), recipient_type: recipType,
        recipient_ids: chosen.map(c => c.id), qty_per_person: qtyNum,
        due_date: item.is_returnable ? (dueDate || null) : null,
        notes: notes.trim() || null, filter_label: filterLabel,
        filters: filterParams(),
      }, { timeout: 60000 });
      onIssued(r.data.id);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not issue the item. Check your connection and try again.');
    } finally { setIssuing(false); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className={cardCls}>
        <p className="text-sm font-bold text-slate-800 dark:text-white">1. What are you issuing?</p>
        <div>
          <label className={labelCls}>Item</label>
          <select className={inputCls} value={itemId} onChange={e => setItemId(e.target.value)}>
            <option value="">Select item</option>
            {issuable.map(i => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.quantity_available} available){i.is_returnable ? ', returnable' : ''}
              </option>
            ))}
          </select>
        </div>
        {item?.is_returnable && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
            This item is returnable. Each person gets a tracked loan and stays under Loans until they return it.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Quantity per person</label>
            <input type="number" min="1" className={inputCls} value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          {item?.is_returnable && (
            <div>
              <label className={labelCls}>Due back (optional)</label>
              <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div className={cardCls}>
        <p className="text-sm font-bold text-slate-800 dark:text-white">2. Who is receiving it?</p>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/40 rounded-lg p-1">
          {(['student', 'teacher'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setRecipType(t); setGender(''); }}
              className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${recipType === t ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
              style={recipType === t ? { background: primary } : {}}>
              {t === 'student' ? 'Students' : 'Teachers'}
            </button>
          ))}
        </div>

        {recipType === 'student' ? (
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={className} onChange={e => setClassName(e.target.value)}>
              <option value="">All Classes</option>
              {filters.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={inputCls} value={programId} onChange={e => setProgramId(e.target.value)}>
              <option value="">All Programmes</option>
              {filters.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className={inputCls} value={yearBatch} onChange={e => setYearBatch(e.target.value)}>
              <option value="">All Year Batches</option>
              {filters.years.map(y => <option key={y} value={String(y)}>{y} Batch</option>)}
            </select>
            <select className={inputCls} value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            <select className={inputCls} value={resStatus} onChange={e => setResStatus(e.target.value)}>
              <option value="">Day &amp; Boarding</option>
              <option value="Day">Day Only</option>
              <option value="Boarding">Boarding Only</option>
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={deptId} onChange={e => setDeptId(e.target.value)}>
              <option value="">All Departments</option>
              {filters.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={inputCls} value={gender} onChange={e => setGender(e.target.value)}>
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        )}

        <button type="button" onClick={loadList} disabled={listLoading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold border-2 disabled:opacity-50"
          style={{ borderColor: primary, color: primary }}>
          {listLoading ? 'Loading…' : recipients ? 'Reload list' : 'Load list'}
        </button>

        {recipients && recipients.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input className={`${inputCls} flex-1`} placeholder="Search name or code…"
                value={listSearch} onChange={e => setListSearch(e.target.value)} />
              <button type="button" onClick={() => setAllVisible(true)} className="text-xs font-semibold px-2 py-1 text-slate-600 dark:text-slate-300 hover:underline shrink-0">All</button>
              <button type="button" onClick={() => setAllVisible(false)} className="text-xs font-semibold px-2 py-1 text-slate-600 dark:text-slate-300 hover:underline shrink-0">None</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selected.size} of {recipients.length} selected. Untick anyone who is absent; you can add them to this record later when they collect.
            </p>
            <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
              {visible.map(r => (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                    className="w-4 h-4 accent-[#145C44] shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-800 dark:text-white truncate">{r.name}</span>
                    <span className="block text-xs text-slate-400">
                      {recipType === 'student'
                        ? `${r.student_code ?? ''}, ${r.class_name ?? ''}`
                        : `${r.teacher_code ?? ''}${r.dept_name || r.department ? `, ${r.dept_name ?? r.department}` : ''}`}
                    </span>
                  </span>
                </label>
              ))}
              {visible.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 text-center">Nobody on this list matches your search.</p>}
            </div>
          </div>
        )}
      </div>

      <div className={cardCls}>
        <p className="text-sm font-bold text-slate-800 dark:text-white">3. Record details</p>
        <div>
          <label className={labelCls}>Title</label>
          <input className={inputCls} value={title}
            onChange={e => { setTitle(e.target.value); setTitleTouched(true); }}
            placeholder="e.g. Exercise Books for Form 1A, Term 1" />
        </div>
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {item && selected.size > 0 && (
          <div className={`rounded-lg px-4 py-3 text-sm ${overStock ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300'}`}>
            <span className="font-semibold">{selected.size}</span> {recipType === 'student' ? 'student(s)' : 'teacher(s)'} × {qtyNum || 0} ={' '}
            <span className="font-semibold">{total}</span> {item.name}
            <span className="block text-xs mt-0.5">
              {overStock
                ? `Only ${item.quantity_available} in stock. Reduce the list or the quantity.`
                : `${item.quantity_available} in stock → ${item.quantity_available - total} left after issuing.`}
            </span>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={printSheet} disabled={!item || !chosen.length}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-40">
            Print sign sheet
          </button>
          <button type="button" onClick={issue} disabled={issuing || !item || !chosen.length || overStock}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: primary }}>
            {issuing ? 'Issuing…' : `Issue to ${chosen.length || 0}`}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          After issuing, open the record to upload the signed sheet.
        </p>
      </div>
    </div>
  );
}
