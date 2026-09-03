'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SemesterConfig {
  id: string; resumption_date: string | null; max_days_home: number;
  is_open: boolean; created_by_name?: string; updated_at?: string;
}
interface Arrival {
  id: string; arrival_date: string; student_id: string; student_name: string;
  student_code: string; class_name: string; house: string | null;
  residential_status: string; recorded_by_name: string | null; notes: string | null;
}
interface MissingStudent {
  id: string; student_name: string; student_code: string;
  class_name: string; house: string | null; residential_status: string;
}
interface Flag {
  id: string; flagged_at: string; resolved_at: string | null; resolution_note: string | null;
  student_id: string; student_name: string; student_code: string;
  class_name: string; house: string | null; flagged_by_name: string | null;
  resolved_by_name: string | null; subject: string | null; session_date: string | null;
}
interface KitchenCount { total: number; by_class: { class_name: string; count: number }[]; }
type Tab = 'config' | 'arrivals' | 'missing' | 'flags' | 'kitchen';

const STYLES = `
  .res-wrap { padding: 20px 16px; max-width: 1100px; margin: 0 auto; }
  .res-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
  .res-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .res-btn-primary { background: #145C44; color: #fff; }
  .res-btn-primary:hover:not(:disabled) { background: #0B3D2E; }
  .res-btn-ghost { background: #F3F4F0; color: #374151; }
  .res-btn-ghost:hover:not(:disabled) { background: #E8E3DC; }
  .res-btn-danger { background: #B83232; color: #fff; }
  .res-btn-danger:hover:not(:disabled) { background: #991B1B; }
  .res-btn-sm { padding: 7px 13px; font-size: 13px; }
  .res-input { border: 1px solid #E5E0D8; border-radius: 8px; padding: 8px 12px; font-size: 14px; background: #fff; color: #1C1917; outline: none; }
  .res-input:focus { border-color: #145C44; }
  .res-label { font-size: 12px; font-weight: 600; color: #374151; display: block; margin-bottom: 6px; }
  .res-tabs { display: flex; gap: 2px; border-bottom: 2px solid #E5E0D8; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; margin-bottom: 24px; }
  .res-tabs::-webkit-scrollbar { display: none; }
  .res-tab-btn { flex-shrink: 0; border: none; background: transparent; padding: 10px 14px; white-space: nowrap; font-size: 13px; font-weight: 500; color: #6B7280; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.15s, border-color 0.15s; }
  .res-tab-btn.active { font-weight: 700; color: #145C44; border-bottom-color: #145C44; }
  .res-filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .res-th { padding: 9px 14px; font-size: 12px; font-weight: 600; color: #4B5563; background: #F8F7F3; border-bottom: 1px solid #E5E0D8; text-align: left; }
  .res-td { padding: 10px 14px; border-bottom: 1px solid #F1EDE8; font-size: 13px; color: #374151; vertical-align: middle; }
  /* Mobile card systems — hidden on desktop, shown on mobile */
  .res-missing-cards { display: none; }
  .res-arrivals-cards { display: none; }
  .res-flags-cards { display: none; }
  /* Mobile FAB */
  .res-mobile-fab { display: none; }
  @media (max-width: 767px) {
    .res-wrap { padding: 16px 14px 96px; }
    .res-filters { flex-direction: column; align-items: stretch; }
    .res-filters .res-input, .res-filters select.res-input { width: 100%; box-sizing: border-box; }
    .res-filters .res-btn { width: 100%; }
    .res-tab-btn { padding: 10px 11px; font-size: 13px; }
    /* Desktop tables hidden */
    .res-missing-table { display: none !important; }
    .res-arrivals-table { display: none !important; }
    .res-flags-table { display: none !important; }
    /* Mobile cards shown */
    .res-missing-cards { display: flex; flex-direction: column; border: 1px solid #E5E0D8; border-radius: 12px; overflow: hidden; }
    .res-mc-row { display: flex; align-items: center; gap: 12px; padding: 14px 12px; border-bottom: 1px solid #F1EDE8; cursor: pointer; background: #fff; }
    .res-mc-row:last-child { border-bottom: none; }
    .res-mc-row.sel { background: #F0F9F4; }
    .res-mc-check { width: 24px; height: 24px; border-radius: 6px; border: 2px solid #E5E0D8; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: background 0.1s, border-color 0.1s; }
    .res-mc-check.checked { background: #145C44; border-color: #145C44; }
    .res-mc-name { font-size: 15px; font-weight: 600; color: #1C1917; margin: 0 0 2px; }
    .res-mc-meta { font-size: 12px; color: #6B7280; margin: 0; }
    .res-arrivals-cards { display: flex; flex-direction: column; border: 1px solid #E5E0D8; border-radius: 12px; overflow: hidden; }
    .res-ac-row { padding: 14px 12px; border-bottom: 1px solid #F1EDE8; background: #fff; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .res-ac-row:last-child { border-bottom: none; }
    .res-ac-name { font-size: 14px; font-weight: 600; color: #1C1917; margin: 0 0 2px; }
    .res-ac-meta { font-size: 12px; color: #6B7280; margin: 0; }
    .res-flags-cards { display: flex; flex-direction: column; gap: 8px; }
    .res-flag-card { border: 1px solid #FCD9A0; border-radius: 10px; padding: 14px; background: #FFF7ED; }
    .res-flag-card.resolved { background: #F8F7F3; border-color: #E5E0D8; }
    .res-flag-name { font-size: 15px; font-weight: 600; color: #1C1917; margin: 0 0 3px; }
    .res-flag-meta { font-size: 12px; color: #6B7280; margin: 0 0 10px; }
    .res-flag-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    /* Sticky FAB for missing tab */
    .res-mobile-fab { display: block; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #E5E0D8; padding: 12px 14px; z-index: 50; box-shadow: 0 -2px 10px rgba(0,0,0,0.08); }
    .res-mobile-fab .res-btn { width: 100%; }
    /* Config form */
    .res-config-form { max-width: 100% !important; }
  }
  @media (min-width: 768px) {
    .res-missing-table { display: block; overflow-x: auto; }
    .res-arrivals-table { display: block; overflow-x: auto; }
    .res-flags-table { display: block; overflow-x: auto; }
    .res-mobile-fab { display: none !important; }
  }
`;

export default function ResumptionPage() {
  const [tab, setTab] = useState<Tab>('arrivals');

  const [config, setConfig]           = useState<SemesterConfig | null>(null);
  const [configForm, setConfigForm]   = useState({ resumption_date: '', max_days_home: 7, is_open: false });
  const [configSaving, setConfigSaving] = useState(false);
  const [configErr, setConfigErr]     = useState<string | null>(null);

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

  const [flags, setFlags]                 = useState<Flag[]>([]);
  const [flagsLoading, setFlagsLoading]   = useState(false);
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
    setArrivalsLoading(true); setArrivalsErr(null);
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
  useEffect(() => { loadMissing(); }, [loadMissing]);
  useEffect(() => { loadFlags(); }, [loadFlags]);
  useEffect(() => { if (tab === 'arrivals') loadArrivals(); }, [tab, loadArrivals]);
  useEffect(() => { if (tab === 'missing') loadMissing(); }, [tab, loadMissing]);
  useEffect(() => { if (tab === 'flags') loadFlags(); }, [tab, loadFlags]);
  useEffect(() => { if (tab === 'kitchen') loadKitchen(); }, [tab, loadKitchen]);

  async function saveConfig() {
    setConfigSaving(true); setConfigErr(null);
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

  function toggleMissing(id: string) {
    setSelectedMissing(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allClasses = [...new Set(boardingStudents.map(s => s.class_name))].sort();
  const allHouses  = [...new Set(boardingStudents.map(s => s.house).filter(Boolean))].sort() as string[];
  const activeFlags = flags.filter(f => !f.resolved_at).length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'arrivals', label: 'Arrivals' },
    { key: 'missing',  label: `Missing (${missing.length})` },
    { key: 'flags',    label: `Flags (${activeFlags})` },
    { key: 'kitchen',  label: 'Kitchen Count' },
    { key: 'config',   label: 'Configuration' },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <div className="res-wrap">

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', margin: 0 }}>Resumption Register</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            Track boarding student arrivals when school reopens. Flag students in class without an arrival record.
          </p>
        </div>

        {/* Status banner */}
        {config && (
          <div style={{
            background: config.is_open ? '#F0F9F4' : '#FEF2F2',
            border: `1px solid ${config.is_open ? '#BBF7D0' : '#FECACA'}`,
            borderRadius: 10, padding: '10px 16px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: config.is_open ? '#2D7A4F' : '#B83232',
              background: config.is_open ? '#DCFCE7' : '#FEE2E2',
              borderRadius: 6, padding: '2px 8px',
            }}>
              {config.is_open ? 'Open' : 'Closed'}
            </span>
            {config.resumption_date && (
              <span style={{ fontSize: 13, color: '#374151' }}>
                Reopening: <strong>{new Date(config.resumption_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
              </span>
            )}
            <span style={{ fontSize: 13, color: '#374151' }}>
              Max days home: <strong>{config.max_days_home}</strong>
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="res-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`res-tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Arrivals Tab ── */}
        {tab === 'arrivals' && (
          <div>
            <div className="res-filters">
              <input placeholder="Search name or ID…" value={arrivalSearch}
                onChange={e => setArrivalSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadArrivals()}
                className="res-input" style={{ width: 200 }}
              />
              <select value={arrivalClass} onChange={e => setArrivalClass(e.target.value)} className="res-input">
                <option value="">All Classes</option>
                {allClasses.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={arrivalHouse} onChange={e => setArrivalHouse(e.target.value)} className="res-input">
                <option value="">All Houses</option>
                {allHouses.map(h => <option key={h}>{h}</option>)}
              </select>
              <button onClick={loadArrivals} className="res-btn res-btn-ghost res-btn-sm">Search</button>
            </div>

            {arrivalsErr && (
              <p style={{ color: '#B83232', fontSize: 12, marginBottom: 12, background: '#FEF2F2', padding: '8px 12px', borderRadius: 6 }}>
                {arrivalsErr}
              </p>
            )}

            {arrivalsLoading ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
            ) : arrivals.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>
                No arrival records yet. Use the Missing tab to record student arrivals.
              </p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="res-arrivals-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Student', 'ID', 'Class', 'House', 'Arrival Date', 'Recorded By', ''].map(h => (
                          <th key={h} className="res-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {arrivals.map(a => (
                        <tr key={a.id} style={{ background: '#fff' }}>
                          <td className="res-td">{a.student_name}</td>
                          <td className="res-td">{a.student_code}</td>
                          <td className="res-td">{a.class_name}</td>
                          <td className="res-td">{a.house || '—'}</td>
                          <td className="res-td">{new Date(a.arrival_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className="res-td">{a.recorded_by_name || '—'}</td>
                          <td className="res-td">
                            <button onClick={() => deleteArrival(a.id)} className="res-btn res-btn-danger res-btn-sm">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="res-arrivals-cards">
                  {arrivals.map(a => (
                    <div key={a.id} className="res-ac-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="res-ac-name">{a.student_name}</p>
                        <p className="res-ac-meta">
                          {a.student_code}, {a.class_name}{a.house ? `, ${a.house}` : ''}
                        </p>
                        <p className="res-ac-meta" style={{ marginTop: 2 }}>
                          Arrived {new Date(a.arrival_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {a.recorded_by_name ? ` — ${a.recorded_by_name}` : ''}
                        </p>
                      </div>
                      <button onClick={() => deleteArrival(a.id)} className="res-btn res-btn-danger res-btn-sm" style={{ flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
              {arrivals.length} student{arrivals.length !== 1 ? 's' : ''} recorded.
            </p>
          </div>
        )}

        {/* ── Missing Students Tab ── */}
        {tab === 'missing' && (
          <div>
            <div className="res-filters">
              <select value={missingClass} onChange={e => setMissingClass(e.target.value)} className="res-input">
                <option value="">All Classes</option>
                {allClasses.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={missingHouse} onChange={e => setMissingHouse(e.target.value)} className="res-input">
                <option value="">All Houses</option>
                {allHouses.map(h => <option key={h}>{h}</option>)}
              </select>
              <button onClick={loadMissing} className="res-btn res-btn-ghost res-btn-sm">Refresh</button>
              {missing.length > 0 && (
                <button onClick={() => {
                  if (selectedMissing.size === missing.length) setSelectedMissing(new Set());
                  else setSelectedMissing(new Set(missing.map(s => s.id)));
                }} className="res-btn res-btn-ghost res-btn-sm">
                  {selectedMissing.size === missing.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
              {selectedMissing.size > 0 && (
                <button onClick={addArrivalsFromMissing} disabled={addingArrivals} className="res-btn res-btn-primary res-btn-sm">
                  {addingArrivals ? 'Recording…' : `Record Arrival (${selectedMissing.size})`}
                </button>
              )}
            </div>

            {missingLoading ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
            ) : missing.length === 0 ? (
              <p style={{ color: '#2D7A4F', fontSize: 13, fontWeight: 600 }}>All boarding students have reported.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="res-missing-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th className="res-th" style={{ width: 40 }}></th>
                        {['Student', 'ID', 'Class', 'House'].map(h => <th key={h} className="res-th">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {missing.map(s => (
                        <tr key={s.id} style={{ background: selectedMissing.has(s.id) ? '#F0F9F4' : '#fff' }}>
                          <td className="res-td" style={{ width: 40 }}>
                            <input type="checkbox" checked={selectedMissing.has(s.id)}
                              onChange={() => toggleMissing(s.id)}
                              style={{ width: 16, height: 16, accentColor: '#145C44' }}
                            />
                          </td>
                          <td className="res-td">{s.student_name}</td>
                          <td className="res-td">{s.student_code}</td>
                          <td className="res-td">{s.class_name}</td>
                          <td className="res-td">{s.house || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="res-missing-cards">
                  {missing.map(s => (
                    <div key={s.id} className={`res-mc-row${selectedMissing.has(s.id) ? ' sel' : ''}`}
                      onClick={() => toggleMissing(s.id)}
                    >
                      <div className={`res-mc-check${selectedMissing.has(s.id) ? ' checked' : ''}`}>
                        {selectedMissing.has(s.id) && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20,6 9,17 4,12"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="res-mc-name">{s.student_name}</p>
                        <p className="res-mc-meta">{s.student_code}, {s.class_name}{s.house ? `, ${s.house}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
              Students marked Present in class attendance who have no resumption arrival record. Flagged automatically when teachers submit attendance.
            </p>
            {flagsLoading ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</p>
            ) : flags.length === 0 ? (
              <p style={{ color: '#2D7A4F', fontSize: 13, fontWeight: 600 }}>No active flags.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="res-flags-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Student', 'Class', 'House', 'Subject', 'Session Date', 'Flagged', 'Status', ''].map(h => (
                          <th key={h} className="res-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flags.map(f => (
                        <tr key={f.id} style={{ background: f.resolved_at ? '#F9F8F5' : '#FFF7ED' }}>
                          <td className="res-td">{f.student_name}</td>
                          <td className="res-td">{f.class_name}</td>
                          <td className="res-td">{f.house || '—'}</td>
                          <td className="res-td">{f.subject || '—'}</td>
                          <td className="res-td">{f.session_date ? new Date(f.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td className="res-td">{new Date(f.flagged_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td className="res-td">
                            {f.resolved_at
                              ? <span style={{ color: '#2D7A4F', fontWeight: 600, fontSize: 12 }}>Resolved</span>
                              : <span style={{ color: '#C8780A', fontWeight: 600, fontSize: 12 }}>Active</span>
                            }
                          </td>
                          <td className="res-td">
                            {!f.resolved_at && (
                              <button onClick={() => resolveFlag(f.id)} disabled={resolvingFlag === f.id} className="res-btn res-btn-primary res-btn-sm">
                                Resolve
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="res-flags-cards">
                  {flags.map(f => (
                    <div key={f.id} className={`res-flag-card${f.resolved_at ? ' resolved' : ''}`}>
                      <p className="res-flag-name">{f.student_name}</p>
                      <p className="res-flag-meta">
                        {f.class_name}{f.house ? `, ${f.house}` : ''}
                        {f.subject ? ` — ${f.subject}` : ''}
                        {f.session_date ? `, ${new Date(f.session_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                      </p>
                      <div className="res-flag-actions">
                        {f.resolved_at
                          ? <span style={{ color: '#2D7A4F', fontWeight: 600, fontSize: 13 }}>Resolved</span>
                          : (
                            <>
                              <span style={{ color: '#C8780A', fontWeight: 600, fontSize: 13 }}>Active</span>
                              <button onClick={() => resolveFlag(f.id)} disabled={resolvingFlag === f.id} className="res-btn res-btn-primary res-btn-sm">
                                Resolve
                              </button>
                            </>
                          )
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
                  display: 'inline-block', background: '#F0F9F4', border: '1px solid #BBF7D0',
                  borderRadius: 12, padding: '20px 32px', marginBottom: 28,
                }}>
                  <p style={{ fontSize: 13, color: '#2D7A4F', fontWeight: 600, margin: 0 }}>Boarders on campus</p>
                  <p style={{ fontSize: 48, fontWeight: 700, color: '#2D7A4F', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    {kitchen.total}
                  </p>
                </div>
                {kitchen.by_class.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 280 }}>
                      <thead>
                        <tr>
                          <th className="res-th">Class</th>
                          <th className="res-th" style={{ textAlign: 'right' }}>On campus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kitchen.by_class.map(row => (
                          <tr key={row.class_name}>
                            <td className="res-td">{row.class_name}</td>
                            <td className="res-td" style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <button onClick={loadKitchen} className="res-btn res-btn-ghost res-btn-sm" style={{ marginTop: 16 }}>Refresh</button>
          </div>
        )}

        {/* ── Config Tab ── */}
        {tab === 'config' && (
          <div className="res-config-form" style={{ maxWidth: 460 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', marginBottom: 20 }}>Semester Configuration</h2>

            <div style={{ marginBottom: 16 }}>
              <label className="res-label">Resumption Date</label>
              <input type="date" value={configForm.resumption_date}
                onChange={e => setConfigForm(p => ({ ...p, resumption_date: e.target.value }))}
                className="res-input" style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="res-label">Maximum days allowed home after resumption</label>
              <input type="number" min={0} max={60} value={configForm.max_days_home}
                onChange={e => setConfigForm(p => ({ ...p, max_days_home: parseInt(e.target.value) || 0 }))}
                className="res-input" style={{ width: 120 }}
              />
            </div>

            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="is_open" checked={configForm.is_open}
                onChange={e => setConfigForm(p => ({ ...p, is_open: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: '#145C44' }}
              />
              <label htmlFor="is_open" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                Arrival register is open (teachers can record student arrivals)
              </label>
            </div>

            {configErr && <p style={{ color: '#B83232', fontSize: 13, marginBottom: 12 }}>{configErr}</p>}

            <button onClick={saveConfig} disabled={configSaving} className="res-btn res-btn-primary">
              {configSaving ? 'Saving…' : 'Save configuration'}
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

      {/* Mobile sticky FAB for Missing tab when students are selected */}
      {tab === 'missing' && selectedMissing.size > 0 && (
        <div className="res-mobile-fab">
          <button onClick={addArrivalsFromMissing} disabled={addingArrivals} className="res-btn res-btn-primary">
            {addingArrivals ? 'Recording…' : `Record arrival — ${selectedMissing.size} student${selectedMissing.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </>
  );
}

