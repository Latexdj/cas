'use client';
import { useEffect, useState, useMemo } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface DashboardData {
  house_name: string;
  total:      number;
  male:       number;
  female:     number;
  boarding:   number;
  day:        number;
  by_class:   { class_name: string; count: number }[];
}

interface Student {
  id:                 string;
  student_code:       string;
  name:               string;
  class_name:         string;
  gender:             string;
  residential_status: string;
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col items-center justify-center text-center">
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
        <span>{label}</span>
        <span>{count} <span className="text-slate-400">({pct}%)</span></span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const RESIDENTIAL_COLORS: Record<string, string> = {
  boarding: '#6366f1',
  day:      '#f59e0b',
};
const GENDER_COLORS: Record<string, string> = {
  male:   '#3b82f6',
  female: '#ec4899',
};
const RES_LABELS: Record<string, string>    = { boarding: 'Boarding', day: 'Day' };
const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female' };

export default function HouseStudentsPage() {
  const [tab,        setTab]        = useState<'overview' | 'students'>('overview');
  const [dashboard,  setDashboard]  = useState<DashboardData | null>(null);
  const [students,   setStudents]   = useState<Student[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [stuLoading, setStuLoading] = useState(false);
  const [noHouse,    setNoHouse]    = useState(false);

  const [filterClass, setFilterClass]       = useState('');
  const [filterRes,   setFilterRes]         = useState('');
  const [filterGender, setFilterGender]     = useState('');

  useEffect(() => {
    teacherApi.get<DashboardData>('/api/houses/my-dashboard')
      .then(r => setDashboard(r.data))
      .catch(e => { if (e?.response?.status === 404) setNoHouse(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'students' || noHouse) return;
    setStuLoading(true);
    const params = new URLSearchParams();
    if (filterClass)  params.set('class_name', filterClass);
    if (filterRes)    params.set('residential_status', filterRes);
    if (filterGender) params.set('gender', filterGender);
    teacherApi.get<Student[]>(`/api/houses/my-students?${params}`)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setStuLoading(false));
  }, [tab, filterClass, filterRes, filterGender, noHouse]);

  const classOptions = useMemo(() =>
    dashboard ? [...new Set(dashboard.by_class.map(c => c.class_name))].sort() : [],
  [dashboard]);

  const maxClassCount = useMemo(() =>
    dashboard ? Math.max(...dashboard.by_class.map(c => c.count), 1) : 1,
  [dashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (noHouse) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-slate-400">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <path d="M9 22V12h6v10" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No house assigned</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">You have not been assigned as a housemaster. Contact your administrator.</p>
      </div>
    );
  }

  if (!dashboard) return null;

  const { house_name, total, male, female, boarding, day, by_class } = dashboard;

  return (
    <div className="p-4 space-y-4 pb-24 md:pb-6">

      {/* Header */}
      <div className="space-y-0.5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{house_name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {total} active student{total !== 1 ? 's' : ''}
          {boarding > 0 || day > 0 ? ` · ${boarding} Boarding, ${day} Day` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {(['overview', 'students'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === t
              ? { backgroundColor: '#fff', color: '#15803d', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: '#64748b' }}
          >
            {t === 'overview' ? 'Overview' : 'Students'}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <StatCard label="Total"    value={total} />
            <StatCard label="Male"     value={male}    sub={total > 0 ? `${Math.round(male / total * 100)}%` : '—'} />
            <StatCard label="Female"   value={female}  sub={total > 0 ? `${Math.round(female / total * 100)}%` : '—'} />
            <StatCard label="Boarding" value={boarding} sub={total > 0 ? `${Math.round(boarding / total * 100)}%` : '—'} />
            <StatCard label="Day"      value={day}     sub={total > 0 ? `${Math.round(day / total * 100)}%` : '—'} />
          </div>

          {/* Gender distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gender Distribution</p>
            {(['male', 'female'] as const).map(g => (
              <DistBar key={g} label={GENDER_LABELS[g]} count={g === 'male' ? male : female} total={total} color={GENDER_COLORS[g]} />
            ))}
            {total - male - female > 0 && (
              <DistBar label="Not specified" count={total - male - female} total={total} color="#94a3b8" />
            )}
          </div>

          {/* Residential distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Residential Status</p>
            {(['boarding', 'day'] as const).map(r => (
              <DistBar key={r} label={RES_LABELS[r]} count={r === 'boarding' ? boarding : day} total={total} color={RESIDENTIAL_COLORS[r]} />
            ))}
            {total - boarding - day > 0 && (
              <DistBar label="Not specified" count={total - boarding - day} total={total} color="#94a3b8" />
            )}
          </div>

          {/* By class */}
          {by_class.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">By Class / Form</p>
              {by_class.map(c => (
                <div key={c.class_name} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>{c.class_name || 'Unassigned'}</span>
                    <span>{c.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((c.count / maxClassCount) * 100)}%`, backgroundColor: '#15803d' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Students tab ── */}
      {tab === 'students' && (
        <div className="space-y-3">

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Classes</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filterRes}
              onChange={e => setFilterRes(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Residential</option>
              <option value="Boarding">Boarding</option>
              <option value="Day">Day</option>
            </select>

            <select
              value={filterGender}
              onChange={e => setFilterGender(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {stuLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">No students found.</div>
          ) : (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Showing {students.length} student{students.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {students.map(s => (
                  <div key={s.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.student_code}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {s.class_name && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {s.class_name}
                        </span>
                      )}
                      {s.residential_status && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.residential_status.toLowerCase() === 'boarding' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {s.residential_status}
                        </span>
                      )}
                      {s.gender && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.gender.toLowerCase() === 'male' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}>
                          {s.gender}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
