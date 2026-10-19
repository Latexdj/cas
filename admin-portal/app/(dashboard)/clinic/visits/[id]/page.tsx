'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { printClinicVisit } from '@/lib/clinic-visit-print';

interface Visit {
  id: string; patient_type: 'student' | 'teacher'; patient_name: string;
  student_code: string | null; class_name: string | null; teacher_code: string | null;
  complaint: string; vitals_temp_c: number | null; vitals_bp: string | null; vitals_pulse: number | null;
  diagnosis_notes: string | null; treatment_given: string | null; outcome: string | null;
  severity: string; status: string; closed_at: string | null; sms_sent: boolean; notes: string | null;
  visit_date: string; arrived_at: string;
  referred_by_teacher_name: string | null;
  attended_by_staff_name: string | null; attended_by_teacher_name: string | null;
}

const OUTCOMES = [
  { value: 'returned_to_class',   label: 'Returned to class' },
  { value: 'sent_home',           label: 'Sent home' },
  { value: 'referred_to_hospital', label: 'Referred to hospital' },
  { value: 'admitted_in_clinic',  label: 'Admitted in clinic' },
  { value: 'other',               label: 'Other' },
];

export default function ClinicVisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState('returned_to_class');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    vitals_temp_c: '', vitals_bp: '', vitals_pulse: '',
    diagnosis_notes: '', treatment_given: '', notes: '',
  });

  function load() {
    setLoading(true);
    api.get<Visit>(`/api/clinic/visits/${id}`).then(r => {
      setVisit(r.data);
      setForm({
        vitals_temp_c: r.data.vitals_temp_c?.toString() ?? '',
        vitals_bp: r.data.vitals_bp ?? '',
        vitals_pulse: r.data.vitals_pulse?.toString() ?? '',
        diagnosis_notes: r.data.diagnosis_notes ?? '',
        treatment_given: r.data.treatment_given ?? '',
        notes: r.data.notes ?? '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function saveClinicalFields() {
    setSaving(true); setError('');
    try {
      await api.put(`/api/clinic/visits/${id}`, {
        vitals_temp_c: form.vitals_temp_c ? Number(form.vitals_temp_c) : null,
        vitals_bp: form.vitals_bp || null,
        vitals_pulse: form.vitals_pulse ? Number(form.vitals_pulse) : null,
        diagnosis_notes: form.diagnosis_notes || null,
        treatment_given: form.treatment_given || null,
        notes: form.notes || null,
      });
      load();
    } catch {
      setError('Could not save changes, try again');
    } finally {
      setSaving(false);
    }
  }

  async function closeVisit() {
    setClosing(true); setError('');
    try {
      await api.post(`/api/clinic/visits/${id}/close`, { outcome });
      load();
    } catch {
      setError('Could not close the visit, try again');
    } finally {
      setClosing(false);
    }
  }

  async function reopenVisit() {
    setClosing(true); setError('');
    try {
      await api.post(`/api/clinic/visits/${id}/reopen`);
      load();
    } catch {
      setError('Could not reopen the visit, try again');
    } finally {
      setClosing(false);
    }
  }

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading…</p></div>;
  if (!visit) return <div className="p-6"><p className="text-sm text-red-500">Visit not found</p></div>;

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/clinic/visits')} className="text-xs text-slate-500 hover:text-slate-700 mb-1">&larr; Back to visits</button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{visit.patient_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {visit.patient_type === 'student' ? `${visit.student_code} · ${visit.class_name}` : `Staff · ${visit.teacher_code ?? ''}`}
            {' · '}{visit.visit_date}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => printClinicVisit(visit)}>Print slip</Button>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
            visit.status === 'open' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}>{visit.status}</span>
        </div>
      </div>

      {visit.referred_by_teacher_name && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Referred by {visit.referred_by_teacher_name}</p>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Complaint</label>
          <p className="text-sm text-slate-900 dark:text-white">{visit.complaint}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Temp (°C)</label>
            <input disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60"
              value={form.vitals_temp_c} onChange={e => setForm(p => ({ ...p, vitals_temp_c: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Blood pressure</label>
            <input disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60"
              value={form.vitals_bp} onChange={e => setForm(p => ({ ...p, vitals_bp: e.target.value }))} placeholder="120/80" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Pulse</label>
            <input disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60"
              value={form.vitals_pulse} onChange={e => setForm(p => ({ ...p, vitals_pulse: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Diagnosis notes</label>
          <textarea disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60" rows={2}
            value={form.diagnosis_notes} onChange={e => setForm(p => ({ ...p, diagnosis_notes: e.target.value }))} />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Treatment given</label>
          <textarea disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60" rows={2}
            value={form.treatment_given} onChange={e => setForm(p => ({ ...p, treatment_given: e.target.value }))} />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Notes</label>
          <textarea disabled={visit.status === 'closed'} className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60" rows={2}
            value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>

        {visit.status === 'open' && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={saveClinicalFields} loading={saving}>Save</Button>
          </div>
        )}
      </div>

      {visit.status === 'open' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Close this visit</h2>
          <select
            className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            value={outcome}
            onChange={e => setOutcome(e.target.value)}
          >
            {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={closeVisit} loading={closing}>Close visit</Button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Closed {visit.closed_at ? new Date(visit.closed_at).toLocaleString() : ''}, outcome: {OUTCOMES.find(o => o.value === visit.outcome)?.label ?? visit.outcome}
            </p>
            {visit.sms_sent && <p className="text-xs text-slate-500 mt-1">A parent/guardian notification was sent.</p>}
          </div>
          <Button variant="secondary" size="sm" onClick={reopenVisit} loading={closing}>Reopen</Button>
        </div>
      )}
    </div>
  );
}
