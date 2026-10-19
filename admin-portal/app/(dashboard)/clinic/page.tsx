'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatCard } from '@/components/ui/Card';

interface OpenVisit {
  id: string; patient_type: 'student' | 'teacher'; patient_name: string;
  student_code: string | null; class_name: string | null; complaint: string; severity: string; arrived_at: string;
}

interface Dashboard {
  open_visits: OpenVisit[];
  today_visits: number;
  severity_breakdown: { severity: string; count: number }[];
}

export default function ClinicOverviewPage() {
  const [data,    setData]    = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Dashboard>('/api/clinic/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const countFor = (severity: string) => data?.severity_breakdown.find(b => b.severity === severity)?.count ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Clinic</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Today's visits and who is currently in the clinic</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Today's Visits" value={data.today_visits} color="blue" />
            <StatCard label="Currently in Clinic" value={data.open_visits.length} color="yellow" />
            <StatCard label="Minor Today" value={countFor('minor')} color="green" />
            <StatCard label="Serious Today" value={countFor('serious')} color="red" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Currently in clinic</h2>
            {data.open_visits.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nobody is currently being seen at the clinic.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.open_visits.map(v => (
                  <a key={v.id} href={`/clinic/visits/${v.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 -mx-5 px-5 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {v.patient_name} {v.class_name ? <span className="text-slate-400 font-normal">· {v.class_name}</span> : null}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{v.complaint}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      v.severity === 'serious' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      v.severity === 'moderate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-[#E8F4EE] text-[#145C44] dark:bg-green-900/30 dark:text-[#2ab289]'
                    }`}>{v.severity}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick links</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { href: '/clinic/visits', label: 'Log a visit' },
                { href: '/clinic/health-profiles', label: 'Health profiles' },
                { href: '/clinic/reports', label: 'Reports' },
                { href: '/clinic/settings', label: 'Notification settings' },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-red-500">Could not load the clinic dashboard, try again</p>
      )}
    </div>
  );
}
