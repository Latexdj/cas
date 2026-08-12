'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { AcademicYear, Semester } from '@/types/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('default', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900'
  + ' focus:outline-none focus:ring-2 focus:ring-green-600 dark:border-slate-600 dark:bg-slate-700 dark:text-white';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1';

const SEM_NAMES: Record<number, string> = { 1: 'First Semester', 2: 'Second Semester' };

// ── page ──────────────────────────────────────────────────────────────────────

const YEAR_EMPTY = { name: '', is_current: false, current_semester: '1', start_date: '', end_date: '' };

export default function AcademicYearsPage() {
  const [years,   setYears]   = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'create' | 'edit' | null>(null);
  const [form,    setForm]    = useState(YEAR_EMPTY);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // which year row has semesters expanded
  const [expandedYearId, setExpandedYearId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AcademicYear[]>('/api/academic-years');
      setYears(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(YEAR_EMPTY); setError(''); setEditId(null); setModal('create');
  }
  function openEdit(y: AcademicYear) {
    setForm({
      name: y.name,
      is_current: y.is_current,
      current_semester: String(y.current_semester ?? 1),
      start_date: y.start_date ?? '',
      end_date:   y.end_date   ?? '',
    });
    setEditId(y.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = {
        name: form.name,
        is_current: form.is_current,
        current_semester: parseInt(form.current_semester),
        start_date: form.start_date || undefined,
        end_date:   form.end_date   || undefined,
      };
      if (modal === 'create') await api.post('/api/academic-years', body);
      else                    await api.put(`/api/academic-years/${editId}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save academic year.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete academic year "${name}"? This cannot be undone.`)) return;
    try { await api.delete(`/api/academic-years/${id}`); await load(); }
    catch { alert('Failed to delete. It may have data attached.'); }
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } = useTableControls(years);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>+ Add Academic Year</Button>
      </div>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-x-auto">
          <table className="min-w-[700px] w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700">
              <tr>
                <Th label="Year" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Start</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">End</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Semester</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(displayRows as typeof years).map(y => (
                <YearRows key={y.id} year={y}
                  expanded={expandedYearId === y.id}
                  onToggleExpand={() => setExpandedYearId(prev => prev === y.id ? null : y.id)}
                  onEdit={() => openEdit(y)}
                  onDelete={() => del(y.id, y.name)}
                  onRefresh={load}
                />
              ))}
              {years.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No academic years yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Academic Year' : 'Edit Academic Year'}>
        <div className="space-y-4">
          <Input label="Year Name *" placeholder="2025/2026" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" className={inputCls} value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" className={inputCls} value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Current Semester</label>
            <select value={form.current_semester}
              onChange={e => setForm(f => ({ ...f, current_semester: e.target.value }))}
              className={inputCls}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.is_current}
              onChange={e => setForm(f => ({ ...f, is_current: e.target.checked }))} />
            Mark as current academic year
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Year row + expandable semester panel ──────────────────────────────────────

function YearRows({ year, expanded, onToggleExpand, onEdit, onDelete, onRefresh }:
  { year: AcademicYear; expanded: boolean; onToggleExpand: () => void; onEdit: () => void; onDelete: () => void; onRefresh: () => void }) {
  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-slate-700/30 border-b border-gray-50 dark:border-slate-700/50">
        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{year.name}</td>
        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{fmtDate(year.start_date)}</td>
        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{fmtDate(year.end_date)}</td>
        <td className="px-4 py-3 text-gray-600 dark:text-slate-400">Semester {year.current_semester ?? '—'}</td>
        <td className="px-4 py-3">
          {year.is_current
            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Current</span>
            : null}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end whitespace-nowrap">
            <button onClick={onToggleExpand}
              className="text-xs font-semibold text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20">
              {expanded ? 'Hide Semesters ▲' : 'Semesters ▼'}
            </button>
            <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
            <Button variant="danger" size="sm" onClick={onDelete}>Del</Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 dark:bg-slate-800/60 px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <SemesterPanel yearId={year.id} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Semester panel ─────────────────────────────────────────────────────────────

const SEM_EMPTY = { number: '1', name: '', start_date: '', end_date: '' };

function SemesterPanel({ yearId, onRefresh: _onRefresh }: { yearId: string; onRefresh: () => void }) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [form,      setForm]      = useState(SEM_EMPTY);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const loadSems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Semester[]>(`/api/academic-years/${yearId}/semesters`);
      setSemesters(data);
    } finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { loadSems(); }, [loadSems]);

  function startAdd() {
    setEditId(null);
    setForm(SEM_EMPTY);
    setError('');
    setAdding(true);
  }

  function startEdit(s: Semester) {
    setEditId(s.id);
    setForm({ number: String(s.number), name: s.name, start_date: s.start_date ?? '', end_date: s.end_date ?? '' });
    setError('');
    setAdding(true);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = { number: parseInt(form.number), name: form.name, start_date: form.start_date || undefined, end_date: form.end_date || undefined };
      if (editId) await api.put(`/api/academic-years/${yearId}/semesters/${editId}`, body);
      else        await api.post(`/api/academic-years/${yearId}/semesters`, body);
      setAdding(false);
      await loadSems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Remove "${name}"?`)) return;
    try { await api.delete(`/api/academic-years/${yearId}/semesters/${id}`); await loadSems(); }
    catch { alert('Failed to delete.'); }
  }

  const usedNumbers = new Set(semesters.filter(s => s.id !== editId).map(s => s.number));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Semesters</p>
        {!adding && (
          <button onClick={startAdd}
            className="text-xs font-semibold text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20">
            + Add Semester
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Number *</label>
              <select className={inputCls} value={form.number}
                onChange={e => setForm(f => ({ ...f, number: e.target.value }))}>
                {[1, 2].map(n => (
                  <option key={n} value={n} disabled={usedNumbers.has(n as 1|2)}>
                    Semester {n}{usedNumbers.has(n as 1|2) ? ' (exists)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Name *</label>
              <input className={inputCls} value={form.name} placeholder={SEM_NAMES[parseInt(form.number)]}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" className={inputCls} value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input type="date" className={inputCls} value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-600">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="text-xs font-semibold text-white px-3 py-1.5 rounded disabled:opacity-60"
              style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Add Semester'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-slate-400">Loading…</div>
      ) : semesters.length === 0 && !adding ? (
        <p className="text-xs text-slate-400">No semesters defined yet. Add one to track semester dates.</p>
      ) : semesters.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left px-3 py-2 font-semibold text-slate-500">#</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Name</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">Start</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-500">End</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {semesters.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                  <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">{s.number}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{fmtDate(s.start_date)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{fmtDate(s.end_date)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => startEdit(s)} className="text-blue-500 hover:text-blue-700 font-semibold">Edit</button>
                      <button onClick={() => del(s.id, s.name)} className="text-red-500 hover:text-red-700 font-semibold">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
