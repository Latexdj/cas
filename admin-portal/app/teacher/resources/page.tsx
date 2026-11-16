'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { teacherApi } from '@/lib/teacher-api';
import { WebsitesCard } from '@/components/teacher-resources/WebsitesCard';

interface SubjectApp { id: string; group_label: string; subject: string; url: string }

// Remembered per browser: the last choice and up to three recent apps.
const STORE = 'cas_t_subject_apps';
interface Saved { group?: string; appId?: string; recent?: string[] }
function readSaved(): Saved {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') as Saved; } catch { return {}; }
}
function writeSaved(s: Saved) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const fieldCls = 'w-full rounded-xl border border-[#E2D9CC] bg-white px-3 min-h-[48px] text-base text-[#2C2218] disabled:bg-[#F4EFE6] disabled:text-[#8C7E6E] focus:outline-none focus:ring-2 focus:ring-[#145C44]';

export default function TeacherResourcesPage() {
  const router = useRouter();
  const [apps,    setApps]    = useState<SubjectApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [group,   setGroup]   = useState('');
  const [appId,   setAppId]   = useState('');
  const [recent,  setRecent]  = useState<string[]>([]);

  useEffect(() => {
    teacherApi.get<SubjectApp[]>('/api/teacher-resources/subject-apps')
      .then(r => {
        setApps(r.data);
        const saved = readSaved();
        const ids = new Set(r.data.map(a => a.id));
        setRecent((saved.recent ?? []).filter(id => ids.has(id)));
        // Pre-select the last choice only if it still exists.
        const last = r.data.find(a => a.id === saved.appId);
        if (last) { setGroup(last.group_label); setAppId(last.id); }
        else if (saved.group && r.data.some(a => a.group_label === saved.group)) setGroup(saved.group);
      })
      .catch(() => setError('Could not load the subject apps. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  // Forms in the order the server sends them (by sort order).
  const groups = useMemo(() => [...new Set(apps.map(a => a.group_label))], [apps]);
  const subjects = useMemo(
    () => apps.filter(a => a.group_label === group).sort((a, b) => a.subject.localeCompare(b.subject)),
    [apps, group]
  );
  const chosen = apps.find(a => a.id === appId && a.group_label === group);
  const recentApps = recent.map(id => apps.find(a => a.id === id)).filter((a): a is SubjectApp => !!a);

  function chooseGroup(g: string) {
    setGroup(g); setAppId('');
    writeSaved({ ...readSaved(), group: g, appId: undefined });
  }
  function chooseApp(id: string) {
    setAppId(id);
    writeSaved({ ...readSaved(), group, appId: id });
  }

  // Runs as the link opens: remember it and count the launch.
  function launched(app: SubjectApp) {
    const next = [app.id, ...recent.filter(id => id !== app.id)].slice(0, 3);
    setRecent(next);
    writeSaved({ group: app.group_label, appId: app.id, recent: next });
    teacherApi.post(`/api/teacher-resources/subject-apps/${app.id}/launch`).catch(() => { /* counting only */ });
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-10" style={{ background: '#F4EFE6' }}>
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/teacher')} aria-label="Back to Today"
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC] shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2C2218]">Teaching resources</h1>
            <p className="text-sm text-[#6E6253]">Tools to help you plan and teach</p>
          </div>
        </div>

        <section className="bg-white rounded-2xl border border-[#E2D9CC] p-5 space-y-4" aria-labelledby="subject-apps">
          <div>
            <h2 id="subject-apps" className="text-lg font-bold text-[#2C2218]">Subject apps</h2>
            <p className="text-sm text-[#6E6253] mt-0.5">
              AI teaching assistants for each subject, built on Playlab. Pick your form and subject; the app opens in a new tab.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="h-12 rounded-xl bg-[#F4EFE6] animate-pulse" />
              <div className="h-12 rounded-xl bg-[#F4EFE6] animate-pulse" />
            </div>
          ) : error ? (
            <p className="text-sm text-[#B91C1C]">{error}</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-[#6E6253]">No subject apps have been added yet.</p>
          ) : (
            <>
              {recentApps.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-[#4A3F32] mb-2">Recent</p>
                  <div className="flex flex-wrap gap-2">
                    {recentApps.map(a => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => launched(a)}
                        className="inline-flex items-center min-h-[44px] px-3 rounded-xl border border-[#145C44]/30 bg-[#E8F4EE] text-sm font-semibold text-[#145C44]">
                        {a.subject}<span className="font-normal text-[#2D7A4F] ml-1">· {a.group_label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="sa-group" className="block text-sm font-semibold text-[#4A3F32] mb-1.5">Form or curriculum</label>
                <select id="sa-group" className={fieldCls} value={group} onChange={e => chooseGroup(e.target.value)}>
                  <option value="">Choose…</option>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="sa-subject" className="block text-sm font-semibold text-[#4A3F32] mb-1.5">Subject</label>
                <select id="sa-subject" className={fieldCls} value={chosen ? appId : ''} disabled={!group}
                  onChange={e => chooseApp(e.target.value)}>
                  <option value="">{group ? 'Choose a subject…' : 'Choose a form first'}</option>
                  {subjects.map(a => <option key={a.id} value={a.id}>{a.subject}</option>)}
                </select>
              </div>

              {chosen ? (
                <a href={chosen.url} target="_blank" rel="noopener noreferrer" onClick={() => launched(chosen)}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold text-white"
                  style={{ backgroundColor: '#145C44' }}>
                  Launch app
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
                  </svg>
                </a>
              ) : (
                <button type="button" disabled
                  className="w-full min-h-[48px] rounded-xl text-base font-semibold text-white opacity-50 cursor-not-allowed"
                  style={{ backgroundColor: '#145C44' }}>
                  Launch app
                </button>
              )}
            </>
          )}
        </section>

        <WebsitesCard />
      </div>
    </div>
  );
}
