'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTeacherColors } from '@/lib/teacher-auth';
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

interface MeetingRecord {
  id: string;
  date: string;
  meeting_title: string;
  meeting_type: string;
  start_time: string;
  end_time: string;
  notes?: string;
  location_name?: string;
  location_verified: boolean;
  submitted_at: string;
}

interface AcademicYear {
  id: string;
  name: string;
  is_current: boolean;
  current_semester: 1 | 2 | null;
}

/* ─── Helpers ─── */
const PAGE_SIZE = 30;

function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/* ─── Component ─── */
export default function HistoryPage() {
  const [primary, setPrimary] = useState('#2ab289');
  const [tab, setTab]         = useState<'my' | 'meetings'>('my');

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

  /* ── Meetings state ── */
  const [plcRecords,     setPlcRecords]     = useState<MeetingRecord[]>([]);
  const [plcLoading,     setPlcLoading]     = useState(false);
  const [plcLoadingMore, setPlcLoadingMore] = useState(false);
  const [plcOffset,      setPlcOffset]      = useState(0);
  const [plcHasMore,     setPlcHasMore]     = useState(true);
  const [plcError,       setPlcError]       = useState('');
  const [plcFilterYear,  setPlcFilterYear]  = useState('');
  const [plcFilterSem,   setPlcFilterSem]   = useState('');

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

  /* ─── PLC load ─── */
  const fetchPlcPage = useCallback(async (
    currentOffset: number,
    append: boolean,
    year = plcFilterYear,
    sem  = plcFilterSem,
  ) => {
    if (append) setPlcLoadingMore(true);
    else setPlcLoading(true);
    setPlcError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (year) params.set('academic_year_id', year);
      if (sem)  params.set('semester', sem);
      const res = await teacherApi.get<MeetingRecord[]>(`/api/meetings/my-history?${params}`);
      const rows: MeetingRecord[] = Array.isArray(res.data) ? res.data : [];
      if (append) setPlcRecords(prev => [...prev, ...rows]);
      else        setPlcRecords(rows);
      setPlcHasMore(rows.length === PAGE_SIZE);
      setPlcOffset(currentOffset + rows.length);
    } catch {
      setPlcError('Failed to load meeting history.');
    } finally {
      setPlcLoading(false);
      setPlcLoadingMore(false);
    }
  }, [plcFilterYear, plcFilterSem]);

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
      setPlcFilterYear(yearId);
      setPlcFilterSem(sem);
      fetchPlcPage(0, false, yearId, sem);
    }).catch(() => {
      fetchPage(0, false, '', '');
      fetchPlcPage(0, false, '', '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter(year: string, sem: string) {
    setFilterYear(year);
    setFilterSem(sem);
    setRecords([]);
    setOffset(0);
    fetchPage(0, false, year, sem);
  }

  function applyPlcFilter(year: string, sem: string) {
    setPlcFilterYear(year);
    setPlcFilterSem(sem);
    setPlcRecords([]);
    setPlcOffset(0);
    fetchPlcPage(0, false, year, sem);
  }

  const selectedYearName = academicYears.find(y => y.id === filterYear)?.name ?? 'All Years';
  const semLabel = filterSem === '1' ? 'Semester 1' : filterSem === '2' ? 'Semester 2' : 'All Semesters';

  return (
    <div className="min-h-screen pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 mb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">History</h1>
        <p className="text-sm text-[#8C7E6E]">Lessons &amp; meetings</p>
      </div>

      {/* Tab toggle */}
      <div className="px-4 mb-4">
        <div className="flex bg-white rounded-2xl border border-[#E2D9CC] p-1 gap-1">
          {([
            ['my',       'Lessons'],
            ['meetings', 'Meetings'],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={tab === t ? { background: primary, color: '#fff' } : { color: '#8C7E6E' }}
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
          <div className="bg-white border-b border-[#E2D9CC] px-4 py-3 mb-4 flex gap-3">
            <div className="flex-1 relative">
              <select
                value={filterYear}
                onChange={e => applyFilter(e.target.value, filterSem)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="w-36 relative">
              <select
                value={filterSem}
                onChange={e => applyFilter(filterYear, e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                <option value="">All</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="px-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
              {selectedYearName} · {semLabel}
            </p>
            {error && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />
                ))}
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

      {/* ── Meetings tab ── */}
      {tab === 'meetings' && (
        <>
          {/* Filter bar */}
          <div className="bg-white border-b border-[#E2D9CC] px-4 py-3 mb-4 flex gap-3">
            <div className="flex-1 relative">
              <select
                value={plcFilterYear}
                onChange={e => applyPlcFilter(e.target.value, plcFilterSem)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                {academicYears.map(y => (
                  <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="w-36 relative">
              <select
                value={plcFilterSem}
                onChange={e => applyPlcFilter(plcFilterYear, e.target.value)}
                className="w-full appearance-none border border-[#E2D9CC] rounded-xl px-3 py-2 pr-8 text-sm font-semibold text-[#2C2218] bg-[#F4EFE6] focus:outline-none focus:border-[#8C7E6E]"
              >
                <option value="">All</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5 text-[#8C7E6E] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="px-4">
            {!plcLoading && plcRecords.length > 0 && (
              <div className="flex gap-3 mb-4">
                <div className="flex-1 bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-3 text-center">
                  <p className="text-2xl font-bold" style={{ color: primary }}>{plcRecords.length}{plcHasMore ? '+' : ''}</p>
                  <p className="text-xs text-[#8C7E6E] mt-0.5">Sessions attended</p>
                </div>
              </div>
            )}
            {plcError && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{plcError}</p>}
            {plcLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />
                ))}
              </div>
            ) : plcRecords.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
                <p className="text-[#8C7E6E] text-sm">No meeting records for this period</p>
              </div>
            ) : (
              <div className="space-y-3">
                {plcRecords.map(rec => (
                  <div key={rec.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4"
                    style={{ borderLeftColor: '#A7D7B8', borderLeftWidth: 3 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1A4D2E] truncate">{rec.meeting_title}</p>
                        <p className="text-xs text-[#8C7E6E] mt-0.5">{formatDate(rec.date)}</p>
                        <p className="text-xs text-[#8C7E6E] mt-0.5">
                          {rec.start_time.slice(0, 5)} – {rec.end_time.slice(0, 5)}
                        </p>
                        {rec.location_name && (
                          <p className="text-xs text-[#8C7E6E] mt-1 truncate">
                            <span className="font-medium">Venue:</span> {rec.location_name}
                            {rec.location_verified && <span className="text-green-600 ml-1">✓</span>}
                          </p>
                        )}
                        {rec.notes && (
                          <p className="text-xs text-[#8C7E6E] mt-0.5 truncate">
                            <span className="font-medium">Notes:</span> {rec.notes}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <span className="text-xs font-bold px-2 py-1 rounded-full"
                          style={{ background: '#E4F4EB', color: '#1A4D2E' }}>{rec.meeting_type}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {plcHasMore && (
                  <button onClick={() => fetchPlcPage(plcOffset, true)} disabled={plcLoadingMore}
                    className="w-full py-3 rounded-xl text-sm font-semibold border border-[#E2D9CC] bg-white text-[#8C7E6E] disabled:opacity-40">
                    {plcLoadingMore
                      ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-[#8C7E6E] border-t-transparent animate-spin" />Loading...</span>
                      : 'Load More'}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
