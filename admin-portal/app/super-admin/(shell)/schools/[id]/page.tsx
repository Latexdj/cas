'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { saApi } from '@/lib/super-admin-api';

interface SchoolDetail {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  subscription_status: string;
  plan_name: string | null;
  display_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active_teachers: number;
  teacher_limit: number;
  total_attendance: number;
  last_submission: string | null;
  school_type: string | null;
  school_category: string | null;
}

interface ModuleItem {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  core: boolean;
  licensable: boolean;
}

const SCHOOL_TYPES = ['Nursery', 'KG', 'Primary', 'JHS', 'SHS', 'Technical', 'University', 'Other'];
const SCHOOL_CATEGORIES = ['Public', 'Private', 'International'];

// The licensable product rows shown on this screen. Foundation/attendance
// keys (teacher_attendance, timetable, etc.) are licensable:false in the
// registry and never appear here — they're always available, same tier as
// student records and academic years. "House Management" is the one row
// that maps to two underlying keys (houses + exeat), which some schools
// already have set independently of each other.
const LICENSABLE_ROWS: { label: string; keys: string[] }[] = [
  { label: 'Assessment',       keys: ['assessments'] },
  { label: 'Admission',        keys: ['admissions'] },
  { label: 'Accounts',         keys: ['fees'] },
  { label: 'Inventory',        keys: ['inventory'] },
  { label: 'Library',          keys: ['library'] },
  { label: 'LMS',              keys: ['lms'] },
  { label: 'Clearance',        keys: ['clearance'] },
  { label: 'House Management', keys: ['houses', 'exeat'] },
  { label: 'Administration',   keys: ['discipline'] },
];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(iso: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(iso); end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86400000);
}

function statusBadge(status: string) {
  if (status === 'active') return 'bg-green-900/50 text-[#5DAA82] border-green-800';
  if (status === 'trial')  return 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50';
  return 'bg-red-900/40 text-red-300 border-red-800';
}

export default function SchoolDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit info
  const [editName,     setEditName]     = useState('');
  const [editEmail,    setEditEmail]    = useState('');
  const [editPhone,    setEditPhone]    = useState('');
  const [editAddress,  setEditAddress]  = useState('');
  const [editNotes,    setEditNotes]    = useState('');
  const [editType,     setEditType]     = useState('SHS');
  const [editCategory, setEditCategory] = useState('Public');
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [saveErr,      setSaveErr]      = useState('');

  // Subscription actions
  const today = new Date().toISOString().slice(0, 10);
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [trialDays,     setTrialDays]     = useState('14');
  const [activateLimit, setActivateLimit] = useState('');
  const [activateStart, setActivateStart] = useState(today);
  const [activateEnd,   setActivateEnd]   = useState(oneYearLater);
  const [subLoading,    setSubLoading]    = useState(false);
  const [subMsg,        setSubMsg]        = useState('');
  const [subErr,        setSubErr]        = useState('');

  // Reset PIN
  const [newPin,      setNewPin]      = useState('');
  const [pinLoading,  setPinLoading]  = useState(false);
  const [pinMsg,      setPinMsg]      = useState('');
  const [pinErr,      setPinErr]      = useState('');

  // Teacher limit
  const [limitInput,   setLimitInput]   = useState('');
  const [limitLoading, setLimitLoading] = useState(false);
  const [limitMsg,     setLimitMsg]     = useState('');
  const [limitErr,     setLimitErr]     = useState('');

  // Typed delete
  const [deleteInput,   setDeleteInput]   = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteErr,     setDeleteErr]     = useState('');

  // Modules
  const [modules,        setModules]        = useState<ModuleItem[]>([]);
  const [moduleRowSaving, setModuleRowSaving] = useState<Record<string, boolean>>({});
  const [moduleMsg,      setModuleMsg]      = useState('');
  const [moduleErr,      setModuleErr]      = useState('');
  const [expandedRow,    setExpandedRow]    = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    try {
      const res = await saApi.get(`/api/schools/${id}/modules`);
      setModules(res.data);
    } catch {
      // silently ignore
    }
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saApi.get(`/api/schools/${id}`);
      const s = res.data;
      setSchool(s);
      setEditName(s.name ?? '');
      setEditEmail(s.email ?? '');
      setEditPhone(s.phone ?? '');
      setEditAddress(s.address ?? '');
      setEditNotes(s.notes ?? '');
      setEditType(s.school_type ?? 'SHS');
      setEditCategory(s.school_category ?? 'Public');
      setActivateLimit(String(s.teacher_limit ?? 10));
      if (s.starts_at) setActivateStart(s.starts_at.slice(0, 10));
      if (s.ends_at)   setActivateEnd(s.ends_at.slice(0, 10));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    load();
    loadModules();
  }, [load, loadModules]);

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveMsg(''); setSaveErr('');
    try {
      await saApi.put(`/api/schools/${id}`, {
        name:            editName.trim()    || undefined,
        email:           editEmail.trim()   || undefined,
        phone:           editPhone.trim()   || undefined,
        address:         editAddress.trim() || undefined,
        notes:           editNotes,
        school_type:     editType,
        school_category: editCategory,
      });
      setSaveMsg('Saved successfully.');
      await load();
    } catch (err: unknown) {
      setSaveErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  function applyDuration(months: number) {
    const start = activateStart || new Date().toISOString().slice(0, 10);
    const end   = new Date(new Date(start).setMonth(new Date(start).getMonth() + months));
    setActivateEnd(end.toISOString().slice(0, 10));
  }

  async function handleActivate() {
    const limit = parseInt(activateLimit);
    if (!limit || limit < 10) { setSubErr('Teacher limit must be at least 10.'); return; }
    if (!activateEnd)          { setSubErr('Subscription end date is required.'); return; }
    if (activateEnd <= activateStart) { setSubErr('End date must be after start date.'); return; }
    setSubLoading(true); setSubMsg(''); setSubErr('');
    try {
      await saApi.post(`/api/schools/${id}/activate`, {
        teacherLimit: limit,
        startsAt: activateStart,
        endsAt:   activateEnd,
      });
      setSubMsg(`Activated on paid plan · ${activateStart} → ${activateEnd} · ${limit} teachers.`);
      await load();
    } catch (err: unknown) {
      setSubErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setSubLoading(false); }
  }

  async function handleUpdateSubscription() {
    const limit = parseInt(activateLimit);
    if (!limit || limit < 10) { setSubErr('Teacher limit must be at least 10.'); return; }
    setSubLoading(true); setSubMsg(''); setSubErr('');
    try {
      await saApi.patch(`/api/schools/${id}/subscription`, {
        startsAt:     activateStart || undefined,
        endsAt:       activateEnd   || undefined,
        teacherLimit: limit,
      });
      setSubMsg('Subscription period updated.');
      await load();
    } catch (err: unknown) {
      setSubErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setSubLoading(false); }
  }

  async function handleRevertToTrial() {
    const days = parseInt(trialDays) || 14;
    setSubLoading(true); setSubMsg(''); setSubErr('');
    try {
      await saApi.post(`/api/schools/${id}/revert-to-trial`, { days });
      setSubMsg(`Reverted to trial (${days} days).`);
      await load();
    } catch (err: unknown) {
      setSubErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setSubLoading(false); }
  }

  async function handleExtendTrial() {
    const days = parseInt(trialDays) || 14;
    setSubLoading(true); setSubMsg(''); setSubErr('');
    try {
      await saApi.post(`/api/schools/${id}/extend-trial`, { days });
      setSubMsg(`Trial extended by ${days} days.`);
      await load();
    } catch (err: unknown) {
      setSubErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setSubLoading(false); }
  }

  async function handleResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!newPin.trim()) { setPinErr('PIN is required.'); return; }
    if (!/^\d{4,8}$/.test(newPin)) { setPinErr('PIN must be 4–8 digits.'); return; }
    setPinLoading(true); setPinMsg(''); setPinErr('');
    try {
      await saApi.post(`/api/schools/${id}/reset-admin-pin`, { pin: newPin.trim() });
      setPinMsg('Admin PIN reset successfully.');
      setNewPin('');
    } catch (err: unknown) {
      setPinErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to reset PIN.');
    } finally { setPinLoading(false); }
  }

  async function handleUpdateLimit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(limitInput);
    if (!n || n < 10) { setLimitErr('Limit must be at least 10.'); return; }
    setLimitLoading(true); setLimitMsg(''); setLimitErr('');
    try {
      await saApi.patch(`/api/schools/${id}/teacher-limit`, { teacherLimit: n });
      setLimitMsg(`Teacher limit updated to ${n}.`);
      setLimitInput('');
      await load();
    } catch (err: unknown) {
      setLimitErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update limit.');
    } finally { setLimitLoading(false); }
  }

  async function handleDelete() {
    if (deleteInput !== school?.name) { setDeleteErr('School name does not match.'); return; }
    setDeleteLoading(true); setDeleteErr('');
    try {
      await saApi.delete(`/api/schools/${id}`);
      router.replace('/super-admin/schools');
    } catch (err: unknown) {
      setDeleteErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete.');
      setDeleteLoading(false);
    }
  }

  function getModuleEnabled(key: string): boolean {
    return modules.find(m => m.key === key)?.enabled ?? false;
  }

  // 'on' / 'off' when every key in the row agrees, 'partial' when they don't
  // (e.g. a school with houses=true, exeat=false) — shown explicitly rather
  // than collapsed into a single misleading state.
  function rowState(row: { keys: string[] }): 'on' | 'off' | 'partial' {
    const states = row.keys.map(getModuleEnabled);
    if (states.every(s => s)) return 'on';
    if (states.every(s => !s)) return 'off';
    return 'partial';
  }

  async function patchModuleKeys(rowLabel: string, updates: { key: string; enabled: boolean }[]) {
    setModuleRowSaving(prev => ({ ...prev, [rowLabel]: true }));
    setModuleMsg(''); setModuleErr('');
    try {
      await saApi.patch(`/api/schools/${id}/modules`, { updates });
      setModules(prev => prev.map(m => {
        const u = updates.find(x => x.key === m.key);
        return u ? { ...m, enabled: u.enabled } : m;
      }));
      setModuleMsg(`${rowLabel} updated.`);
    } catch (err: unknown) {
      setModuleErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? `Failed to update ${rowLabel}.`);
    } finally {
      setModuleRowSaving(prev => ({ ...prev, [rowLabel]: false }));
    }
  }

  // Clicking the collapsed row toggle: if both keys already agree, flip both
  // together. If they disagree (partial), resolve by turning both ON —
  // the same "don't take away access a school might already be using"
  // posture as the Phase 0 backfill — rather than guessing which one the
  // super admin meant to keep.
  function handleRowToggle(row: { label: string; keys: string[] }) {
    const state = rowState(row);
    const nextEnabled = state !== 'on'; // 'off' or 'partial' -> turn both on; 'on' -> turn both off
    patchModuleKeys(row.label, row.keys.map(key => ({ key, enabled: nextEnabled })));
  }

  function handleSubKeyToggle(rowLabel: string, key: string) {
    patchModuleKeys(rowLabel, [{ key, enabled: !getModuleEnabled(key) }]);
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-800 rounded-xl animate-pulse" />)}
    </div>
  );

  if (!school) return (
    <div className="p-6 text-center text-slate-400">School not found.</div>
  );

  const badge = statusBadge(school.subscription_status);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/super-admin/schools')}
          className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center mt-0.5 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-white truncate">{school.name}</h1>
            <span className="font-mono text-sm font-bold text-[#C8973A] bg-[#0B3D2E]/40 px-2 py-0.5 rounded-lg">{school.code}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge}`}>
              {school.subscription_status === 'active' ? 'Paid' : school.subscription_status === 'trial' ? 'Trial' : 'Expired'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Created {fmtDate(school.created_at)}</p>
        </div>
      </div>

      {/* Usage metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-[#C8973A]">
            {school.active_teachers}
            <span className="text-sm font-normal text-slate-500">/{school.teacher_limit}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Active Teachers</p>
          <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((school.active_teachers / school.teacher_limit) * 100))}%`,
                backgroundColor: school.active_teachers >= school.teacher_limit ? '#f87171' : '#818cf8',
              }}
            />
          </div>
        </div>
        {[
          { label: 'Total Attendance', value: school.total_attendance.toLocaleString(), color: '#4ade80' },
          { label: 'Last Submission',  value: fmtDate(school.last_submission), color: '#94a3b8' },
        ].map(m => (
          <div key={m.label} className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
            <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Edit info + notes */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <p className="text-xs font-bold font-medium text-slate-400 mb-4">School Information</p>
        <form onSubmit={handleSaveInfo} className="space-y-3">
          {[
            { label: 'Name',    value: editName,    set: setEditName },
            { label: 'Email',   value: editEmail,   set: setEditEmail,   type: 'email' },
            { label: 'Phone',   value: editPhone,   set: setEditPhone },
            { label: 'Address', value: editAddress, set: setEditAddress },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
              <input type={f.type ?? 'text'} value={f.value}
                onChange={e => { f.set(e.target.value); setSaveMsg(''); setSaveErr(''); }}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8]"
              />
            </div>
          ))}

          {/* School Type + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">School Type</label>
              <select value={editType} onChange={e => { setEditType(e.target.value); setSaveMsg(''); setSaveErr(''); }}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8]">
                {SCHOOL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Category</label>
              <select value={editCategory} onChange={e => { setEditCategory(e.target.value); setSaveMsg(''); setSaveErr(''); }}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8]">
                {SCHOOL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Internal Notes</label>
            <textarea value={editNotes} rows={3}
              onChange={e => { setEditNotes(e.target.value); setSaveMsg(''); setSaveErr(''); }}
              placeholder="Billing notes, contact info, anything internal..."
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8] resize-none"
            />
          </div>
          {saveMsg && <p className="text-xs text-[#2ab289] bg-green-900/30 border border-green-800 rounded-lg px-3 py-2">{saveMsg}</p>}
          {saveErr && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">{saveErr}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#145C44] hover:bg-[#145C44] text-white font-semibold text-sm transition-colors disabled:opacity-40">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Modules */}
      {modules.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-xs font-bold font-medium text-slate-400 mb-1">Modules</p>
          <p className="text-xs text-slate-500 mb-4">
            Licensed features for this school. Turning a module off blocks new changes there
            immediately — existing data stays visible to the school&apos;s admin and nothing is
            lost if it&apos;s turned back on. Core features (student records, academic years,
            attendance) are always available and aren&apos;t shown here.
          </p>
          <div className="space-y-2">
            {LICENSABLE_ROWS.map(row => {
              const state = rowState(row);
              const saving = !!moduleRowSaving[row.label];
              const multiKey = row.keys.length > 1;
              const isExpanded = expandedRow === row.label;
              return (
                <div key={row.label} className="rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleRowToggle(row)}
                      title={state === 'partial' ? 'Houses and Exeat disagree — click to enable both' : undefined}
                      className={[
                        'relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-40',
                        state === 'on' ? 'bg-[#145C44]' : state === 'partial' ? 'bg-amber-600' : 'bg-slate-600',
                      ].join(' ')}
                    >
                      <span className={[
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                        state === 'off' ? 'translate-x-0.5' : 'translate-x-5',
                      ].join(' ')} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white">{row.label}</span>
                        {state === 'partial' && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-900/40 px-1.5 py-0.5 rounded">
                            Partially enabled
                          </span>
                        )}
                      </div>
                    </div>
                    {multiKey && (
                      <button
                        type="button"
                        onClick={() => setExpandedRow(isExpanded ? null : row.label)}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline flex-shrink-0"
                      >
                        {isExpanded ? 'Hide details' : 'Details'}
                      </button>
                    )}
                  </div>
                  {multiKey && isExpanded && (
                    <div className="border-t border-slate-700 bg-slate-950/40 px-3 py-2 space-y-1.5">
                      {row.keys.map(key => {
                        const on = getModuleEnabled(key);
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-xs text-slate-300 capitalize">{key}</span>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSubKeyToggle(row.label, key)}
                              className={[
                                'relative w-9 h-5 rounded-full transition-colors disabled:opacity-40',
                                on ? 'bg-[#145C44]' : 'bg-slate-600',
                              ].join(' ')}
                            >
                              <span className={[
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                                on ? 'translate-x-4' : 'translate-x-0.5',
                              ].join(' ')} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {moduleMsg && <p className="text-xs text-[#2ab289] bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mt-3">{moduleMsg}</p>}
          {moduleErr && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-3">{moduleErr}</p>}
        </div>
      )}

      {/* Subscription */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <p className="text-xs font-bold font-medium text-slate-400 mb-4">Subscription</p>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-white">{school.display_name ?? school.plan_name ?? 'No plan'}</p>
            <p className="text-xs text-slate-400">
              {school.subscription_status === 'active'
                ? school.ends_at
                  ? `Paid · ${fmtDate(school.starts_at)} → ${fmtDate(school.ends_at)} (${daysUntil(school.ends_at)} days left)`
                  : `Paid · started ${fmtDate(school.starts_at)} · no expiry set`
                : school.ends_at
                  ? `${school.subscription_status === 'trial' ? 'Trial' : 'Expired'} · ends ${fmtDate(school.ends_at)} (${daysUntil(school.ends_at)} days)`
                  : 'No subscription'}
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge}`}>
            {school.subscription_status === 'active' ? 'Paid' : school.subscription_status === 'trial' ? 'Trial' : 'Expired'}
          </span>
        </div>

        <div className="space-y-3">
          {/* ── Subscription period form (shown for ALL statuses) ── */}
          <div className="bg-slate-900/60 rounded-xl p-4 space-y-3 border border-slate-600">
            <p className="text-[10px] font-bold font-medium text-slate-400">
              {school.subscription_status === 'active' ? 'Update Subscription Period' : 'Activate Paid Plan'}
            </p>

            {/* Duration quick-select */}
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5">Quick duration</p>
              <div className="flex gap-1.5 flex-wrap">
                {([['1 mo', 1], ['3 mo', 3], ['6 mo', 6], ['1 yr', 12]] as [string, number][]).map(([label, months]) => (
                  <button key={label} type="button"
                    onClick={() => applyDuration(months)}
                    className="px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start / end dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Start date</label>
                <input type="date" value={activateStart}
                  onChange={e => { setActivateStart(e.target.value); setSubErr(''); }}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#145C44]" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">End date</label>
                <input type="date" value={activateEnd}
                  onChange={e => { setActivateEnd(e.target.value); setSubErr(''); }}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#145C44]" />
              </div>
            </div>

            {/* Teacher limit */}
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Teacher limit</label>
              <input type="number" value={activateLimit}
                onChange={e => { setActivateLimit(e.target.value); setSubErr(''); }}
                min="10" placeholder={`Current: ${school.teacher_limit}`}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#145C44]" />
            </div>

            {school.subscription_status === 'active' ? (
              <button onClick={handleUpdateSubscription} disabled={subLoading}
                className="w-full py-2 rounded-xl bg-[#145C44] hover:bg-[#145C44] text-white text-xs font-semibold disabled:opacity-40 transition-colors">
                {subLoading ? 'Saving...' : 'Save Subscription Period'}
              </button>
            ) : (
              <button onClick={handleActivate} disabled={subLoading}
                className="w-full py-2 rounded-xl bg-[#145C44] hover:bg-[#0B3D2E] text-white text-xs font-semibold disabled:opacity-40 transition-colors">
                {subLoading ? 'Activating...' : 'Activate Paid Plan'}
              </button>
            )}
          </div>

          {/* ── Revert to trial (paid → trial) ── */}
          {school.subscription_status === 'active' && (
            <button onClick={handleRevertToTrial} disabled={subLoading}
              className="w-full px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
              Revert to Trial
            </button>
          )}

          {/* ── Extend trial ── */}
          {school.subscription_status !== 'active' && (
            <div className="flex items-center gap-2">
              <input type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)}
                min="1" max="365" placeholder="Days"
                className="w-16 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none" />
              <button onClick={handleExtendTrial} disabled={subLoading}
                className="px-4 py-2 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
                Extend Trial
              </button>
            </div>
          )}
        </div>

        {subMsg && <p className="text-xs text-[#2ab289] bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mt-3">{subMsg}</p>}
        {subErr && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-3">{subErr}</p>}
      </div>

      {/* Teacher Limit */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <p className="text-xs font-bold font-medium text-slate-400 mb-1">Teacher Limit</p>
        <p className="text-xs text-slate-500 mb-4">
          Current limit: <span className="font-semibold text-white">{school.teacher_limit} teachers</span>
          {' '}({school.active_teachers} currently active).
          {school.active_teachers >= school.teacher_limit && (
            <span className="text-red-400 font-semibold"> Limit reached — new registrations are blocked.</span>
          )}
        </p>
        <form onSubmit={handleUpdateLimit} className="flex gap-2">
          <input
            type="number" value={limitInput}
            onChange={e => { setLimitInput(e.target.value); setLimitErr(''); setLimitMsg(''); }}
            placeholder={`New limit (min 10, current ${school.teacher_limit})`} min="10"
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8] placeholder-slate-500"
          />
          <button type="submit" disabled={limitLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
            {limitLoading ? '...' : 'Update'}
          </button>
        </form>
        {limitMsg && <p className="text-xs text-[#2ab289] bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mt-2">{limitMsg}</p>}
        {limitErr && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-2">{limitErr}</p>}
      </div>

      {/* Reset admin PIN */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <p className="text-xs font-bold font-medium text-slate-400 mb-4">Reset Admin PIN</p>
        <form onSubmit={handleResetPin} className="flex gap-2">
          <input type="text" value={newPin} onChange={e => { setNewPin(e.target.value); setPinErr(''); setPinMsg(''); }}
            placeholder="New PIN (4–8 digits)" maxLength={8}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#B8D9C8] placeholder-slate-500"
          />
          <button type="submit" disabled={pinLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
            {pinLoading ? '...' : 'Reset'}
          </button>
        </form>
        {pinMsg && <p className="text-xs text-[#2ab289] bg-green-900/30 border border-green-800 rounded-lg px-3 py-2 mt-2">{pinMsg}</p>}
        {pinErr && <p className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 mt-2">{pinErr}</p>}
      </div>

      {/* Danger zone */}
      <div className="bg-red-950/30 border border-red-900/60 rounded-xl p-5">
        <p className="text-xs font-bold font-medium text-red-500 mb-2">Danger Zone</p>
        <p className="text-xs text-slate-400 mb-4">
          Permanently deletes <span className="font-semibold text-red-300">{school.name}</span> and ALL its data — teachers, attendance, timetable, everything. This cannot be undone.
        </p>
        <p className="text-xs text-slate-400 mb-2">
          Type <span className="font-mono font-bold text-white">{school.name}</span> to confirm:
        </p>
        <input
          type="text" value={deleteInput}
          onChange={e => { setDeleteInput(e.target.value); setDeleteErr(''); }}
          placeholder="Type school name exactly..."
          className="w-full bg-slate-900 border border-red-900 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-600 placeholder-slate-500 mb-3"
        />
        {deleteErr && <p className="text-xs text-red-400 mb-2">{deleteErr}</p>}
        <button
          onClick={handleDelete}
          disabled={deleteLoading || deleteInput !== school.name}
          className="w-full py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-30"
        >
          {deleteLoading ? 'Deleting...' : 'Permanently Delete School'}
        </button>
      </div>
    </div>
  );
}
