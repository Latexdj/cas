'use client';

import { useCallback, useEffect, useState } from 'react';
import { principalApi as api } from '@/lib/principal-api';

interface RollCall {
  id: string; date: string; title: string | null; location: string | null;
  notes: string | null; conducted_by_name: string | null;
  total_entries: number; present_count: number; absent_count: number; break_bounds_count: number;
}
interface Entry {
  id: string; status: 'Present' | 'Absent' | 'Break Bounds'; notes: string | null;
  student_id: string; student_name: string; student_code: string;
  class_name: string; house: string | null;
}
interface Student {
  id: string; name: string; student_code: string;
  class_name: string; house: string | null; residential_status: string;
}

const STATUS_CFG = {
  'Present':      { bg: '#DCFCE7', text: '#2D7A4F', border: '#2D7A4F' },
  'Absent':       { bg: '#FEE2E2', text: '#B83232', border: '#B83232' },
  'Break Bounds': { bg: '#FEF3C7', text: '#C8780A', border: '#C8780A' },
} as const;

const STYLES = `
  .rc-wrap { padding: 20px 16px; max-width: 1200px; margin: 0 auto; }
  .rc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
  .rc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .rc-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .rc-btn-primary { background: #145C44; color: #fff; }
  .rc-btn-primary:hover:not(:disabled) { background: #0B3D2E; }
  .rc-btn-ghost { background: #F3F4F0; color: #374151; }
  .rc-btn-ghost:hover:not(:disabled) { background: #E8E3DC; }
  .rc-btn-danger { background: #B83232; color: #fff; }
  .rc-btn-danger:hover:not(:disabled) { background: #991B1B; }
  .rc-btn-sm { padding: 7px 13px; font-size: 13px; }
  .rc-input { border: 1px solid #E5E0D8; border-radius: 8px; padding: 8px 12px; font-size: 14px; background: #fff; color: #1C1917; outline: none; }
  .rc-input:focus { border-color: #145C44; }
  .rc-label { font-size: 12px; font-weight: 600; color: #374151; display: block; margin-bottom: 4px; }
  .rc-create-box { background: #F8F7F3; border: 1px solid #E5E0D8; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
  .rc-create-fields { display: flex; gap: 12px; flex-wrap: wrap; }
  .rc-create-actions { display: flex; gap: 8px; margin-top: 16px; }
  .rc-layout { display: grid; grid-template-columns: 260px 1fr; gap: 20px; }
  .rc-list-section-title { font-size: 13px; font-weight: 600; color: #6B7280; margin-bottom: 12px; }
  .rc-rc-card { border: 1px solid #E5E0D8; border-radius: 10px; padding: 14px; cursor: pointer; background: #fff; transition: border-color 0.15s, background 0.15s; position: relative; }
  .rc-rc-card:hover { border-color: #9FC8B4; }
  .rc-rc-card.selected { border-color: #145C44; background: #F0F9F4; }
  .rc-rc-card-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .rc-card-title { margin: 0; font-weight: 600; font-size: 14px; color: #1C1917; }
  .rc-card-meta { margin: 3px 0 0; font-size: 12px; color: #6B7280; }
  .rc-card-stats { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .chip-p { background: #DCFCE7; color: #2D7A4F; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
  .chip-a { background: #FEE2E2; color: #B83232; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
  .chip-b { background: #FEF3C7; color: #C8780A; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 700; }
  .rc-icon-btn { background: none; border: none; cursor: pointer; color: #9CA3AF; padding: 4px; border-radius: 5px; display: flex; align-items: center; flex-shrink: 0; }
  .rc-icon-btn:hover { color: #B83232; background: #FEE2E2; }
  .rc-detail-hdr { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .rc-detail-title { font-size: 16px; font-weight: 700; color: #1C1917; margin: 0; flex: 1; min-width: 0; }
  .rc-detail-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .rc-th { padding: 9px 14px; font-size: 12px; font-weight: 600; color: #4B5563; background: #F8F7F3; border-bottom: 1px solid #E5E0D8; text-align: left; }
  .rc-td { padding: 10px 14px; border-bottom: 1px solid #F1EDE8; font-size: 13px; color: #374151; vertical-align: middle; }
  .rc-status-btns { display: flex; gap: 5px; }
  .rc-status-btn { flex: 1; height: 34px; min-width: 58px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1.5px solid #E5E0D8; background: #F8F7F3; color: #6B7280; transition: all 0.1s; white-space: nowrap; }
  .rc-status-btn:hover { border-color: #9FC8B4; color: #145C44; background: #F0F9F4; }
  .rc-back-btn { display: none; }
  .rc-mobile-save-bar { display: none; }
  .rc-student-cards { display: none; }
  @media (max-width: 767px) {
    .rc-wrap { padding: 16px 14px 100px; }
    .rc-hdr { flex-direction: column; align-items: stretch; }
    .rc-hdr-btn-wrap .rc-btn { width: 100%; }
    .rc-layout { display: block; }
    .rc-list-hidden { display: none !important; }
    .rc-detail-hidden { display: none !important; }
    .rc-back-btn { display: flex; align-items: center; gap: 4px; padding: 0; background: none; border: none; cursor: pointer; color: #145C44; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
    .rc-mobile-save-bar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #E5E0D8; padding: 12px 14px; gap: 8px; z-index: 50; box-shadow: 0 -2px 10px rgba(0,0,0,0.08); align-items: center; }
    .rc-mobile-save-bar .rc-btn { flex: 1; }
    .rc-detail-actions { display: none; }
    .rc-detail-hdr { flex-direction: column; align-items: flex-start; gap: 8px; }
    .rc-student-table-wrap { display: none !important; }
    .rc-student-cards { display: flex; flex-direction: column; border: 1px solid #E5E0D8; border-radius: 12px; overflow: hidden; }
    .rc-sc-item { padding: 14px; border-bottom: 1px solid #F1EDE8; background: #fff; }
    .rc-sc-item:last-child { border-bottom: none; }
    .rc-sc-item.sc-break { background: #FFFBEB; }
    .rc-sc-item.sc-absent { background: #FEF2F2; }
    .rc-sc-name { font-size: 15px; font-weight: 600; color: #1C1917; margin: 0 0 2px; }
    .rc-sc-meta { font-size: 12px; color: #6B7280; margin: 0 0 10px; }
    .rc-status-btns { gap: 7px; }
    .rc-status-btn { height: 48px; font-size: 13px; border-radius: 9px; min-width: 0; }
    .rc-create-fields { flex-direction: column; }
    .rc-create-fields .rc-input { width: 100% !important; box-sizing: border-box; }
    .rc-rc-card + .rc-rc-card { margin-top: 8px; }
    .rc-create-box { padding: 16px; }
    .rc-list-section-title { margin-bottom: 10px; }
    .rc-mobile-class-select { flex: 1; min-width: 0; font-size: 13px; }
  }
  @media (min-width: 768px) {
    .rc-student-table-wrap { display: block; overflow-x: auto; }
    .rc-mobile-save-bar { display: none !important; }
  }
`;

export default function RollCallPage() {
  const [rollCalls, setRollCalls]       = useState<RollCall[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [entries, setEntries]           = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [localEntries, setLocalEntries] = useState<Map<string, { status: 'Present' | 'Absent' | 'Break Bounds'; notes: string }>>(new Map());
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [mobileView, setMobileView]     = useState<'list' | 'detail'>('list');

  const [showCreate, setShowCreate]   = useState(false);
  const [createForm, setCreateForm]   = useState({ title: '', location: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [creating, setCreating]       = useState(false);
  const [createErr, setCreateErr]     = useState<string | null>(null);

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [classFilter, setClassFilter] = useState('');

  const loadRollCalls = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/roll-call');
      setRollCalls(r.data.roll_calls || []);
    } catch { setRollCalls([]); } finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setEntriesLoading(true);
    try {
      const r = await api.get(`/api/roll-call/${id}`);
      setEntries(r.data.entries || []);
      const m = new Map<string, { status: 'Present' | 'Absent' | 'Break Bounds'; notes: string }>();
      for (const e of (r.data.entries || [])) m.set(e.student_id, { status: e.status, notes: e.notes || '' });
      setLocalEntries(m);
    } catch { setEntries([]); } finally { setEntriesLoading(false); }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const r = await api.get('/api/students', { params: { status: 'Active' } });
      setAllStudents((r.data || []).filter((s: Student) => s.residential_status === 'Boarding'));
    } catch { setAllStudents([]); }
  }, []);

  useEffect(() => { loadRollCalls(); loadStudents(); }, [loadRollCalls, loadStudents]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  async function createRollCall() {
    setCreating(true); setCreateErr(null);
    try {
      const r = await api.post('/api/roll-call', createForm);
      const newRc: RollCall = { ...r.data.roll_call, conducted_by_name: 'You', total_entries: 0, present_count: 0, absent_count: 0, break_bounds_count: 0 };
      setRollCalls(prev => [newRc, ...prev]);
      setSelectedId(r.data.roll_call.id);
      setMobileView('detail');
      setShowCreate(false);
      setCreateForm({ title: '', location: '', date: new Date().toISOString().slice(0, 10), notes: '' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } } };
      const code = err?.response?.data?.code;
      const msg  = err?.response?.data?.error || 'Failed to create';
      setCreateErr(code ? `${msg} [${code}]` : msg);
    } finally { setCreating(false); }
  }

  async function deleteRollCall(id: string) {
    if (!confirm('Delete this roll call and all its entries?')) return;
    try {
      await api.delete(`/api/roll-call/${id}`);
      setRollCalls(prev => prev.filter(r => r.id !== id));
      if (selectedId === id) { setSelectedId(null); setEntries([]); setMobileView('list'); }
    } catch { alert('Failed to delete'); }
  }

  async function addStudentsToRollCall() {
    if (!selectedId) return;
    const existing = new Set(entries.map(e => e.student_id));
    const toAdd = allStudents
      .filter(s => !existing.has(s.id) && (!classFilter || s.class_name === classFilter))
      .map(s => ({ student_id: s.id, status: 'Present' as const }));
    if (!toAdd.length) { alert('No new students to add.'); return; }
    setSaving(true);
    try {
      await api.put(`/api/roll-call/${selectedId}/entries`, { entries: toAdd });
      await loadDetail(selectedId);
      setSaveMsg(`Added ${toAdd.length} students.`);
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { alert('Failed to add students'); } finally { setSaving(false); }
  }

  async function saveEntries() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const entriesToSave = [...localEntries.entries()].map(([student_id, v]) => ({
        student_id, status: v.status, notes: v.notes,
      }));
      await api.put(`/api/roll-call/${selectedId}/entries`, { entries: entriesToSave });
      setSaveMsg('Saved.');
      setTimeout(() => setSaveMsg(''), 2000);
      await loadRollCalls();
    } catch { alert('Failed to save'); } finally { setSaving(false); }
  }

  function setEntryStatus(studentId: string, status: 'Present' | 'Absent' | 'Break Bounds') {
    setLocalEntries(prev => {
      const next = new Map(prev);
      const existing = next.get(studentId) || { status: 'Present', notes: '' };
      next.set(studentId, { ...existing, status });
      return next;
    });
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const cls = a.class_name.localeCompare(b.class_name);
    return cls !== 0 ? cls : a.student_name.localeCompare(b.student_name);
  });
  const classes = [...new Set(allStudents.map(s => s.class_name))].sort();
  const selectedRc = rollCalls.find(r => r.id === selectedId);

  const StatusButtons = ({ studentId, currentStatus }: { studentId: string; currentStatus: 'Present' | 'Absent' | 'Break Bounds' }) => (
    <div className="rc-status-btns">
      {(['Present', 'Absent', 'Break Bounds'] as const).map(s => {
        const cfg = STATUS_CFG[s];
        const active = currentStatus === s;
        return (
          <button key={s} className="rc-status-btn"
            onClick={() => setEntryStatus(studentId, s)}
            style={active ? { background: cfg.bg, color: cfg.text, borderColor: cfg.border } : undefined}
          >
            {s}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <style>{STYLES}</style>
      <div className="rc-wrap">

        {/* Header */}
        <div className="rc-hdr">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', margin: 0 }}>Roll Call</h1>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
              Identify students who have broken bounds or gone AWOL.
            </p>
          </div>
          <div className="rc-hdr-btn-wrap">
            <button onClick={() => setShowCreate(p => !p)} className="rc-btn rc-btn-primary">
              Start roll call
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rc-create-box">
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#1C1917' }}>New roll call</h3>
            <div className="rc-create-fields">
              <div>
                <label className="rc-label">Date</label>
                <input type="date" value={createForm.date}
                  onChange={e => setCreateForm(p => ({ ...p, date: e.target.value }))}
                  className="rc-input"
                />
              </div>
              <div>
                <label className="rc-label">Title (optional)</label>
                <input placeholder="e.g. Evening roll call" value={createForm.title}
                  onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                  className="rc-input" style={{ width: 200 }}
                />
              </div>
              <div>
                <label className="rc-label">Location (optional)</label>
                <input placeholder="e.g. Assembly Hall" value={createForm.location}
                  onChange={e => setCreateForm(p => ({ ...p, location: e.target.value }))}
                  className="rc-input" style={{ width: 200 }}
                />
              </div>
            </div>
            {createErr && <p style={{ color: '#B83232', fontSize: 13, marginTop: 12 }}>{createErr}</p>}
            <div className="rc-create-actions">
              <button onClick={createRollCall} disabled={creating} className="rc-btn rc-btn-primary">
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} className="rc-btn rc-btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        <div className="rc-layout">
          {/* List panel */}
          <div className={mobileView === 'detail' ? 'rc-list-hidden' : undefined}>
            <p className="rc-list-section-title">This semester</p>
            {loading ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
            ) : rollCalls.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>No roll calls yet. Start one above.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rollCalls.map(rc => (
                  <div key={rc.id}
                    className={`rc-rc-card${selectedId === rc.id ? ' selected' : ''}`}
                    onClick={() => { setSelectedId(rc.id); setMobileView('detail'); }}
                  >
                    <div className="rc-rc-card-hdr">
                      <div style={{ minWidth: 0 }}>
                        <p className="rc-card-title">{rc.title || 'Roll Call'}</p>
                        <p className="rc-card-meta">
                          {new Date(rc.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                          {rc.location ? `, ${rc.location}` : ''}
                        </p>
                      </div>
                      <button className="rc-icon-btn"
                        onClick={e => { e.stopPropagation(); deleteRollCall(rc.id); }}
                        aria-label="Delete roll call"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                    {rc.total_entries > 0 && (
                      <div className="rc-card-stats">
                        <span className="chip-p">{rc.present_count} Present</span>
                        <span className="chip-a">{rc.absent_count} Absent</span>
                        {rc.break_bounds_count > 0 && <span className="chip-b">{rc.break_bounds_count} Break Bounds</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className={mobileView === 'list' ? 'rc-detail-hidden' : undefined}>
            {!selectedId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', fontSize: 13 }}>
                Select a roll call to view entries
              </div>
            ) : (
              <div>
                <button className="rc-back-btn" onClick={() => setMobileView('list')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15,18 9,12 15,6"/>
                  </svg>
                  Roll calls
                </button>

                <div className="rc-detail-hdr">
                  <h2 className="rc-detail-title">
                    {selectedRc?.title || 'Roll Call'} &mdash;{' '}
                    {selectedRc ? new Date(selectedRc.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                  </h2>
                  <div className="rc-detail-actions">
                    <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className="rc-input" style={{ fontSize: 13 }}>
                      <option value="">All Classes</option>
                      {classes.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <button onClick={addStudentsToRollCall} disabled={saving} className="rc-btn rc-btn-ghost rc-btn-sm">
                      {saving ? 'Adding…' : 'Add boarding students'}
                    </button>
                    <button onClick={saveEntries} disabled={saving} className="rc-btn rc-btn-primary rc-btn-sm">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {saveMsg && <p style={{ color: '#2D7A4F', fontSize: 13, marginBottom: 12 }}>{saveMsg}</p>}

                {entriesLoading ? (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading entries…</p>
                ) : sortedEntries.length === 0 ? (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                    No students added yet. Use &ldquo;Add boarding students&rdquo; to populate the list.
                  </p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="rc-student-table-wrap">
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Student', 'ID', 'Class', 'House', 'Status'].map(h => (
                              <th key={h} className="rc-th">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedEntries.map(e => {
                            const local = localEntries.get(e.student_id);
                            const status = local?.status || e.status;
                            return (
                              <tr key={e.student_id} style={{
                                background: status === 'Break Bounds' ? '#FFFBEB' : status === 'Absent' ? '#FEF2F2' : '#fff',
                              }}>
                                <td className="rc-td">{e.student_name}</td>
                                <td className="rc-td">{e.student_code}</td>
                                <td className="rc-td">{e.class_name}</td>
                                <td className="rc-td">{e.house || '—'}</td>
                                <td className="rc-td"><StatusButtons studentId={e.student_id} currentStatus={status} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile card list */}
                    <div className="rc-student-cards">
                      {sortedEntries.map(e => {
                        const local = localEntries.get(e.student_id);
                        const status = local?.status || e.status;
                        return (
                          <div key={e.student_id}
                            className={`rc-sc-item${status === 'Break Bounds' ? ' sc-break' : status === 'Absent' ? ' sc-absent' : ''}`}
                          >
                            <p className="rc-sc-name">{e.student_name}</p>
                            <p className="rc-sc-meta">{e.student_code}, {e.class_name}{e.house ? `, ${e.house}` : ''}</p>
                            <StatusButtons studentId={e.student_id} currentStatus={status} />
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky save bar — only shown on mobile when in detail view */}
      {selectedId && mobileView === 'detail' && (
        <div className="rc-mobile-save-bar">
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
            className="rc-input rc-mobile-class-select" style={{ fontSize: 13 }}
          >
            <option value="">All classes</option>
            {classes.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={addStudentsToRollCall} disabled={saving} className="rc-btn rc-btn-ghost rc-btn-sm">
            Add
          </button>
          <button onClick={saveEntries} disabled={saving} className="rc-btn rc-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </>
  );
}

