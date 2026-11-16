'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SubjectAppsManager, LIGHT } from '@/components/teacher-resources/SubjectAppsManager';
import { WebsitesManager } from '@/components/teacher-resources/WebsitesManager';

const TABS = [
  { key: 'apps',  label: 'Subject apps' },
  { key: 'sites', label: 'Websites and tools' },
] as const;
type Tab = typeof TABS[number]['key'];
const TAB_KEY = 'cas_admin_teacher_resources_tab';

export default function TeacherResourcesAdminPage() {
  const [tab, setTab] = useState<Tab>('apps');
  useEffect(() => {
    try { const t = localStorage.getItem(TAB_KEY); if (t === 'apps' || t === 'sites') setTab(t); } catch { /* storage unavailable */ }
  }, []);
  function pick(t: Tab) { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ } }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-ink">Teacher Resources</h1>
        <p className="text-sm mt-0.5 text-ink-muted">What teachers can open from Resources in the teacher portal.</p>
      </div>
      <div role="tablist" aria-label="Resource type" className="flex gap-1 border-b border-line">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)}
            className={`px-3 min-h-[44px] text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-[#145C44] text-ink' : 'border-transparent text-ink-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'apps'
        ? <SubjectAppsManager client={api} mode="school" P={LIGHT} />
        : <WebsitesManager client={api} mode="school" P={LIGHT} />}
    </div>
  );
}
