'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { LessonObservationListItem } from '@/types/api';

const STATUS_STYLES: Record<string, string> = {
  Scheduled:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Completed:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Acknowledged: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Closed:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function fmtDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function MyObservations({ apiClient, basePath }: { apiClient: AxiosInstance; basePath: string }) {
  const [observations, setObservations] = useState<LessonObservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<LessonObservationListItem[]>('/api/lesson-observation');
      setObservations(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load.');
    } finally { setLoading(false); }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Observations</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Feedback from lesson observations conducted by your HOD or management.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
        </div>
      ) : observations.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
          No observations yet.
        </div>
      ) : (
        <div className="space-y-3">
          {observations.map(o => (
            <Link key={o.id} href={`${basePath}/${o.id}`}
              className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{o.subject || 'Lesson Observation'} {o.class_names ? `· ${o.class_names}` : ''}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Observed by {o.observer_name} · {fmtDateTime(o.observed_at || o.scheduled_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {o.open_actions > 0 && <span className="text-xs font-semibold text-amber-600">{o.open_actions} open action{o.open_actions !== 1 ? 's' : ''}</span>}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
