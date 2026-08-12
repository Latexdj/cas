'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Duty {
  id: string;
  teacher_id: string;
  teacher_name: string;
  role: 'chief' | 'assistant';
}

interface ExamSession {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_name: string;
  hall_name: string;
  invigilators_needed: number;
  academic_year_id: string | null;
  semester: number | null;
  duties: Duty[];
}

interface PoolTeacher {
  id: string;
  name: string;
  department: string | null;
  is_excluded: boolean;
  excluded_reason: string | null;
  notes: string | null;
  duty_count: number;
}

interface GeneratedAssignment {
  exam_session_id: string;
  session_date: string;
  session_start: string;
  session_end: string;
  session_subject: string;
  session_class: string;
  session_hall: string;
  teacher_id: string;
  teacher_name: string;
  role: 'chief' | 'assistant';
}

interface DutyCount { teacher_id: string; teacher_name: string; count: number; }

interface GenerateResult {
  assignments: GeneratedAssignment[];
  duty_counts: DutyCount[];
  warnings: string[];
  eligible_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (t: string) => t.slice(0, 5);

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'sessions' | 'pool' | 'roster';

export default function ExamsPage() {
  const [tab, setTab] = useState<Tab>('sessions');

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        tab === t
          ? 'bg-green-700 text-white'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Invigilation</h1>
          <p className="text-sm mt-0.5 text-slate-400">Manage exam sessions, invigilator pool, and duty rosters</p>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
          {tabBtn('sessions', 'Exam Sessions')}
          {tabBtn('pool', 'Invigilator Pool')}
          {tabBtn('roster', 'Duty Roster')}
        </div>
      </div>

      {tab === 'sessions' && <SessionsTab />}
      {tab === 'pool'     && <PoolTab />}
      {tab === 'roster'   && <RosterTab />}
    </div>
  );
}

// ── Sessions tab ──────────────────────────────────────────────────────────────

interface SchoolClass { id: string; name: string; }
interface ClassRow {
  class_name: string;       // display name; for merged rows: "Form 1A, Form 1B"
  hall_name: string;
  invigilators_needed: number;
  checked: boolean;
  members?: string[];        // set only on merged rows; contains original class names
}
interface Subject { id: string; name: string; code: string | null; }

const EMPTY_HEADER = { date: '', start_time: '', end_time: '', subject: '' };

function SessionsTab() {
  const [sessions,   setSessions]   = useState<ExamSession[]>([]);
  const [classes,    setClasses]    = useState<SchoolClass[]>([]);
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [header,     setHeader]     = useState(EMPTY_HEADER);
  const [classRows,  setClassRows]  = useState<ClassRow[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState({ date: '', start_time: '', end_time: '', subject: '', class_name: '', hall_name: '', invigilators_needed: 2 });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');
  const [mergeMode,  setMergeMode]  = useState(false);
  const [mergeIds,   setMergeIds]   = useState<string[]>([]);
  const [merging,    setMerging]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes, subRes] = await Promise.allSettled([
        api.get<ExamSession[]>('/api/exams/sessions'),
        api.get<SchoolClass[]>('/api/classes'),
        api.get<Subject[]>('/api/subjects'),
      ]);
      if (sRes.status === 'fulfilled') setSessions(sRes.value.data);
      if (cRes.status === 'fulfilled') {
        setClasses(cRes.value.data);
        setClassRows(cRes.value.data.map(c => ({ class_name: c.name, hall_name: '', invigilators_needed: 2, checked: false })));
      }
      if (subRes.status === 'fulfilled') setSubjects(subRes.value.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setAdding(true); setError(''); setHeader(EMPTY_HEADER);
    setClassRows(classes.map(c => ({ class_name: c.name, hall_name: '', invigilators_needed: 2, checked: false })));
  }

  function updateRow(idx: number, patch: Partial<ClassRow>) {
    setClassRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function toggleAll(checked: boolean) {
    setClassRows(prev => prev.map(r => ({ ...r, checked })));
  }

  function groupSelected() {
    const checkedRows = classRows.filter(r => r.checked);
    if (checkedRows.length < 2) return;
    const memberNames = checkedRows.flatMap(r => r.members ?? [r.class_name]);
    const groupRow: ClassRow = {
      class_name: memberNames.join(', '),
      hall_name: '',
      invigilators_needed: 2,
      checked: true,
      members: memberNames,
    };
    let inserted = false;
    setClassRows(prev => {
      const result: ClassRow[] = [];
      for (const row of prev) {
        if (row.checked) {
          if (!inserted) { result.push(groupRow); inserted = true; }
        } else {
          result.push(row);
        }
      }
      return result;
    });
  }

  function ungroupRow(idx: number) {
    setClassRows(prev => {
      const row = prev[idx];
      if (!row.members) return prev;
      const expanded: ClassRow[] = row.members.map(name => ({
        class_name: name, hall_name: '', invigilators_needed: 2, checked: false,
      }));
      return [...prev.slice(0, idx), ...expanded, ...prev.slice(idx + 1)];
    });
  }

  async function save() {
    const selected = classRows.filter(r => r.checked);
    if (!header.date || !header.start_time || !header.end_time || !header.subject) {
      setError('Date, times and subject are required.'); return;
    }
    if (!selected.length) { setError('Select at least one class.'); return; }
    const missingHall = selected.find(r => !r.hall_name.trim());
    if (missingHall) { setError(`Enter a hall name for ${missingHall.class_name}.`); return; }

    setSaving(true); setError('');
    try {
      await api.post<{ count: number }>('/api/exams/sessions/bulk', {
        ...header,
        classes: selected.map(r => ({ class_name: r.class_name, hall_name: r.hall_name.trim(), invigilators_needed: r.invigilators_needed })),
      });
      setAdding(false);
      await load();
    } catch (e: any) {
      const msg  = e?.response?.data?.error ?? 'Failed to save.';
      const code = e?.response?.data?.code;
      setError(code ? `${msg} (${code})` : msg);
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this exam session and all its assigned duties?')) return;
    setDeleting(id);
    try { await api.delete(`/api/exams/sessions/${id}`); await load(); }
    catch { alert('Failed to delete.'); }
    finally { setDeleting(null); }
  }

  function startEdit(s: ExamSession) {
    setEditingId(s.id);
    setEditForm({ date: s.date, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), subject: s.subject, class_name: s.class_name, hall_name: s.hall_name, invigilators_needed: s.invigilators_needed });
    setEditError('');
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/api/exams/sessions/${editingId}`, editForm);
      setEditingId(null);
      await load();
    } catch (e: any) {
      const msg  = e?.response?.data?.error ?? 'Failed to save.';
      const code = e?.response?.data?.code;
      setEditError(code ? `${msg} (${code})` : msg);
    } finally { setEditSaving(false); }
  }

  async function doMerge() {
    if (mergeIds.length < 2) return;
    const names = mergeIds.map(id => sessions.find(s => s.id === id)?.class_name).filter(Boolean).join(', ');
    if (!confirm(`Merge these sessions into one?\n\n${names}\n\nThe earliest session keeps its date/time/hall. Invigilator counts are summed.`)) return;
    setMerging(true);
    try {
      await api.post('/api/exams/sessions/merge', { session_ids: mergeIds });
      setMergeMode(false); setMergeIds([]);
      await load();
    } catch (e: any) {
      const msg  = e?.response?.data?.error ?? 'Merge failed.';
      const code = e?.response?.data?.code;
      alert(code ? `${msg} (${code})` : msg);
    } finally { setMerging(false); }
  }

  const checkedRows   = classRows.filter(r => r.checked);
  const selectedCount = checkedRows.length;  // sessions that will be created
  const classCount    = checkedRows.reduce((n, r) => n + (r.members?.length ?? 1), 0);
  const canGroup      = checkedRows.length >= 2;

  // Group by date
  const byDate: Record<string, ExamSession[]> = {};
  for (const s of sessions) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }
  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        {!adding && sessions.length > 1 && (
          <button
            onClick={() => { setMergeMode(m => !m); setMergeIds([]); setEditingId(null); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ backgroundColor: mergeMode ? '#64748B' : '#2563EB', color: 'white' }}>
            {mergeMode ? 'Cancel Merge' : 'Merge Sessions'}
          </button>
        )}
        <button
          onClick={() => { adding ? setAdding(false) : openAdd(); setMergeMode(false); setMergeIds([]); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: adding ? '#64748B' : '#15803D' }}>
          {adding ? 'Cancel' : '+ Add Sessions'}
        </button>
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New Exam Sessions</h2>

          {/* Shared header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={inputCls} value={header.date}
                onChange={e => setHeader(h => ({ ...h, date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Start Time *</label>
              <input type="time" className={inputCls} value={header.start_time}
                onChange={e => setHeader(h => ({ ...h, start_time: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>End Time *</label>
              <input type="time" className={inputCls} value={header.end_time}
                onChange={e => setHeader(h => ({ ...h, end_time: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Subject *</label>
              <select className={inputCls} value={header.subject}
                onChange={e => setHeader(h => ({ ...h, subject: e.target.value }))}>
                <option value="">— Select subject —</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.name}>{s.name}{s.code ? ` (${s.code})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Class picker table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>Select Classes *</label>
              <div className="flex gap-3 items-center">
                {canGroup && (
                  <button onClick={groupSelected}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Group selected
                  </button>
                )}
                <button onClick={() => toggleAll(true)}  className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline">All</button>
                <button onClick={() => toggleAll(false)} className="text-xs font-semibold text-slate-400 hover:underline">None</button>
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-600">
                    <th className="w-10 px-3 py-2.5" />
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hall / Venue</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invigilators</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {classRows.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-400">No classes found — add classes first in Setup</td></tr>
                  )}
                  {classRows.map((row, idx) => (
                    <tr key={idx} className={`transition-colors ${row.checked ? 'bg-green-50/50 dark:bg-green-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/20'}`}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={row.checked}
                          onChange={e => updateRow(idx, { checked: e.target.checked })}
                          className="rounded border-slate-300 text-green-600" />
                      </td>
                      <td className="px-3 py-2">
                        {row.members ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.members.map(m => (
                              <span key={m} className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{m}</span>
                            ))}
                            <button onClick={() => ungroupRow(idx)}
                              className="text-xs text-slate-400 hover:text-red-500 hover:underline ml-1">
                              Ungroup
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{row.class_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className={`${inputCls} ${!row.checked ? 'opacity-40' : ''}`}
                          placeholder="e.g. Main Hall"
                          value={row.hall_name}
                          disabled={!row.checked}
                          onChange={e => updateRow(idx, { hall_name: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 w-28">
                        <input type="number" min={1} max={10}
                          className={`${inputCls} text-center ${!row.checked ? 'opacity-40' : ''}`}
                          value={row.invigilators_needed}
                          disabled={!row.checked}
                          onChange={e => updateRow(idx, { invigilators_needed: Number(e.target.value) })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {classCount > 0
                ? classCount === selectedCount
                  ? `${selectedCount} class${selectedCount !== 1 ? 'es' : ''} · ${selectedCount} session${selectedCount !== 1 ? 's' : ''} will be created`
                  : `${classCount} class${classCount !== 1 ? 'es' : ''} → ${selectedCount} session${selectedCount !== 1 ? 's' : ''} will be created`
                : 'No classes selected'}
            </p>
            <button onClick={save} disabled={saving || !selectedCount}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : `Create ${selectedCount || ''} Session${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin border-green-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          No exam sessions yet. Add one above.
        </div>
      ) : (
        <div className="space-y-5">
          {dates.map(date => (
            <div key={date}>
              <p className="text-xs font-bold uppercase tracking-widest mb-2 px-1 text-slate-400">{fmt(date)}</p>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                      {mergeMode && <th className="w-10 px-3 py-2.5" />}
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hall</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned</th>
                      {!mergeMode && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {byDate[date].map(s => mergeMode ? (
                      <tr key={s.id}
                        onClick={() => setMergeIds(ids => ids.includes(s.id) ? ids.filter(i => i !== s.id) : [...ids, s.id])}
                        className={`cursor-pointer transition-colors ${mergeIds.includes(s.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                        <td className="px-3 py-2.5 text-center">
                          <input type="checkbox" readOnly checked={mergeIds.includes(s.id)}
                            className="rounded border-slate-300 text-blue-600 pointer-events-none" />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{s.subject}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{s.class_name}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{s.hall_name}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">{s.duties.length} assigned</td>
                      </tr>
                    ) : editingId === s.id ? (
                      <tr key={s.id} className="bg-blue-50/40 dark:bg-blue-900/10">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
                            <div>
                              <label className={labelCls}>Date</label>
                              <input type="date" className={inputCls} value={editForm.date}
                                onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
                            </div>
                            <div>
                              <label className={labelCls}>Start</label>
                              <input type="time" className={inputCls} value={editForm.start_time}
                                onChange={e => setEditForm(f => ({ ...f, start_time: e.target.value }))} />
                            </div>
                            <div>
                              <label className={labelCls}>End</label>
                              <input type="time" className={inputCls} value={editForm.end_time}
                                onChange={e => setEditForm(f => ({ ...f, end_time: e.target.value }))} />
                            </div>
                            <div>
                              <label className={labelCls}>Subject</label>
                              <select className={inputCls} value={editForm.subject}
                                onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}>
                                <option value="">— select —</option>
                                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>Class</label>
                              <input className={inputCls} value={editForm.class_name}
                                onChange={e => setEditForm(f => ({ ...f, class_name: e.target.value }))} />
                            </div>
                            <div>
                              <label className={labelCls}>Hall</label>
                              <input className={inputCls} value={editForm.hall_name}
                                onChange={e => setEditForm(f => ({ ...f, hall_name: e.target.value }))} />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className={labelCls + ' mb-0 mr-1'}>Invigilators</label>
                            <input type="number" min={1} max={10} className={`${inputCls} w-20 text-center`}
                              value={editForm.invigilators_needed}
                              onChange={e => setEditForm(f => ({ ...f, invigilators_needed: Number(e.target.value) }))} />
                            {editError && <span className="text-xs text-red-600">{editError}</span>}
                            <div className="ml-auto flex gap-2">
                              <button onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200">
                                Cancel
                              </button>
                              <button onClick={saveEdit} disabled={editSaving}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                                style={{ backgroundColor: '#15803D' }}>
                                {editSaving ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{s.subject}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{s.class_name}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{s.hall_name}</td>
                        <td className="px-4 py-2.5">
                          {s.duties.length === 0 ? (
                            <span className="text-xs text-slate-300 dark:text-slate-600">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {s.duties.map(d => (
                                <span key={d.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  d.role === 'chief'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                  {d.role === 'chief' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
                                  {d.teacher_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => startEdit(s)}
                            className="text-xs font-semibold text-blue-500 hover:text-blue-700 mr-3">
                            Edit
                          </button>
                          <button onClick={() => del(s.id)} disabled={deleting === s.id}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40">
                            {deleting === s.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {mergeMode && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {mergeIds.length === 0
              ? 'Click sessions to select them for merging'
              : `${mergeIds.length} session${mergeIds.length !== 1 ? 's' : ''} selected`}
          </p>
          <button onClick={doMerge} disabled={mergeIds.length < 2 || merging}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#2563EB' }}>
            {merging ? 'Merging…' : `Merge ${mergeIds.length >= 2 ? mergeIds.length : ''} Sessions`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Pool tab ──────────────────────────────────────────────────────────────────

const EXCLUSION_REASONS = ['Headmaster / Deputy', 'Exam Committee', 'Other'];

function PoolTab() {
  const [teachers, setTeachers] = useState<PoolTeacher[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [search,   setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<PoolTeacher[]>('/api/exams/pool');
      setTeachers(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle(t: PoolTeacher, excluded: boolean, reason?: string) {
    setSaving(t.id);
    try {
      await api.put(`/api/exams/pool/${t.id}`, {
        is_excluded: excluded,
        excluded_reason: excluded ? (reason ?? t.excluded_reason) : null,
      });
      setTeachers(prev => prev.map(p => p.id === t.id
        ? { ...p, is_excluded: excluded, excluded_reason: excluded ? (reason ?? p.excluded_reason) : null }
        : p
      ));
    } catch { alert('Failed to update pool.'); }
    finally { setSaving(null); }
  }

  const filtered = useMemo(() =>
    teachers.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.department ?? '').toLowerCase().includes(search.toLowerCase())),
    [teachers, search]
  );
  const inPool  = filtered.filter(t => !t.is_excluded);
  const excluded = filtered.filter(t => t.is_excluded);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin border-green-600" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <input className={inputCls + ' max-w-xs'} placeholder="Search teachers…" value={search} onChange={e => setSearch(e.target.value)} />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-green-700 dark:text-green-400">{inPool.length}</span> eligible ·{' '}
          <span className="font-semibold text-red-600">{excluded.length}</span> excluded
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* In pool */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Eligible Invigilators</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click Exclude to remove from the pool</p>
          </div>
          {inPool.length === 0
            ? <p className="px-5 py-8 text-sm text-slate-400 text-center">No eligible teachers</p>
            : (
              <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[420px] overflow-y-auto">
                {inPool.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{t.name}</p>
                      <p className="text-xs text-slate-400 truncate">{t.department ?? 'No department'} · {t.duty_count} dut{t.duty_count !== 1 ? 'ies' : 'y'}</p>
                    </div>
                    <ExcludeButton teacher={t} saving={saving === t.id} onExclude={(reason) => toggle(t, true, reason)} />
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Excluded */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Excluded</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click Restore to add back to the pool</p>
          </div>
          {excluded.length === 0
            ? <p className="px-5 py-8 text-sm text-slate-400 text-center">No exclusions</p>
            : (
              <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-[420px] overflow-y-auto">
                {excluded.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{t.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {t.excluded_reason ?? 'No reason given'}
                        {t.department ? ` · ${t.department}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => toggle(t, false)}
                      disabled={saving === t.id}
                      className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline disabled:opacity-40 whitespace-nowrap"
                    >
                      {saving === t.id ? '…' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function ExcludeButton({ teacher, saving, onExclude }: { teacher: PoolTeacher; saving: boolean; onExclude: (reason: string) => void }) {
  const [open,   setOpen]   = useState(false);
  const [reason, setReason] = useState(EXCLUSION_REASONS[0]);
  if (open) return (
    <div className="flex items-center gap-1.5 shrink-0">
      <select className="border rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
        value={reason} onChange={e => setReason(e.target.value)}>
        {EXCLUSION_REASONS.map(r => <option key={r}>{r}</option>)}
      </select>
      <button onClick={() => { setOpen(false); onExclude(reason); }} disabled={saving}
        className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40">
        {saving ? '…' : 'Confirm'}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
    </div>
  );
  return (
    <button onClick={() => setOpen(true)} disabled={saving}
      className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40 whitespace-nowrap">
      Exclude
    </button>
  );
}

// ── Roster tab ────────────────────────────────────────────────────────────────

function RosterTab() {
  const [sessions,   setSessions]   = useState<ExamSession[]>([]);
  const [pool,       setPool]       = useState<PoolTeacher[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [perHall,    setPerHall]    = useState(2);
  const [exclSubj,   setExclSubj]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview,    setPreview]    = useState<GenerateResult | null>(null);
  const [draftMap,   setDraftMap]   = useState<Record<string, GeneratedAssignment[]>>({}); // session_id -> assignments
  const [msg,        setMsg]        = useState<{ type: 'ok'|'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.allSettled([
        api.get<ExamSession[]>('/api/exams/sessions'),
        api.get<PoolTeacher[]>('/api/exams/pool'),
      ]);
      if (sRes.status === 'fulfilled') setSessions(sRes.value.data);
      if (pRes.status === 'fulfilled') setPool(pRes.value.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll   = () => setSelected(new Set(sessions.map(s => s.id)));
  const selectNone  = () => setSelected(new Set());

  async function generate() {
    if (!selected.size) { setMsg({ type: 'err', text: 'Select at least one exam session.' }); return; }
    setGenerating(true); setMsg(null); setPreview(null);
    try {
      const { data } = await api.post<GenerateResult>('/api/exams/generate', {
        session_ids: Array.from(selected),
        invigilators_per_hall: perHall,
        exclude_subject_teachers: exclSubj,
      });
      setPreview(data);
      // Build draft map: session_id -> assignments
      const map: Record<string, GeneratedAssignment[]> = {};
      for (const a of data.assignments) {
        if (!map[a.exam_session_id]) map[a.exam_session_id] = [];
        map[a.exam_session_id].push({ ...a });
      }
      setDraftMap(map);
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? 'Generation failed.' });
    } finally { setGenerating(false); }
  }

  function swapTeacher(sessionId: string, idx: number, newTeacherId: string) {
    const t = pool.find(p => p.id === newTeacherId);
    if (!t) return;
    setDraftMap(prev => {
      const updated = [...(prev[sessionId] ?? [])];
      updated[idx] = { ...updated[idx], teacher_id: newTeacherId, teacher_name: t.name };
      return { ...prev, [sessionId]: updated };
    });
  }

  async function confirm() {
    const allDuties = Object.values(draftMap).flat().map(a => ({
      exam_session_id: a.exam_session_id,
      teacher_id: a.teacher_id,
      role: a.role,
      is_auto_generated: true,
    }));
    if (!allDuties.length) return;
    setConfirming(true); setMsg(null);
    try {
      const { data } = await api.post<{ saved: number }>('/api/exams/duties/confirm', {
        duties: allDuties,
        session_ids: Array.from(selected),
      });
      setMsg({ type: 'ok', text: `Roster saved — ${data.saved} duties assigned.` });
      setPreview(null); setDraftMap({}); setSelected(new Set());
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error ?? 'Failed to save roster.' });
    } finally { setConfirming(false); }
  }

  const eligiblePool = pool.filter(t => !t.is_excluded);

  // Group sessions by date for the selector
  const byDate: Record<string, ExamSession[]> = {};
  for (const s of sessions) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }
  const dates = Object.keys(byDate).sort();

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin border-green-600" />
    </div>
  );

  if (sessions.length === 0) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
      No exam sessions yet — go to <strong>Exam Sessions</strong> to add some first.
    </div>
  );

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.type === 'ok'
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>{msg.text}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left: session selector + settings */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">Select Sessions</h2>
              <div className="flex gap-2">
                <button onClick={selectAll}  className="text-xs text-green-700 dark:text-green-400 font-semibold hover:underline">All</button>
                <button onClick={selectNone} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">None</button>
              </div>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-700 max-h-80 overflow-y-auto">
              {dates.map(date => (
                <div key={date}>
                  <p className="px-5 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/40">{fmt(date)}</p>
                  {byDate[date].map(s => (
                    <label key={s.id} className="flex items-center gap-3 px-5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer">
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)}
                        className="rounded border-slate-300 text-green-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{s.subject} — {s.hall_name}</p>
                        <p className="text-xs text-slate-400">{fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.class_name}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Generation Settings</h2>
            <div>
              <label className={labelCls}>Invigilators per Hall</label>
              <input type="number" min={1} max={10} className={inputCls} value={perHall}
                onChange={e => setPerHall(Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={exclSubj} onChange={e => setExclSubj(e.target.checked)}
                className="rounded border-slate-300 text-green-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300">Exclude subject teachers</span>
            </label>
            <p className="text-xs text-slate-400">
              Pool: <strong>{eligiblePool.length}</strong> eligible teacher{eligiblePool.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={generate}
              disabled={generating || !selected.size}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: '#15803D' }}>
              {generating ? 'Generating…' : `Generate Roster (${selected.size} session${selected.size !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>

        {/* Right: preview */}
        <div className="lg:col-span-2 space-y-4">
          {!preview ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
              Select sessions and click Generate to preview the duty roster
            </div>
          ) : (
            <>
              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Warnings</p>
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                  ))}
                </div>
              )}

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-white">Generated Roster — Review & Adjust</h2>
                  <button
                    onClick={confirm}
                    disabled={confirming}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: '#15803D' }}>
                    {confirming ? 'Saving…' : 'Confirm & Save'}
                  </button>
                </div>

                <div className="divide-y divide-slate-50 dark:divide-slate-700">
                  {Object.entries(draftMap)
                    .sort(([, a], [, b]) => {
                      if (!a[0] || !b[0]) return 0;
                      return (a[0].session_date + a[0].session_start).localeCompare(b[0].session_date + b[0].session_start);
                    })
                    .map(([sessionId, assigns]) => {
                      if (!assigns.length) return null;
                      const a0 = assigns[0];
                      return (
                        <div key={sessionId} className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                {fmt(a0.session_date)} · {fmtTime(a0.session_start)}–{fmtTime(a0.session_end)}
                              </p>
                              <p className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">
                                {a0.session_subject} · {a0.session_class} · {a0.session_hall}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {assigns.map((a, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className={`w-16 text-xs font-semibold shrink-0 ${
                                  a.role === 'chief' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                                }`}>
                                  {a.role === 'chief' ? 'Chief' : 'Assistant'}
                                </span>
                                <select
                                  className="flex-1 border rounded-lg px-2 py-1 text-sm bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                                  value={a.teacher_id}
                                  onChange={e => swapTeacher(sessionId, idx, e.target.value)}
                                >
                                  {eligiblePool.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Duty distribution */}
              {preview.duty_counts.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Duty Distribution</h3>
                  <div className="space-y-2">
                    {preview.duty_counts.map(d => {
                      const max = preview.duty_counts[0]?.count || 1;
                      return (
                        <div key={d.teacher_id} className="flex items-center gap-3">
                          <span className="text-xs text-slate-600 dark:text-slate-300 w-36 truncate shrink-0">{d.teacher_name}</span>
                          <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                            <div className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${(d.count / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400 w-8 text-right">{d.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <button onClick={generate} disabled={generating}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-40">
                  ↺ Regenerate
                </button>
                <button
                  onClick={confirm}
                  disabled={confirming}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: '#15803D' }}>
                  {confirming ? 'Saving…' : 'Confirm & Save Roster'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
