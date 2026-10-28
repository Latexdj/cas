'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { LessonObservationDetail } from '@/types/api';

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white resize-none';

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function MyObservationDetail({ apiClient, backHref, observationId }: {
  apiClient: AxiosInstance; backHref: string; observationId: string;
}) {
  const [obs, setObs] = useState<LessonObservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [acking, setAcking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<LessonObservationDetail>(`/api/lesson-observation/${observationId}`);
      setObs(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load.');
    } finally { setLoading(false); }
  }, [apiClient, observationId]);

  useEffect(() => { load(); }, [load]);

  async function acknowledge() {
    setAcking(true); setError('');
    try {
      await apiClient.post(`/api/lesson-observation/${observationId}/acknowledge`, { comment: comment || undefined });
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to acknowledge.');
    } finally { setAcking(false); }
  }

  async function toggleAction(actionId: string, currentStatus: 'Open' | 'Done') {
    try {
      await apiClient.patch(`/api/lesson-observation/${observationId}/actions/${actionId}`, { status: currentStatus === 'Open' ? 'Done' : 'Open' });
      load();
    } catch { alert('Failed to update action item.'); }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
    </div>
  );
  if (!obs) return <p className="text-sm text-red-600">{error || 'Observation not found.'}</p>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href={backHref} className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Back</Link>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{obs.subject || 'Lesson Observation'} {obs.class_names ? `· ${obs.class_names}` : ''}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Observed by {obs.observer_name} · {fmtDateTime(obs.observed_at || obs.scheduled_at)}</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      {obs.status === 'Scheduled' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">This observation hasn&apos;t happened yet. Feedback will appear here once it&apos;s conducted.</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">What Went Well</h2>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.glow_notes || '—'}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">What to Work On</h2>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.grow_notes || '—'}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Recommended Action</h2>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{obs.recommended_action || '—'}</p>
            </div>
          </div>

          {obs.photos.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Photos</h2>
              <div className="flex flex-wrap gap-2">
                {obs.photos.map(p => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.photo_url} alt={p.caption || 'Evidence'} className="w-28 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-600" />
                ))}
              </div>
            </div>
          )}

          {obs.actions.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-2">
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Action Items</h2>
              {obs.actions.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-slate-50 dark:border-slate-700 last:border-0">
                  <input type="checkbox" checked={a.status === 'Done'} onChange={() => toggleAction(a.id, a.status)} className="mt-1" />
                  <div>
                    <p className={`text-sm ${a.status === 'Done' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{a.description}</p>
                    {a.due_date && <p className="text-xs text-slate-400">Due {fmtDate(a.due_date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-3">
            {obs.teacher_ack_at ? (
              <>
                <p className="text-xs text-slate-400">You acknowledged this on {fmtDate(obs.teacher_ack_at)}</p>
                {obs.teacher_comment && <p className="text-sm text-slate-700 dark:text-slate-200 italic">&ldquo;{obs.teacher_comment}&rdquo;</p>}
              </>
            ) : obs.status === 'Completed' ? (
              <>
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Acknowledge This Feedback</h2>
                <textarea className={inputCls} rows={2} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Optional comment — add context or push back if needed…" />
                <div className="flex justify-end">
                  <button onClick={acknowledge} disabled={acking}
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#145C44' }}>
                    {acking ? 'Submitting…' : 'Acknowledge'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
