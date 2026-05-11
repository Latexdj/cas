'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface SchoolSettings {
  name: string;
  code: string;
  primary_color: string;
  accent_color: string;
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg border border-white/20 shadow-sm flex-shrink-0" style={{ backgroundColor: color }} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>{label}</p>
        <p className="text-sm font-mono font-semibold" style={{ color: '#0F172A' }}>{color}</p>
      </div>
    </div>
  );
}

function AppPreview({ primary, accent }: { primary: string; accent: string }) {
  const textOnPrimary = '#ffffff';
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(15,23,42,0.12)', width: 200, fontFamily: 'system-ui' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-5" style={{ backgroundColor: primary }}>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs font-bold" style={{ color: textOnPrimary, opacity: 0.9 }}>Good day, Teacher</p>
            <p className="text-xs" style={{ color: textOnPrimary, opacity: 0.55 }}>Monday, 12 May</p>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: accent, color: '#fff' }}>T</div>
        </div>
      </div>
      {/* Stats card */}
      <div className="mx-3 -mt-3 rounded-xl p-3 bg-white mb-3" style={{ border: '1px solid #F1F5F9', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div className="flex justify-around">
          {[['4', 'Lessons'], ['2', 'Done'], ['2', 'Pending']].map(([n, l]) => (
            <div key={l} className="text-center">
              <p className="text-base font-bold" style={{ color: '#0F172A' }}>{n}</p>
              <p className="text-xs" style={{ color: '#94A3B8' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Slot card */}
      <div className="mx-3 rounded-xl overflow-hidden mb-3 flex" style={{ border: '1px solid #F1F5F9' }}>
        <div className="w-1" style={{ backgroundColor: accent }} />
        <div className="p-3 flex-1">
          <p className="text-xs" style={{ color: '#94A3B8' }}>08:00 – 09:00</p>
          <p className="text-sm font-bold" style={{ color: '#0F172A' }}>Mathematics</p>
          <p className="text-xs" style={{ color: '#64748B' }}>Form 2A</p>
        </div>
        <div className="pr-3 flex items-center">
          <div className="px-2 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: accent + '25', color: accent }}>Submit</div>
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex border-t" style={{ borderColor: '#F1F5F9', backgroundColor: '#fff' }}>
        {['Today', 'Submit', 'History', 'Profile'].map((t, i) => (
          <div key={t} className="flex-1 py-2 flex flex-col items-center gap-0.5">
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: i === 0 ? primary : 'transparent' }} />
            <p className="text-xs" style={{ color: i === 0 ? primary : '#94A3B8', fontWeight: i === 0 ? '700' : '400' }}>{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [settings,  setSettings]  = useState<SchoolSettings | null>(null);
  const [primary,   setPrimary]   = useState('#0B3D2E');
  const [accent,    setAccent]    = useState('#C8973A');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.get<SchoolSettings>('/api/admin/settings').then(r => {
      setSettings(r.data);
      setPrimary(r.data.primary_color);
      setAccent(r.data.accent_color);
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.patch('/api/admin/settings', { primary_color: primary, accent_color: accent });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* School info */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: '#64748B' }}>School Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>School Name</p>
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{settings?.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>School Code</p>
            <p className="text-sm font-mono font-bold px-2 py-0.5 rounded inline-block" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>{settings?.code}</p>
          </div>
        </div>
      </div>

      {/* Theme colors */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>App Theme Colors</h2>
        <p className="text-xs mb-6" style={{ color: '#94A3B8' }}>
          Choose your school colors. The teacher app will update automatically after teachers log out and back in.
        </p>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Pickers */}
          <div className="flex-1 space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#475569' }}>Primary Color</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="color"
                    value={primary}
                    onChange={e => setPrimary(e.target.value)}
                    className="w-14 h-14 rounded-xl cursor-pointer border-0 p-0.5"
                    style={{ border: '2px solid #E2E8F0' }}
                  />
                </div>
                <div className="flex-1">
                  <ColorSwatch color={primary} label="Primary" />
                  <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>Used for headers, nav bar, and tab indicators</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#475569' }}>Accent Color</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <input
                    type="color"
                    value={accent}
                    onChange={e => setAccent(e.target.value)}
                    className="w-14 h-14 rounded-xl cursor-pointer border-0 p-0.5"
                    style={{ border: '2px solid #E2E8F0' }}
                  />
                </div>
                <div className="flex-1">
                  <ColorSwatch color={accent} label="Accent" />
                  <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>Used for buttons, highlights, and action items</p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{error}</p>
            )}
            {saved && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>✓ Colors saved — teachers will see the new theme on next login.</p>
            )}

            <Button onClick={save} loading={saving} size="lg">
              Save Colors
            </Button>
          </div>

          {/* Live preview */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Live Preview</p>
            <AppPreview primary={primary} accent={accent} />
          </div>
        </div>
      </div>
    </div>
  );
}
