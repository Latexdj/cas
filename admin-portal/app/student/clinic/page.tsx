'use client';
import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';

interface Visit {
  id: string; complaint: string; severity: string; outcome: string | null;
  visit_date: string; diagnosis_notes: string | null; treatment_given: string | null; closed_at: string | null;
}
interface HealthProfile {
  blood_group: string | null; genotype: string | null; known_allergies: string | null;
  known_conditions: string | null; current_medications: string | null;
}

const OUTCOME_LABELS: Record<string, string> = {
  returned_to_class: 'Returned to class',
  sent_home: 'Sent home',
  referred_to_hospital: 'Referred to hospital',
  admitted_in_clinic: 'Admitted in clinic',
  other: 'Other',
};

export default function StudentClinicPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      studentApi.get<Visit[]>('/api/clinic/my-visits'),
      studentApi.get<HealthProfile | null>('/api/clinic/my-health-profile'),
    ]).then(([v, p]) => { setVisits(v.data); setProfile(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading…</p></div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Clinic</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Your clinic visit history and health profile on file</p>
      </div>

      {profile && (profile.blood_group || profile.genotype || profile.known_allergies || profile.known_conditions || profile.current_medications) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Health profile on file</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {profile.blood_group && <div><p className="text-xs text-slate-400">Blood group</p><p className="text-slate-900 dark:text-white">{profile.blood_group}</p></div>}
            {profile.genotype && <div><p className="text-xs text-slate-400">Genotype</p><p className="text-slate-900 dark:text-white">{profile.genotype}</p></div>}
            {profile.known_allergies && <div className="col-span-2"><p className="text-xs text-slate-400">Known allergies</p><p className="text-slate-900 dark:text-white">{profile.known_allergies}</p></div>}
            {profile.known_conditions && <div className="col-span-2"><p className="text-xs text-slate-400">Known conditions</p><p className="text-slate-900 dark:text-white">{profile.known_conditions}</p></div>}
            {profile.current_medications && <div className="col-span-2"><p className="text-xs text-slate-400">Current medications</p><p className="text-slate-900 dark:text-white">{profile.current_medications}</p></div>}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 px-5 pt-5 pb-3">Visit history</h2>
        {visits.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 px-5 pb-5">You have no recorded clinic visits.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {visits.map(v => (
              <div key={v.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{v.complaint}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    v.severity === 'serious' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    v.severity === 'moderate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-[#E8F4EE] text-[#145C44] dark:bg-green-900/30 dark:text-[#2ab289]'
                  }`}>{v.severity}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{v.visit_date}{v.outcome ? ` · ${OUTCOME_LABELS[v.outcome] ?? v.outcome}` : ''}</p>
                {v.treatment_given && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Treatment: {v.treatment_given}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
