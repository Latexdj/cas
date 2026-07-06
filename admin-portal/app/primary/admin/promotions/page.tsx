'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ClassInfo {
  class_name: string;
  sort_order: number;
  student_count: number;
}

interface StudentRow {
  id: string;
  surname: string;
  other_names: string | null;
  admission_number: string;
}

interface WizardRow {
  class_name: string;
  sort_order: number;
  student_count: number;
  action: 'promote' | 'graduate' | 'skip';
  target_class: string;
}

type TabId = 'promote' | 'graduate' | 'wizard';

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

function RosterList({ students, selectedIds, setSelectedIds, loading }: {
  students: StudentRow[];
  selectedIds: Set<string>;
  setSelectedIds: (s: Set<string>) => void;
  loading: boolean;
}) {
  if (loading) return <div className="text-center py-4 text-sm text-slate-400">Loading students…</div>;
  if (students.length === 0) return <div className="text-center py-4 text-sm text-slate-400">No active students in this class.</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500">
          {selectedIds.size} of {students.length} selected
          {selectedIds.size < students.length && (
            <span className="ml-1.5 text-amber-600">({students.length - selectedIds.size} will repeat)</span>
          )}
        </span>
        <div className="flex gap-3 text-xs">
          <button onClick={() => setSelectedIds(new Set(students.map(s => s.id)))}
            className="text-green-700 font-semibold hover:underline">Select all</button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-slate-500 font-semibold hover:underline">Deselect all</button>
        </div>
      </div>
      <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {students.map(s => (
          <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.has(s.id)}
              className="rounded border-slate-300 text-green-600 focus:ring-green-500"
              onChange={e => {
                const next = new Set(selectedIds);
                e.target.checked ? next.add(s.id) : next.delete(s.id);
                setSelectedIds(next);
              }}
            />
            <span className="text-sm text-slate-800 flex-1">
              {s.surname}{s.other_names ? `, ${s.other_names}` : ''}
            </span>
            <span className="text-xs text-slate-400 font-mono">{s.admission_number}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function PrimaryPromotionsPage() {
  const [tab, setTab] = useState<TabId>('promote');
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  // Promote tab
  const [fromClass, setFromClass]     = useState('');
  const [toClass, setToClass]         = useState('');
  const [roster, setRoster]           = useState<StudentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [promoteResult, setPromoteResult] = useState('');
  const [promoting, setPromoting]     = useState(false);

  // Graduate tab
  const [gradClass, setGradClass]           = useState('');
  const [gradRoster, setGradRoster]         = useState<StudentRow[]>([]);
  const [gradSelected, setGradSelected]     = useState<Set<string>>(new Set());
  const [loadingGradRoster, setLoadingGradRoster] = useState(false);
  const [gradResult, setGradResult]         = useState('');
  const [graduating, setGraduating]         = useState(false);

  // Wizard tab
  const [wizardRows, setWizardRows]   = useState<WizardRow[]>([]);
  const [wizardRunning, setWizardRunning] = useState(false);
  const [wizardLog, setWizardLog]     = useState('');

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const { data } = await api.get<ClassInfo[]>('/api/primary/students/classes');
      setClasses(data);
      setWizardRows(data.map((c, i) => ({
        ...c,
        action: i < data.length - 1 ? 'promote' : 'graduate',
        target_class: i < data.length - 1 ? data[i + 1].class_name : '',
      })));
    } catch { /* silent */ }
    finally { setLoadingClasses(false); }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Load roster for promote tab when fromClass changes
  useEffect(() => {
    if (!fromClass) { setRoster([]); setSelectedIds(new Set()); return; }
    setLoadingRoster(true); setPromoteResult('');
    api.get<StudentRow[]>(`/api/primary/students?class_name=${encodeURIComponent(fromClass)}&status=Active`)
      .then(r => {
        setRoster(r.data);
        setSelectedIds(new Set(r.data.map(s => s.id)));
        const idx = classes.findIndex(c => c.class_name === fromClass);
        setToClass(idx >= 0 && idx < classes.length - 1 ? classes[idx + 1].class_name : '');
      })
      .catch(() => setRoster([]))
      .finally(() => setLoadingRoster(false));
  }, [fromClass, classes]);

  // Load roster for graduate tab when gradClass changes
  useEffect(() => {
    if (!gradClass) { setGradRoster([]); setGradSelected(new Set()); return; }
    setLoadingGradRoster(true); setGradResult('');
    api.get<StudentRow[]>(`/api/primary/students?class_name=${encodeURIComponent(gradClass)}&status=Active`)
      .then(r => {
        setGradRoster(r.data);
        setGradSelected(new Set(r.data.map(s => s.id)));
      })
      .catch(() => setGradRoster([]))
      .finally(() => setLoadingGradRoster(false));
  }, [gradClass]);

  async function handlePromote() {
    if (!fromClass || !toClass) return;
    if (fromClass === toClass) { setPromoteResult('From and To classes must be different.'); return; }
    if (selectedIds.size === 0) { setPromoteResult('No students selected.'); return; }
    setPromoting(true); setPromoteResult('');
    try {
      const { data } = await api.post<{ promoted: number }>('/api/primary/students/promote', {
        from_class: fromClass,
        to_class: toClass,
        student_ids: [...selectedIds],
      });
      setPromoteResult(`✓ ${data.promoted} student(s) promoted from ${fromClass} to ${toClass}.`);
      await loadClasses();
      setFromClass(''); setToClass(''); setRoster([]); setSelectedIds(new Set());
    } catch (e: unknown) {
      setPromoteResult((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Promote failed.');
    } finally { setPromoting(false); }
  }

  async function handleGraduate() {
    if (!gradClass || gradSelected.size === 0) return;
    if (!confirm(`Graduate ${gradSelected.size} student(s) in ${gradClass}? They will be marked as Graduated. This cannot be undone.`)) return;
    setGraduating(true); setGradResult('');
    try {
      const { data } = await api.post<{ graduated: number }>('/api/primary/students/graduate', {
        class_name: gradClass,
        student_ids: [...gradSelected],
      });
      setGradResult(`✓ ${data.graduated} student(s) in ${gradClass} marked as Graduated.`);
      await loadClasses();
      setGradClass(''); setGradRoster([]); setGradSelected(new Set());
    } catch (e: unknown) {
      setGradResult((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Graduate failed.');
    } finally { setGraduating(false); }
  }

  async function runWizard() {
    const toRun = wizardRows.filter(r => r.action !== 'skip' && r.student_count > 0);
    if (toRun.length === 0) { setWizardLog('Nothing to run — all classes are set to Skip or have no students.'); return; }

    const preview = toRun.map(r =>
      r.action === 'promote'
        ? `• Promote ${r.class_name} → ${r.target_class} (${r.student_count} students)`
        : `• Graduate all active students in ${r.class_name} (${r.student_count} students)`
    ).join('\n');

    if (!confirm(`Run end-of-year promotions?\n\n${preview}\n\nThis cannot be undone.`)) return;

    setWizardRunning(true); setWizardLog('');
    const lines: string[] = [];

    // Process in reverse sort_order to avoid collisions (highest class first)
    const reversed = [...toRun].sort((a, b) => b.sort_order - a.sort_order);

    for (const row of reversed) {
      try {
        if (row.action === 'promote') {
          if (!row.target_class) { lines.push(`⚠ ${row.class_name}: No target class — skipped.`); continue; }
          const { data } = await api.post<{ promoted: number }>('/api/primary/students/promote', {
            from_class: row.class_name,
            to_class: row.target_class,
          });
          lines.push(`✓ ${row.class_name} → ${row.target_class}: ${data.promoted} promoted`);
        } else {
          const { data } = await api.post<{ graduated: number }>('/api/primary/students/graduate', {
            class_name: row.class_name,
          });
          lines.push(`✓ ${row.class_name}: ${data.graduated} graduated`);
        }
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        lines.push(`✗ ${row.class_name}: ${msg ?? 'failed'}`);
      }
    }

    setWizardLog(lines.join('\n'));
    await loadClasses();
    setWizardRunning(false);
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'promote',  label: 'Promote Class' },
    { id: 'graduate', label: 'Graduate Class' },
    { id: 'wizard',   label: 'End-of-Year Wizard' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Student Promotions</h1>
        <p className="text-sm text-slate-500 mt-0.5">Promote classes to the next level or graduate final-year students.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Promote Tab ── */}
      {tab === 'promote' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Promote a Class</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Uncheck students who should repeat the year — only checked students will be moved to the next class.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">From Class</label>
            <select className={inputCls} value={fromClass}
              onChange={e => { setFromClass(e.target.value); setPromoteResult(''); }}>
              <option value="">Select class…</option>
              {classes.map(c => (
                <option key={c.class_name} value={c.class_name}>
                  {c.class_name} — {c.student_count} active student{c.student_count !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {fromClass && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Students</label>
              <RosterList
                students={roster}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                loading={loadingRoster}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To Class</label>
            <select className={inputCls} value={toClass} onChange={e => setToClass(e.target.value)}>
              <option value="">Select target class…</option>
              {classes.filter(c => c.class_name !== fromClass).map(c => (
                <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
              ))}
            </select>
          </div>

          {promoteResult && (
            <p className={`text-sm rounded-lg px-3 py-2 ${promoteResult.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {promoteResult}
            </p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handlePromote}
              disabled={promoting || !fromClass || !toClass || selectedIds.size === 0}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#15803D' }}>
              {promoting ? 'Promoting…' : `Promote${selectedIds.size > 0 ? ` (${selectedIds.size} students)` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Graduate Tab ── */}
      {tab === 'graduate' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">Graduate a Class</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Mark students as Graduated. Uncheck any student who should not graduate yet. All historical records are preserved.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Class to Graduate</label>
            <select className={inputCls} value={gradClass}
              onChange={e => { setGradClass(e.target.value); setGradResult(''); }}>
              <option value="">Select class…</option>
              {classes.map(c => (
                <option key={c.class_name} value={c.class_name}>
                  {c.class_name} — {c.student_count} active student{c.student_count !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {gradClass && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Students</label>
              <RosterList
                students={gradRoster}
                selectedIds={gradSelected}
                setSelectedIds={setGradSelected}
                loading={loadingGradRoster}
              />
            </div>
          )}

          {gradResult && (
            <p className={`text-sm rounded-lg px-3 py-2 ${gradResult.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
              {gradResult}
            </p>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleGraduate}
              disabled={graduating || !gradClass || gradSelected.size === 0}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#0369A1' }}>
              {graduating ? 'Graduating…' : `Graduate${gradSelected.size > 0 ? ` (${gradSelected.size} students)` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Wizard Tab ── */}
      {tab === 'wizard' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800">End-of-Year Wizard</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review and run all class promotions at once. Classes are auto-sequenced by sort order. Adjust any row before running.
              Students are processed highest class first to avoid conflicts.
            </p>
          </div>

          {loadingClasses ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin"
                style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
            </div>
          ) : wizardRows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No classes found. Set up classes in Class Setup first.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Students</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wizardRows.map((row, i) => (
                    <tr key={row.class_name} className={row.action === 'skip' ? 'opacity-40' : ''}>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{row.class_name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{row.student_count}</td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.action}
                          onChange={e => {
                            const next = [...wizardRows];
                            next[i] = { ...row, action: e.target.value as WizardRow['action'] };
                            setWizardRows(next);
                          }}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                          <option value="promote">Promote →</option>
                          <option value="graduate">Graduate</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.action === 'promote' ? (
                          <select
                            value={row.target_class}
                            onChange={e => {
                              const next = [...wizardRows];
                              next[i] = { ...row, target_class: e.target.value };
                              setWizardRows(next);
                            }}
                            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
                            <option value="">Select…</option>
                            {classes.filter(c => c.class_name !== row.class_name).map(c => (
                              <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
                            ))}
                          </select>
                        ) : row.action === 'graduate' ? (
                          <span className="text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">
                            Graduated
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {wizardLog && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Result</p>
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{wizardLog}</pre>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={runWizard}
              disabled={wizardRunning || wizardRows.every(r => r.action === 'skip')}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: '#15803D' }}>
              {wizardRunning ? 'Running…' : 'Run End-of-Year Promotion'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
