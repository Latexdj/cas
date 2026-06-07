'use client';
import { useEffect, useState, useMemo } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface HouseStats {
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
  house?:             string;
}

type Role = 'loading' | 'none' | 'housemaster' | 'senior_housemaster';

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

function HouseOverviewCard({ h, accent }: { h: HouseStats; accent: string }) {
  const maxClass = Math.max(...h.by_class.map(c => c.count), 1);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 dark:text-white">{h.house_name}</h3>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{h.total} students</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Male',     value: h.male,     color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Female',   value: h.female,   color: 'text-pink-600 dark:text-pink-400' },
          { label: 'Boarding', value: h.boarding, color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Day',      value: h.day,      color: 'text-amber-600 dark:text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl py-2">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      {h.by_class.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">By Class</p>
          {h.by_class.map(c => (
            <div key={c.class_name} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0 truncate">{c.class_name || '—'}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((c.count / maxClass) * 100)}%`, backgroundColor: accent }} />
              </div>
              <span className="text-xs text-slate-500 w-6 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ACCENT = '#15803d';

export default function HouseStudentsPage() {
  const [role,       setRole]       = useState<Role>('loading');
  const [tab,        setTab]        = useState<'overview' | 'students'>('overview');

  // Housemaster state (single house)
  const [dashboard,  setDashboard]  = useState<HouseStats | null>(null);

  // Senior housemaster state (all houses)
  const [allHouses,  setAllHouses]  = useState<HouseStats[]>([]);

  // Students (shared)
  const [students,   setStudents]   = useState<Student[]>([]);
  const [stuLoading, setStuLoading] = useState(false);

  // Filters
  const [filterHouse,  setFilterHouse]  = useState('');
  const [filterClass,  setFilterClass]  = useState('');
  const [filterRes,    setFilterRes]    = useState('');
  const [filterGender, setFilterGender] = useState('');

  // Detect role on mount
  useEffect(() => {
    teacherApi.get<HouseStats>('/api/houses/my-dashboard')
      .then(r => { setDashboard(r.data); setRole('housemaster'); })
      .catch(e => {
        if (e?.response?.status === 404) {
          // Try senior housemaster
          teacherApi.get<HouseStats[]>('/api/houses/all-dashboard')
            .then(r => { setAllHouses(r.data); setRole('senior_housemaster'); })
            .catch(() => setRole('none'));
        } else {
          setRole('none');
        }
      });
  }, []);

  // Load students when tab switches to 'students'
  useEffect(() => {
    if (tab !== 'students' || (role !== 'housemaster' && role !== 'senior_housemaster')) return;
    setStuLoading(true);
    const params = new URLSearchParams();
    if (role === 'senior_housemaster' && filterHouse) params.set('house', filterHouse);
    if (filterClass)  params.set('class_name', filterClass);
    if (filterRes)    params.set('residential_status', filterRes);
    if (filterGender) params.set('gender', filterGender);

    const endpoint = role === 'senior_housemaster'
      ? `/api/houses/all-students?${params}`
      : `/api/houses/my-students?${params}`;

    teacherApi.get<Student[]>(endpoint)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setStuLoading(false));
  }, [tab, role, filterHouse, filterClass, filterRes, filterGender]);

  // Class options for filter (derived from loaded data)
  const classOptions = useMemo(() => {
    if (role === 'housemaster' && dashboard) {
      return dashboard.by_class.map(c => c.class_name).sort();
    }
    if (role === 'senior_housemaster') {
      const source = filterHouse
        ? allHouses.find(h => h.house_name === filterHouse)?.by_class ?? []
        : allHouses.flatMap(h => h.by_class);
      return [...new Set(source.map(c => c.class_name))].sort();
    }
    return [];
  }, [role, dashboard, allHouses, filterHouse]);

  const houseOptions = useMemo(() =>
    allHouses.map(h => h.house_name), [allHouses]);

  // ── Loading ──
  if (role === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Not assigned ──
  if (role === 'none') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-slate-400">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No house assigned</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">You have not been assigned as a housemaster. Contact your administrator.</p>
      </div>
    );
  }

  const isSenior = role === 'senior_housemaster';

  // Summary totals for senior housemaster header
  const seniorTotals = isSenior ? allHouses.reduce(
    (acc, h) => ({ total: acc.total + h.total, male: acc.male + h.male, female: acc.female + h.female, boarding: acc.boarding + h.boarding, day: acc.day + h.day }),
    { total: 0, male: 0, female: 0, boarding: 0, day: 0 }
  ) : null;

  const houseName    = isSenior ? 'All Houses' : dashboard!.house_name;
  const headerTotal  = isSenior ? seniorTotals!.total : dashboard!.total;

  return (
    <div className="p-4 space-y-4 pb-24 md:pb-6">

      {/* Header */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{houseName}</h1>
          {isSenior && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              Senior Housemaster
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {headerTotal} active student{headerTotal !== 1 ? 's' : ''}
          {isSenior && ` across ${allHouses.length} house${allHouses.length !== 1 ? 's' : ''}`}
          {!isSenior && dashboard && (dashboard.boarding > 0 || dashboard.day > 0)
            ? ` · ${dashboard.boarding} Boarding, ${dashboard.day} Day` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {(['overview', 'students'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={tab === t ? { backgroundColor: '#fff', color: '#15803d', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748b' }}>
            {t === 'overview' ? 'Overview' : 'Students'}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {isSenior ? (
            <>
              {/* Senior: summary strip then per-house cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard label="Total"    value={seniorTotals!.total} />
                <StatCard label="Male"     value={seniorTotals!.male}    sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.male / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Female"   value={seniorTotals!.female}  sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.female / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Boarding" value={seniorTotals!.boarding} sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.boarding / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Day"      value={seniorTotals!.day}     sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.day / seniorTotals!.total * 100)}%` : '—'} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 pt-1">Per House</p>
              <div className="space-y-4">
                {allHouses.map(h => <HouseOverviewCard key={h.house_name} h={h} accent={ACCENT} />)}
              </div>
            </>
          ) : (
            <>
              {/* Regular housemaster: same as before */}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                <StatCard label="Total"    value={dashboard!.total} />
                <StatCard label="Male"     value={dashboard!.male}    sub={dashboard!.total > 0 ? `${Math.round(dashboard!.male / dashboard!.total * 100)}%` : '—'} />
                <StatCard label="Female"   value={dashboard!.female}  sub={dashboard!.total > 0 ? `${Math.round(dashboard!.female / dashboard!.total * 100)}%` : '—'} />
                <StatCard label="Boarding" value={dashboard!.boarding} sub={dashboard!.total > 0 ? `${Math.round(dashboard!.boarding / dashboard!.total * 100)}%` : '—'} />
                <StatCard label="Day"      value={dashboard!.day}     sub={dashboard!.total > 0 ? `${Math.round(dashboard!.day / dashboard!.total * 100)}%` : '—'} />
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gender Distribution</p>
                <DistBar label="Male"   count={dashboard!.male}   total={dashboard!.total} color="#3b82f6" />
                <DistBar label="Female" count={dashboard!.female} total={dashboard!.total} color="#ec4899" />
                {dashboard!.total - dashboard!.male - dashboard!.female > 0 &&
                  <DistBar label="Not specified" count={dashboard!.total - dashboard!.male - dashboard!.female} total={dashboard!.total} color="#94a3b8" />}
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Residential Status</p>
                <DistBar label="Boarding" count={dashboard!.boarding} total={dashboard!.total} color="#6366f1" />
                <DistBar label="Day"      count={dashboard!.day}      total={dashboard!.total} color="#f59e0b" />
                {dashboard!.total - dashboard!.boarding - dashboard!.day > 0 &&
                  <DistBar label="Not specified" count={dashboard!.total - dashboard!.boarding - dashboard!.day} total={dashboard!.total} color="#94a3b8" />}
              </div>
              {dashboard!.by_class.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">By Class / Form</p>
                  {dashboard!.by_class.map(c => {
                    const max = Math.max(...dashboard!.by_class.map(x => x.count), 1);
                    return (
                      <div key={c.class_name} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span>{c.class_name || 'Unassigned'}</span><span>{c.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round((c.count / max) * 100)}%`, backgroundColor: ACCENT }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Students tab ── */}
      {tab === 'students' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {/* House filter — senior housemaster only */}
            {isSenior && (
              <select value={filterHouse} onChange={e => { setFilterHouse(e.target.value); setFilterClass(''); }}
                className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">All Houses</option>
                {houseOptions.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Classes</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterRes} onChange={e => setFilterRes(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Residential</option>
              <option value="Boarding">Boarding</option>
              <option value="Day">Day</option>
            </select>
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {s.student_code}
                        {isSenior && s.house ? ` · ${s.house}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {s.class_name && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{s.class_name}</span>
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
