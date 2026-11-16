'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ClassLevel } from '@/types/api';
import { confirmAction } from '@/components/ui/dialogs';

interface MappingRow {
  from_class_id: string;
  from_class_name: string;
  active_count: number;
  suggested_to_class_id: string | null;
  suggested_to_class_name: string | null;
}
interface DestClass { id: string; name: string; }
interface StudentRow { id: string; name: string; student_code: string; }
interface PromoteResult { from_class: string; to_class: string; promoted: number; held_back: number; }

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';

// Graduates every active student in a level's classes at once, except those
// unticked (students staying back). Uses POST /api/students/graduate with the
// ticked student ids, so nobody outside the list is touched.
function GraduateLevel({ levels, onDone }: { levels: ClassLevel[]; onDone: () => void }) {
  const [levelId,  setLevelId]  = useState('');
  const [groups,   setGroups]   = useState<{ cls: string; students: StudentRow[] }[] | null>(null);
  const [kept,     setKept]     = useState<Set<string>>(new Set());   // unticked: not graduating
  const [open,     setOpen]     = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState('');
  const [done,     setDone]     = useState('');

  async function load(id: string) {
    setLevelId(id); setGroups(null); setKept(new Set()); setOpen(null); setError(''); setDone('');
    if (!id) return;
    setLoading(true);
    try {
      const { data: classes } = await api.get<{ id: string; name: string; level_id: string | null }[]>('/api/classes');
      const inLevel = classes.filter(c => c.level_id === id).sort((a, b) => a.name.localeCompare(b.name));
      const rosters = await Promise.all(inLevel.map(c =>
        api.get<StudentRow[]>(`/api/students?class_name=${encodeURIComponent(c.name)}&status=Active`)
          .then(r => ({ cls: c.name, students: r.data })).catch(() => ({ cls: c.name, students: [] as StudentRow[] }))));
      setGroups(rosters);
    } catch { setError('Could not load the classes in this level.'); }
    finally { setLoading(false); }
  }

  const all = groups?.flatMap(g => g.students) ?? [];
  const ticked = all.filter(st => !kept.has(st.id));
  const level = levels.find(l => l.id === levelId);

  function toggle(id: string) {
    setKept(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function graduate() {
    if (!level || ticked.length === 0) return;
    if (!await confirmAction(`Graduate ${ticked.length} student${ticked.length !== 1 ? 's' : ''} in ${level.name}? They will be marked as Graduated and leave their class lists. Their records are kept.`, { confirmLabel: 'Graduate' })) return;
    setRunning(true); setError('');
    try {
      const { data } = await api.post<{ graduated: number }>('/api/students/graduate', { class_name: level.name, student_ids: ticked.map(st => st.id) });
      setDone(`${data.graduated} student${data.graduated !== 1 ? 's' : ''} in ${level.name} graduated.${kept.size ? ` ${kept.size} stayed in their class.` : ''}`);
      setGroups(null); setLevelId(''); setKept(new Set());
      onDone();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Graduation failed. Nobody was changed.');
    } finally { setRunning(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-base text-[#1C1208]">Graduate a level</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          For final-year students leaving the school. Graduate them before promoting the level below into their classes.
        </p>
      </div>
      <div className="max-w-sm">
        <label className="text-xs font-semibold block mb-1 text-slate-600">Level</label>
        <select className={inputCls} value={levelId} onChange={e => load(e.target.value)}>
          <option value="">Select level…</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.class_count} classes)</option>)}
        </select>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading students…</p>}
      {groups && groups.length === 0 && <p className="text-sm text-slate-600">No classes are set to this level. Assign them in Setup › Curriculum › Classes.</p>}

      {groups && groups.length > 0 && (
        <>
          <p className="text-sm text-slate-600">Everyone is ticked. Untick a student who is staying back; they stay in their class.</p>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {groups.map(g => {
              const keptHere = g.students.filter(st => kept.has(st.id)).length;
              const isOpen = open === g.cls;
              return (
                <div key={g.cls}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : g.cls)} aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className="font-semibold text-[#1C1208]">{g.cls}</span>
                    <span className="text-sm text-slate-600">
                      {g.students.length - keptHere} of {g.students.length} graduating{keptHere ? `, ${keptHere} staying` : ''}
                      <span className="ml-2 text-[#145C44] font-semibold">{isOpen ? 'Hide' : 'Choose'}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="max-h-72 overflow-y-auto border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/50">
                      {g.students.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No active students.</p>}
                      {g.students.map(st => (
                        <label key={st.id} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer select-none">
                          <input type="checkbox" checked={!kept.has(st.id)} onChange={() => toggle(st.id)} className="rounded border-slate-300 accent-[#145C44]" />
                          <span className="text-sm flex-1 text-[#1C1208]">{st.name}</span>
                          <span className="text-xs font-mono text-slate-500">{st.student_code}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={graduate} disabled={ticked.length === 0} loading={running}>
              Graduate {ticked.length} student{ticked.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}
      {done && <p className="text-sm font-semibold text-[#145C44]">{done}</p>}
    </div>
  );
}

export default function PromotionsPage() {
  const [levels,      setLevels]      = useState<ClassLevel[]>([]);
  const [loadingLvls, setLoadingLvls] = useState(true);
  const [fromLevel,   setFromLevel]   = useState('');
  const [toLevel,     setToLevel]     = useState('');

  const [mapping,      setMapping]      = useState<MappingRow[] | null>(null);
  const [destClasses,  setDestClasses]  = useState<DestClass[]>([]);
  const [loadingPrev,  setLoadingPrev]  = useState(false);
  const [previewError, setPreviewError] = useState('');

  // per-class-id chosen destination, and per-class-id set of excluded (repeating) student ids
  const [chosenDest, setChosenDest] = useState<Record<string, string>>({});
  const [excluded,   setExcluded]   = useState<Record<string, Set<string>>>({});

  // roster modal (pick who repeats)
  const [rosterFor,     setRosterFor]     = useState<MappingRow | null>(null);
  const [roster,        setRoster]        = useState<StudentRow[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [refreshingClasses, setRefreshingClasses] = useState(false);
  const [reason, setReason] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [result,    setResult]    = useState<{ promoted_total: number; results: PromoteResult[] } | null>(null);
  const [runError,  setRunError]  = useState('');

  const loadLevels = useCallback(async () => {
    setLoadingLvls(true);
    try {
      const { data } = await api.get<ClassLevel[]>('/api/class-levels');
      setLevels(data);
    } catch { /* silent */ }
    finally { setLoadingLvls(false); }
  }, []);
  useEffect(() => { loadLevels(); }, [loadLevels]);

  async function preview() {
    if (!fromLevel || !toLevel) return;
    setLoadingPrev(true); setPreviewError(''); setMapping(null); setResult(null); setRunError('');
    try {
      const { data } = await api.get<{ mapping: MappingRow[]; dest_classes: DestClass[] }>(
        `/api/class-levels/${fromLevel}/promotion-preview?to_level_id=${toLevel}`
      );
      setMapping(data.mapping);
      setDestClasses(data.dest_classes);
      const dest: Record<string, string> = {};
      for (const m of data.mapping) dest[m.from_class_id] = m.suggested_to_class_id ?? '';
      setChosenDest(dest);
      setExcluded({});
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPreviewError(msg ?? 'Could not load mapping preview.');
    } finally { setLoadingPrev(false); }
  }

  async function refreshDestClasses() {
    setRefreshingClasses(true);
    try {
      const { data } = await api.get<{ id: string; name: string; level_id: string | null }[]>('/api/classes');
      setDestClasses(data.filter(c => c.level_id === toLevel).map(c => ({ id: c.id, name: c.name })));
    } catch { /* silent */ }
    finally { setRefreshingClasses(false); }
  }

  async function openRoster(row: MappingRow) {
    setRosterFor(row); setLoadingRoster(true);
    try {
      const { data } = await api.get<StudentRow[]>(`/api/students?class_name=${encodeURIComponent(row.from_class_name)}&status=Active`);
      setRoster(data);
    } catch { setRoster([]); }
    finally { setLoadingRoster(false); }
  }

  function toggleExclude(classId: string, studentId: string) {
    setExcluded(prev => {
      const next = { ...prev };
      const set = new Set(next[classId] ?? []);
      set.has(studentId) ? set.delete(studentId) : set.add(studentId);
      next[classId] = set;
      return next;
    });
  }

  const allMapped = mapping !== null && mapping.every(m => !!chosenDest[m.from_class_id]);

  async function confirmPromote() {
    if (!mapping || !allMapped) return;
    setPromoting(true); setRunError(''); setResult(null);
    try {
      const body: Record<string, unknown> = {
        to_level_id: toLevel,
        mappings: mapping.map(m => ({
          from_class_id: m.from_class_id,
          to_class_id: chosenDest[m.from_class_id],
          excluded_student_ids: Array.from(excluded[m.from_class_id] ?? []),
        })),
      };
      if (reason.trim()) body.reason = reason.trim();
      const { data } = await api.post<{ promoted_total: number; results: PromoteResult[] }>(
        `/api/class-levels/${fromLevel}/promote`, body
      );
      setResult(data);
      setMapping(null);
      setReason('');
      loadLevels();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRunError(msg ?? 'Promotion failed.');
    } finally { setPromoting(false); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: '#1C1208' }}>Promotions</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
          Promote a whole Form/Year level at once. Each class under the level still maps to a specific destination class,
          so nothing is merged into one big group. At the end of the year, graduate the final year first (below), then promote
          each level into the one above.
        </p>
      </div>

      {loadingLvls ? (
        <div className="flex justify-center h-24 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin" />
        </div>
      ) : levels.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 text-sm" style={{ color: '#64748B' }}>
          No levels set up yet. Go to <strong>Curriculum → Levels</strong> to auto-detect or create levels before promoting by level.
          Individual classes can still be promoted from the Students page in the meantime.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>From Level</label>
              <select className={inputCls} value={fromLevel} onChange={e => { setFromLevel(e.target.value); setMapping(null); setResult(null); }}>
                <option value="">Select level…</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.class_count} classes)</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#64748B' }}>To Level</label>
              <select className={inputCls} value={toLevel} onChange={e => { setToLevel(e.target.value); setMapping(null); setResult(null); }}>
                <option value="">Select level…</option>
                {levels.filter(l => l.id !== fromLevel).map(l => <option key={l.id} value={l.id}>{l.name} ({l.class_count} classes)</option>)}
              </select>
            </div>
          </div>

          {previewError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{previewError}</p>}

          <div className="flex justify-end">
            <Button onClick={preview} disabled={!fromLevel || !toLevel} loading={loadingPrev}>Preview Mapping</Button>
          </div>
        </div>
      )}

      {mapping && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-semibold text-sm" style={{ color: '#1C1208' }}>Class mapping</h2>
              <p className="text-xs" style={{ color: '#94A3B8' }}>Every class needs a destination before you can promote.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={refreshDestClasses} loading={refreshingClasses}>Refresh classes</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F0E8] border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>From Class</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>Active</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>To Class</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: '#94A3B8' }}>Repeaters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {mapping.map(m => {
                  const hasMatch = !!chosenDest[m.from_class_id];
                  const excludedCount = excluded[m.from_class_id]?.size ?? 0;
                  return (
                    <tr key={m.from_class_id} className={!hasMatch ? 'bg-amber-50/50' : ''}>
                      <td className="px-4 py-3 font-medium" style={{ color: '#1C1208' }}>{m.from_class_name}</td>
                      <td className="px-4 py-3" style={{ color: '#64748B' }}>{m.active_count}</td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#145C44]"
                          value={chosenDest[m.from_class_id] ?? ''}
                          onChange={e => setChosenDest(prev => ({ ...prev, [m.from_class_id]: e.target.value }))}
                          style={!hasMatch ? { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' } : undefined}
                        >
                          <option value="">Select class…</option>
                          {destClasses.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {!hasMatch && (
                          <p className="text-xs text-amber-700 mt-1 max-w-[220px]">
                            No matching class found. <a href="/curriculum?tab=classes" target="_blank" rel="noreferrer" className="underline font-semibold">Create it in Setup → Curriculum</a>, then click "Refresh classes" above.
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => openRoster(m)} disabled={m.active_count === 0}>
                          {excludedCount > 0 ? `${excludedCount} held back` : 'Choose…'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {runError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mx-4 my-2">{runError}</p>}

          <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-3">
            <input className={`${inputCls} flex-1`} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Reason (optional) — e.g. End of year promotion" />
            <Button onClick={confirmPromote} disabled={!allMapped} loading={promoting}>
              Promote {mapping.length} class{mapping.length !== 1 ? 'es' : ''}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="font-semibold text-sm mb-2" style={{ color: '#145C44' }}>
            {result.promoted_total} student{result.promoted_total !== 1 ? 's' : ''} promoted.
          </p>
          <div className="space-y-1">
            {result.results.map((r, i) => (
              <p key={i} className="text-xs" style={{ color: '#64748B' }}>
                {r.from_class} → {r.to_class}: {r.promoted} promoted{r.held_back > 0 ? `, ${r.held_back} held back` : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {levels.length > 0 && <GraduateLevel levels={levels} onDone={loadLevels} />}

      <Modal open={rosterFor !== null} onClose={() => setRosterFor(null)}
        title={rosterFor ? `Students in ${rosterFor.from_class_name}` : ''} maxWidth="max-w-md">
        {rosterFor && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Uncheck any student who should repeat the year. Unchecked students stay in {rosterFor.from_class_name} and aren't touched by this promotion.
            </p>
            {loadingRoster ? (
              <div className="text-center py-4 text-sm" style={{ color: '#94A3B8' }}>Loading…</div>
            ) : roster.length === 0 ? (
              <div className="text-center py-4 text-sm" style={{ color: '#94A3B8' }}>No active students in this class.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {roster.map(s => {
                  const isExcluded = excluded[rosterFor.from_class_id]?.has(s.id) ?? false;
                  return (
                    <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none">
                      <input type="checkbox" checked={!isExcluded} className="rounded border-slate-300"
                        onChange={() => toggleExclude(rosterFor.from_class_id, s.id)} />
                      <span className="text-sm flex-1" style={{ color: '#1C1208' }}>{s.name}</span>
                      <span className="text-xs font-mono" style={{ color: '#94A3B8' }}>{s.student_code}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button onClick={() => setRosterFor(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
