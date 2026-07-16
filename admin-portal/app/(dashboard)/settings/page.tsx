'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { GradeBoundary } from '@/types/api';

interface SchoolSettings {
  name: string;
  code: string;
  primary_color: string;
  accent_color: string;
  logo_url?: string | null;
  headmaster_signature_url?: string | null;
  period_duration_minutes: number;
  ca_percentage: number;
  vision?: string | null;
  mission?: string | null;
  core_values?: string | null;
}

function compressToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png', 0.9));
    };
    img.onerror = reject;
    img.src = url;
  });
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

/* ── Grade Boundaries section ── */
type GBExamBody = 'WAEC' | 'CTVET';

function GradeBoundariesCard() {
  const [activeBody, setActiveBody] = useState<GBExamBody>('WAEC');
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<'add' | 'edit' | null>(null);
  const [editRow,    setEditRow]    = useState<GradeBoundary | null>(null);
  const [form,       setForm]       = useState({ grade: '', min_pct: '', max_pct: '', remark: '', sort_order: '' });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [seeding,    setSeeding]    = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<GradeBoundary[]>('/api/grade-boundaries');
      setBoundaries(data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = boundaries.filter(b => b.exam_body === activeBody);

  function openAdd() {
    setForm({ grade: '', min_pct: '', max_pct: '', remark: '', sort_order: '' });
    setEditRow(null); setError(''); setModal('add');
  }
  function openEdit(b: GradeBoundary) {
    setForm({ grade: b.grade, min_pct: String(b.min_pct), max_pct: String(b.max_pct), remark: b.remark ?? '', sort_order: String(b.sort_order) });
    setEditRow(b); setError(''); setModal('edit');
  }

  async function save() {
    if (!form.grade.trim()) { setError('Grade label is required.'); return; }
    setSaving(true); setError('');
    try {
      const body = { grade: form.grade.trim(), min_pct: parseFloat(form.min_pct) || 0, max_pct: parseFloat(form.max_pct) || 100, remark: form.remark || null, sort_order: parseInt(form.sort_order) || 0, exam_body: activeBody };
      if (modal === 'add') await api.post('/api/grade-boundaries', body);
      else await api.put(`/api/grade-boundaries/${editRow!.id}`, body);
      setModal(null); await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, grade: string) {
    if (!confirm(`Delete grade "${grade}"?`)) return;
    try { await api.delete(`/api/grade-boundaries/${id}`); await load(); }
    catch { alert('Failed to delete.'); }
  }

  async function seedDefaults() {
    if (!confirm(`Reset ${activeBody} grades to defaults? This will overwrite current ${activeBody} boundaries.`)) return;
    setSeeding(true);
    try { await api.post('/api/grade-boundaries/seed', { exam_body: activeBody }); await load(); }
    catch { alert('Failed to reset.'); }
    finally { setSeeding(false); }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

  return (
    <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Grade Boundaries</h2>
      <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
        Set the percentage ranges and labels for each grade under WAEC and CTVET. Used to compute grades on report cards.
      </p>

      {/* Exam body toggle */}
      <div className="flex gap-1 p-1 rounded-xl mb-4 w-fit" style={{ backgroundColor: '#F1F5F9' }}>
        {(['WAEC', 'CTVET'] as GBExamBody[]).map(b => (
          <button key={b} onClick={() => setActiveBody(b)}
            className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ backgroundColor: activeBody === b ? '#FFFFFF' : 'transparent', color: activeBody === b ? '#0F172A' : '#64748B', boxShadow: activeBody === b ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {b}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center h-24 items-center">
          <div className="w-5 h-5 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #F1F5F9' }}>
            <table className="min-w-[520px] w-full text-sm">
              <thead style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                <tr>
                  {['Grade', 'Min %', 'Max %', 'Remark', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b, i) => (
                  <tr key={b.id} className="hover:bg-slate-50"
                    style={{ borderBottom: i < shown.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <td className="px-4 py-2.5 font-bold" style={{ color: '#0F172A' }}>{b.grade}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#64748B' }}>{b.min_pct}%</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#64748B' }}>{b.max_pct}%</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#94A3B8' }}>{b.remark ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(b)} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>Edit</button>
                        <button onClick={() => del(b.id, b.grade)} className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: '#94A3B8' }}>No grades set for {activeBody}. Add manually or reset to defaults.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={openAdd}>+ Add Grade</Button>
            <Button size="sm" variant="secondary" onClick={seedDefaults} loading={seeding}>
              Reset to {activeBody} Defaults
            </Button>
          </div>
        </div>
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'add' ? `Add ${activeBody} Grade` : 'Edit Grade'} maxWidth="max-w-sm">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grade Label *</label>
            <input className={inputCls} value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} placeholder="e.g. A1, B+, C" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Min % *</label>
              <input className={inputCls} type="number" min="0" max="100" step="0.5"
                value={form.min_pct} onChange={e => setForm(f => ({ ...f, min_pct: e.target.value }))} placeholder="e.g. 80" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max % *</label>
              <input className={inputCls} type="number" min="0" max="100" step="0.5"
                value={form.max_pct} onChange={e => setForm(f => ({ ...f, max_pct: e.target.value }))} placeholder="e.g. 100" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remark</label>
            <input className={inputCls} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="e.g. Excellent, Credit, Pass, Fail" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort Order</label>
            <input className={inputCls} type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} placeholder="Higher = shown first (e.g. 9 for A1)" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SettingsPage() {
  const logoFileRef = useRef<HTMLInputElement>(null);
  const sigFileRef  = useRef<HTMLInputElement>(null);
  const [settings,     setSettings]     = useState<SchoolSettings | null>(null);
  const [primary,      setPrimary]      = useState('#0B3D2E');
  const [accent,       setAccent]       = useState('#C8973A');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null);
  const [logoSaving,   setLogoSaving]   = useState(false);
  const [logoSaved,    setLogoSaved]    = useState(false);
  const [logoError,    setLogoError]    = useState('');
  const [sigUrl,       setSigUrl]       = useState<string | null>(null);
  const [sigSaving,    setSigSaving]    = useState(false);
  const [sigSaved,     setSigSaved]     = useState(false);
  const [sigError,     setSigError]     = useState('');

  // Period duration state
  const [periodMins,      setPeriodMins]      = useState(60);
  const [periodSaving,    setPeriodSaving]    = useState(false);
  const [periodSaved,     setPeriodSaved]     = useState(false);
  const [periodError,     setPeriodError]     = useState('');

  // CA percentage state
  const [caPct,     setCaPct]     = useState(30);
  const [caSaving,  setCaSaving]  = useState(false);
  const [caSaved,   setCaSaved]   = useState(false);
  const [caError,   setCaError]   = useState('');

  // School identity state
  const [vision,         setVision]         = useState('');
  const [mission,        setMission]        = useState('');
  const [coreValues,     setCoreValues]     = useState('');
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaved,  setIdentitySaved]  = useState(false);
  const [identityError,  setIdentityError]  = useState('');

  useEffect(() => {
    api.get<SchoolSettings>('/api/admin/settings').then(r => {
      setSettings(r.data);
      setPrimary(r.data.primary_color);
      setAccent(r.data.accent_color);
      setLogoUrl(r.data.logo_url ?? null);
      setSigUrl(r.data.headmaster_signature_url ?? null);
      setPeriodMins(r.data.period_duration_minutes ?? 60);
      setCaPct(r.data.ca_percentage ?? 30);
      setVision(r.data.vision ?? '');
      setMission(r.data.mission ?? '');
      setCoreValues(r.data.core_values ?? '');
    }).finally(() => setLoading(false));
  }, []);

  async function saveCaPercentage() {
    if (!caPct || caPct < 1 || caPct > 99) { setCaError('Must be between 1 and 99.'); return; }
    setCaSaving(true); setCaError(''); setCaSaved(false);
    try {
      await api.patch('/api/admin/settings/scheduling', { ca_percentage: caPct });
      setCaSaved(true);
      setTimeout(() => setCaSaved(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCaError(msg ?? 'Failed to save.');
    } finally { setCaSaving(false); }
  }

  async function savePeriodDuration() {
    if (!periodMins || periodMins < 1 || periodMins > 480) {
      setPeriodError('Must be between 1 and 480 minutes.');
      return;
    }
    setPeriodSaving(true); setPeriodError(''); setPeriodSaved(false);
    try {
      await api.patch('/api/admin/settings/scheduling', { period_duration_minutes: periodMins });
      setPeriodSaved(true);
      setTimeout(() => setPeriodSaved(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPeriodError(msg ?? 'Failed to save.');
    } finally { setPeriodSaving(false); }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoSaving(true); setLogoError(''); setLogoSaved(false);
    try {
      const dataUrl = await compressToBase64(file);
      const res = await api.patch('/api/admin/settings/logo', { imageBase64: dataUrl });
      setLogoUrl(res.data.logo_url);
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 3000);
    } catch {
      setLogoError('Failed to upload logo. Please try again.');
    } finally {
      setLogoSaving(false);
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  }

  async function handleSignatureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSigSaving(true); setSigError(''); setSigSaved(false);
    try {
      const dataUrl = await compressToBase64(file);
      const res = await api.patch('/api/admin/settings/signature', { imageBase64: dataUrl });
      setSigUrl(res.data.headmaster_signature_url);
      setSigSaved(true);
      setTimeout(() => setSigSaved(false), 3000);
    } catch {
      setSigError('Failed to upload signature. Please try again.');
    } finally {
      setSigSaving(false);
      if (sigFileRef.current) sigFileRef.current.value = '';
    }
  }

  async function saveIdentity() {
    setIdentitySaving(true); setIdentityError(''); setIdentitySaved(false);
    try {
      await api.patch('/api/admin/settings/info', { vision, mission, core_values: coreValues });
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 3000);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIdentityError(msg ?? 'Failed to save.');
    } finally { setIdentitySaving(false); }
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.patch('/api/admin/settings', { primary_color: primary, accent_color: accent });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      if (status === 401) {
        setError('Session expired — please log out and log back in.');
      } else if (serverMsg) {
        setError(`${serverMsg}${status ? ` (${status})` : ''}`);
      } else {
        setError(`Failed to save. ${err.message ?? ''}`.trim());
      }
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

      {/* School Logo */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>School Logo</h2>
        <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
          Displayed in the teacher portal sidebar. Recommended: square image, at least 200×200 px.
        </p>
        <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
        <div className="flex items-center gap-5">
          {/* Current logo preview */}
          <div className="w-20 h-20 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ border: '2px dashed #E2E8F0', background: '#F8FAFC' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="School logo" className="w-full h-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8" style={{ color: '#CBD5E1' }}>
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <button
              onClick={() => logoFileRef.current?.click()}
              disabled={logoSaving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: '#15803D', color: '#15803D', background: '#F0FDF4' }}
            >
              {logoSaving ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-green-700 border-t-transparent animate-spin" />
                  Uploading...
                </span>
              ) : logoUrl ? 'Replace Logo' : 'Upload Logo'}
            </button>
            {logoSaved  && <p className="text-xs mt-2" style={{ color: '#15803D' }}>✓ Logo updated successfully.</p>}
            {logoError  && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{logoError}</p>}
            {!logoUrl   && !logoSaved && <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>No logo uploaded yet.</p>}
          </div>
        </div>
      </div>

      {/* Headmaster / Principal Signature */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Headmaster / Principal Signature</h2>
        <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
          Uploaded signature will be printed automatically on student report cards. Use a clear image on a white or transparent background.
        </p>
        <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />
        <div className="flex items-center gap-5">
          {/* Signature preview */}
          <div className="rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ width: '160px', height: '64px', border: '2px dashed #E2E8F0', background: '#F8FAFC' }}>
            {sigUrl ? (
              <img src={sigUrl} alt="Headmaster signature" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: '#CBD5E1' }}>
                <path d="M3 17c2-2 4-4 6-4s3 2 5 2 4-2 7-5" strokeLinecap="round" />
                <path d="M3 20h18" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="flex-1">
            <button
              onClick={() => sigFileRef.current?.click()}
              disabled={sigSaving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: '#15803D', color: '#15803D', background: '#F0FDF4' }}
            >
              {sigSaving ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-green-700 border-t-transparent animate-spin" />
                  Uploading...
                </span>
              ) : sigUrl ? 'Replace Signature' : 'Upload Signature'}
            </button>
            {sigSaved && <p className="text-xs mt-2" style={{ color: '#15803D' }}>✓ Signature updated successfully.</p>}
            {sigError && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{sigError}</p>}
            {!sigUrl  && !sigSaved && <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>No signature uploaded yet.</p>}
          </div>
        </div>
      </div>

      {/* School Identity */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>School Identity</h2>
        <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
          Used in report cards, certificates, and the admission portal. Provide your school&apos;s vision, mission, and core values.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#475569' }}>Vision Statement</label>
            <textarea rows={3} value={vision} onChange={e => setVision(e.target.value)}
              placeholder="e.g. To be a centre of excellence in holistic education…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#475569' }}>Mission Statement</label>
            <textarea rows={3} value={mission} onChange={e => setMission(e.target.value)}
              placeholder="e.g. To nurture confident, creative and responsible learners…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#475569' }}>Core Values</label>
            <textarea rows={2} value={coreValues} onChange={e => setCoreValues(e.target.value)}
              placeholder="e.g. Integrity, Excellence, Discipline, Respect, Innovation"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-green-600" />
          </div>
          {identityError && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{identityError}</p>}
          {identitySaved && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>✓ School identity saved.</p>}
          <Button onClick={saveIdentity} loading={identitySaving}>Save Identity</Button>
        </div>
      </div>

      {/* Period Duration */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Scheduling</h2>
        <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
          Set how many minutes make up one period at your school. This is used to calculate periods
          from timetable start and end times, with break times automatically deducted.
        </p>

        <div className="max-w-xs space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#475569' }}>
              Minutes per Period
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={480}
                value={periodMins}
                onChange={e => { setPeriodMins(parseInt(e.target.value, 10) || 0); setPeriodError(''); }}
                className="w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-sm text-slate-500">minutes</span>
            </div>
            {periodMins >= 1 && (
              <p className="text-xs mt-2" style={{ color: '#64748B' }}>
                {periodMins < 60
                  ? `${periodMins} min per period`
                  : periodMins === 60
                    ? '1 hour per period'
                    : periodMins % 60 === 0
                      ? `${periodMins / 60} hours per period`
                      : `${Math.floor(periodMins / 60)}h ${periodMins % 60}min per period`}
              </p>
            )}
          </div>

          {periodError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{periodError}</p>
          )}
          {periodSaved && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>✓ Period duration saved.</p>
          )}

          <Button onClick={savePeriodDuration} loading={periodSaving}>
            Save Period Duration
          </Button>
        </div>
      </div>

      {/* Assessment CA % */}
      <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}>Assessment Scoring</h2>
        <p className="text-xs mb-5" style={{ color: '#94A3B8' }}>
          Set the percentage of the total score that comes from Continuous Assessment (CA). The remainder is for the End-of-Semester Exam.
        </p>
        <div className="max-w-xs space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#475569' }}>
              CA Percentage
            </label>
            <div className="flex items-center gap-3">
              <input type="number" min={1} max={99} value={caPct}
                onChange={e => { setCaPct(parseInt(e.target.value, 10) || 0); setCaError(''); }}
                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            {caPct >= 1 && caPct <= 99 && (
              <p className="text-xs mt-2" style={{ color: '#64748B' }}>
                CA: <span className="font-semibold">{caPct}%</span> &nbsp;·&nbsp; Exam: <span className="font-semibold">{100 - caPct}%</span>
              </p>
            )}
          </div>
          {caError && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{caError}</p>}
          {caSaved && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#F0FDF4', color: '#15803D' }}>✓ CA percentage saved.</p>}
          <Button onClick={saveCaPercentage} loading={caSaving}>Save CA %</Button>
        </div>
      </div>

      {/* Grade Boundaries */}
      <GradeBoundariesCard />

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
