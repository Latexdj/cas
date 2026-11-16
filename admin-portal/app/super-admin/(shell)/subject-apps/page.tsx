'use client';

import { useState } from 'react';
import { saApi } from '@/lib/super-admin-api';
import { SubjectAppsManager, type Palette } from '@/components/teacher-resources/SubjectAppsManager';
import { WebsitesManager } from '@/components/teacher-resources/WebsitesManager';

// Matches the super-admin portal's dark palette.
const DARK: Palette = {
  card: '#132B1C', border: '#2A3D28', sunken: '#0E1A0C',
  ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.55)',
  primary: '#C8973A', onPrimary: '#0E1A0C', link: '#E2C07A',
  good: '#7DD3A8', goodBg: 'rgba(125,211,168,0.14)', warn: '#E2C07A', warnBg: 'rgba(200,151,58,0.15)', bad: '#F87171',
  inputBg: '#0B1A0E',
};

export default function SharedTeacherResourcesPage() {
  const [tab, setTab] = useState<'apps' | 'sites'>('apps');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>Teacher Resources</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
          The shared subject apps and websites every school&apos;s teachers see.
        </p>
      </div>
      <div role="tablist" aria-label="Resource type" style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${DARK.border}` }}>
        {([['apps', 'Subject apps'], ['sites', 'Websites and tools']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ minHeight: 44, padding: '0 12px', fontSize: 14, fontWeight: 600, background: 'transparent', cursor: 'pointer',
              color: tab === k ? '#FFFFFF' : DARK.muted, border: 'none', borderBottom: `2px solid ${tab === k ? DARK.primary : 'transparent'}`, marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'apps'
        ? <SubjectAppsManager client={saApi} mode="shared" P={DARK} />
        : <WebsitesManager client={saApi} mode="shared" P={DARK} />}
    </div>
  );
}
