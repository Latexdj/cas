'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { SchoolCalendarEntry } from '@/types/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Period {
  id: string;
  name: string;
  kind: 'vacation' | 'exam';
  start_date: string;
  end_date: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodDays(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}
function fmt(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('default', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TYPE_STYLES: Record<string, { bg: string; color: string; dot: string }> = {
  'Holiday':      { bg: '#FEF2F2', color: '#DC2626', dot: '#DC2626' },
  'School Event': { bg: '#EFF6FF', color: '#2563EB', dot: '#2563EB' },
  'Closed Day':   { bg: '#FFF7ED', color: '#C2410C', dot: '#C2410C' },
};
const TYPES = ['Holiday', 'School Event', 'Closed Day'] as const;

function Badge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? { bg: '#F1F5F9', color: '#64748B', dot: '#64748B' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {type}
    </span>
  );
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold font-medium text-slate-500 dark:text-slate-400 mb-1';

type Tab = 'events' | 'vacation' | 'exam';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SchoolCalendarPage() {
  const thisYear = new Date().getFullYear();
  const [tab,  setTab]  = useState<Tab>('events');
  const [year, setYear] = useState(thisYear);

  const [entries,    setEntries]    = useState<SchoolCalendarEntry[]>([]);
  const [vacations,  setVacations]  = useState<Period[]>([]);
  const [examPeriods, setExamPeriods] = useState<Period[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [calRes, vacRes, examRes] = await Promise.allSettled([
        api.get<SchoolCalendarEntry[]>(`/api/school-calendar?year=${year}`),
        api.get<Period[]>(`/api/school-calendar/vacations?year=${year}&kind=vacation`),
        api.get<Period[]>(`/api/school-calendar/vacations?year=${year}&kind=exam`),
      ]);
      if (calRes.status  === 'fulfilled') setEntries(calRes.value.data);
      if (vacRes.status  === 'fulfilled') setVacations(vacRes.value.data);
      if (examRes.status === 'fulfilled') setExamPeriods(examRes.value.data);
    } finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  // ── Tab button helper ──────────────────────────────────────────────────────

  function tabBtn(t: Tab, label: string, count?: number) {
    const active = tab === t;
    return (
      <button onClick={() => setTab(t)}
        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
          active ? 'bg-[#145C44] text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}>
        {label}
        {count !== undefined && count > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-[#145C44] text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'}`}>
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">School Calendar</h1>
          <p className="text-sm mt-0.5 text-slate-400">Holidays, vacations and examination periods</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm font-semibold border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {tabBtn('events',  'Holidays & Events', entries.length)}
        {tabBtn('vacation','Vacation',          vacations.length)}
        {tabBtn('exam',    'Exam Periods',      examPeriods.length)}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin border-green-600" />
        </div>
      ) : (
        <>
          {tab === 'events'   && <EventsTab   entries={entries}     year={year} onRefresh={load} />}
          {tab === 'vacation' && <PeriodTab   periods={vacations}   kind="vacation" year={year} onRefresh={load} />}
          {tab === 'exam'     && <PeriodTab   periods={examPeriods} kind="exam"     year={year} onRefresh={load} />}
        </>
      )}
    </div>
  );
}

// ── Events tab ────────────────────────────────────────────────────────────────

type EntryForm = { date: string; name: string; type: typeof TYPES[number]; notes: string; start_time: string; end_time: string };
const ENTRY_EMPTY: EntryForm = { date: '', name: '', type: 'Holiday', notes: '', start_time: '', end_time: '' };

function EntryFormFields({ form, onChange }: { form: EntryForm; onChange: (f: EntryForm) => void }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.date}
            onChange={e => onChange({ ...form, date: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Type *</label>
          <select className={inputCls} value={form.type}
            onChange={e => onChange({ ...form, type: e.target.value as typeof TYPES[number] })}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Name *</label>
          <input className={inputCls} value={form.name} placeholder="e.g. Independence Day"
            onChange={e => onChange({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <input className={inputCls} value={form.notes} placeholder="Optional"
            onChange={e => onChange({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <div>
          <label className={labelCls}>Start Time <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span></label>
          <input type="time" className={inputCls} value={form.start_time}
            onChange={e => onChange({ ...form, start_time: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>End Time <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span></label>
          <input type="time" className={inputCls} value={form.end_time}
            onChange={e => onChange({ ...form, end_time: e.target.value })} />
        </div>
        <div className="flex items-end pb-1">
          <p className="text-xs text-slate-400">
            {form.start_time && form.end_time
              ? `Only lessons from ${form.start_time}–${form.end_time} will be affected.`
              : 'No times set — affects all lessons on this day.'}
          </p>
        </div>
      </div>
    </>
  );
}

function EventsTab({ entries, year, onRefresh }: { entries: SchoolCalendarEntry[]; year: number; onRefresh: () => void }) {
  const [adding,    setAdding]    = useState(false);
  const [form,      setForm]      = useState<EntryForm>(ENTRY_EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm,  setEditForm]  = useState<EntryForm>(ENTRY_EMPTY);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  async function save() {
    if (!form.date || !form.name.trim()) { setError('Date and name are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/school-calendar', { ...form, start_time: form.start_time || undefined, end_time: form.end_time || undefined });
      setAdding(false); setForm(ENTRY_EMPTY); onRefresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  function startEdit(e: SchoolCalendarEntry) {
    setEditingId(e.id);
    setEditForm({
      date: e.date, name: e.name, type: e.type as typeof TYPES[number],
      notes: e.notes ?? '', start_time: e.start_time?.slice(0, 5) ?? '', end_time: e.end_time?.slice(0, 5) ?? '',
    });
    setEditError('');
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.date || !editForm.name.trim()) { setEditError('Date and name are required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/api/school-calendar/${editingId}`, {
        ...editForm,
        start_time: editForm.start_time || null,
        end_time:   editForm.end_time   || null,
      });
      setEditingId(null); onRefresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditError(msg ?? 'Failed to save.');
    } finally { setEditSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the school calendar?`)) return;
    try { await api.delete(`/api/school-calendar/${id}`); onRefresh(); }
    catch { alert('Failed to delete.'); }
  }

  async function reapply(id: string, name: string) {
    try {
      const { data } = await api.post<{ absences_excused: number }>(`/api/school-calendar/${id}/reapply`);
      const n = data.absences_excused;
      alert(n > 0 ? `Done — ${n} absence record${n !== 1 ? 's' : ''} for "${name}" have been excused.` : `No outstanding absences found for "${name}".`);
    } catch { alert('Failed to reapply. Please try again.'); }
  }

  const byMonth: Record<string, SchoolCalendarEntry[]> = {};
  for (const e of entries) {
    const m = e.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(e);
  }
  const monthKeys = Object.keys(byMonth).sort();

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => { setAdding(a => !a); setError(''); setEditingId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: adding ? '#64748B' : '#145C44' }}>
          {adding ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New Calendar Entry</h2>
          <EntryFormFields form={form} onChange={setForm} />
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#145C44' }}>
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          No entries for {year}. Add a holiday or school event above.
        </div>
      ) : (
        <div className="space-y-5">
          {monthKeys.map(month => {
            const label = new Date(month + '-01T12:00:00').toLocaleString('default', { month: 'long', year: 'numeric' });
            return (
              <div key={month}>
                <p className="text-xs font-bold font-medium mb-2 px-1 text-slate-400">{label}</p>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                      {byMonth[month].map(e => (
                        <>
                          <tr key={e.id} className={`transition-colors ${editingId === e.id ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                            <td className="px-4 py-3 font-mono text-xs w-28 text-slate-500">
                              {new Date(e.date + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{e.name}</td>
                            <td className="px-4 py-3"><Badge type={e.type} /></td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {e.start_time && e.end_time ? `${e.start_time.slice(0,5)}–${e.end_time.slice(0,5)}` : <span className="text-slate-300 dark:text-slate-600">Whole day</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">{e.notes ?? ''}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                {editingId === e.id ? (
                                  <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                                ) : (
                                  <>
                                    <button onClick={() => startEdit(e)} className="text-xs font-semibold text-amber-600 hover:text-amber-800">Edit</button>
                                    <button onClick={() => reapply(e.id, e.name)} className="text-xs font-semibold text-blue-500 hover:text-blue-700"
                                      title="Re-run absence clearing for this event">Fix Absences</button>
                                    <button onClick={() => del(e.id, e.name)} className="text-xs font-semibold text-red-500 hover:text-red-700">Remove</button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {editingId === e.id && (
                            <tr key={`${e.id}-edit`}>
                              <td colSpan={6} className="px-5 py-4 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/30">
                                <div className="space-y-3">
                                  <EntryFormFields form={editForm} onChange={setEditForm} />
                                  {editError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{editError}</p>}
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => setEditingId(null)}
                                      className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                      Cancel
                                    </button>
                                    <button onClick={saveEdit} disabled={editSaving}
                                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                                      style={{ backgroundColor: '#145C44' }}>
                                      {editSaving ? 'Saving…' : 'Save Changes'}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-center text-slate-400">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} in {year}</p>
        </div>
      )}
    </div>
  );
}

// ── Period tab (shared by Vacation and Exam) ───────────────────────────────────

const PERIOD_CONFIG = {
  vacation: {
    label: 'Vacation Period',
    addBtn: '+ Add Vacation',
    placeholder: 'e.g. Long Vacation 2025',
    emptyMsg: 'No vacation periods set. Add one to pause absence detection during school breaks.',
    accentCls: 'bg-teal-600',
    badgeCls:  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    note: 'Absence detection is paused for the entire period.',
  },
  exam: {
    label: 'Exam Period',
    addBtn: '+ Add Exam Period',
    placeholder: 'e.g. WASSCE 2025',
    emptyMsg: 'No exam periods set. Add one to mark examination dates and pause absence detection.',
    accentCls: 'bg-purple-600',
    badgeCls:  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    note: 'Regular absence detection is paused — teachers are on invigilation duty.',
  },
};

function PeriodTab({ periods, kind, year, onRefresh }: { periods: Period[]; kind: 'vacation' | 'exam'; year: number; onRefresh: () => void }) {
  const cfg = PERIOD_CONFIG[kind];
  const accent = kind === 'exam' ? '#7C3AED' : '#0D9488';

  const [adding,     setAdding]     = useState(false);
  const [form,       setForm]       = useState({ name: '', start_date: '', end_date: '' });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState({ name: '', start_date: '', end_date: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  async function save() {
    if (!form.name.trim() || !form.start_date || !form.end_date) { setError('Name, start date and end date are required.'); return; }
    if (form.end_date < form.start_date) { setError('End date must be on or after start date.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post<{ absences_excused: number } & Period>('/api/school-calendar/vacations', { ...form, kind });
      setAdding(false);
      setForm({ name: '', start_date: '', end_date: '' });
      if (data.absences_excused > 0) {
        alert(`Saved. ${data.absences_excused} false absence record${data.absences_excused !== 1 ? 's' : ''} from this period were automatically excused.`);
      }
      onRefresh();
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
      setError(d?.error ? (d.code ? `${d.error} (${d.code})` : d.error) : 'Failed to save.');
    } finally { setSaving(false); }
  }

  function startEdit(p: Period) {
    setEditingId(p.id);
    setEditForm({ name: p.name, start_date: p.start_date, end_date: p.end_date });
    setEditError('');
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim() || !editForm.start_date || !editForm.end_date) { setEditError('All fields are required.'); return; }
    if (editForm.end_date < editForm.start_date) { setEditError('End date must be on or after start date.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/api/school-calendar/vacations/${editingId}`, editForm);
      setEditingId(null); onRefresh();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditError(msg ?? 'Failed to save.');
    } finally { setEditSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Remove "${name}"? Absences from this period will not be un-excused.`)) return;
    try { await api.delete(`/api/school-calendar/vacations/${id}`); onRefresh(); }
    catch { alert('Failed to delete.'); }
  }

  const days = form.start_date && form.end_date && form.end_date >= form.start_date
    ? periodDays(form.start_date, form.end_date) : null;
  const editDays = editForm.start_date && editForm.end_date && editForm.end_date >= editForm.start_date
    ? periodDays(editForm.start_date, editForm.end_date) : null;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => { setAdding(a => !a); setError(''); setEditingId(null); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: adding ? '#64748B' : accent }}>
          {adding ? 'Cancel' : cfg.addBtn}
        </button>
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New {cfg.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Name *</label>
              <input className={inputCls} value={form.name} placeholder={cfg.placeholder}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Start Date *</label>
              <input type="date" className={inputCls} value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input type="date" className={inputCls} value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          {days !== null && <p className="text-xs text-slate-400">{days} day{days !== 1 ? 's' : ''} · {cfg.note}</p>}
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: accent }}>
              {saving ? 'Saving…' : `Save ${cfg.label}`}
            </button>
          </div>
        </div>
      )}

      {periods.length === 0 && !adding ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          {cfg.emptyMsg}
        </div>
      ) : periods.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-5 py-3 text-xs font-semibold font-medium text-slate-500">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold font-medium text-slate-500">Start</th>
                <th className="text-left px-5 py-3 text-xs font-semibold font-medium text-slate-500">End</th>
                <th className="text-left px-5 py-3 text-xs font-semibold font-medium text-slate-500">Duration</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {periods.map(p => {
                const d = periodDays(p.start_date, p.end_date);
                const isEditing = editingId === p.id;
                return (
                  <>
                    <tr key={p.id} className={`transition-colors ${isEditing ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeCls}`}>
                          {p.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{fmt(p.start_date)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{fmt(p.end_date)}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">{d} day{d !== 1 ? 's' : ''}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {isEditing ? (
                            <button onClick={() => setEditingId(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                          ) : (
                            <>
                              <button onClick={() => startEdit(p)} className="text-xs font-semibold text-amber-600 hover:text-amber-800">Edit</button>
                              <button onClick={() => del(p.id, p.name)} className="text-xs font-semibold text-red-500 hover:text-red-700">Remove</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr key={`${p.id}-edit`}>
                        <td colSpan={5} className="px-5 py-4 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/30">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className={labelCls}>Name *</label>
                                <input className={inputCls} value={editForm.name}
                                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                              </div>
                              <div>
                                <label className={labelCls}>Start Date *</label>
                                <input type="date" className={inputCls} value={editForm.start_date}
                                  onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                              </div>
                              <div>
                                <label className={labelCls}>End Date *</label>
                                <input type="date" className={inputCls} value={editForm.end_date}
                                  onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
                              </div>
                            </div>
                            {editDays !== null && <p className="text-xs text-slate-400">{editDays} day{editDays !== 1 ? 's' : ''}</p>}
                            {editError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{editError}</p>}
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingId(null)}
                                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                                Cancel
                              </button>
                              <button onClick={saveEdit} disabled={editSaving}
                                className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                                style={{ backgroundColor: accent }}>
                                {editSaving ? 'Saving…' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
