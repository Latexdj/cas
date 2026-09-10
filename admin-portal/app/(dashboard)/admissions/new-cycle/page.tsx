'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Settings {
  portal_slug?: string; admission_prefix?: string; admission_year?: number;
  next_sequence?: number; is_portal_open?: boolean; application_deadline?: string;
  admission_reporting_date?: string; website_title?: string;
}
interface UploadResult {
  inserted: number; skipped: number; year?: number;
  errors: { row: number; message: string }[];
}

const TOTAL_STEPS = 6;

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-green-600';

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className={`h-2 rounded-full transition-all ${
          i + 1 < current ? 'w-5 bg-[#145C44]' :
          i + 1 === current ? 'w-8 bg-[#145C44]' :
          'w-2 bg-slate-200'
        }`} />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NewCyclePage() {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<Settings>({});
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Step 1 state
  const [admYear,       setAdmYear]       = useState('');
  const [admPrefix,     setAdmPrefix]     = useState('');
  const [deadline,      setDeadline]      = useState('');
  const [reportingDate, setReportingDate] = useState('');
  const [step1Saving,   setStep1Saving]   = useState(false);
  const [step1Error,    setStep1Error]    = useState('');
  const [step1Done,     setStep1Done]     = useState(false);

  // Step 2 state
  const [seqValue,    setSeqValue]    = useState('1');
  const [seqSaving,   setSeqSaving]   = useState(false);
  const [seqError,    setSeqError]    = useState('');
  const [seqDone,     setSeqDone]     = useState(false);
  const [showSeqConfirm, setShowSeqConfirm] = useState(false);

  // Step 3 state
  const [closingSaving, setClosingSaving] = useState(false);
  const [closingError,  setClosingError]  = useState('');
  const [portalClosed,  setPortalClosed]  = useState(false);

  // Step 4 state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading,     setUploading]     = useState(false);
  const [uploadResult,  setUploadResult]  = useState<UploadResult | null>(null);
  const [uploadError,   setUploadError]   = useState('');

  // Step 5 state — manual checklist
  const [checks, setChecks] = useState({ houses: false, prospectus: false, letter: false, website: false });

  // Step 6 state
  const [openingSaving, setOpeningSaving] = useState(false);
  const [openingError,  setOpeningError]  = useState('');
  const [portalOpened,  setPortalOpened]  = useState(false);

  const load = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const { data } = await api.get<Settings>('/api/admin/admissions/settings');
      setSettings(data);
      setAdmYear(String(data.admission_year ?? ''));
      setAdmPrefix(data.admission_prefix ?? '');
      setDeadline(data.application_deadline ?? '');
      setReportingDate(data.admission_reporting_date ?? '');
      setPortalClosed(data.is_portal_open === false);
    } catch {}
    finally { setLoadingSettings(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── Step 1: Save year + prefix ─────────────────────────────────────────────
  async function saveStep1() {
    const yr = parseInt(admYear, 10);
    if (!admPrefix.trim())            return setStep1Error('Prefix is required.');
    if (!Number.isInteger(yr) || yr < 0 || yr > 99) return setStep1Error('Admission year must be a 2-digit number (0–99).');
    setStep1Saving(true); setStep1Error(''); setStep1Done(false);
    try {
      const { data } = await api.patch<Settings>('/api/admin/admissions/settings', {
        admission_prefix: admPrefix.trim().toUpperCase(),
        admission_year: yr,
        ...(deadline      ? { application_deadline: deadline }           : {}),
        ...(reportingDate ? { admission_reporting_date: reportingDate }  : {}),
      });
      setSettings(s => ({ ...s, ...data }));
      setStep1Done(true);
      setTimeout(() => setStep(2), 800);
    } catch (e: unknown) {
      setStep1Error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed.');
    } finally { setStep1Saving(false); }
  }

  // ── Step 2: Reset counter ──────────────────────────────────────────────────
  async function resetSeq() {
    const seq = parseInt(seqValue, 10);
    if (!Number.isInteger(seq) || seq < 1) return setSeqError('Enter a whole number ≥ 1.');
    setSeqSaving(true); setSeqError(''); setSeqDone(false);
    try {
      const { data } = await api.post<Settings>('/api/admin/admissions/settings/reset-sequence', { new_sequence: seq });
      setSettings(s => ({ ...s, next_sequence: data.next_sequence }));
      setSeqDone(true);
      setTimeout(() => setStep(3), 800);
    } catch (e: unknown) {
      setSeqError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Reset failed.');
    } finally { setSeqSaving(false); }
  }

  // ── Step 3: Close portal ───────────────────────────────────────────────────
  async function closePortal() {
    setClosingSaving(true); setClosingError('');
    try {
      await api.patch('/api/admin/admissions/settings', { is_portal_open: false });
      setSettings(s => ({ ...s, is_portal_open: false }));
      setPortalClosed(true);
    } catch (e: unknown) {
      setClosingError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setClosingSaving(false); }
  }

  // ── Step 4: Upload CSSPS ───────────────────────────────────────────────────
  async function uploadCSSPS() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setUploadError('Please select a file first.');
    setUploading(true); setUploadResult(null); setUploadError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post<UploadResult>('/api/admin/admissions/placement/upload', fd);
      setUploadResult(data);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: unknown) {
      setUploadError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  // ── Step 6: Open portal ────────────────────────────────────────────────────
  async function openPortal() {
    setOpeningSaving(true); setOpeningError('');
    try {
      await api.patch('/api/admin/admissions/settings', { is_portal_open: true });
      setSettings(s => ({ ...s, is_portal_open: true }));
      setPortalOpened(true);
    } catch (e: unknown) {
      setOpeningError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed.');
    } finally { setOpeningSaving(false); }
  }

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-t-transparent animate-spin" />
      </div>
    );
  }

  const nextAdmNo = `${(admPrefix || settings.admission_prefix || 'STU').toUpperCase()}${String(parseInt(seqValue) || 1).padStart(4,'0')}${String(parseInt(admYear) || settings.admission_year || 0).padStart(2,'0')}`;
  const portalUrl = settings.portal_slug ? `/admissions/${settings.portal_slug}` : null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
          <Link href="/admissions/settings" className="hover:text-slate-600 transition-colors">Admissions</Link>
          <span>›</span>
          <span className="text-slate-600">New Academic Year</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Start New Academic Year</h1>
        <p className="text-sm text-slate-400 mt-1">
          This wizard guides you through resetting the admissions module for a fresh intake cycle.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        <StepDots current={step} />
        <span className="text-xs text-slate-400">Step {step} of {TOTAL_STEPS}</span>
      </div>

      {/* ── Step 1: Year & Prefix ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Year &amp; Admission Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Update the year and prefix for the new intake cycle.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Admission Year (2-digit) *</label>
              <input className={inputCls} type="number" min="0" max="99" placeholder="26"
                value={admYear} onChange={e => setAdmYear(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Admission Prefix *</label>
              <input className={inputCls} placeholder="e.g. SASHTS"
                value={admPrefix} onChange={e => setAdmPrefix(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Application Deadline</label>
              <input className={inputCls} type="date"
                value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Reporting Date</label>
              <input className={inputCls} placeholder="e.g. 14th September 2026"
                value={reportingDate} onChange={e => setReportingDate(e.target.value)} />
            </div>
          </div>
          {admPrefix && admYear && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              First admission number of the new cycle:{' '}
              <span className="font-mono font-semibold text-slate-800">
                {admPrefix.toUpperCase()}0001{admYear.padStart(2,'0')}
              </span>
            </p>
          )}
          {step1Error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{step1Error}</p>}
          {step1Done  && <p className="rounded-lg bg-[#E8F4EE] px-3 py-2 text-xs text-[#145C44] font-semibold">✓ Settings saved.</p>}
          <div className="flex justify-end">
            <Button onClick={saveStep1} loading={step1Saving}>Save &amp; Continue</Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Reset Sequence ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Reset Admission Counter</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              The counter is currently at <strong>#{settings.next_sequence ?? '—'}</strong>.
              Set it to 1 so this year&apos;s first student receives{' '}
              <span className="font-mono">{nextAdmNo}</span>.
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">This only affects new admissions.</p>
            <p>Existing admission numbers are not changed. Numbers from the previous cycle remain in the system for historical records.</p>
          </div>

          {!showSeqConfirm ? (
            <div className="flex justify-between items-center">
              <button onClick={() => setStep(1)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
              <Button onClick={() => setShowSeqConfirm(true)}>Reset Counter…</Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Confirm reset</p>
              <div>
                <label className="text-xs font-semibold text-slate-500">Start counter from</label>
                <input type="number" min="1" className={inputCls}
                  value={seqValue} onChange={e => setSeqValue(e.target.value)} />
                <p className="mt-1 text-xs text-slate-400">
                  Next student receives: <span className="font-mono font-semibold">{nextAdmNo}</span>
                </p>
              </div>
              {seqError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{seqError}</p>}
              {seqDone  && <p className="rounded-lg bg-[#E8F4EE] px-3 py-2 text-xs text-[#145C44] font-semibold">✓ Counter reset.</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSeqConfirm(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
                  Cancel
                </button>
                <Button onClick={resetSeq} loading={seqSaving}>Confirm Reset</Button>
              </div>
            </div>
          )}

          {!showSeqConfirm && (
            <div className="flex justify-end">
              <button onClick={() => setStep(3)} className="text-xs text-[#145C44] font-semibold hover:underline">
                Skip (counter already reset) →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Confirm Portal Closed ──────────────────────────────────── */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Confirm Portal is Closed</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Make sure the portal is closed before uploading the new placement list.
            </p>
          </div>

          {settings.is_portal_open ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <span className="text-red-500 text-lg">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-red-700">Portal is currently open</p>
                  <p className="text-xs text-red-500 mt-0.5">Students can still submit applications. Close it before proceeding.</p>
                </div>
              </div>
              {closingError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{closingError}</p>}
              <div className="flex justify-between items-center">
                <button onClick={() => setStep(2)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
                <Button onClick={closePortal} loading={closingSaving}>Close Portal &amp; Continue</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-[#B8D9C8] bg-[#E8F4EE] px-4 py-3">
                <span className="text-[#145C44] text-lg">✓</span>
                <div>
                  <p className="text-sm font-semibold text-[#0B3D2E]">Portal is closed</p>
                  <p className="text-xs text-[#145C44] mt-0.5">No new applications can be submitted.</p>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={() => setStep(2)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
                <Button onClick={() => setStep(4)}>Continue</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 4: Upload CSSPS File ──────────────────────────────────────── */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Upload New CSSPS Placement List</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload the Excel or CSV file from CSSPS. This file will be tagged with year &apos;
              {String(settings.admission_year ?? 0).padStart(2,'0')}&apos; and will not overwrite prior years&apos; records.
            </p>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            Required columns: <span className="font-mono">IndexNo, FullName, DOB, Gender, Aggregate, Programme, ResidentialStatus</span>
          </p>

          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="text-sm text-slate-600 flex-1" />
            <Button onClick={uploadCSSPS} loading={uploading}>Upload</Button>
          </div>

          {uploadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</p>}
          {uploadResult && (
            <div className="rounded-xl border border-[#B8D9C8] bg-[#E8F4EE] px-4 py-3 space-y-1">
              <p className="text-sm text-[#0B3D2E] font-semibold">
                {uploadResult.inserted} student{uploadResult.inserted !== 1 ? 's' : ''} added to the placement list
                {uploadResult.year != null ? ` for year '${String(uploadResult.year).padStart(2,'0')}'` : ''}.
              </p>
              {uploadResult.skipped > 0 && <p className="text-xs text-amber-700">{uploadResult.skipped} row{uploadResult.skipped !== 1 ? 's' : ''} skipped.</p>}
              {uploadResult.errors.slice(0,5).map((e, i) => <p key={i} className="text-xs text-red-600">Row {e.row}: {e.message}</p>)}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(3)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
            <div className="flex items-center gap-3">
              {uploadResult && (
                <button onClick={() => setStep(5)} className="text-xs text-[#145C44] font-semibold hover:underline">
                  Continue →
                </button>
              )}
              {!uploadResult && (
                <button onClick={() => setStep(5)} className="text-xs text-slate-400 hover:text-slate-600">
                  Skip (upload from Placement page later) →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: Manual Checklist ───────────────────────────────────────── */}
      {step === 5 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Final Checks</h2>
            <p className="text-xs text-slate-400 mt-0.5">Tick each item to confirm you&apos;ve reviewed it before opening the portal.</p>
          </div>

          <div className="space-y-3">
            {([
              { key: 'houses',     label: 'Houses are configured',          desc: 'Check that house names are correct for this intake year.',           href: '/general-settings' },
              { key: 'prospectus', label: 'Prospectus PDFs are up to date', desc: 'Upload or verify the PDFs students will download.',                 href: '/admissions/prospectus' },
              { key: 'letter',     label: 'Letter template reviewed',        desc: 'Check the reporting requirements and body text for the new year.',  href: '/admissions/settings' },
              { key: 'website',    label: 'Portal website content updated',  desc: 'Title, tagline, welcome message, and banner image for 2025/2026.', href: '/admissions/settings' },
            ] as const).map(({ key, label, desc, href }) => (
              <label key={key} className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${checks[key] ? 'border-[#B8D9C8] bg-[#E8F4EE]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checks[key]}
                  onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded text-[#145C44] focus:ring-[#145C44]" />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${checks[key] ? 'text-[#0B3D2E]' : 'text-slate-700'}`}>{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                </div>
                <Link href={href} className="shrink-0 text-xs text-[#145C44] font-semibold hover:underline mt-0.5">
                  Review →
                </Link>
              </label>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1">
            <button onClick={() => setStep(4)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
            <Button onClick={() => setStep(6)}>All checked — Open Portal</Button>
          </div>
        </div>
      )}

      {/* ── Step 6: Open Portal ────────────────────────────────────────────── */}
      {step === 6 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-slate-800">Open the Admission Portal</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Everything is configured. Open the portal to allow students to start their applications.
            </p>
          </div>

          {!portalOpened ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-600">
                <p><strong>Year:</strong> &apos;{String(settings.admission_year ?? 0).padStart(2,'0')}&apos; &nbsp;|&nbsp; <strong>Prefix:</strong> {settings.admission_prefix ?? '—'} &nbsp;|&nbsp; <strong>Counter starts at:</strong> #{settings.next_sequence ?? '—'}</p>
                {settings.portal_slug && (
                  <p><strong>Portal URL:</strong> <span className="font-mono">/admissions/{settings.portal_slug}</span></p>
                )}
              </div>
              {openingError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{openingError}</p>}
              <div className="flex justify-between items-center">
                <button onClick={() => setStep(5)} className="text-xs text-slate-400 hover:text-slate-600">← Back</button>
                <Button onClick={openPortal} loading={openingSaving}>Open Portal Now</Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-[#B8D9C8] bg-[#E8F4EE] px-5 py-4 text-center space-y-1">
                <div className="text-3xl">🎉</div>
                <p className="text-base font-bold text-[#0B3D2E]">Portal is open!</p>
                <p className="text-xs text-[#145C44]">Students can now check their placement and begin their applications.</p>
              </div>
              <div className="flex gap-3">
                {portalUrl && (
                  <a href={portalUrl} target="_blank" rel="noreferrer"
                    className="flex-1 rounded-lg border border-[#B8D9C8] bg-white py-2 text-center text-sm font-semibold text-[#145C44] hover:bg-[#E8F4EE] transition-colors">
                    View Portal →
                  </a>
                )}
                <Link href="/admissions/applications"
                  className="flex-1 rounded-lg bg-[#145C44] py-2 text-center text-sm font-semibold text-white hover:bg-[#0B3D2E] transition-colors">
                  Go to Applications
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer hint */}
      {step < 6 && (
        <p className="text-center text-xs text-slate-400">
          You can always return to{' '}
          <Link href="/admissions/settings" className="text-[#145C44] font-semibold hover:underline">Portal Settings</Link>
          {' '}to change individual fields.
        </p>
      )}
    </div>
  );
}
