'use client';
import { useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface StudentResult { id: string; name: string; student_code: string; class_name: string; }
interface ReferralVisit {
  id: string; patient_name: string; complaint: string; status: string;
  outcome: string | null; visit_date: string;
}

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

export default function TeacherClinicPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentResult[]>([]);
  const [selected, setSelected] = useState<StudentResult | null>(null);
  const [complaint, setComplaint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<ReferralVisit | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      teacherApi.get<StudentResult[]>('/api/clinic/referral/students/search', { params: { q: query.trim() } })
        .then(r => setResults(r.data)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function submit() {
    if (!selected) { setError('Select the student you are referring.'); return; }
    if (!complaint.trim()) { setError('Describe the reason for the referral.'); return; }
    setSubmitting(true); setError('');
    try {
      const r = await teacherApi.post<ReferralVisit>('/api/clinic/referral', {
        student_id: selected.id,
        complaint: complaint.trim(),
      });
      setSent(r.data);
      setSelected(null); setQuery(''); setComplaint('');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not send the referral, try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.dark }}>Send to clinic</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>Refer a student to the school clinic. Clinic staff will complete the visit when the student arrives.</p>
      </div>

      {sent && (
        <div className="rounded-xl px-4 py-3 border" style={{ background: C.successBg, borderColor: C.border, color: C.success }}>
          {sent.patient_name} has been referred to the clinic.
        </div>
      )}

      <div className="rounded-xl border p-5 space-y-4" style={{ background: C.card, borderColor: C.border }}>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: C.border }}>
            <div>
              <p className="text-sm font-medium" style={{ color: C.dark }}>{selected.name}</p>
              <p className="text-xs" style={{ color: C.muted }}>{selected.student_code} · {selected.class_name}</p>
            </div>
            <button className="text-xs" style={{ color: C.muted }} onClick={() => setSelected(null)}>Change</button>
          </div>
        ) : (
          <div className="relative">
            <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: C.muted }}>Find student</label>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name or student code…"
              className="w-full rounded-lg px-3 py-2.5 text-sm border"
              style={{ borderColor: C.border, color: C.dark }}
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg shadow-lg max-h-48 overflow-y-auto border" style={{ background: C.card, borderColor: C.border }}>
                {results.map(s => (
                  <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-black/5" onClick={() => { setSelected(s); setResults([]); }}>
                    <p className="font-medium" style={{ color: C.dark }}>{s.name}</p>
                    <p className="text-xs" style={{ color: C.muted }}>{s.student_code} · {s.class_name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: C.muted }}>Reason for referral</label>
          <textarea
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            rows={3}
            placeholder="e.g. complained of a headache, fell during PE…"
            className="w-full rounded-lg px-3 py-2.5 text-sm border"
            style={{ borderColor: C.border, color: C.dark }}
          />
        </div>

        {error && <p className="text-sm" style={{ color: '#B83232' }}>{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: C.mid }}
        >
          {submitting ? 'Sending…' : 'Send to clinic'}
        </button>
      </div>
    </div>
  );
}
