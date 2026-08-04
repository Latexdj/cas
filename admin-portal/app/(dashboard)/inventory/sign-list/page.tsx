'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { buildSignListHtml, type SlRecipient, type SlSchool } from '@/lib/sign-list-print';

interface SlFilters {
  classes: string[];
  programs: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

interface RecipientsResponse {
  recipients: SlRecipient[];
  school: SlSchool;
  total: number;
}

export default function SignListPage() {
  const today = new Date().toISOString().split('T')[0];

  // Document config
  const [title,             setTitle]             = useState('');
  const [itemName,          setItemName]          = useState('');
  const [issueDate,         setIssueDate]         = useState(today);
  const [qtyPerPerson,      setQtyPerPerson]      = useState('1');
  const [notes,             setNotes]             = useState('');

  // Recipient type
  const [recipientType,     setRecipientType]     = useState<'students' | 'teachers'>('students');

  // Student filters
  const [className,         setClassName]         = useState('');
  const [programId,         setProgramId]         = useState('');
  const [gender,            setGender]            = useState('');
  const [residentialStatus, setResidentialStatus] = useState('');

  // Teacher filters
  const [departmentId,      setDepartmentId]      = useState('');
  const [teacherGender,     setTeacherGender]     = useState('');

  // Data
  const [filters,           setFilters]           = useState<SlFilters>({ classes: [], programs: [], departments: [] });
  const [count,             setCount]             = useState<number | null>(null);
  const [countLoading,      setCountLoading]      = useState(false);
  const [generating,        setGenerating]        = useState(false);
  const [error,             setError]             = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<SlFilters>('/api/inventory/sign-list/filters')
      .then(r => setFilters(r.data))
      .catch(() => {});
  }, []);

  // Debounce count refresh on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCountLoading(true);
      api.get<RecipientsResponse>('/api/inventory/sign-list/recipients', { params: buildParams() })
        .then(r => setCount(r.data.total))
        .catch(() => setCount(null))
        .finally(() => setCountLoading(false));
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientType, className, programId, gender, residentialStatus, departmentId, teacherGender]);

  function buildParams(): Record<string, string> {
    const p: Record<string, string> = { recipient_type: recipientType };
    if (recipientType === 'students') {
      if (className)         p.class_name         = className;
      if (programId)         p.program_id         = programId;
      if (gender)            p.gender             = gender;
      if (residentialStatus) p.residential_status = residentialStatus;
    } else {
      if (departmentId)  p.department_id = departmentId;
      if (teacherGender) p.gender        = teacherGender;
    }
    return p;
  }

  function buildFilterLabel(): string {
    const parts: string[] = [];
    if (recipientType === 'students') {
      parts.push(className || 'All Classes');
      if (programId) {
        const prog = filters.programs.find(x => x.id === programId);
        if (prog) parts.push(prog.name);
      }
      if (gender) parts.push(gender);
      if (residentialStatus) parts.push(residentialStatus + ' Students');
    } else {
      if (departmentId) {
        const dept = filters.departments.find(x => x.id === departmentId);
        if (dept) parts.push(dept.name);
      } else {
        parts.push('All Departments');
      }
      if (teacherGender) parts.push(teacherGender);
      parts.push('Teachers');
    }
    return parts.join(' · ');
  }

  async function handleGenerate() {
    if (!title.trim()) { setError('Please enter a document title.'); return; }
    setError('');
    setGenerating(true);
    try {
      const r = await api.get<RecipientsResponse>('/api/inventory/sign-list/recipients', { params: buildParams() });
      if (!r.data.recipients.length) {
        setError('No recipients match the current filters.');
        return;
      }
      const html = buildSignListHtml({
        title, itemName, issueDate, qtyPerPerson, notes,
        recipientType, filterLabel: buildFilterLabel(),
        recipients: r.data.recipients,
        school: r.data.school,
      });
      const w = window.open('', '_blank');
      if (!w) { setError('Pop-ups are blocked. Please allow pop-ups for this site and try again.'); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to generate sign list. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  const iCls = 'mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500';
  const lCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sign List Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Generate a printable sign sheet for students or staff to sign when items are distributed
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Config form ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 space-y-6">

          {/* Document details */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Document Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={lCls}>Document Title <span className="text-red-500">*</span></label>
                <input value={title} onChange={e => { setTitle(e.target.value); setError(''); }}
                  placeholder="e.g. Exercise Books — Term 2 Issue"
                  className={iCls} />
              </div>
              <div>
                <label className={lCls}>Item / Reference</label>
                <input value={itemName} onChange={e => setItemName(e.target.value)}
                  placeholder="Name of item being issued"
                  className={iCls} />
              </div>
              <div>
                <label className={lCls}>Issue Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Quantity per Person</label>
                <input type="number" min="1" value={qtyPerPerson}
                  onChange={e => setQtyPerPerson(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className={lCls}>Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Printed at top of sheet"
                  className={iCls} />
              </div>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-700" />

          {/* Recipient type + filters */}
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Recipients & Filters</h2>

            <div className="flex gap-2 mb-5">
              {(['students', 'teachers'] as const).map(t => (
                <button key={t} onClick={() => setRecipientType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    recipientType === t
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-green-400 dark:hover:border-green-600'
                  }`}>
                  {t === 'students' ? 'Students' : 'Teachers / Staff'}
                </button>
              ))}
            </div>

            {recipientType === 'students' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lCls}>Class</label>
                  <select value={className} onChange={e => setClassName(e.target.value)} className={iCls}>
                    <option value="">All Classes</option>
                    {filters.classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lCls}>Program</label>
                  <select value={programId} onChange={e => setProgramId(e.target.value)} className={iCls}>
                    <option value="">All Programs</option>
                    {filters.programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lCls}>Gender</label>
                  <select value={gender} onChange={e => setGender(e.target.value)} className={iCls}>
                    <option value="">All Genders</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className={lCls}>Residential Status</label>
                  <select value={residentialStatus} onChange={e => setResidentialStatus(e.target.value)} className={iCls}>
                    <option value="">Day &amp; Boarding</option>
                    <option value="Day">Day Students Only</option>
                    <option value="Boarding">Boarding Students Only</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lCls}>Department</label>
                  <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={iCls}>
                    <option value="">All Departments</option>
                    {filters.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lCls}>Gender</label>
                  <select value={teacherGender} onChange={e => setTeacherGender(e.target.value)} className={iCls}>
                    <option value="">All Genders</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Preview + Generate ────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Preview</h2>

            <div className="text-center py-5 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl mb-4">
              {countLoading ? (
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2"
                  style={{ borderColor: '#16A34A', borderTopColor: 'transparent' }} />
              ) : (
                <p className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">{count ?? '—'}</p>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {recipientType === 'students' ? 'students' : 'teachers'} match filters
              </p>
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 space-y-1 mb-4">
              <p className="font-semibold text-slate-500 dark:text-slate-400">Printed document includes:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>School logo and header</li>
                <li>Document title and item details</li>
                <li>Numbered recipient rows</li>
                <li>Signature column per person</li>
                <li>Store officer sign-off footer</li>
              </ul>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <button onClick={handleGenerate} disabled={generating || countLoading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {generating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 012-2h4l2 2h4a2 2 0 012 2v3M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                  </svg>
                  Generate &amp; Print
                </>
              )}
            </button>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Tip</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
              The sign list opens in a new tab. Use your browser&apos;s print dialog (Ctrl+P / Cmd+P) to print or save as PDF.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
