'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { ObservationCriterion, LessonObservationDetail } from '@/types/api';

const SCORE_LABELS: Record<number, string> = { 1: '1 — Ineffective', 2: '2 — Developing', 3: '3 — Effective', 4: '4 — Highly Effective' };

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';
const textareaCls = inputCls + ' resize-none';

export default function ObservationDetail({ apiClient, backHref, observationId }: {
  apiClient: AxiosInstance; backHref: string; observationId: string;
}) {
  const [obs, setObs] = useState<LessonObservationDetail | null>(null);
  const [criteria, setCriteria] = useState<ObservationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [scores, setScores] = useState<Record<string, { score: number | null; note: string }>>({});
  const [glow, setGlow] = useState('');
  const [grow, setGrow] = useState('');
  const [action, setAction] = useState('');
  const [evidence, setEvidence] = useState('');

  const [newActionDesc, setNewActionDesc] = useState('');
  const [newActionDue, setNewActionDue] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [obsRes, critRes] = await Promise.all([
        apiClient.get<LessonObservationDetail>(`/api/lesson-observation/${observationId}`),
        apiClient.get<ObservationCriterion[]>('/api/lesson-observation/criteria'),
      ]);
      setObs(obsRes.data);
      setCriteria(critRes.data);
      setGlow(obsRes.data.glow_notes || '');
      setGrow(obsRes.data.grow_notes || '');
      setAction(obsRes.data.recommended_action || '');
      setEvidence(obsRes.data.evidence_notes || '');
      const scoreMap: Record<string, { score: number | null; note: string }> = {};
      for (const s of obsRes.data.scores || []) scoreMap[s.criterion_id] = { score: s.score, note: s.note || '' };
      setScores(scoreMap);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load observation.');
    } finally { setLoading(false); }
  }, [apiClient, observationId]);

  useEffect(() => { load(); }, [load]);

  async function save(publish: boolean) {
    setSaving(true); setError('');
    try {
      const scoreArr = criteria.map(c => ({
        criterion_id: c.id,
        score: scores[c.id]?.score ?? null,
        note: scores[c.id]?.note || undefined,
      }));
      const { data } = await apiClient.patch<LessonObservationDetail>(`/api/lesson-observation/${observationId}`, {
        scores: scoreArr,
        glow_notes: glow, grow_notes: grow, recommended_action: action, evidence_notes: evidence,
        status: publish ? 'Completed' : undefined,
      });
      setObs(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function closeObservation() {
    if (!confirm('Close this observation? This marks it as fully done.')) return;
    try {
      const { data } = await apiClient.patch<LessonObservationDetail>(`/api/lesson-observation/${observationId}`, { status: 'Closed' });
      setObs(data);
    } catch { alert('Failed to close.'); }
  }

  async function addAction() {
    if (!newActionDesc.trim()) return;
    try {
      await apiClient.post(`/api/lesson-observation/${observationId}/actions`, { description: newActionDesc.trim(), due_date: newActionDue || undefined });
      setNewActionDesc(''); setNewActionDue('');
      load();
    } catch { alert('Failed to add action item.'); }
  }

  async function toggleAction(actionId: string, currentStatus: 'Open' | 'Done') {
    try {
      await apiClient.patch(`/api/lesson-observation/${observationId}/actions/${actionId}`, { status: currentStatus === 'Open' ? 'Done' : 'Open' });
      load();
    } catch { alert('Failed to update action item.'); }
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiClient.post(`/api/lesson-observation/${observationId}/photos`, { photo_base64: base64 });
      load();
    } catch { alert('Failed to upload photo.'); }
    finally { setUploadingPhoto(false); e.target.value = ''; }
  }

  async function removePhoto(photoId: string) {
    if (!confirm('Remove this photo?')) return;
    try { await apiClient.delete(`/api/lesson-observation/${observationId}/photos/${photoId}`); load(); }
    catch { alert('Failed to remove photo.'); }
  }

  async function downloadPdf() {
    try {
      const res = await apiClient.get(`/api/lesson-observation/${observationId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `lesson-observation-${observationId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Failed to download report.'); }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
    </div>
  );
  if (!obs) return <p className="text-sm text-red-600">{error || 'Observation not found.'}</p>;

  const editable = obs.status === 'Scheduled';

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={backHref} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back</Link>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{obs.observed_teacher_name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{obs.subject || 'Observation'} {obs.class_names ? `· ${obs.class_names}` : ''} · Observer: {obs.observer_name}</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{obs.status}</span>
          {!editable && (
            <button onClick={downloadPdf} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
              Download PDF
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">Rubric Scores</h2>
        <div className="space-y-3">
          {criteria.map(c => (
            <div key={c.id} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2 items-start border-b border-slate-50 dark:border-slate-700 pb-3 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.name}</p>
                {c.nts_domain && <p className="text-xs text-slate-400">{c.nts_domain}</p>}
                {editable ? (
                  <input className={inputCls + ' mt-1.5'} placeholder="Note (optional)"
                    value={scores[c.id]?.note || ''}
                    onChange={e => setScores(s => ({ ...s, [c.id]: { score: s[c.id]?.score ?? null, note: e.target.value } }))} />
                ) : (
                  scores[c.id]?.note && <p className="text-xs text-slate-500 mt-1">{scores[c.id].note}</p>
                )}
              </div>
              {editable ? (
                <select className={inputCls} value={scores[c.id]?.score ?? ''}
                  onChange={e => setScores(s => ({ ...s, [c.id]: { score: e.target.value ? Number(e.target.value) : null, note: s[c.id]?.note || '' } }))}>
                  <option value="">Not Observed</option>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{SCORE_LABELS[n]}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {scores[c.id]?.score ? SCORE_LABELS[scores[c.id].score as number] : 'Not Observed'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
        <div>
          <label className={labelCls}>What Went Well {editable && '*'}</label>
          {editable ? (
            <textarea className={textareaCls} rows={3} value={glow} onChange={e => setGlow(e.target.value)} placeholder="e.g. Strong board work, clear instructions…" />
          ) : <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.glow_notes || '—'}</p>}
        </div>
        <div>
          <label className={labelCls}>What to Work On {editable && '*'}</label>
          {editable ? (
            <textarea className={textareaCls} rows={3} value={grow} onChange={e => setGrow(e.target.value)} placeholder="e.g. Checking for understanding before moving on…" />
          ) : <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.grow_notes || '—'}</p>}
        </div>
        <div>
          <label className={labelCls}>Recommended Action {editable && '*'}</label>
          {editable ? (
            <textarea className={textareaCls} rows={2} value={action} onChange={e => setAction(e.target.value)} placeholder="The specific 'how' — e.g. use a thumbs-up/down check every 10 minutes" />
          ) : <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.recommended_action || '—'}</p>}
        </div>
        {editable && (
          <div>
            <label className={labelCls}>Observer Notes (private, not shown to the teacher)</label>
            <textarea className={textareaCls} rows={2} value={evidence} onChange={e => setEvidence(e.target.value)} />
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">Evidence Photos</h2>
          <label className="text-xs font-semibold cursor-pointer" style={{ color: '#145C44' }}>
            {uploadingPhoto ? 'Uploading…' : '+ Add Photo'}
            <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} disabled={uploadingPhoto} />
          </label>
        </div>
        {obs.photos.length === 0 ? <p className="text-sm text-slate-400">No photos attached.</p> : (
          <div className="flex flex-wrap gap-2">
            {obs.photos.map(p => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo_url} alt={p.caption || 'Evidence'} className="w-28 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
                <button onClick={() => removePhoto(p.id)}
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white text-xs rounded-full w-5 h-5 opacity-0 group-hover:opacity-100">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editable ? (
        <div className="flex justify-end gap-3">
          <button onClick={() => save(false)} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={() => save(true)} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#145C44' }}>
            {saving ? 'Publishing…' : 'Publish to Teacher'}
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Follow-Up Actions</h2>
            {obs.actions.map(a => (
              <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-slate-50 dark:border-slate-700 last:border-0">
                <input type="checkbox" checked={a.status === 'Done'} onChange={() => toggleAction(a.id, a.status)} className="mt-1" />
                <div className="flex-1">
                  <p className={`text-sm ${a.status === 'Done' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{a.description}</p>
                  {a.due_date && <p className="text-xs text-slate-400">Due {fmtDate(a.due_date)}</p>}
                </div>
              </div>
            ))}
            {obs.actions.length === 0 && <p className="text-sm text-slate-400">No action items yet.</p>}
            {obs.status !== 'Closed' && (
              <div className="flex gap-2 pt-2">
                <input className={inputCls} placeholder="New action item…" value={newActionDesc} onChange={e => setNewActionDesc(e.target.value)} />
                <input type="date" className={inputCls + ' max-w-[160px]'} value={newActionDue} onChange={e => setNewActionDue(e.target.value)} />
                <button onClick={addAction} className="px-4 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap" style={{ backgroundColor: '#145C44' }}>Add</button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">Teacher Response</h2>
            {obs.teacher_ack_at ? (
              <>
                <p className="text-xs text-slate-400">Acknowledged {fmtDate(obs.teacher_ack_at)}</p>
                {obs.teacher_comment && <p className="text-sm text-slate-700 dark:text-slate-200 italic">&ldquo;{obs.teacher_comment}&rdquo;</p>}
              </>
            ) : <p className="text-sm text-slate-400">Not yet acknowledged.</p>}
          </div>

          {obs.status !== 'Closed' && (
            <div className="flex justify-end">
              <button onClick={closeObservation} className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                Close Observation
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
