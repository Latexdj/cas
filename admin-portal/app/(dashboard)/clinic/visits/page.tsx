'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Visit {
  id: string; patient_type: 'student' | 'teacher'; patient_name: string;
  student_code: string | null; class_name: string | null; teacher_code: string | null;
  complaint: string; severity: string; status: string; outcome: string | null;
  visit_date: string; arrived_at: string;
}

interface PersonResult { id: string; name: string; student_code?: string; teacher_code?: string; class_name?: string; department?: string; }

const SEVERITY_COLORS: Record<string, string> = {
  minor:    'bg-[#E8F4EE] text-[#145C44] dark:bg-green-900/30 dark:text-[#2ab289]',
  moderate: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  serious:  'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  open:   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

export default function ClinicVisitsPage() {
  const [visits,  setVisits]  = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [patientType, setPatientType] = useState<'student' | 'teacher'>('student');
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [complaint, setComplaint] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api.get<Visit[]>('/api/clinic/visits', { params: { search: search || undefined, status: status || undefined } })
      .then(r => setVisits(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [status]);

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(visits.filter(v => {
      const s = search.toLowerCase();
      return !s || v.patient_name.toLowerCase().includes(s) || v.student_code?.toLowerCase().includes(s);
    }));

  useEffect(() => {
    if (personQuery.trim().length < 2) { setPersonResults([]); return; }
    const endpoint = patientType === 'student' ? '/api/clinic/students/search' : '/api/clinic/teachers/search';
    const t = setTimeout(() => {
      api.get<PersonResult[]>(endpoint, { params: { q: personQuery.trim() } })
        .then(r => setPersonResults(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [personQuery, patientType]);

  function resetModal() {
    setPatientType('student'); setPersonQuery(''); setPersonResults([]);
    setSelectedPerson(null); setComplaint(''); setSeverity('minor'); setError('');
  }

  async function submitVisit() {
    if (!selectedPerson) { setError('Select who this visit is for'); return; }
    if (!complaint.trim()) { setError('Enter the reason for the visit'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/clinic/visits', {
        patient_type: patientType,
        student_id: patientType === 'student' ? selectedPerson.id : undefined,
        teacher_id: patientType === 'teacher' ? selectedPerson.id : undefined,
        complaint: complaint.trim(),
        severity,
      });
      setModalOpen(false);
      resetModal();
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not log the visit, try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Visits</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">All clinic visits (latest 200)</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Log a visit</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white w-64"
          placeholder="Search by name or student code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading…</p>
        ) : displayRows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No visits found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <Th label="Patient" sortKey="patient_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Complaint</th>
                <Th label="Date" sortKey="visit_date" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap" />
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Severity</th>
                <th className="px-4 py-3 text-left font-semibold text-[#4A3F32] text-xs whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {(displayRows as Visit[]).map(v => (
                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer" onClick={() => { window.location.href = `/clinic/visits/${v.id}`; }}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{v.patient_name}</p>
                    <p className="text-xs text-slate-500">{v.patient_type === 'student' ? `${v.student_code} · ${v.class_name}` : v.teacher_code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{v.complaint}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{v.visit_date}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${SEVERITY_COLORS[v.severity]}`}>{v.severity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[v.status]}`}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && displayRows.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total}
            onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetModal(); }} title="Log a clinic visit" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="flex gap-3">
            {(['student', 'teacher'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setPatientType(t); setSelectedPerson(null); setPersonQuery(''); setPersonResults([]); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-colors ${
                  patientType === t
                    ? 'bg-[#145C44] text-white border-[#145C44]'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {selectedPerson ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{selectedPerson.name}</p>
                <p className="text-xs text-slate-500">{selectedPerson.student_code ?? selectedPerson.teacher_code}</p>
              </div>
              <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setSelectedPerson(null)}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <Input
                label={patientType === 'student' ? 'Find student *' : 'Find staff *'}
                placeholder="Name or code…"
                value={personQuery}
                onChange={e => setPersonQuery(e.target.value)}
              />
              {personResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {personResults.map(p => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-600"
                      onClick={() => { setSelectedPerson(p); setPersonResults([]); }}
                    >
                      <p className="font-medium text-slate-900 dark:text-white">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.student_code ?? p.teacher_code} {p.class_name ? `· ${p.class_name}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Reason for visit *</label>
            <textarea
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              rows={3}
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              placeholder="e.g. headache, stomach pain, fever…"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">Severity</label>
            <select
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              value={severity}
              onChange={e => setSeverity(e.target.value)}
            >
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="serious">Serious</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setModalOpen(false); resetModal(); }}>Cancel</Button>
            <Button onClick={submitVisit} loading={saving}>Log visit</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
