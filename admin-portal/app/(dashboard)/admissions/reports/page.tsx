'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ChartRow { label: string; count: number; }
interface Reports {
  programs: ChartRow[]; genders: ChartRow[]; houses: ChartRow[]; residentials: ChartRow[];
}
interface Stats {
  total: number; pending: number; completed: number; reported: number; migrated: number;
  total_placed: number; total_registered: number;
}

function Bar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-xs text-slate-600 truncate text-right">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-xs font-semibold text-slate-700 text-right">{count}</span>
    </div>
  );
}

function ChartCard({ title, data, color }: { title: string; data: ChartRow[]; color: string }) {
  const max = data.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>
      {data.length === 0
        ? <p className="text-xs text-slate-400">No data yet.</p>
        : <div className="space-y-2">{data.map(r => <Bar key={r.label} label={r.label} count={r.count} max={max} color={color} />)}</div>
      }
    </div>
  );
}

export default function AdmissionReportsPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.get('/api/admin/admissions/stats'),
        api.get('/api/admin/admissions/reports'),
      ]);
      setStats(s.data); setReports(r.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admission Reports</h1>
        <p className="text-sm text-slate-400 mt-0.5">Overview of the current admission cycle.</p>
      </div>

      {/* Pipeline cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Placed',     val: stats.total_placed,     color: '#64748B' },
            { label: 'Registered', val: stats.total_registered, color: '#0284C7' },
            { label: 'Pending',    val: stats.pending,          color: '#94A3B8' },
            { label: 'Completed',  val: stats.completed,        color: '#1D4ED8' },
            { label: 'Reported',   val: stats.reported,         color: '#15803D' },
            { label: 'Migrated',   val: stats.migrated,         color: '#7C3AED' },
            { label: 'Total',      val: stats.total,            color: '#0F172A' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline funnel */}
      {stats && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Admission Pipeline</h3>
          <div className="space-y-2">
            {[
              { label: 'Placed by CSSPS', val: stats.total_placed,     color: '#94A3B8' },
              { label: 'Registered',      val: stats.total_registered, color: '#60A5FA' },
              { label: 'Completed Form',  val: stats.completed + stats.reported + stats.migrated, color: '#34D399' },
              { label: 'Reported',        val: stats.reported + stats.migrated, color: '#A78BFA' },
              { label: 'Migrated',        val: stats.migrated,         color: '#7C3AED' },
            ].map(s => (
              <Bar key={s.label} label={s.label} count={s.val} max={stats.total_placed || 1} color={s.color} />
            ))}
          </div>
        </div>
      )}

      {reports && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ChartCard title="Applications by Program"         data={reports.programs}    color="#16A34A" />
          <ChartCard title="Applications by House"          data={reports.houses}      color="#7C3AED" />
          <ChartCard title="Applications by Gender"         data={reports.genders}     color="#0284C7" />
          <ChartCard title="Applications by Residential Status" data={reports.residentials} color="#F59E0B" />
        </div>
      )}
    </div>
  );
}
