'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

interface ClearanceRow {
  id: string; student_code: string; name: string; class_name: string; program_name?: string;
  clearance_id?: string; is_fully_cleared: boolean; fully_cleared_at?: string;
  total_offices: number; cleared_offices: number;
}

interface OfficeRow {
  office_name: string; office_type: string; cleared_at?: string; cleared_by_name?: string;
}
interface DetailResult {
  student: { id: string; student_code: string; name: string; class_name: string; program_name?: string };
  clearance: { is_fully_cleared: boolean; fully_cleared_at?: string; initiated_at?: string } | null;
  offices: OfficeRow[];
}

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClearancePage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [cls,     setCls]     = useState('');
  const [status,  setStatus]  = useState('');
  const [search,  setSearch]  = useState('');
  const [data,    setData]    = useState<ClearanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [certCode, setCertCode] = useState('');
  const [certResult, setCertResult] = useState<DetailResult | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError,   setCertError]   = useState('');
  const [detailId,    setDetailId]    = useState<string | null>(null);
  const [detail,      setDetail]      = useState<DetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cls)    params.set('class', cls);
    if (status) params.set('status', status);
    principalApi.get(`/api/principal/clearance?${params}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cls, status]);

  const dark = mounted && theme === 'dark';

  const classes = [...new Set<string>(data.map(r => r.class_name))].sort();

  const filtered = data.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.student_code.toLowerCase().includes(search.toLowerCase())
  );

  async function checkCertificate() {
    if (!certCode.trim()) return;
    setCertLoading(true); setCertError(''); setCertResult(null);
    try {
      const r = await principalApi.get('/api/principal/clearance', { params: { status: 'all' } });
      const found = (r.data as ClearanceRow[]).find(s =>
        s.student_code.toLowerCase() === certCode.trim().toLowerCase() ||
        s.name.toLowerCase().includes(certCode.trim().toLowerCase())
      );
      if (!found) return setCertError('Student not found.');
      const dr = await principalApi.get(`/api/principal/clearance/student/${found.id}`);
      setCertResult(dr.data);
    } catch { setCertError('Lookup failed. Try again.'); }
    finally  { setCertLoading(false); }
  }

  async function openDetail(id: string) {
    setDetailId(id); setDetail(null); setDetailLoading(true);
    try {
      const r = await principalApi.get(`/api/principal/clearance/student/${id}`);
      setDetail(r.data);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  }

  const cleared    = data.filter(r => r.is_fully_cleared).length;
  const inProgress = data.filter(r => r.clearance_id && !r.is_fully_cleared).length;
  const notStarted = data.filter(r => !r.clearance_id).length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>Student Clearance</h2>
      </div>

      {/* Certificate check */}
      <div style={{
        background: dark ? '#1E293B' : '#FFFFFF',
        border: `1.5px solid ${dark ? '#334155' : '#E2E8F0'}`,
        borderRadius: 14, padding: '18px 20px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 4 }}>
          Certificate Clearance Check
        </div>
        <p style={{ fontSize: 12, color: dark ? '#64748B' : '#94A3B8', marginBottom: 14 }}>
          Enter a student ID or name to verify clearance before issuing a certificate.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={certCode}
            onChange={e => setCertCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkCertificate()}
            placeholder="Student ID or Name…"
            style={{
              flex: 1, minWidth: 200, border: `1.5px solid ${dark ? '#334155' : '#E2E8F0'}`,
              background: dark ? '#0F172A' : '#F8FAFC', color: dark ? '#F1F5F9' : '#0F172A',
              borderRadius: 8, padding: '8px 12px', fontSize: 13,
            }}
          />
          <button
            onClick={checkCertificate}
            disabled={certLoading || !certCode.trim()}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: '#10B981', color: '#FFFFFF', border: 'none',
              cursor: certLoading ? 'not-allowed' : 'pointer', opacity: certLoading ? 0.7 : 1,
            }}
          >
            {certLoading ? 'Checking…' : 'Check'}
          </button>
        </div>

        {certError && <p style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{certError}</p>}

        {certResult && (
          <div style={{
            marginTop: 16, padding: '14px 16px', borderRadius: 10,
            background: certResult.clearance?.is_fully_cleared
              ? (dark ? '#14532D33' : '#DCFCE7') : (dark ? '#7F1D1D33' : '#FEE2E2'),
            border: `1px solid ${certResult.clearance?.is_fully_cleared ? '#10B981' : '#EF4444'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>{certResult.clearance?.is_fully_cleared ? '✅' : '❌'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: dark ? '#F1F5F9' : '#0F172A' }}>
                  {certResult.student.name}
                </div>
                <div style={{ fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>
                  {certResult.student.student_code} · {certResult.student.class_name}
                  {certResult.student.program_name ? ` · ${certResult.student.program_name}` : ''}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4,
                  color: certResult.clearance?.is_fully_cleared ? '#10B981' : '#EF4444' }}>
                  {certResult.clearance?.is_fully_cleared
                    ? `Fully Cleared — ${fmt(certResult.clearance.fully_cleared_at)}`
                    : certResult.clearance
                      ? `Not fully cleared · ${certResult.offices.filter(o => !o.cleared_at).length} office(s) pending`
                      : 'Clearance not started'}
                </div>
              </div>
            </div>

            {certResult.offices.length > 0 && !certResult.clearance?.is_fully_cleared && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                  PENDING OFFICES:
                </div>
                {certResult.offices.filter(o => !o.cleared_at).map(o => (
                  <div key={o.office_name} style={{
                    fontSize: 12, color: '#DC2626', display: 'flex', gap: 6, marginBottom: 2,
                  }}>
                    <span>•</span> {o.office_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Fully Cleared', count: cleared,    color: '#10B981', filter: 'fully_cleared' },
            { label: 'In Progress',   count: inProgress, color: '#F59E0B', filter: 'in_progress'  },
            { label: 'Not Started',   count: notStarted, color: '#94A3B8', filter: 'not_started'  },
          ].map(s => (
            <div
              key={s.filter}
              onClick={() => setStatus(status === s.filter ? '' : s.filter)}
              style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                background: status === s.filter ? s.color : (dark ? '#1E293B' : '#F8FAFC'),
                border: `1px solid ${status === s.filter ? s.color : (dark ? '#334155' : '#E2E8F0')}`,
                color: status === s.filter ? '#FFFFFF' : s.color, fontWeight: 600, fontSize: 13,
                transition: 'all 0.15s',
              }}
            >
              {s.count} {s.label}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search name or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        />
        <select
          value={cls}
          onChange={e => setCls(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value="">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : (
        <div style={{
          background: dark ? '#1E293B' : '#FFFFFF',
          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                  {['Student', 'Class', 'Program', 'Progress', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                      color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: dark ? '#475569' : '#94A3B8' }}>No students found</td></tr>
                ) : filtered.map((r, i) => {
                  const pct = r.total_offices > 0 ? Math.round((r.cleared_offices / r.total_offices) * 100) : null;
                  return (
                    <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` : 'none' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A' }}>{r.name}</div>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: dark ? '#64748B' : '#94A3B8' }}>{r.student_code}</div>
                      </td>
                      <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{r.class_name}</td>
                      <td style={{ padding: '10px 14px', color: dark ? '#94A3B8' : '#64748B', fontSize: 12 }}>{r.program_name || '—'}</td>
                      <td style={{ padding: '10px 14px', minWidth: 120 }}>
                        {pct != null ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 11 }}>
                              <div style={{ flex: 1, height: 5, background: '#E2E8F0', borderRadius: 3 }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3,
                                  background: pct === 100 ? '#10B981' : '#F59E0B' }} />
                              </div>
                              <span style={{ color: dark ? '#94A3B8' : '#64748B', minWidth: 32 }}>{r.cleared_offices}/{r.total_offices}</span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: dark ? '#475569' : '#94A3B8' }}>Not started</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '3px 10px',
                          background: r.is_fully_cleared ? (dark ? '#14532D33' : '#DCFCE7') :
                            r.clearance_id ? (dark ? '#78350F33' : '#FEF3C7') : (dark ? '#1E293B' : '#F1F5F9'),
                          color: r.is_fully_cleared ? '#10B981' : r.clearance_id ? '#D97706' : (dark ? '#475569' : '#94A3B8'),
                        }}>
                          {r.is_fully_cleared ? 'Cleared' : r.clearance_id ? 'In Progress' : 'Not Started'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => openDetail(r.id)}
                          style={{ fontSize: 12, fontWeight: 600, color: dark ? '#38BDF8' : '#0EA5E9', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', padding: 16,
        }}>
          <div style={{
            background: dark ? '#1E293B' : '#FFFFFF', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480,
            maxHeight: '80vh', overflowY: 'auto',
          }}>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
            ) : detail ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: dark ? '#F1F5F9' : '#0F172A' }}>{detail.student.name}</div>
                    <div style={{ fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>
                      {detail.student.student_code} · {detail.student.class_name}
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: dark ? '#64748B' : '#94A3B8' }}>✕</button>
                </div>

                {!detail.clearance ? (
                  <p style={{ color: dark ? '#64748B' : '#94A3B8', fontSize: 13 }}>Clearance process has not started.</p>
                ) : (
                  <>
                    <div style={{
                      padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                      background: detail.clearance.is_fully_cleared ? (dark ? '#14532D33' : '#DCFCE7') : (dark ? '#78350F33' : '#FEF3C7'),
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 14,
                        color: detail.clearance.is_fully_cleared ? '#10B981' : '#D97706' }}>
                        {detail.clearance.is_fully_cleared
                          ? `Fully Cleared on ${fmt(detail.clearance.fully_cleared_at)}`
                          : 'Clearance In Progress'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.offices.map(o => (
                        <div key={o.office_name} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                          borderRadius: 10, background: dark ? '#0F172A33' : '#F8FAFC',
                          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                        }}>
                          <span style={{ fontSize: 18 }}>{o.cleared_at ? '✅' : '⏳'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: dark ? '#F1F5F9' : '#0F172A' }}>{o.office_name}</div>
                            {o.cleared_at && (
                              <div style={{ fontSize: 11, color: dark ? '#64748B' : '#94A3B8' }}>
                                {fmt(o.cleared_at)}{o.cleared_by_name ? ` · ${o.cleared_by_name}` : ''}
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: o.cleared_at ? '#10B981' : '#D97706' }}>
                            {o.cleared_at ? 'Cleared' : 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
