'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AxiosInstance } from 'axios';
import Link from 'next/link';
import type { LessonObservationListItem, ObservableTeacher, ObservationAnalytics, AcademicYear, TeacherLessonOption } from '@/types/api';

const STATUS_STYLES: Record<string, string> = {
  Scheduled:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Completed:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Acknowledged: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  Closed:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
  + ' border-slate-200 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

export default function ObservationWorkspace({ apiClient, basePath }: { apiClient: AxiosInstance; basePath: string }) {
  const [tab, setTab] = useState<'list' | 'analytics'>('list');
  const [observations, setObservations] = useState<LessonObservationListItem[]>([]);
  const [teachers, setTeachers] = useState<ObservableTeacher[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [analytics, setAnalytics] = useState<ObservationAnalytics | null>(null);
  const [analyticsYear, setAnalyticsYear] = useState('');
  const [analyticsSemester, setAnalyticsSemester] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [lessonOptions, setLessonOptions] = useState<TeacherLessonOption[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  const [form, setForm] = useState({
    observed_teacher_id: '', observation_type: 'drop_in' as 'drop_in' | 'scheduled',
    subject: '', class_names: '', timetable_id: '',
    academic_year_id: '', semester: '',
    scheduled_date: '', scheduled_time: '',
    entry_mode: 'live' as 'live' | 'paper_entered_later', observed_date: '',
  });

  const recentYears = academicYears.slice(0, 3);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [obsRes, teacherRes, yearsRes] = await Promise.all([
        apiClient.get<LessonObservationListItem[]>('/api/lesson-observation'),
        apiClient.get<ObservableTeacher[]>('/api/lesson-observation/observable-teachers'),
        apiClient.get<AcademicYear[]>('/api/academic-years'),
      ]);
      setObservations(obsRes.data);
      setTeachers(teacherRes.data);
      setAcademicYears(yearsRes.data);
      const current = yearsRes.data.find(y => y.is_current) || yearsRes.data[0];
      if (current) {
        setForm(f => ({ ...f, academic_year_id: f.academic_year_id || current.id, semester: f.semester || (current.current_semester ? String(current.current_semester) : '') }));
        setAnalyticsYear(y => y || current.id);
        setAnalyticsSemester(s => s || (current.current_semester ? String(current.current_semester) : ''));
      }
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to load.');
    } finally { setLoading(false); }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'analytics') return;
    const params: Record<string, string> = {};
    if (analyticsYear) params.academic_year_id = analyticsYear;
    if (analyticsSemester) params.semester = analyticsSemester;
    apiClient.get<ObservationAnalytics>('/api/lesson-observation/analytics', { params }).then(r => setAnalytics(r.data)).catch(() => {});
  }, [tab, apiClient, analyticsYear, analyticsSemester]);

  useEffect(() => {
    if (!adding || !form.observed_teacher_id) return;
    let cancelled = false;
    setLoadingLessons(true);
    const params: Record<string, string> = {};
    if (form.academic_year_id) params.academic_year_id = form.academic_year_id;
    if (form.semester) params.semester = form.semester;
    apiClient.get<TeacherLessonOption[]>(`/api/lesson-observation/teacher-lessons/${form.observed_teacher_id}`, { params })
      .then(r => { if (!cancelled) setLessonOptions(r.data); })
      .catch(() => { if (!cancelled) setLessonOptions([]); })
      .finally(() => { if (!cancelled) setLoadingLessons(false); });
    return () => { cancelled = true; };
  }, [adding, apiClient, form.observed_teacher_id, form.academic_year_id, form.semester]);

  async function createObservation() {
    if (!form.observed_teacher_id) { setError('Select a teacher to observe.'); return; }
    setSaving(true); setError('');
    try {
      const scheduled_at = form.observation_type === 'scheduled' && form.scheduled_date
        ? new Date(`${form.scheduled_date}T${form.scheduled_time || '08:00'}`).toISOString()
        : undefined;
      const observed_at = form.entry_mode === 'paper_entered_later' && form.observed_date
        ? new Date(form.observed_date).toISOString()
        : undefined;
      const { data } = await apiClient.post('/api/lesson-observation', {
        observed_teacher_id: form.observed_teacher_id,
        observation_type: form.observation_type,
        subject: form.subject || undefined,
        class_names: form.class_names || undefined,
        timetable_id: form.timetable_id || undefined,
        academic_year_id: form.academic_year_id || undefined,
        semester: form.semester ? Number(form.semester) : undefined,
        scheduled_at, observed_at,
        entry_mode: form.entry_mode,
      });
      setAdding(false);
      setForm(f => ({ ...f, observed_teacher_id: '', observation_type: 'drop_in', subject: '', class_names: '', timetable_id: '', scheduled_date: '', scheduled_time: '', entry_mode: 'live', observed_date: '' }));
      window.location.href = `${basePath}/${data.id}`;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create observation.');
    } finally { setSaving(false); }
  }

  async function deleteObservation(id: string) {
    if (!confirm('Delete this scheduled observation? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/api/lesson-observation/${id}`);
      setObservations(obs => obs.filter(o => o.id !== id));
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete observation.');
    } finally { setDeletingId(null); }
  }

  async function downloadBlankForm() {
    try {
      const res = await apiClient.get('/api/lesson-observation/blank-form/pdf', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'lesson-observation-blank-form.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { alert('Failed to download the blank form.'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Lesson Observation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Observe, score, and give feedback on teachers&apos; lessons.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadBlankForm}
            className="px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
            Download Blank Form (PDF)
          </button>
          <button onClick={() => { setAdding(a => !a); setError(''); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: adding ? '#64748B' : '#145C44' }}>
            {adding ? 'Cancel' : '+ New Observation'}
          </button>
        </div>
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">New Observation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Teacher *</label>
              <select className={inputCls} value={form.observed_teacher_id}
                onChange={e => setForm(f => ({ ...f, observed_teacher_id: e.target.value, subject: '', class_names: '', timetable_id: '' }))}>
                <option value="">Select a teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name} {t.department ? `(${t.department})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.observation_type}
                onChange={e => setForm(f => ({ ...f, observation_type: e.target.value as 'drop_in' | 'scheduled' }))}>
                <option value="drop_in">Drop-in (now)</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Academic Year</label>
              <select className={inputCls} value={form.academic_year_id}
                onChange={e => setForm(f => ({ ...f, academic_year_id: e.target.value }))}>
                <option value="">Select year…</option>
                {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Semester</label>
              <select className={inputCls} value={form.semester}
                onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}>
                <option value="">Select semester…</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Lesson (Subject &amp; Class)</label>
              <select className={inputCls} value={form.timetable_id}
                disabled={!form.observed_teacher_id || loadingLessons}
                onChange={e => {
                  const opt = lessonOptions.find(o => o.timetable_id === e.target.value);
                  setForm(f => ({ ...f, timetable_id: e.target.value, subject: opt?.subject || '', class_names: opt?.class_names || '' }));
                }}>
                <option value="">
                  {!form.observed_teacher_id ? 'Select a teacher first…' : loadingLessons ? 'Loading timetable…' : lessonOptions.length === 0 ? 'No timetable found — leave blank' : 'Select from timetable…'}
                </option>
                {lessonOptions.map(o => (
                  <option key={o.timetable_id} value={o.timetable_id}>{o.subject} — {o.class_names}</option>
                ))}
              </select>
              {!loadingLessons && form.observed_teacher_id && lessonOptions.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">This teacher has no timetable entries for the selected year/semester — the observation will be created without a subject/class.</p>
              )}
            </div>
            {form.observation_type === 'scheduled' && (
              <>
                <div>
                  <label className={labelCls}>Date *</label>
                  <input type="date" className={inputCls} value={form.scheduled_date}
                    onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input type="time" className={inputCls} value={form.scheduled_time}
                    onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} />
                </div>
              </>
            )}
            <div>
              <label className={labelCls}>Entry Mode</label>
              <select className={inputCls} value={form.entry_mode}
                onChange={e => setForm(f => ({ ...f, entry_mode: e.target.value as 'live' | 'paper_entered_later' }))}>
                <option value="live">Live (scoring now/later in-app)</option>
                <option value="paper_entered_later">Entered from paper form</option>
              </select>
            </div>
            {form.entry_mode === 'paper_entered_later' && (
              <div>
                <label className={labelCls}>Actual Lesson Date *</label>
                <input type="date" className={inputCls} value={form.observed_date}
                  onChange={e => setForm(f => ({ ...f, observed_date: e.target.value }))} />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <button onClick={createObservation} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#145C44' }}>
              {saving ? 'Creating…' : 'Create & Continue'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {(['list', 'analytics'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === t ? 'bg-[#145C44] text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {t === 'list' ? 'Observations' : 'Analytics'}
          </button>
        ))}
      </div>

      {error && !adding && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

      {tab === 'list' ? (
        loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
          </div>
        ) : observations.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-center py-16 text-sm text-slate-400">
            No observations yet.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    {['Teacher', 'Observer', 'Subject / Class', 'Year / Semester', 'Date', 'Status', 'Open Actions', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {observations.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{o.observed_teacher_name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{o.observer_name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{o.subject || '—'} {o.class_names ? `(${o.class_names})` : ''}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">{o.academic_year_name || '—'}{o.semester ? ` · Sem ${o.semester}` : ''}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">{fmtDateTime(o.observed_at || o.scheduled_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{o.open_actions > 0 ? `${o.open_actions} open` : '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                        <Link href={`${basePath}/${o.id}`} className="text-xs font-semibold" style={{ color: '#145C44' }}>
                          {o.status === 'Scheduled' ? 'Edit' : 'View'}
                        </Link>
                        {o.status === 'Scheduled' && (
                          <button onClick={() => deleteObservation(o.id)} disabled={deletingId === o.id}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">
                            {deletingId === o.id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Academic Year</label>
              <select className={inputCls + ' w-48'} value={analyticsYear} onChange={e => setAnalyticsYear(e.target.value)}>
                <option value="">All years</option>
                {recentYears.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Semester</label>
              <select className={inputCls + ' w-40'} value={analyticsSemester} onChange={e => setAnalyticsSemester(e.target.value)}>
                <option value="">Both semesters</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </div>
          </div>
          <AnalyticsPanel analytics={analytics} />
        </>
      )}
    </div>
  );
}

function AnalyticsPanel({ analytics }: { analytics: ObservationAnalytics | null }) {
  if (!analytics) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#145C44', borderTopColor: 'transparent' }} />
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-400">Open Action Items</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.actions.open}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-400">Closed Action Items</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{analytics.actions.done}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs text-slate-400">Overdue Action Items</p>
          <p className="text-2xl font-bold" style={{ color: analytics.actions.overdue > 0 ? '#DC2626' : undefined }}>{analytics.actions.overdue}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-1">Coverage — Who Hasn&apos;t Been Observed</h3>
        <p className="text-xs text-slate-400 mb-3">Sorted least-observed first, this academic year.</p>
        <div className="space-y-1.5">
          {analytics.coverage.map(c => (
            <div key={c.teacher_id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-700 last:border-0">
              <span className="text-slate-700 dark:text-slate-200">{c.teacher_name} {c.department ? <span className="text-slate-400 text-xs">({c.department})</span> : null}</span>
              <span className={`text-xs font-semibold ${c.observation_count === 0 ? 'text-red-500' : 'text-slate-400'}`}>
                {c.observation_count === 0 ? 'Never observed' : `${c.observation_count} time${c.observation_count !== 1 ? 's' : ''} · last ${fmt(c.last_observed_at)}`}
              </span>
            </div>
          ))}
          {analytics.coverage.length === 0 && <p className="text-sm text-slate-400">No teachers in scope.</p>}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Score Trend by Criterion</h3>
        <div className="space-y-2.5">
          {analytics.score_trend.map(s => (
            <div key={s.criterion_id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300">{s.criterion_name}</span>
                <span className="text-slate-400">{s.avg_score ?? '—'} avg · {s.n} score{s.n !== 1 ? 's' : ''}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-2 rounded-full" style={{ width: `${((s.avg_score ?? 0) / 4) * 100}%`, backgroundColor: '#145C44' }} />
              </div>
            </div>
          ))}
          {analytics.score_trend.length === 0 && <p className="text-sm text-slate-400">No scored observations yet.</p>}
        </div>
      </div>
    </div>
  );
}
