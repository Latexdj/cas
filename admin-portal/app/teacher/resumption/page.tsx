'use client';

import { useCallback, useEffect, useState } from 'react';
import { teacherApi as api } from '@/lib/teacher-api';

interface SemesterConfig {
  id: string;
  resumption_date: string | null;
  max_days_home: number;
  is_open: boolean;
  created_by_name?: string;
  updated_at?: string;
}

interface Arrival {
  id: string;
  arrival_date: string;
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  house: string | null;
  residential_status: string;
  recorded_by_name: string | null;
  notes: string | null;
}

interface MissingStudent {
  id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  house: string | null;
  residential_status: string;
}

interface Flag {
  id: string;
  flagged_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  house: string | null;
  flagged_by_name: string | null;
  resolved_by_name: string | null;
  subject: string | null;
  session_date: string | null;
}

interface KitchenCount {
  total: number;
  by_class: { class_name: string; count: number }[];
}

type Tab = 'config' | 'arrivals' | 'missing' | 'flags' | 'kitchen';

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

export default function ResumptionPage() {
  const [tab, setTab] = useState<Tab>('arrivals');

  const [config, setConfig]         = useState<SemesterConfig | null>(null);
  const [configForm, setConfigForm] = useState({ resumption_date: '', max_days_home: 7, is_open: false });
  const [configSaving, setConfigSaving] = useState(false);
  const [configErr, setConfigErr]   = useState<string | null>(null);

  const [arrivals, setArrivals]               = useState<Arrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalsErr, setArrivalsErr]         = useState<string | null>(null);
  const [arrivalSearch, setArrivalSearch]     = useState('');
  const [arrivalClass, setArrivalClass]       = useState('');
  const [arrivalHouse, setArrivalHouse]       = useState('');

  const [missing, setMissing]                 = useState<MissingStudent[]>([]);
  const [missingLoading, setMissingLoading]   = useState(false);
  const [missingClass, setMissingClass]       = useState('');
  const [missingHouse, setMissingHouse]       = useState('');
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set());
  const [addingArrivals, setAddingArrivals]   = useState(false);

  const [flags, setFlags]               = useState<Flag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [resolvingFlag, setResolvingFlag] = useState<string | null>(null);

  const [kitchen, setKitchen]               = useState<KitchenCount | null>(null);
  const [kitchenLoading, setKitchenLoading] = useState(false);

  const [boardingStudents, setBoardingStudents] = useState<{ id: string; class_name: string; house: string | null }[]>([]);

  const loadBoardingStudents = useCallback(async () => {
    try {
      const r = await api.get('/api/students', { params: { status: 'Active' } });
      setBoardingStudents((r.data || []).filter((s: { residential_status: string }) => s.residential_status === 'Boarding'));
    } catch { /* silently ignore */ }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const r = await api.get('/api/resumption/config');
      setConfig(r.data.config);
      if (r.data.config) {
        setConfigForm({
          resumption_date: r.data.config.resumption_date?.slice(0, 10) || '',
          max_days_home:   r.data.config.max_days_home ?? 7,
          is_open:         r.data.config.is_open ?? false,
        });
      }
    } catch { /* silently ignore */ }
  }, []);

  const loadArrivals = useCallback(async () => {
    setArrivalsLoading(true);
    setArrivalsErr(null);
    try {
      const params: Record<string, string> = {};
      if (arrivalClass) params.class_name = arrivalClass;
      if (arrivalHouse) params.house = arrivalHouse;
      if (arrivalSearch) params.search = arrivalSearch;
      const r = await api.get('/api/resumption/arrivals', { params });
      setArrivals(r.data.arrivals || []);
      if (r.data._error) {
        setArrivalsErr(`DB has ${r.data._rawCount} record(s) but query failed: ${r.data._error} [${r.data._code}]`);
      } else if (r.data._rawCount > 0 && (r.data.arrivals || []).length === 0) {
        setArrivalsErr(`DB has ${r.data._rawCount} record(s) but none returned. Check year/semester config.`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } } };
      const msg = err?.response?.data?.error || 'Failed to load arrivals';
      const code = err?.response?.data?.code;
      setArrivalsErr(code ? `${msg} [${code}]` : msg);
      setArrivals([]);
    } finally { setArrivalsLoading(false); }
  }, [arrivalClass, arrivalHouse, arrivalSearch]);

  const loadMissing = useCallback(async () => {
    setMissingLoading(true);
    try {
      const params: Record<string, string> = {};
      if (missingClass) params.class_name = missingClass;
      if (missingHouse) params.house = missingHouse;
      const r = await api.get('/api/resumption/missing', { params });
      setMissing(r.data.students || []);
    } catch { setMissing([]); } finally { setMissingLoading(false); }
  }, [missingClass, missingHouse]);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const r = await api.get('/api/resumption/flags');
      setFlags(r.data.flags || []);
    } catch { setFlags([]); } finally { setFlagsLoading(false); }
  }, []);

  const loadKitchen = useCallback(async () => {
    setKitchenLoading(true);
    try {
      const r = await api.get('/api/resumption/kitchen-count');
      setKitchen(r.data);
    } catch { setKitchen(null); } finally { setKitchenLoading(false); }
  }, []);

  useEffect(() => { loadBoardingStudents(); }, [loadBoardingStudents]);
  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (tab === 'arrivals') loadArrivals(); }, [tab, loadArrivals]);
  useEffect(() => { if (tab === 'missing') loadMissing(); }, [tab, loadMissing]);
  useEffect(() => { if (tab === 'flags') loadFlags(); }, [tab, loadFlags]);
  useEffect(() => { if (tab === 'kitchen') loadKitchen(); }, [tab, loadKitchen]);

  async function saveConfig() {
    setConfigSaving(true);
    setConfigErr(null);
    try {
      await api.post('/api/resumption/config', configForm);
      await loadConfig();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setConfigErr(err?.response?.data?.error || 'Failed to save');
    } finally { setConfigSaving(false); }
  }

  async function deleteArrival(id: string) {
    if (!confirm('Remove this arrival record?')) return;
    try {
      await api.delete(`/api/resumption/arrivals/${id}`);
      setArrivals(prev => prev.filter(a => a.id !== id));
    } catch { alert('Failed to remove arrival'); }
  }

  async function addArrivalsFromMissing() {
    if (!selectedMissing.size) return;
    setAddingArrivals(true);
    try {
      await api.post('/api/resumption/arrivals', { student_ids: [...selectedMissing] });
      setSelectedMissing(new Set());
      await loadMissing();
      setTab('arrivals');
    } catch { alert('Failed to record arrivals'); } finally { setAddingArrivals(false); }
  }

  async function resolveFlag(id: string) {
    const note = prompt('Resolution note (optional):');
    if (note === null) return;
    setResolvingFlag(id);
    try {
      await api.post(`/api/resumption/flags/${id}/resolve`, { resolution_note: note });
      await loadFlags();
    } catch { alert('Failed to resolve flag'); } finally { setResolvingFlag(null); }
  }

  const allClasses = [...new Set(boardingStudents.map(s => s.class_name))].sort();
  const allHouses  = [...new Set(boardingStudents.map(s => s.house).filter(Boolean))].sort() as string[];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'arrivals', label: 'Arrival Register' },
    { key: 'missing',  label: `Missing (${missing.length})` },
    { key: 'flags',    label: `Flags (${flags.filter(f => !f.resolved_at).length})` },
    { key: 'kitchen',  label: 'Kitchen Count' },
    { key: 'config',   label: 'Configuration' },
  ];

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Resumption Register</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
          Track student arrivals when school reopens · flag students in class without an arrival record
        </p>
      </div>

      {config && (
        <div style={{
          background: config.is_open ? '#F0FDF4' : '#FEF2F2',
          border: `1px solid ${config.is_open ? '#BBF7D0' : '#FECACA'}`,
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: config.is_open ? '#15803D' : '#B91C1C',
            background: config.is_open ? '#DCFCE7' : '#FEE2E2',
            borderRadius: 6, padding: '2px 8px',
          }}>
            {config.is_open ? 'Open' : 'Closed'}
          </span>
          {config.resumption_date && (
            <span style={{ fontSize: 13, color: '#374151' }}>
              Reopening: <strong>{new Date(config.resumption_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</strong>
            </span>
          )}
          <span style={{ fontSize: 13, color: '#374151' }}>
            Max days home: <strong>{config.max_days_home}</strong>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #E2E8F0', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            border: 'none', background: 'transparent', padding: '10px 16px', whiteSpace: 'nowrap',
            fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? '#16A34A' : '#6B7280', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid #16A34A' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Arrivals Tab ── */}
      {tab === 'arrivals' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              placeholder="Search name or ID…" value={arrivalSearch}
              onChange={e => setArrivalSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadArrivals()}
              style={{ ...inputStyle, width: 200 }}
            />
            <select value={arrivalClass} onChange={e => setArrivalClass(e.target.value)} style={inputStyle}>
              <option value="">All Classes</option>
              {allClasses.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={arrivalHouse} onChange={e => setArrivalHouse(e.target.value)} style={inputStyle}>
              <option value="">All Houses</option>
              {allHouses.map(h => <option key={h}>{h}</option>)}
            </select>
            <button onClick={loadArrivals} style={btn('ghost')}>Search</button>
          </div>

          {arrivalsErr && (
            <p style={{ color: '#DC2626', fontSize: 12, marginBottom: 12, background: '#FEF2F2', padding: '8px 12px', borderRadius: 6 }}>
              {arrivalsErr}
            </p>
          )}
          {arrivalsLoading ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
          ) : arrivals.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>No arrival records yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Student', 'ID', 'Class', 'House', 'Arrival Date', 'Recorded By', ''].map(h => (
                      <th key={h} style={hCell}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map(a => (
                    <tr key={a.id} style={{ background: '#fff' }}>
                      <td style={cell}>{a.student_name}</td>
                      <td style={cell}>{a.student_code}</td>
                      <td style={cell}>{a.class_name}</td>
                      <td style={cell}>{a.house || '—'}</td>
                      <td style={cell}>{new Date(a.arrival_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
                      <td style={cell}>{a.recorded_by_name || '—'}</td>
                      <td style={cell}>
                        <button onClick={() => deleteArrival(a.id)} style={{ ...btn('danger'), padding: '4px 10px', fontSize: 12 }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
            {arrivals.length} student{arrivals.length !== 1 ? 's' : ''} recorded. Use the Missing tab to add more.
          </p>
        </div>
      )}

      {/* ── Missing Students Tab ── */}
      {tab === 'missing' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={missingClass} onChange={e => setMissingClass(e.target.value)} style={inputStyle}>
              <option value="">All Classes</option>
              {allClasses.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={missingHouse} onChange={e => setMissingHouse(e.target.value)} style={inputStyle}>
              <option value="">All Houses</option>
              {allHouses.map(h => <option key={h}>{h}</option>)}
            </select>
            <button onClick={loadMissing} style={btn('ghost')}>Refresh</button>
            {selectedMissing.size > 0 && (
              <button onClick={addArrivalsFromMissing} disabled={addingArrivals} style={btn('primary')}>
                {addingArrivals ? 'Recording…' : `Record Arrival (${selectedMissing.size} selected)`}
              </button>
            )}
            {missing.length > 0 && (
              <button onClick={() => {
                if (selectedMissing.size === missing.length) { setSelectedMissing(new Set()); }
                else { setSelectedMissing(new Set(missing.map(s => s.id))); }
              }} style={btn('ghost')}>
                {selectedMissing.size === missing.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {missingLoading ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
          ) : missing.length === 0 ? (
            <p style={{ color: '#16A34A', fontSize: 13, fontWeight: 600 }}>All boarding students have reported.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={hCell}></th>
                    {['Student', 'ID', 'Class', 'House'].map(h => <th key={h} style={hCell}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {missing.map(s => (
                    <tr key={s.id} style={{ background: selectedMissing.has(s.id) ? '#F0FDF4' : '#fff' }}>
                      <td style={{ ...cell, width: 40 }}>
                        <input type="checkbox" checked={selectedMissing.has(s.id)}
                          onChange={() => setSelectedMissing(prev => {
                            const next = new Set(prev);
                            next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                            return next;
                          })}
                        />
                      </td>
                      <td style={cell}>{s.student_name}</td>
                      <td style={cell}>{s.student_code}</td>
                      <td style={cell}>{s.class_name}</td>
                      <td style={cell}>{s.house || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
            {missing.length} boarding student{missing.length !== 1 ? 's' : ''} yet to report.
          </p>
        </div>
      )}

      {/* ── Flags Tab ── */}
      {tab === 'flags' && (
        <div>
          <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
            Students marked Present in class attendance who have no resumption arrival record. These are flagged automatically when teachers submit attendance.
          </p>
          {flagsLoading ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
          ) : flags.length === 0 ? (
            <p style={{ color: '#16A34A', fontSize: 13, fontWeight: 600 }}>No active flags.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Student', 'Class', 'House', 'Subject', 'Session Date', 'Flagged', 'Status', ''].map(h => (
                      <th key={h} style={hCell}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flags.map(f => (
                    <tr key={f.id} style={{ background: f.resolved_at ? '#F9FAFB' : '#FFF7ED' }}>
                      <td style={cell}>{f.student_name}</td>
                      <td style={cell}>{f.class_name}</td>
                      <td style={cell}>{f.house || '—'}</td>
                      <td style={cell}>{f.subject || '—'}</td>
                      <td style={cell}>{f.session_date ? new Date(f.session_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—'}</td>
                      <td style={cell}>{new Date(f.flagged_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
                      <td style={cell}>
                        {f.resolved_at ? (
                          <span style={{ color: '#16A34A', fontWeight: 600, fontSize: 12 }}>Resolved</span>
                        ) : (
                          <span style={{ color: '#D97706', fontWeight: 600, fontSize: 12 }}>Active</span>
                        )}
                      </td>
                      <td style={cell}>
                        {!f.resolved_at && (
                          <button
                            onClick={() => resolveFlag(f.id)}
                            disabled={resolvingFlag === f.id}
                            style={btn('primary')}
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Kitchen Count Tab ── */}
      {tab === 'kitchen' && (
        <div>
          {kitchenLoading ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
          ) : !kitchen ? (
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>No data available.</p>
          ) : (
            <>
              <div style={{
                display: 'inline-block',
                background: '#F0FDF4', border: '1px solid #BBF7D0',
                borderRadius: 12, padding: '20px 32px', marginBottom: 28,
              }}>
                <p style={{ fontSize: 13, color: '#15803D', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Boarders on Campus
                </p>
                <p style={{ fontSize: 48, fontWeight: 700, color: '#15803D', margin: '4px 0 0' }}>{kitchen.total}</p>
              </div>
              {kitchen.by_class.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 300 }}>
                    <thead>
                      <tr>
                        <th style={hCell}>Class</th>
                        <th style={{ ...hCell, textAlign: 'right' }}>Students on Campus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kitchen.by_class.map(row => (
                        <tr key={row.class_name}>
                          <td style={cell}>{row.class_name}</td>
                          <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <button onClick={loadKitchen} style={{ ...btn('ghost'), marginTop: 16 }}>Refresh</button>
        </div>
      )}

      {/* ── Config Tab ── */}
      {tab === 'config' && (
        <div style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Semester Configuration</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Resumption Date
            </label>
            <input type="date" value={configForm.resumption_date}
              onChange={e => setConfigForm(p => ({ ...p, resumption_date: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Maximum Days Allowed Home After Resumption
            </label>
            <input type="number" min={0} max={60} value={configForm.max_days_home}
              onChange={e => setConfigForm(p => ({ ...p, max_days_home: parseInt(e.target.value) || 0 }))}
              style={{ ...inputStyle, width: 120 }}
            />
          </div>

          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="is_open" checked={configForm.is_open}
              onChange={e => setConfigForm(p => ({ ...p, is_open: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="is_open" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              Arrival register is open (teachers can record student arrivals via mobile app)
            </label>
          </div>

          {configErr && (
            <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{configErr}</p>
          )}

          <button onClick={saveConfig} disabled={configSaving} style={btn('primary')}>
            {configSaving ? 'Saving…' : 'Save Configuration'}
          </button>

          {config?.updated_at && (
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
              Last updated: {new Date(config.updated_at).toLocaleString('en-GB')}
              {config.created_by_name ? ` by ${config.created_by_name}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
