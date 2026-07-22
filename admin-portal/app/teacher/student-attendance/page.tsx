'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

/* ─── Types ─── */
interface StudentSession {
  id: string;
  date: string;
  subject: string;
  class_name: string;
  total: number;
  present: number;
  absent: number;
  late: number;
}

interface SessionRecord {
  id: string;
  status: 'Present' | 'Absent' | 'Late';
  student_id: string;
  student_code: string;
  name: string;
  class_name: string;
}

interface SessionDetail {
  session: StudentSession & { teacher_name: string };
  records: SessionRecord[];
}

interface AtRiskStudent {
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

/* ─── Helpers ─── */
function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Present: { bg: '#DCFCE7', color: '#15803D' },
  Absent:  { bg: '#FEF2F2', color: '#DC2626' },
  Late:    { bg: '#FFFBEB', color: '#D97706' },
};

const RISK_THRESHOLD = 75;

/* ─── Component ─── */
export default function StudentAttendancePage() {
  const [primary, setPrimary] = useState('#2ab289');
  const [tab, setTab]         = useState<'sessions' | 'atrisk'>('sessions');

  const today30  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  /* ── Sessions state ── */
  const [sessions,     setSessions]     = useState<StudentSession[]>([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [sessError,    setSessError]    = useState('');
  const [sessFrom,     setSessFrom]     = useState(today30);
  const [sessTo,       setSessTo]       = useState(todayStr);

  /* ── Session detail ── */
  const [detail,        setDetail]       = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editLoading,   setEditLoading]  = useState<string | null>(null);
  const [editError,     setEditError]    = useState('');

  /* ── At Risk state ── */
  const [atRisk,        setAtRisk]       = useState<AtRiskStudent[]>([]);
  const [riskLoading,   setRiskLoading]  = useState(false);
  const [riskError,     setRiskError]    = useState('');
  const [riskFrom,      setRiskFrom]     = useState(today30);
  const [riskTo,        setRiskTo]       = useState(todayStr);
  const [riskBelowOnly, setRiskBelowOnly] = useState(false);
  const [openClasses,   setOpenClasses]  = useState<Set<string>>(new Set());

  /* ─── Sessions load ─── */
  const fetchSessions = useCallback(async (from: string, to: string) => {
    const teacher = getTeacher();
    if (!teacher) return;
    setSessLoading(true); setSessError('');
    try {
      const params = new URLSearchParams({ from, to });
      const res = await teacherApi.get<StudentSession[]>(
        `/api/student-attendance/teacher/${teacher.id}?${params}`
      );
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSessError('Failed to load sessions.');
    } finally {
      setSessLoading(false);
    }
  }, []);

  /* ─── At Risk load ─── */
  const fetchAtRisk = useCallback(async (from: string, to: string) => {
    const teacher = getTeacher();
    if (!teacher) return;
    setRiskLoading(true); setRiskError('');
    try {
      const params = new URLSearchParams({ from, to });
      const res = await teacherApi.get<AtRiskStudent[]>(
        `/api/student-attendance/report/teacher/${teacher.id}/students?${params}`
      );
      setAtRisk(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRiskError('Failed to load student data.');
    } finally {
      setRiskLoading(false);
    }
  }, []);

  /* ─── Init ─── */
  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    fetchSessions(today30, todayStr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Session detail ─── */
  async function openDetail(sessionId: string) {
    setDetailLoading(true); setDetail(null); setEditError('');
    try {
      const res = await teacherApi.get<SessionDetail>(`/api/student-attendance/session/${sessionId}`);
      setDetail(res.data);
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateRecordStatus(recordId: string, newStatus: 'Present' | 'Absent' | 'Late') {
    if (!detail) return;
    const oldRecord = detail.records.find(r => r.id === recordId);
    if (!oldRecord || oldRecord.status === newStatus) return;
    const oldStatus = oldRecord.status;
    const sessionId = detail.session.id;

    setDetail(prev => {
      if (!prev) return prev;
      const updated = prev.records.map(r => r.id === recordId ? { ...r, status: newStatus } : r);
      return {
        ...prev,
        records: updated,
        session: {
          ...prev.session,
          present: updated.filter(r => r.status === 'Present').length,
          absent:  updated.filter(r => r.status === 'Absent').length,
          late:    updated.filter(r => r.status === 'Late').length,
        },
      };
    });
    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      present: s.present + (newStatus === 'Present' ? 1 : 0) - (oldStatus === 'Present' ? 1 : 0),
      absent:  s.absent  + (newStatus === 'Absent'  ? 1 : 0) - (oldStatus === 'Absent'  ? 1 : 0),
      late:    s.late    + (newStatus === 'Late'    ? 1 : 0) - (oldStatus === 'Late'    ? 1 : 0),
    } : s));

    setEditLoading(recordId); setEditError('');
    try {
      await teacherApi.patch(`/api/student-attendance/records/${recordId}`, { status: newStatus });
    } catch (err: unknown) {
      setDetail(prev => {
        if (!prev) return prev;
        const reverted = prev.records.map(r => r.id === recordId ? { ...r, status: oldStatus } : r);
        return {
          ...prev,
          records: reverted,
          session: {
            ...prev.session,
            present: reverted.filter(r => r.status === 'Present').length,
            absent:  reverted.filter(r => r.status === 'Absent').length,
            late:    reverted.filter(r => r.status === 'Late').length,
          },
        };
      });
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        present: s.present - (newStatus === 'Present' ? 1 : 0) + (oldStatus === 'Present' ? 1 : 0),
        absent:  s.absent  - (newStatus === 'Absent'  ? 1 : 0) + (oldStatus === 'Absent'  ? 1 : 0),
        late:    s.late    - (newStatus === 'Late'    ? 1 : 0) + (oldStatus === 'Late'    ? 1 : 0),
      } : s));
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setEditError(msg ?? 'Failed to update status. Please try again.');
    } finally {
      setEditLoading(null);
    }
  }

  return (
    <div className="min-h-screen pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 mb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">Student Attendance</h1>
        <p className="text-sm text-[#8C7E6E]">Sessions &amp; at-risk tracking</p>
      </div>

      {/* Tab toggle */}
      <div className="px-4 mb-4">
        <div className="flex bg-white rounded-2xl border border-[#E2D9CC] p-1 gap-1">
          {([
            ['sessions', 'Sessions'],
            ['atrisk',   'At Risk'],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'atrisk' && atRisk.length === 0 && !riskLoading) fetchAtRisk(riskFrom, riskTo);
              }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={tab === t ? { background: primary, color: '#fff' } : { color: '#8C7E6E' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        <>
          {/* Date range filter */}
          <div className="bg-white border-b border-[#E2D9CC] px-4 py-3 mb-4 flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-semibold text-[#8C7E6E] shrink-0">From</label>
              <input type="date" value={sessFrom}
                onChange={e => { setSessFrom(e.target.value); fetchSessions(e.target.value, sessTo); }}
                className="flex-1 border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-white text-[#2C2218] focus:outline-none" />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs font-semibold text-[#8C7E6E] shrink-0">To</label>
              <input type="date" value={sessTo}
                onChange={e => { setSessTo(e.target.value); fetchSessions(sessFrom, e.target.value); }}
                className="flex-1 border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-white text-[#2C2218] focus:outline-none" />
            </div>
          </div>

          <div className="px-4">
            {sessError && (
              <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{sessError}</p>
            )}
            {sessLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm font-semibold text-[#2C2218]">No student sessions found</p>
                <p className="text-xs text-[#8C7E6E] mt-1">Adjust the date range to see earlier records</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(sess => (
                  <button key={sess.id} type="button"
                    onClick={() => openDetail(sess.id)}
                    className="w-full bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 text-left active:opacity-80 transition-opacity">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-[#2C2218]">{sess.subject} — {sess.class_name}</p>
                        <p className="text-xs text-[#8C7E6E] mt-0.5">{formatDate(sess.date)}</p>
                      </div>
                      <p className="text-xs font-semibold text-[#8C7E6E] mt-0.5">{sess.total} students</p>
                    </div>
                    <div className="flex gap-3">
                      {[
                        { label: 'Present', val: sess.present, color: '#15803D', bg: '#DCFCE7' },
                        { label: 'Absent',  val: sess.absent,  color: '#DC2626', bg: '#FEF2F2' },
                        { label: 'Late',    val: sess.late,    color: '#D97706', bg: '#FFFBEB' },
                      ].map(({ label, val, color, bg }) => (
                        <div key={label} className="flex-1 rounded-lg py-1.5 text-center" style={{ background: bg }}>
                          <p className="text-base font-bold" style={{ color }}>{val}</p>
                          <p className="text-[10px] font-semibold" style={{ color }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Session detail bottom sheet */}
          {(detail || detailLoading) && (
            <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <div className="bg-white rounded-t-3xl w-full max-h-[85vh] flex flex-col shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2D9CC]">
                  <div>
                    <h2 className="text-base font-bold text-[#2C2218]">
                      {detail ? `${detail.session.class_name} — ${detail.session.subject}` : 'Loading…'}
                    </h2>
                    {detail && <p className="text-xs text-[#8C7E6E] mt-0.5">{formatDate(detail.session.date)}</p>}
                  </div>
                  {detail && (
                    <div className="flex gap-3 text-xs font-bold mr-3">
                      <span style={{ color: '#15803D' }}>{detail.records.filter(r => r.status === 'Present').length} Present</span>
                      <span style={{ color: '#DC2626' }}>{detail.records.filter(r => r.status === 'Absent').length} Absent</span>
                      {detail.records.filter(r => r.status === 'Late').length > 0 && (
                        <span style={{ color: '#D97706' }}>{detail.records.filter(r => r.status === 'Late').length} Late</span>
                      )}
                    </div>
                  )}
                  <button onClick={() => setDetail(null)} className="text-2xl font-bold text-[#8C7E6E] leading-none">×</button>
                </div>
                {editError && (
                  <p className="text-xs text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-2 mx-5 mt-2">
                    {editError}
                  </p>
                )}
                {/* Body */}
                <div className="overflow-y-auto flex-1 px-5 py-3">
                  {detailLoading && !detail && (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: primary, borderTopColor: 'transparent' }} />
                    </div>
                  )}
                  {detail && (
                    <>
                      <p className="text-[10px] font-semibold text-[#8C7E6E] mb-2">
                        Tap a badge to cycle status: Present → Absent → Late
                      </p>
                      <div className="space-y-2">
                        {detail.records.map(r => {
                          const nextSt: 'Present' | 'Absent' | 'Late' =
                            r.status === 'Present' ? 'Absent' : r.status === 'Absent' ? 'Late' : 'Present';
                          const sc = STATUS_STYLE[r.status] ?? STATUS_STYLE.Present;
                          const isUpdating = editLoading === r.id;
                          return (
                            <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-[#F4EFE6] last:border-0">
                              <div>
                                <p className="text-xs font-bold text-[#8C7E6E]">{r.student_code}</p>
                                <p className="text-sm font-semibold text-[#2C2218]">{r.name}</p>
                              </div>
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => updateRecordStatus(r.id, nextSt)}
                                className="text-xs font-semibold px-2.5 py-1 rounded-full disabled:opacity-60 active:opacity-70 transition-opacity"
                                style={{ background: sc.bg, color: sc.color }}>
                                {isUpdating ? '…' : r.status}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── At Risk tab ── */}
      {tab === 'atrisk' && (
        <>
          {/* Date range + toggle filter */}
          <div className="bg-white border-b border-[#E2D9CC] px-4 py-3 mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-semibold text-[#8C7E6E] shrink-0">From</label>
                <input type="date" value={riskFrom}
                  onChange={e => { setRiskFrom(e.target.value); fetchAtRisk(e.target.value, riskTo); }}
                  className="flex-1 border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-white text-[#2C2218] focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-semibold text-[#8C7E6E] shrink-0">To</label>
                <input type="date" value={riskTo}
                  onChange={e => { setRiskTo(e.target.value); fetchAtRisk(riskFrom, e.target.value); }}
                  className="flex-1 border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-white text-[#2C2218] focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              {([false, true] as const).map(v => (
                <button key={String(v)} onClick={() => setRiskBelowOnly(v)}
                  className="flex-1 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  style={riskBelowOnly === v
                    ? { background: primary, color: '#fff', borderColor: primary }
                    : { background: '#F0EDE8', color: '#4A3F32', borderColor: '#E2D9CC' }}>
                  {v ? `Below ${RISK_THRESHOLD}% only` : 'All Students'}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            {riskError && (
              <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{riskError}</p>
            )}
            {riskLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-16 animate-pulse" />
                ))}
              </div>
            ) : (() => {
              const classMap = new Map<string, AtRiskStudent[]>();
              for (const s of atRisk) {
                if (riskBelowOnly && (s.present_pct === null || s.present_pct >= RISK_THRESHOLD)) continue;
                if (!classMap.has(s.class_name)) classMap.set(s.class_name, []);
                classMap.get(s.class_name)!.push(s);
              }
              const classGroups = [...classMap.entries()].sort(([a], [b]) => a.localeCompare(b));

              if (classGroups.length === 0) return (
                <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
                  <p className="text-3xl mb-2">{riskBelowOnly ? '✅' : '📋'}</p>
                  <p className="text-sm font-semibold text-[#2C2218]">
                    {riskBelowOnly ? 'No students below threshold' : 'No student data for this period'}
                  </p>
                  <p className="text-xs text-[#8C7E6E] mt-1">Adjust the date range to see more records</p>
                </div>
              );

              return (
                <div className="space-y-2">
                  {classGroups.map(([className, students]) => {
                    const isOpen = openClasses.has(className);
                    const belowCount = students.filter(s => s.present_pct !== null && s.present_pct < RISK_THRESHOLD).length;
                    const hasAlert = belowCount > 0;
                    return (
                      <div key={className} className="rounded-2xl overflow-hidden border"
                        style={{ borderColor: hasAlert ? '#FECACA' : '#E2D9CC' }}>
                        <button type="button"
                          onClick={() => setOpenClasses(prev => {
                            const next = new Set(prev);
                            if (next.has(className)) next.delete(className); else next.add(className);
                            return next;
                          })}
                          className="w-full flex items-center justify-between px-4 py-3 text-left"
                          style={{ backgroundColor: hasAlert ? '#FFF8F8' : '#FAFAF8' }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <p className="text-sm font-bold text-[#2C2218] truncate">{className}</p>
                            <span className="text-xs text-[#8C7E6E] shrink-0">
                              {students.length} student{students.length !== 1 ? 's' : ''}
                              {hasAlert && !riskBelowOnly && (
                                <span style={{ color: '#DC2626' }}> · {belowCount} below {RISK_THRESHOLD}%</span>
                              )}
                            </span>
                          </div>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                            className="w-4 h-4 shrink-0 ml-2 transition-transform"
                            style={{ color: '#8C7E6E', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {isOpen && (
                          <div className="bg-white divide-y divide-[#F4EFE6]">
                            {students.map(s => {
                              const pct = s.present_pct ?? 0;
                              const barColor = pct >= 90 ? '#15803D' : pct >= RISK_THRESHOLD ? '#D97706' : '#DC2626';
                              const isLow = s.present_pct !== null && s.present_pct < RISK_THRESHOLD;
                              return (
                                <div key={s.id} className="px-4 py-3"
                                  style={{ backgroundColor: isLow ? '#FFF8F8' : 'white' }}>
                                  <div className="flex items-start justify-between mb-1.5">
                                    <div className="flex-1 min-w-0 pr-3">
                                      <p className="text-sm font-semibold text-[#2C2218]">{s.name}</p>
                                      <p className="text-xs text-[#8C7E6E]">{s.student_code}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-base font-bold" style={{ color: barColor }}>
                                        {s.present_pct !== null ? `${s.present_pct}%` : '—'}
                                      </p>
                                      <p className="text-[10px] text-[#8C7E6E]">attendance</p>
                                    </div>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden mb-1">
                                    <div className="h-1.5 rounded-full"
                                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                                  </div>
                                  <p className="text-xs text-[#8C7E6E]">
                                    {s.absent} absent{s.late > 0 ? ` · ${s.late} late` : ''} · {s.total_sessions} session{s.total_sessions !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
