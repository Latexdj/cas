'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

/* ─── Types ─── */
interface AttendanceRecord {
  id: string;
  date: string;
  subject: string;
  class_names: string;
  topic?: string;
  location_name?: string;
  periods?: number;
}

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester: 1 | 2 | null;
}

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
const PAGE_SIZE = 30;

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

/* ─── Component ─── */
export default function HistoryPage() {
  const [primary, setPrimary] = useState('#2ab289');
  const [tab, setTab] = useState<'my' | 'students' | 'atrisk'>('my');

  /* ── My Attendance state ── */
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [offset,       setOffset]       = useState(0);
  const [hasMore,      setHasMore]      = useState(true);
  const [error,        setError]        = useState('');
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [filterYear,   setFilterYear]   = useState('');
  const [filterSem,    setFilterSem]    = useState('');

  /* ── Student Sessions state ── */
  const [sessions,     setSessions]     = useState<StudentSession[]>([]);
  const [sessLoading,  setSessLoading]  = useState(false);
  const [sessError,    setSessError]    = useState('');
  const today30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [sessFrom, setSessFrom] = useState(today30);
  const [sessTo,   setSessTo]   = useState(todayStr);

  /* ── Session detail ── */
  const [detail,       setDetail]       = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── At Risk state ── */
  const [atRisk,        setAtRisk]       = useState<AtRiskStudent[]>([]);
  const [riskLoading,   setRiskLoading]  = useState(false);
  const [riskError,     setRiskError]    = useState('');
  const [riskFrom,      setRiskFrom]     = useState(today30);
  const [riskTo,        setRiskTo]       = useState(todayStr);
  const [riskBelowOnly, setRiskBelowOnly] = useState(false);
  const RISK_THRESHOLD = 75;

  /* ─── My Attendance load ─── */
  const fetchPage = useCallback(async (
    currentOffset: number,
    append: boolean,
    year = filterYear,
    sem  = filterSem,
  ) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (year) params.set('academic_year_id', year);
      if (sem)  params.set('semester', sem);
      const res = await teacherApi.get(`/api/attendance/history?${params}`);
      const d = res.data;
      const newRecords: AttendanceRecord[] = Array.isArray(d) ? d : d?.records ?? d?.history ?? [];
      if (append) setRecords(prev => [...prev, ...newRecords]);
      else        setRecords(newRecords);
      setHasMore(newRecords.length === PAGE_SIZE);
      setOffset(currentOffset + newRecords.length);
    } catch {
      setError('Failed to load history.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterYear, filterSem]);

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

  /* ─── Student Sessions load ─── */
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

  /* ─── Init ─── */
  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);

    teacherApi.get<AcademicYear[]>('/api/academic-years').then(r => {
      const years = r.data ?? [];
      setAcademicYears(years);
      const current = years.find(y => y.is_current);
      const yearId = current?.id ?? '';
      const sem    = current?.current_semester ? String(current.current_semester) : '';
      setFilterYear(yearId);
      setFilterSem(sem);
      fetchPage(0, false, yearId, sem);
    }).catch(() => {
      fetchPage(0, false, '', '');
    });

    fetchSessions(today30, todayStr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter(year: string, sem: string) {
    setFilterYear(year);
    setFilterSem(sem);
    setRecords([]);
    setOffset(0);
    fetchPage(0, false, year, sem);
  }

  async function openDetail(sessionId: string) {
    setDetailLoading(true); setDetail(null);
    try {
      const res = await teacherApi.get<SessionDetail>(`/api/student-attendance/session/${sessionId}`);
      setDetail(res.data);
    } finally {
      setDetailLoading(false);
    }
  }

  const selectedYearName = academicYears.find(y => y.id === filterYear)?.name ?? 'All Years';
  const semLabel = filterSem === '1' ? 'Semester 1' : filterSem === '2' ? 'Semester 2' : 'All Semesters';

  return (
    <div className="min-h-screen pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 mb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">History</h1>
        <p className="text-sm text-[#8C7E6E]">Attendance &amp; student sessions</p>
      </div>

      {/* Tab toggle */}
      <div className="px-4 mb-4">
        <div className="flex bg-white rounded-2xl border border-[#E2D9CC] p-1 gap-1">
          {([
            ['my',       'My Attendance'],
            ['students', 'Sessions'],
            ['atrisk',   'At Risk'],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === 'atrisk' && atRisk.length === 0 && !riskLoading) fetchAtRisk(riskFrom, riskTo);
              }}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={tab === t
                ? { background: primary, color: '#fff' }
                : { color: '#8C7E6E' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── My Attendance tab ── */}
      {tab === 'my' && (
        <>
          {/* Filter bar */}
          <div className="bg-white border-b border-[#E2D9CC] px-4 pb-3 mb-4">
            <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
              {academicYears.map(y => (
                <button key={y.id} onClick={() => applyFilter(y.id, filterSem)}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  style={filterYear === y.id
                    ? { background: primary, color: '#fff', borderColor: primary }
                    : { background: '#F0EDE8', color: '#4A3F32', borderColor: '#E2D9CC' }}>
                  {y.name}{y.is_current ? ' ✦' : ''}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {([['', 'All'], ['1', 'Sem 1'], ['2', 'Sem 2']] as const).map(([val, label]) => (
                <button key={val} onClick={() => applyFilter(filterYear, val)}
                  className="flex-1 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  style={filterSem === val
                    ? { background: primary, color: '#fff', borderColor: primary }
                    : { background: '#F0EDE8', color: '#4A3F32', borderColor: '#E2D9CC' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
              {selectedYearName} · {semLabel}
            </p>
            {error && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />)}
              </div>
            ) : records.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
                <p className="text-[#8C7E6E] text-sm">No records for {selectedYearName} · {semLabel}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map(rec => (
                  <div key={rec.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#2C2218] truncate">{rec.subject} — {rec.class_names}</p>
                        <p className="text-xs text-[#8C7E6E] mt-0.5">{formatDate(rec.date)}</p>
                        {rec.topic && <p className="text-xs text-[#8C7E6E] mt-1 truncate"><span className="font-medium">Topic:</span> {rec.topic}</p>}
                        {rec.location_name && <p className="text-xs text-[#8C7E6E] truncate"><span className="font-medium">Location:</span> {rec.location_name}</p>}
                      </div>
                      {rec.periods && (
                        <div className="shrink-0 text-center">
                          <p className="text-base font-bold" style={{ color: primary }}>{rec.periods}</p>
                          <p className="text-[10px] text-[#8C7E6E]">Period{rec.periods !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={() => fetchPage(offset, true)} disabled={loadingMore}
                    className="w-full py-3 rounded-xl text-sm font-semibold border border-[#E2D9CC] bg-white text-[#8C7E6E] disabled:opacity-40">
                    {loadingMore
                      ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-[#8C7E6E] border-t-transparent animate-spin" />Loading...</span>
                      : 'Load More'}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Student Sessions tab ── */}
      {tab === 'students' && (
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
            {sessError && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{sessError}</p>}
            {sessLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />)}
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
                {/* Modal header */}
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

                {/* Modal body */}
                <div className="overflow-y-auto flex-1 px-5 py-3">
                  {detailLoading && !detail && (
                    <div className="flex justify-center py-8">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
                    </div>
                  )}
                  {detail && (
                    <div className="space-y-2">
                      {detail.records.map(r => {
                        const sc = STATUS_STYLE[r.status] ?? STATUS_STYLE.Present;
                        return (
                          <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-[#F4EFE6] last:border-0">
                            <div>
                              <p className="text-xs font-bold text-[#8C7E6E]">{r.student_code}</p>
                              <p className="text-sm font-semibold text-[#2C2218]">{r.name}</p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: sc.bg, color: sc.color }}>
                              {r.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
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
            {riskError && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{riskError}</p>}
            {riskLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-20 animate-pulse" />)}
              </div>
            ) : (() => {
              const displayed = riskBelowOnly
                ? atRisk.filter(s => s.present_pct !== null && s.present_pct < RISK_THRESHOLD)
                : atRisk;
              if (displayed.length === 0) return (
                <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
                  <p className="text-3xl mb-2">{riskBelowOnly ? '✅' : '📋'}</p>
                  <p className="text-sm font-semibold text-[#2C2218]">
                    {riskBelowOnly ? 'No students below threshold' : 'No student data for this period'}
                  </p>
                  <p className="text-xs text-[#8C7E6E] mt-1">Adjust the date range to see more records</p>
                </div>
              );
              return (
                <div className="space-y-3">
                  {riskBelowOnly && (
                    <p className="text-xs font-semibold text-[#B83232] mb-1">{displayed.length} student{displayed.length !== 1 ? 's' : ''} below {RISK_THRESHOLD}% attendance</p>
                  )}
                  {displayed.map(s => {
                    const pct = s.present_pct ?? 0;
                    const barColor = pct >= 90 ? '#15803D' : pct >= RISK_THRESHOLD ? '#D97706' : '#DC2626';
                    const isLow = s.present_pct !== null && s.present_pct < RISK_THRESHOLD;
                    return (
                      <div key={s.id}
                        className="bg-white rounded-2xl border shadow-sm p-4"
                        style={{ borderColor: isLow ? '#FECACA' : '#E2D9CC', backgroundColor: isLow ? '#FFF8F8' : 'white' }}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="text-sm font-semibold text-[#2C2218]">{s.name}</p>
                            <p className="text-xs text-[#8C7E6E] mt-0.5">{s.class_name} · {s.student_code}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-bold" style={{ color: barColor }}>
                              {s.present_pct !== null ? `${s.present_pct}%` : '—'}
                            </p>
                            <p className="text-[10px] text-[#8C7E6E]">attendance</p>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden mb-1.5">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
                        </div>
                        <p className="text-xs text-[#8C7E6E]">
                          {s.absent} absent · {s.late > 0 ? `${s.late} late · ` : ''}{s.total_sessions} session{s.total_sessions !== 1 ? 's' : ''}
                        </p>
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
