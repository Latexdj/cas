'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface StudentResult { id: string; name: string; student_code: string; class_name: string; }
interface HealthProfile {
  blood_group: string | null; genotype: string | null; known_allergies: string | null;
  known_conditions: string | null; current_medications: string | null; updated_at: string | null;
}

const emptyProfile: HealthProfile = {
  blood_group: '', genotype: '', known_allergies: '', known_conditions: '', current_medications: '', updated_at: null,
};

export default function HealthProfilesPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [selected, setSelected] = useState<StudentResult | null>(null);
  const [profile, setProfile] = useState<HealthProfile>(emptyProfile);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get<StudentResult[]>('/api/clinic/students/search', { params: { q: query.trim() } })
        .then(r => setResults(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function selectStudent(s: StudentResult) {
    setSelected(s);
    setResults([]);
    setQuery('');
    setSaved(false);
    setLoading(true);
    api.get<HealthProfile | null>(`/api/clinic/students/${s.id}/health-profile`)
      .then(r => setProfile(r.data ?? emptyProfile))
      .catch(() => setProfile(emptyProfile))
      .finally(() => setLoading(false));
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setSaved(false);
    try {
      const r = await api.put<HealthProfile>(`/api/clinic/students/${selected.id}/health-profile`, {
        blood_group: profile.blood_group || null,
        genotype: profile.genotype || null,
        known_allergies: profile.known_allergies || null,
        known_conditions: profile.known_conditions || null,
        current_medications: profile.current_medications || null,
      });
      setProfile(r.data);
      setSaved(true);
    } catch {
      // no-op, button stays available to retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Health profiles</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Blood group, allergies, and known conditions, for clinic staff to reference during a visit</p>
      </div>

      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5 bg-white dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{selected.name}</p>
            <p className="text-xs text-slate-500">{selected.student_code} · {selected.class_name}</p>
          </div>
          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => { setSelected(null); setProfile(emptyProfile); }}>Change</button>
        </div>
      ) : (
        <div className="relative max-w-md">
          <Input placeholder="Search student by name or code…" value={query} onChange={e => setQuery(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(s => (
                <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-600" onClick={() => selectStudent(s)}>
                  <p className="font-medium text-slate-900 dark:text-white">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.student_code} · {s.class_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Blood group" value={profile.blood_group ?? ''} onChange={e => setProfile(p => ({ ...p, blood_group: e.target.value }))} placeholder="e.g. O+" />
              <Input label="Genotype" value={profile.genotype ?? ''} onChange={e => setProfile(p => ({ ...p, genotype: e.target.value }))} placeholder="e.g. AA" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Known allergies</label>
              <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
                value={profile.known_allergies ?? ''} onChange={e => setProfile(p => ({ ...p, known_allergies: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Known conditions</label>
              <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
                value={profile.known_conditions ?? ''} onChange={e => setProfile(p => ({ ...p, known_conditions: e.target.value }))} placeholder="e.g. asthma, epilepsy, sickle cell" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Current medications</label>
              <textarea className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white" rows={2}
                value={profile.current_medications ?? ''} onChange={e => setProfile(p => ({ ...p, current_medications: e.target.value }))} placeholder="e.g. asthma inhaler, as needed" />
            </div>
            <div className="flex items-center justify-between pt-2">
              {profile.updated_at && <p className="text-xs text-slate-500">Last updated {new Date(profile.updated_at).toLocaleString()}</p>}
              <div className="flex items-center gap-3 ml-auto">
                {saved && <span className="text-xs text-[#145C44] dark:text-[#2ab289]">Saved</span>}
                <Button onClick={save} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
