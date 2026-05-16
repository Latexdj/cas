'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { StudentAttendanceSession, StudentAttendanceRecord } from '@/types/api';

/* ─── Types ─── */
interface SessionDetail {
  session: StudentAttendanceSession & { teacher_name: string; lesson_end_time: string | null };
  records: StudentAttendanceRecord[];
}

interface StudentReport {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  total_sessions: number;
  present: number;
  absent: number;
  late: number;
  present_pct: number | null;
}

/* ─── Constants ─── */
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Present: { bg: '#DCFCE7', color: '#15803D' },
  Absent:  { bg: '#FEF2F2', color: '#DC2626' },
  Late:    { bg: '#FFFBEB', color: '#D97706' },
};

const today = new Date().toISOString().slice(0, 10);

function pctColor(pct: number | null) {
  if (pct === null) return '#94A3B8';
  if (pct >= 90) return '#15803D';
  if (pct >= 75) return '#2563EB';
  if (pct >= 60) return '#D97706';
  return '#DC2626';
}

/* ─── Page ─── */
export default function StudentAttendancePage() {
  const [tab, setTab] = useState<'sessions' | 'report'>('sessions');

  /* Sessions tab state */
  const [sessions,   setSessions]   = useState<StudentAttendanceSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [detail,     setDetail]     = useState<SessionDetail | null>(null);
  const [loadingDtl, setLoadingDtl] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [savingId,   setSavingId]   = useState<string | null>(null);
  const [editError,  setEditError]  = useState('');
  const [from,       setFrom]       = useState(today);
  const [to,         setTo]         = useState(today);
  const [filterClass, setFilterClass] = useState('');

  /* Report tab state */
  const [report,        setReport]        = useState<StudentReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportClass,   setReportClass]   = useState('');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [reportFrom, setReportFrom] = useState(thirtyDaysAgo);
  const [reportTo,   setReportTo]   = useState(today);
  const LOW_THRESHOLD = 75;

  /* ─── Sessions load ─── */
  const loadSessions = useCallback(async (f = from, t = to, cls = filterClass) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: f, to: t });
      if (cls) params.set('class_name', cls);
      const res = await api.get<StudentAttendanceSession[]>(`/api/student-attendance?${params}`);
      setSessions(res.data);
    } finally { setLoading(false); }
  }, [from, to, filterClass]);

  /* ─── Report load ─── */
  const loadReport = useCallback(async (f = reportFrom, t = reportTo, cls = reportClass) => {
    setReportLoading(true);
    try {
      const params = new URLSearchParams({ from: f, to: t });
      if (cls) params.set('class_name', cls);
      const res = await api.get<StudentReport[]>(`/api/student-attendance/report/students?${params}`);
      setReport(res.data);
    } finally { setReportLoading(false); }
  }, [reportFrom, reportTo, reportClass]);

  useEffect(() => { loadSessions(); }, [from, to, filterClass]);
  useEffect(() => { if (tab === 'report') loadReport(); }, [tab]);

  /* ─── Session detail ─── */
  async function openDetail(sessionId: string) {
    setLoadingDtl(true); setDetail(null); setEditingId(null); setEditError('');
    try {
      const res = await api.get<SessionDetail>(`/api/student-attendance/session/${sessionId}`);
      setDetail(res.data);
    } finally { setLoadingDtl(false); }
  }

  async function saveStatus(recordId: string, status: string) {
    setSavingId(recordId); setEditError('');
    try {
      await api.patch(`/api/student-attendance/records/${recordId}`, { status });
      setDetail(prev => prev ? {
        ...prev,
        records: prev.records.map(r => r.id === recordId ? { ...r, status: status as 'Present' | 'Absent' | 'Late' } : r),
      } : null);
      setEditingId(null);
    } catch (e: unknown) {
      setEditError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Save failed');
    } finally { setSavingId(null); }
  }

  const uniqueClasses = [...new Set(sessions.map(s => s.class_name))].sort();
  const reportClasses = [...new Set(report.map(r => r.class_name))].sort();
  const lowAttendance = report.filter(r => r.present_pct !== null && r.present_pct < LOW_THRESHOLD).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Student Attendance</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Session records and per-student attendance reports</p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#F1F5F9' }}>
        {(['sessions', 'report'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
            style={tab === t
              ? { background: '#fff', color: '#0F172A', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: '#64748B' }}>
            {t === 'sessions' ? 'Sessions' : 'Student Report'}
          </button>
        ))}
      </div>

      {/* ══ SESSIONS TAB ══ */}
      {tab === 'sessions' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: '#64748B' }}>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: '#64748B' }}>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
            </div>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
              <option value="">All Classes</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Sessions table */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No sessions found for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                      {['Date', 'Class', 'Subject', 'Teacher', 'Present', 'Absent', 'Late', 'Total', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                        style={{ borderBottom: i < sessions.length - 1 ? '1px solid #F8FAFC' : 'none' }}
                        onClick={() => openDetail(s.id)}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#475569' }}>{s.date}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{s.class_name}</td>
                        <td className="px-4 py-3" style={{ color: '#475569' }}>{s.subject}</td>
                        <td className="px-4 py-3" style={{ color: '#475569' }}>{s.teacher_name}</td>
                        <td className="px-4 py-3 font-mono font-bold" style={{ color: '#15803D' }}>{s.present}</td>
                        <td className="px-4 py-3 font-mono font-bold" style={{ color: s.absent > 0 ? '#DC2626' : '#94A3B8' }}>{s.absent}</td>
                        <td className="px-4 py-3 font-mono font-bold" style={{ color: s.late > 0 ? '#D97706' : '#94A3B8' }}>{s.late}</td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{s.total}</td>
                        <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#2563EB' }}>View →</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ STUDENT REPORT TAB ══ */}
      {tab === 'report' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: '#64748B' }}>From</label>
              <input type="date" value={reportFrom}
                onChange={e => { setReportFrom(e.target.value); loadReport(e.target.value, reportTo, reportClass); }}
                className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold" style={{ color: '#64748B' }}>To</label>
              <input type="date" value={reportTo}
                onChange={e => { setReportTo(e.target.value); loadReport(reportFrom, e.target.value, reportClass); }}
                className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
            </div>
            <select value={reportClass}
              onChange={e => { setReportClass(e.target.value); loadReport(reportFrom, reportTo, e.target.value); }}
              className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2E8F0', color: '#0F172A' }}>
              <option value="">All Classes</option>
              {reportClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Summary badges */}
          {!reportLoading && report.length > 0 && (
            <div className="flex gap-3">
              <div className="rounded-lg px-4 py-2.5 text-sm font-semibold" style={{ background: '#F0FDF4', color: '#15803D' }}>
                {report.length} students tracked
              </div>
              {lowAttendance > 0 && (
                <div className="rounded-lg px-4 py-2.5 text-sm font-semibold" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                  ⚠ {lowAttendance} below {LOW_THRESHOLD}% attendance
                </div>
              )}
            </div>
          )}

          {/* Report table */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
            {reportLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
              </div>
            ) : report.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No student data for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                      {['ID', 'Name', 'Class', 'Sessions', 'Present', 'Absent', 'Late', 'Attendance %'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r, i) => (
                      <tr key={r.id}
                        style={{
                          borderBottom: i < report.length - 1 ? '1px solid #F8FAFC' : 'none',
                          backgroundColor: r.present_pct !== null && r.present_pct < LOW_THRESHOLD ? '#FFF8F8' : 'transparent',
                        }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{r.student_code}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{r.name}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#475569' }}>{r.class_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-center" style={{ color: '#64748B' }}>{r.total_sessions}</td>
                        <td className="px-4 py-3 font-mono font-bold text-center" style={{ color: '#15803D' }}>{r.present}</td>
                        <td className="px-4 py-3 font-mono font-bold text-center" style={{ color: r.absent > 0 ? '#DC2626' : '#94A3B8' }}>{r.absent}</td>
                        <td className="px-4 py-3 font-mono font-bold text-center" style={{ color: r.late > 0 ? '#D97706' : '#94A3B8' }}>{r.late}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" style={{ minWidth: 60 }}>
                              <div className="h-1.5 rounded-full" style={{
                                width: `${Math.min(r.present_pct ?? 0, 100)}%`,
                                backgroundColor: pctColor(r.present_pct),
                              }} />
                            </div>
                            <span className="text-xs font-bold w-10 text-right" style={{ color: pctColor(r.present_pct) }}>
                              {r.present_pct !== null ? `${r.present_pct}%` : '—'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ SESSION DETAIL MODAL ══ */}
      {(detail || loadingDtl) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>
                  {detail ? `${detail.session.class_name} — ${detail.session.subject}` : 'Loading…'}
                </h2>
                {detail && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{detail.session.date} · {detail.session.teacher_name}</p>}
              </div>
              {detail && (
                <div className="flex gap-4 text-sm">
                  <span className="font-bold" style={{ color: '#15803D' }}>{detail.records.filter(r => r.status === 'Present').length} Present</span>
                  <span className="font-bold" style={{ color: '#DC2626' }}>{detail.records.filter(r => r.status === 'Absent').length} Absent</span>
                  {detail.records.filter(r => r.status === 'Late').length > 0 && (
                    <span className="font-bold" style={{ color: '#D97706' }}>{detail.records.filter(r => r.status === 'Late').length} Late</span>
                  )}
                </div>
              )}
              <button className="text-xl font-bold ml-4" style={{ color: '#94A3B8' }} onClick={() => { setDetail(null); setEditingId(null); }}>×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {loadingDtl && !detail && (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                </div>
              )}
              {editError && <p className="text-sm mb-3 p-2 rounded" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{editError}</p>}
              {detail && (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {['ID', 'Name', 'Status', ''].map(h => (
                        <th key={h} className="py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.records.map((r, i) => {
                      const sc = STATUS_COLORS[r.status];
                      const isEditing = editingId === r.id;
                      return (
                        <tr key={r.id} style={{ borderBottom: i < detail.records.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                          <td className="py-2.5 font-mono text-xs" style={{ color: '#64748B' }}>{r.student_code}</td>
                          <td className="py-2.5 font-semibold" style={{ color: '#0F172A' }}>{r.name}</td>
                          <td className="py-2.5">
                            {isEditing ? (
                              <div className="flex gap-2 items-center">
                                {['Present', 'Absent', 'Late'].map(st => (
                                  <button key={st}
                                    className="px-2 py-0.5 rounded-full text-xs font-semibold border-2 transition-all"
                                    style={{
                                      backgroundColor: r.status === st ? STATUS_COLORS[st].bg : 'transparent',
                                      color: STATUS_COLORS[st].color,
                                      borderColor: STATUS_COLORS[st].color,
                                    }}
                                    disabled={savingId === r.id}
                                    onClick={() => saveStatus(r.id, st)}
                                  >{st}</button>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: sc.bg, color: sc.color }}>{r.status}</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {!isEditing
                              ? <button className="text-xs font-semibold" style={{ color: '#2563EB' }} onClick={() => { setEditingId(r.id); setEditError(''); }}>Edit</button>
                              : <button className="text-xs font-semibold" style={{ color: '#94A3B8' }} onClick={() => setEditingId(null)}>Cancel</button>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
