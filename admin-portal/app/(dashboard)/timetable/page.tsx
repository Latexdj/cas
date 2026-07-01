'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { TimetableEntry, Teacher, Subject, ClassItem } from '@/types/api';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMPTY_FORM = { teacher_id: '', day_of_week: '1', start_time: '08:00', end_time: '09:00', subject: '' };

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number; }

interface UploadResult {
  inserted: number;
  errors: { row: number; message: string }[];
  coverage?: { unscheduled: number; unteachered: number; total: number } | null;
}
interface BulkUpdateResult {
  updated: number;
  notFound: { row: number; code: string }[];
  errors: { row: number; message: string }[];
}
interface CoverageSummary { unscheduled: number; unteachered: number; total: number }
interface CoverageRow {
  class_subject_id: string; class_name: string; subject: string;
  expected_periods: number; periods_scheduled: number;
  periods_with_teacher: number; periods_without_teacher: number;
  net_minutes_per_week: number; period_duration_minutes: number;
  status: 'covered' | 'unteachered' | 'unscheduled';
}
const COV_CFG = {
  covered:     { label: 'OK',         color: '#15803D', bg: '#F0FDF4' },
  unteachered: { label: 'No Teacher', color: '#B45309', bg: '#FFFBEB' },
  unscheduled: { label: 'Missing',    color: '#DC2626', bg: '#FEF2F2' },
};

function fmtDuration(mins: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function CoverageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows,    setRows]    = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState<'all' | 'issues'>('issues');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get<CoverageRow[]>('/api/timetable/coverage')
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const displayed = filter === 'all' ? rows : rows.filter(r => r.status !== 'covered');

  return (
    <Modal open={open} onClose={onClose} title="Timetable Coverage Report" maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100">
            {(['issues', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{ backgroundColor: filter === f ? '#FFFFFF' : 'transparent', color: filter === f ? '#0F172A' : '#64748B', boxShadow: filter === f ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
                {f === 'issues' ? 'Issues only' : 'All subjects'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{displayed.length} row{displayed.length !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="flex justify-center h-32 items-center">
            <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                <tr>
                  {['Class', 'Subject', 'Expected/wk', 'Scheduled', 'Has Teacher', 'Missing Teacher', 'Duration/wk', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map((r, i) => {
                  const cfg = COV_CFG[r.status];
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{r.class_name}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.subject}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-center">{r.expected_periods}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-center">{r.periods_scheduled}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-green-700 font-medium">{r.periods_with_teacher}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.periods_without_teacher > 0
                          ? <span className="text-amber-700 font-medium">{r.periods_without_teacher}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-medium whitespace-nowrap">
                        {fmtDuration(r.net_minutes_per_week)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {displayed.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {filter === 'issues' ? 'No issues found — all subjects are fully covered.' : 'No allocations defined yet.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400">Duration/wk = sum of lesson times minus any overlapping Bell Schedule breaks.</p>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TimetablePage() {
  const [entries,   setEntries]   = useState<TimetableEntry[]>([]);
  const [teachers,  setTeachers]  = useState<Teacher[]>([]);
  const [subjects,  setSubjects]  = useState<Subject[]>([]);
  const [classes,   setClasses]   = useState<ClassItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<'create' | 'edit' | 'upload' | 'coverage' | 'bulkUpdate' | null>(null);
  const [coverage,  setCoverage]  = useState<CoverageSummary | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [selCls,    setSelCls]    = useState<Set<string>>(new Set());
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [filterDay, setFilterDay] = useState('0');
  const [filterTch, setFilterTch] = useState('');
  const [filterCls, setFilterCls] = useState('');
  const [filterSub, setFilterSub] = useState('');

  // Academic year / semester state
  const [years,       setYears]       = useState<AcademicYear[]>([]);
  const [selYearId,   setSelYearId]   = useState('');
  const [selYearName, setSelYearName] = useState('');
  const [selSemester, setSelSemester] = useState<1|2>(1);

  // Upload state
  const fileRef                   = useRef<HTMLInputElement>(null);
  const [replaceAll,  setReplaceAll]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadErr,   setUploadErr]   = useState('');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Bulk Update state
  const updateFileRef                         = useRef<HTMLInputElement>(null);
  const [updating,      setUpdating]          = useState(false);
  const [updateErr,     setUpdateErr]         = useState('');
  const [updateResult,  setUpdateResult]      = useState<BulkUpdateResult | null>(null);

  const load = useCallback(async (yearId = selYearId, sem = selSemester) => {
    try {
      const [e, t, s, c, cov] = await Promise.all([
        api.get<TimetableEntry[]>(`/api/timetable${yearId ? `?academic_year_id=${yearId}&semester=${sem}` : ''}`),
        api.get<Teacher[]>('/api/teachers'),
        api.get<Subject[]>('/api/subjects'),
        api.get<ClassItem[]>('/api/classes'),
        api.get<CoverageSummary>('/api/timetable/coverage/summary').catch(() => null),
      ]);
      setEntries(e.data); setTeachers(t.data); setSubjects(s.data); setClasses(c.data);
      if (cov) setCoverage(cov.data);
    } finally { setLoading(false); }
  }, [selYearId, selSemester]);

  useEffect(() => {
    // Load years first, then load timetable for current year
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current) ?? r.data[0];
      if (cur) {
        setSelYearId(cur.id);
        setSelYearName(cur.name);
        const sem = (cur.current_semester ?? 1) as 1|2;
        setSelSemester(sem);
        load(cur.id, sem);
      } else {
        load();
      }
    }).catch(() => load());
  }, [load]);

  function toggleClass(name: string) {
    setSelCls(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  function openUpload() { setUploadErr(''); setUploadResult(null); setReplaceAll(false); setModal('upload'); }

  async function downloadTemplate() {
    try {
      const { data } = await api.get('/api/timetable/upload/template', { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data as Blob);
      a.download = 'timetable_template.csv'; a.click();
    } catch { alert('Could not download template.'); }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadErr('Please select a file.'); return; }
    setUploading(true); setUploadErr(''); setUploadResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UploadResult>(
        `/api/timetable/upload?replace=${replaceAll}&academic_year_id=${selYearId}&semester=${selSemester}`,
        fd
      );
      setUploadResult(data);
      await load(selYearId, selSemester);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUploadErr(msg ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  function openBulkUpdate() { setUpdateErr(''); setUpdateResult(null); setModal('bulkUpdate'); }

  async function downloadUpdateTemplate() {
    try {
      const params = selYearId ? `?academic_year_id=${selYearId}&semester=${selSemester}` : '';
      const { data } = await api.get(`/api/timetable/bulk-update/template${params}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data as Blob);
      a.download = 'timetable_update_template.xlsx'; a.click();
    } catch { alert('Could not download template.'); }
  }

  async function handleBulkUpdate() {
    const file = updateFileRef.current?.files?.[0];
    if (!file) { setUpdateErr('Please select a file.'); return; }
    setUpdating(true); setUpdateErr(''); setUpdateResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<BulkUpdateResult>('/api/timetable/bulk-update', fd, { timeout: 120000 });
      setUpdateResult(data);
      await load(selYearId, selSemester);
      if (updateFileRef.current) updateFileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setUpdateErr(msg ?? 'Update failed.');
    } finally { setUpdating(false); }
  }

  function openCreate() {
    setForm(EMPTY_FORM); setSelCls(new Set()); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(e: TimetableEntry) {
    setForm({ teacher_id: e.teacher_id, day_of_week: String(e.day_of_week),
      start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5), subject: e.subject });
    setSelCls(new Set(e.class_names.split(',').map(c => c.trim()).filter(Boolean)));
    setEditId(e.id); setError(''); setModal('edit');
  }

  async function save() {
    if (!form.teacher_id || !form.subject || selCls.size === 0) {
      setError('Teacher, subject, and at least one class are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const body = {
        ...form,
        day_of_week: parseInt(form.day_of_week),
        class_names: Array.from(selCls).join(', '),
        academic_year_id: selYearId,
        semester: selSemester,
      };
      if (modal === 'create') await api.post('/api/timetable', body);
      else                    await api.put(`/api/timetable/${editId}`, body);
      setModal(null); await load(selYearId, selSemester);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save entry.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this timetable entry?')) return;
    await api.delete(`/api/timetable/${id}`);
    await load(selYearId, selSemester);
  }

  function f(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  const filtered = entries
    .filter(e =>
      (filterDay === '0' || e.day_of_week === parseInt(filterDay)) &&
      (!filterTch || e.teacher_id === filterTch) &&
      (!filterCls || e.class_names.split(',').map(c => c.trim()).includes(filterCls)) &&
      (!filterSub || e.subject === filterSub)
    )
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));

  const selectCls ='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="space-y-4">
      {/* Year / Semester selector */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
        <span className="text-sm font-semibold text-slate-600">Timetable for:</span>
        <select
          value={selYearId}
          onChange={e => {
            const y = years.find(y => y.id === e.target.value);
            if (!y) return;
            setSelYearId(y.id); setSelYearName(y.name);
            setLoading(true);
            load(y.id, selSemester);
          }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select
          value={selSemester}
          onChange={e => {
            const sem = parseInt(e.target.value) as 1|2;
            setSelSemester(sem);
            setLoading(true);
            load(selYearId, sem);
          }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value={1}>Semester 1</option>
          <option value={2}>Semester 2</option>
        </select>
        {selYearId && (
          <span className="text-xs text-slate-400 ml-auto">
            Showing {filtered.length} slot{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Coverage alert banner */}
      {coverage && (coverage.unscheduled > 0 || coverage.unteachered > 0) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="text-sm">
              <span className="font-semibold text-amber-800">Timetable gaps detected: </span>
              {coverage.unscheduled > 0 && (
                <span className="text-red-700 font-medium">{coverage.unscheduled} subject{coverage.unscheduled !== 1 ? 's' : ''} not scheduled</span>
              )}
              {coverage.unscheduled > 0 && coverage.unteachered > 0 && <span className="text-amber-600 mx-1">·</span>}
              {coverage.unteachered > 0 && (
                <span className="text-amber-700 font-medium">{coverage.unteachered} slot{coverage.unteachered !== 1 ? 's' : ''} missing a teacher</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setModal('coverage')}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors">
            View Report
          </button>
        </div>
      )}
      {coverage && coverage.total > 0 && coverage.unscheduled === 0 && coverage.unteachered === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <span className="text-green-600 font-bold text-base">✓</span>
          <span className="font-medium">All {coverage.total} allocated subjects have timetable slots and teachers assigned.</span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className={selectCls}>
          <option value="0">All Days</option>
          {DAYS.slice(1, 8).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <select value={filterTch} onChange={e => setFilterTch(e.target.value)} className={selectCls}>
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={filterCls} onChange={e => setFilterCls(e.target.value)} className={selectCls}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filterSub} onChange={e => setFilterSub(e.target.value)} className={selectCls}>
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={openUpload}>↑ Upload Excel</Button>
          <Button variant="secondary" onClick={openBulkUpdate}>✎ Update Records</Button>
          <Button onClick={openCreate}>+ Add Slot</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="min-w-[750px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Day', 'Time', 'Subject', 'Class(es)', 'Teacher', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{DAYS[e.day_of_week]}</td>
                  <td className="px-4 py-3 text-gray-700">{e.start_time.slice(0,5)}–{e.end_time.slice(0,5)}</td>
                  <td className="px-4 py-3 text-gray-700">{e.subject}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="flex flex-wrap gap-1">
                      {e.class_names.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                        <span key={c} className="inline-block bg-slate-100 text-slate-700 text-xs font-medium px-2 py-0.5 rounded">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.teacher_name}</td>
                  <td className="px-4 py-3 flex gap-2 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => del(e.id)}>Del</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No timetable entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload modal */}
      <Modal open={modal === 'upload'} onClose={() => setModal(null)} title="Upload Timetable from Excel" maxWidth="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Importing for: <strong>{selYearName}</strong> — <strong>Semester {selSemester}</strong>
            {replaceAll && <span className="text-amber-600 ml-2">(will replace existing entries for this period only)</span>}
          </p>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-700">Expected columns (row 1 = optional header):</p>
            <div className="grid grid-cols-7 gap-1 text-xs font-mono">
              {['A: Teacher ID', 'B: Teacher Name', 'C: Day', 'D: Start', 'E: End', 'F: Subject', 'G: Classes'].map(c => (
                <span key={c} className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center">{c}</span>
              ))}
            </div>
            <ul className="text-xs text-slate-400 space-y-0.5 mt-1">
              <li>• <strong className="text-slate-600">Column A</strong> accepts a Teacher ID like <code>T001</code> <span className="text-green-600">(recommended)</span> or a teacher name. <strong className="text-slate-600">Column B</strong> is for reference only and is ignored on import.</li>
              <li>• IDs are unambiguous even when two teachers share the same name — download the template to get a pre-filled list</li>
              <li>• Day: Monday/Tuesday… or 1–7 &nbsp;·&nbsp; Times: HH:MM or Excel time cells</li>
              <li>• Classes: comma-separated (e.g. <code>1A, 1B</code>). New classes are auto-created.</li>
            </ul>
          </div>

          <button onClick={downloadTemplate} className="text-sm font-semibold text-green-700 hover:underline">
            ↓ Download template (pre-filled with your teachers&apos; IDs)
          </button>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Select file (.xlsx, .xls, .csv)
            </label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-green-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-green-700 cursor-pointer" />
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Replace existing timetable</p>
              <p className="text-xs text-amber-600 mt-0.5">
                If checked, only timetable entries for <strong>{selYearName} Semester {selSemester}</strong> are deleted before importing. Other semesters are unaffected.
              </p>
            </div>
          </label>

          {uploadErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{uploadErr}</p>}

          {uploadResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{uploadResult.inserted}</span> row{uploadResult.inserted !== 1 ? 's' : ''} imported successfully
                {replaceAll && <span className="ml-2 text-green-600">(previous timetable replaced)</span>}
              </div>
              {uploadResult.coverage && (uploadResult.coverage.unscheduled > 0 || uploadResult.coverage.unteachered > 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <p className="font-semibold">Coverage gaps detected:</p>
                  {uploadResult.coverage.unscheduled > 0 && <p className="text-xs mt-0.5 text-red-700">• {uploadResult.coverage.unscheduled} subject{uploadResult.coverage.unscheduled !== 1 ? 's' : ''} not scheduled in any class</p>}
                  {uploadResult.coverage.unteachered > 0 && <p className="text-xs mt-0.5 text-amber-700">• {uploadResult.coverage.unteachered} timetable slot{uploadResult.coverage.unteachered !== 1 ? 's' : ''} have no teacher</p>}
                  <p className="text-xs mt-1 text-amber-600">See the Coverage Report on the timetable page for details.</p>
                </div>
              )}
              {uploadResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
                  <p className="font-semibold">{uploadResult.errors.length} row{uploadResult.errors.length !== 1 ? 's' : ''} skipped:</p>
                  {uploadResult.errors.map((e, i) => (
                    <p key={i} className="text-xs">Row {e.row}: {e.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={handleUpload} loading={uploading}>Import</Button>
          </div>
        </div>
      </Modal>

      {/* Add / Edit modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => { setModal(null); }}
        title={modal === 'create' ? 'Add Timetable Slot' : 'Edit Timetable Slot'} maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* Teacher */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher *</label>
            <select value={form.teacher_id} onChange={f('teacher_id')} className={`mt-1 w-full ${selectCls}`}>
              <option value="">Select teacher…</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {/* Day */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day *</label>
            <select value={form.day_of_week} onChange={f('day_of_week')} className={`mt-1 w-full ${selectCls}`}>
              {DAYS.slice(1, 8).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </div>
          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start Time *</label>
              <input type="time" value={form.start_time} onChange={f('start_time')} className={`mt-1 w-full ${selectCls}`} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">End Time *</label>
              <input type="time" value={form.end_time} onChange={f('end_time')} className={`mt-1 w-full ${selectCls}`} />
            </div>
          </div>
          {/* Subject */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject *</label>
            {subjects.length > 0 ? (
              <select value={form.subject} onChange={f('subject')} className={`mt-1 w-full ${selectCls}`}>
                <option value="">Select subject…</option>
                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              </select>
            ) : (
              <p className="mt-1 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No subjects defined yet. Go to <strong>Subjects</strong> in the sidebar to add them first.
              </p>
            )}
          </div>
          {/* Classes multi-select */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Class(es) * {selCls.size > 0 && <span className="text-green-600 normal-case font-normal ml-1">({Array.from(selCls).join(', ')})</span>}
            </label>
            {classes.length > 0 ? (
              <div className="border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto space-y-0.5">
                {classes.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1.5">
                    <input type="checkbox" checked={selCls.has(c.name)} onChange={() => toggleClass(c.name)}
                      className="w-4 h-4 accent-green-600" />
                    <span className="text-sm text-slate-900 font-medium">{c.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                No classes defined yet. Go to <strong>Classes</strong> in the sidebar to add them first.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Coverage report modal */}
      <CoverageModal open={modal === 'coverage'} onClose={() => setModal(null)} />

      {/* ── Bulk Update modal ── */}
      <Modal open={modal === 'bulkUpdate'} onClose={() => setModal(null)} title="Update Timetable Records" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
            <p className="font-semibold">How it works:</p>
            <ul className="text-xs space-y-0.5">
              <li>• Download the template — it contains the current timetable with Entry IDs</li>
              <li>• Column A (<strong>Entry ID</strong>) identifies which slot to update — do not edit it</li>
              <li>• Leave any other cell <strong>blank</strong> to keep the existing value unchanged</li>
              <li>• Column C (Teacher Name) is for reference only and is ignored on import</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2 text-xs font-mono text-slate-500 overflow-x-auto whitespace-nowrap">
            A: Entry ID* · B: Teacher Code · C: Teacher Name (ref) · D: Day · E: Start Time · F: End Time · G: Subject · H: Classes
          </div>
          <button onClick={downloadUpdateTemplate} className="text-sm font-semibold text-green-700 hover:underline">
            ↓ Download update template (.xlsx) — pre-filled with {selYearName ? `${selYearName} Sem ${selSemester}` : 'current'} timetable
          </button>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-2">Select file (.xlsx, .xls, .csv)</label>
            <div
              onClick={() => updateFileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl px-6 py-6 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
            >
              <p className="text-sm text-slate-500">
                {updateFileRef.current?.files?.[0]?.name ?? 'Click to choose file or drag & drop'}
              </p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls or .csv</p>
            </div>
            <input ref={updateFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={() => setUpdateErr('')} />
          </div>
          {updateErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{updateErr}</p>}
          {updateResult && (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                <span className="font-semibold">{updateResult.updated}</span> timetable slot{updateResult.updated !== 1 ? 's' : ''} updated successfully
              </div>
              {updateResult.notFound.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1 max-h-36 overflow-y-auto">
                  <p className="font-semibold">{updateResult.notFound.length} Entry ID{updateResult.notFound.length !== 1 ? 's' : ''} not found:</p>
                  {updateResult.notFound.map((n, i) => <p key={i} className="text-xs">Row {n.row}: "{n.code}"</p>)}
                </div>
              )}
              {updateResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-1 max-h-36 overflow-y-auto">
                  <p className="font-semibold">{updateResult.errors.length} row{updateResult.errors.length !== 1 ? 's' : ''} with errors:</p>
                  {updateResult.errors.map((e, i) => <p key={i} className="text-xs">Row {e.row}: {e.message}</p>)}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            <Button onClick={handleBulkUpdate} loading={updating}>Update Records</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
