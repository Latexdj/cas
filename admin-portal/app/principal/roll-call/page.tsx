'use client';

import { useCallback, useEffect, useState } from 'react';
import { principalApi as api } from '@/lib/principal-api';

interface RollCall {
  id: string;
  date: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  conducted_by_name: string | null;
  total_entries: number;
  present_count: number;
  absent_count: number;
  break_bounds_count: number;
}

interface Entry {
  id: string;
  status: 'Present' | 'Absent' | 'Break Bounds';
  notes: string | null;
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  house: string | null;
}

interface Student {
  id: string;
  name: string;
  student_code: string;
  class_name: string;
  house: string | null;
  residential_status: string;
}

const cell: React.CSSProperties = {
  padding: '10px 14px', borderBottom: '1px solid #F1F5F9', fontSize: 13, color: '#374151',
};
const hCell: React.CSSProperties = {
  ...cell, fontWeight: 600, color: '#6B7280', fontSize: 12, background: '#F8FAFC',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const inputStyle: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px',
  fontSize: 13, background: '#fff', color: '#374151', outline: 'none',
};
const btn = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
  border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  background: variant === 'primary' ? '#16A34A' : variant === 'danger' ? '#DC2626' : '#F1F5F9',
  color: variant === 'ghost' ? '#374151' : '#fff',
});

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  'Present':      { background: '#DCFCE7', color: '#15803D' },
  'Absent':       { background: '#FEE2E2', color: '#B91C1C' },
  'Break Bounds': { background: '#FEF3C7', color: '#B45309' },
};

export default function RollCallPage() {
  const [rollCalls, setRollCalls]       = useState<RollCall[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [entries, setEntries]           = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [localEntries, setLocalEntries] = useState<Map<string, { status: 'Present' | 'Absent' | 'Break Bounds'; notes: string }>>(new Map());
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');

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
      for (const e of (r.data.entries || [])) {
        m.set(e.student_id, { status: e.status, notes: e.notes || '' });
      }
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
    setCreating(true);
    setCreateErr(null);
    try {
      const r = await api.post('/api/roll-call', createForm);
      const newRc: RollCall = { ...r.data.roll_call, conducted_by_name: 'You', total_entries: 0, present_count: 0, absent_count: 0, break_bounds_count: 0 };
      setRollCalls(prev => [newRc, ...prev]);
      setSelectedId(r.data.roll_call.id);
      setShowCreate(false);
      setCreateForm({ title: '', location: '', date: new Date().toISOString().slice(0, 10), notes: '' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setCreateErr(err?.response?.data?.error || 'Failed to create');
    } finally { setCreating(false); }
  }

  async function deleteRollCall(id: string) {
    if (!confirm('Delete this roll call and all its entries?')) return;
    try {
      await api.delete(`/api/roll-call/${id}`);
      setRollCalls(prev => prev.filter(r => r.id !== id));
      if (selectedId === id) { setSelectedId(null); setEntries([]); }
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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Roll Call</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            Conduct roll calls to identify students who have broken bounds or gone AWOL
          </p>
        </div>
        <button onClick={() => setShowCreate(p => !p)} style={btn('primary')}>
          + New Roll Call
        </button>
      </div>

      {showCreate && (
        <div style={{
          background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: 20, marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>New Roll Call</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Date</label>
              <input type="date" value={createForm.date}
                onChange={e => setCreateForm(p => ({ ...p, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Title (optional)</label>
              <input placeholder="e.g. Evening Roll Call" value={createForm.title}
                onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                style={{ ...inputStyle, width: 200 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Location (optional)</label>
              <input placeholder="e.g. Assembly Hall" value={createForm.location}
                onChange={e => setCreateForm(p => ({ ...p, location: e.target.value }))}
                style={{ ...inputStyle, width: 200 }}
              />
            </div>
          </div>
          {createErr && <p style={{ color: '#DC2626', fontSize: 13, marginTop: 12 }}>{createErr}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={createRollCall} disabled={creating} style={btn('primary')}>
              {creating ? 'Creating…' : 'Create Roll Call'}
            </button>
            <button onClick={() => setShowCreate(false)} style={btn('ghost')}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
        {/* Roll call list */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            This Semester
          </h3>
          {loading ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
          ) : rollCalls.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>No roll calls yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rollCalls.map(rc => (
                <div key={rc.id}
                  onClick={() => setSelectedId(rc.id)}
                  style={{
                    border: `1px solid ${selectedId === rc.id ? '#16A34A' : '#E2E8F0'}`,
                    borderRadius: 10, padding: 14, cursor: 'pointer',
                    background: selectedId === rc.id ? '#F0FDF4' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#111827' }}>
                        {rc.title || 'Roll Call'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                        {new Date(rc.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                        {rc.location ? ` · ${rc.location}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteRollCall(rc.id); }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, padding: 0 }}
                    >×</button>
                  </div>
                  {rc.total_entries > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, ...STATUS_COLORS['Present'], borderRadius: 4, padding: '2px 6px' }}>
                        {rc.present_count} Present
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, ...STATUS_COLORS['Absent'], borderRadius: 4, padding: '2px 6px' }}>
                        {rc.absent_count} Absent
                      </span>
                      {rc.break_bounds_count > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 600, ...STATUS_COLORS['Break Bounds'], borderRadius: 4, padding: '2px 6px' }}>
                          {rc.break_bounds_count} Break Bounds
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {!selectedId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', fontSize: 13 }}>
              Select a roll call to view entries
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
                  {selectedRc?.title || 'Roll Call'} — {selectedRc ? new Date(selectedRc.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
                </h2>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={inputStyle}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={addStudentsToRollCall} disabled={saving} style={btn('ghost')}>
                    {saving ? 'Adding…' : '+ Add Boarding Students'}
                  </button>
                  <button onClick={saveEntries} disabled={saving} style={btn('primary')}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              {saveMsg && <p style={{ color: '#16A34A', fontSize: 13, marginBottom: 12 }}>{saveMsg}</p>}

              {entriesLoading ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading entries…</p>
              ) : sortedEntries.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                  No students added yet. Use &ldquo;Add Boarding Students&rdquo; to populate the list.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Student', 'ID', 'Class', 'House', 'Status'].map(h => (
                          <th key={h} style={hCell}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEntries.map(e => {
                        const local = localEntries.get(e.student_id);
                        const status = local?.status || e.status;
                        return (
                          <tr key={e.student_id} style={{ background: status === 'Break Bounds' ? '#FFFBEB' : status === 'Absent' ? '#FEF2F2' : '#fff' }}>
                            <td style={cell}>{e.student_name}</td>
                            <td style={cell}>{e.student_code}</td>
                            <td style={cell}>{e.class_name}</td>
                            <td style={cell}>{e.house || '—'}</td>
                            <td style={cell}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {(['Present', 'Absent', 'Break Bounds'] as const).map(s => (
                                  <button key={s}
                                    onClick={() => setEntryStatus(e.student_id, s)}
                                    style={{
                                      border: status === s ? '2px solid currentColor' : '1px solid #E2E8F0',
                                      borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: status === s ? 700 : 400,
                                      cursor: 'pointer', transition: 'all 0.1s',
                                      ...(status === s ? STATUS_COLORS[s] : { background: '#fff', color: '#6B7280' }),
                                    }}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
