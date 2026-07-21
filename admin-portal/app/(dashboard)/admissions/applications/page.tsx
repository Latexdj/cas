'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Application {
  id: string; index_number: string; admission_number: string; form_token: string;
  full_name: string; gender: string; aggregate: number | null; program_name: string | null;
  house: string | null; residential_status: string | null; status: string;
  mobile_number: string | null; date_of_birth: string | null;
  guardian_name: string | null; guardian_mobile: string | null; guardian_relationship: string | null;
  hometown: string | null; ghana_card_number: string | null; nhia_number: string | null;
  religion: string | null; picture_url: string | null; bece_results_url: string | null;
  created_at: string; form_completed_at: string | null; reported_at: string | null;
  total_count?: number;
}
interface Stats {
  total: number; pending: number; completed: number; reported: number; migrated: number;
  total_placed: number; total_registered: number;
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: '#F1F5F9', color: '#64748B' },
  completed: { label: 'Completed', bg: '#DBEAFE', color: '#1D4ED8' },
  reported:  { label: 'Reported',  bg: '#DCFCE7', color: '#15803D' },
  migrated:  { label: 'Migrated',  bg: '#F3E8FF', color: '#7C3AED' },
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

export default function ApplicationsPage() {
  const [rows,       setRows]       = useState<Application[]>([]);
  const [total,      setTotal]      = useState(0);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [statusF,    setStatusF]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Application | null>(null);
  const [migModal,   setMigModal]   = useState(false);
  const [defClass,   setDefClass]   = useState('1');
  const [migrating,  setMigrating]  = useState(false);
  const [migResult,  setMigResult]  = useState<{ migrated: number; skipped: number; errors: { name: string; error: string }[] } | null>(null);

  const loadStats = useCallback(async () => {
    try { const { data } = await api.get('/api/admin/admissions/stats'); setStats(data); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/admissions/applications', {
        params: { search, status: statusF || undefined, page },
      });
      setRows(data.data); setTotal(data.total);
    } finally { setLoading(false); }
  }, [search, statusF, page]);

  useEffect(() => { load(); loadStats(); }, [load, loadStats]);

  async function markReported(id: string) {
    await api.patch(`/api/admin/admissions/applications/${id}`, { status: 'reported' });
    load(); loadStats();
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'reported' } : s);
  }

  async function del(id: string) {
    if (!confirm('Delete this application? This cannot be undone.')) return;
    await api.delete(`/api/admin/admissions/applications/${id}`);
    setSelected(null); load(); loadStats();
  }

  async function migrateSingle(id: string) {
    setMigrating(true);
    try {
      await api.post(`/api/admin/admissions/applications/${id}/migrate`, { default_class: defClass });
      load(); loadStats(); setSelected(null); setMigModal(false);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Migration failed');
    } finally { setMigrating(false); }
  }

  async function migrateBulk() {
    setMigrating(true); setMigResult(null);
    try {
      const { data } = await api.post('/api/admin/admissions/applications/migrate-bulk', { default_class: defClass });
      setMigResult(data); load(); loadStats();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Migration failed');
    } finally { setMigrating(false); }
  }

  const pages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Applications</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage admission applications from prospective students.</p>
        </div>
        <Button onClick={() => setMigModal(true)} disabled={!stats?.reported}>
          Migrate Reported → Students
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Placed',      val: stats.total_placed,     color: '#64748B' },
            { label: 'Registered',  val: stats.total_registered, color: '#0284C7' },
            { label: 'Pending',     val: stats.pending,          color: '#94A3B8' },
            { label: 'Completed',   val: stats.completed,        color: '#1D4ED8' },
            { label: 'Reported',    val: stats.reported,         color: '#15803D' },
            { label: 'Migrated',    val: stats.migrated,         color: '#7C3AED' },
            { label: 'Total Apps',  val: stats.total,            color: '#0F172A' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, index, admission no…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="reported">Reported</option>
          <option value="migrated">Migrated</option>
        </select>
        <span className="text-xs text-slate-400">{total} application{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>{['Admission No.','Name','Index No.','Program','House','Status','Date','Actions'].map(h =>
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center">
                <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No applications found.</td></tr>
            ) : rows.map(r => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
              return (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{r.admission_number || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.full_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.index_number}</td>
                  <td className="px-4 py-3 text-slate-600">{r.program_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.house || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {r.status === 'completed' && (
                        <Button size="sm" onClick={() => markReported(r.id)}>Reported</Button>
                      )}
                      {r.status === 'reported' && (
                        <Button size="sm" onClick={() => { setSelected(r); setMigModal(true); }}>Migrate</Button>
                      )}
                      <Button variant="danger" size="sm" onClick={() => del(r.id)}>Del</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>Prev</Button>
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages}>Next</Button>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!selected && !migModal} onClose={() => setSelected(null)} title="Application Detail" maxWidth="max-w-2xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {selected.picture_url && (
                <img src={selected.picture_url} alt="Photo" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
              )}
              <div>
                <p className="text-xl font-bold text-slate-900">{selected.full_name}</p>
                <p className="text-sm text-slate-500 font-mono">{selected.admission_number}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-1"
                  style={{ backgroundColor: STATUS_CFG[selected.status]?.bg, color: STATUS_CFG[selected.status]?.color }}>
                  {STATUS_CFG[selected.status]?.label}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['Index Number', selected.index_number],
                ['Gender', selected.gender],
                ['Date of Birth', fmtDate(selected.date_of_birth)],
                ['Program', selected.program_name],
                ['House', selected.house],
                ['Residential Status', selected.residential_status],
                ['Mobile', selected.mobile_number],
                ['Hometown', selected.hometown],
                ['Ghana Card', selected.ghana_card_number],
                ['NHIA No.', selected.nhia_number],
                ['Religion', selected.religion],
                ['Aggregate', selected.aggregate],
                ['Guardian', selected.guardian_name],
                ['Guardian Rel.', selected.guardian_relationship],
                ['Guardian Mobile', selected.guardian_mobile],
                ['Applied', fmtDate(selected.created_at)],
              ].map(([label, val]) => val ? (
                <div key={String(label)}>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                  <p className="font-medium text-slate-800">{val}</p>
                </div>
              ) : null)}
            </div>
            {selected.bece_results_url && (
              <a href={selected.bece_results_url} target="_blank" className="text-sm text-green-700 underline">View BECE Results Slip</a>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              {selected.status === 'completed' && (
                <Button onClick={() => markReported(selected.id)}>Mark as Reported</Button>
              )}
              {selected.status === 'reported' && (
                <Button onClick={() => setMigModal(true)}>Migrate to Students</Button>
              )}
              <Button variant="danger" onClick={() => del(selected.id)}>Delete Application</Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Migration modal */}
      <Modal open={migModal} onClose={() => { setMigModal(false); setMigResult(null); }} title="Migrate to Students" maxWidth="max-w-md">
        <div className="space-y-4">
          {selected?.status === 'reported' ? (
            <p className="text-sm text-slate-600">Migrate <strong>{selected.full_name}</strong> to the main students table.</p>
          ) : (
            <p className="text-sm text-slate-600">Migrate <strong>all {stats?.reported ?? 0} reported</strong> students to the main students table. Students will receive login credentials (default password: <span className="font-mono">Student123</span>).</p>
          )}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Class Assignment</label>
            <input value={defClass} onChange={e => setDefClass(e.target.value)}
              placeholder="e.g. 1A or 1"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
            <p className="mt-1 text-xs text-slate-400">Students can be moved to specific classes in the Student roster afterwards.</p>
          </div>
          {migResult && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold">{migResult.migrated} student{migResult.migrated !== 1 ? 's' : ''} migrated successfully.</p>
              {migResult.skipped > 0 && <p className="text-amber-700">{migResult.skipped} skipped.</p>}
              {migResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e.name}: {e.error}</p>)}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setMigModal(false); setMigResult(null); }}>Close</Button>
            <Button onClick={selected?.status === 'reported' ? () => migrateSingle(selected.id) : migrateBulk} loading={migrating}>
              {selected?.status === 'reported' ? 'Migrate Student' : 'Migrate All Reported'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
