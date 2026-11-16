'use client';

import { saApi } from '@/lib/super-admin-api';
import { SubjectAppsManager, type Palette } from '@/components/teacher-resources/SubjectAppsManager';

// Matches the super-admin portal's dark palette.
const DARK: Palette = {
  card: '#132B1C', border: '#2A3D28', sunken: '#0E1A0C',
  ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.55)',
  primary: '#C8973A', onPrimary: '#0E1A0C', link: '#E2C07A',
  good: '#7DD3A8', goodBg: 'rgba(125,211,168,0.14)', warn: '#E2C07A', warnBg: 'rgba(200,151,58,0.15)', bad: '#F87171',
  inputBg: '#0B1A0E',
};

export default function SharedSubjectAppsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>Subject Apps</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
          The shared Playlab subject apps in Teacher Resources.
        </p>
      </div>
      <SubjectAppsManager client={saApi} mode="shared" P={DARK} />
    </div>
  );
}
