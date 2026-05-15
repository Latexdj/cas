'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

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

const PAGE_SIZE = 30;

function formatDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HistoryPage() {
  const [primary,      setPrimary]      = useState('#2ab289');
  const [records,      setRecords]      = useState<AttendanceRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [offset,       setOffset]       = useState(0);
  const [hasMore,      setHasMore]      = useState(true);
  const [error,        setError]        = useState('');
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [filterYear,   setFilterYear]   = useState('');
  const [filterSem,    setFilterSem]    = useState('');

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
      if (append) {
        setRecords((prev) => [...prev, ...newRecords]);
      } else {
        setRecords(newRecords);
      }
      setHasMore(newRecords.length === PAGE_SIZE);
      setOffset(currentOffset + newRecords.length);
    } catch {
      setError('Failed to load history.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterYear, filterSem]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter(year: string, sem: string) {
    setFilterYear(year);
    setFilterSem(sem);
    setRecords([]);
    setOffset(0);
    setLoading(true);
    fetchPage(0, false, year, sem);
  }

  const selectedYearName = academicYears.find(y => y.id === filterYear)?.name ?? 'All Years';
  const semLabel = filterSem === '1' ? 'Semester 1' : filterSem === '2' ? 'Semester 2' : 'All Semesters';

  return (
    <div className="min-h-screen pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="px-4 pt-6 mb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">Attendance History</h1>
        <p className="text-sm text-[#8C7E6E]">Your recent submissions</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-[#E2D9CC] px-4 pb-3 mb-4">
        {/* Year chips */}
        <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
          {academicYears.map(y => (
            <button
              key={y.id}
              onClick={() => applyFilter(y.id, filterSem)}
              className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors"
              style={filterYear === y.id
                ? { background: primary, color: '#fff', borderColor: primary }
                : { background: '#F0EDE8', color: '#4A3F32', borderColor: '#E2D9CC' }}
            >
              {y.name}{y.is_current ? ' ✦' : ''}
            </button>
          ))}
        </div>
        {/* Semester chips */}
        <div className="flex gap-2">
          {[['', 'All'], ['1', 'Sem 1'], ['2', 'Sem 2']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => applyFilter(filterYear, val)}
              className="flex-1 py-1.5 rounded-full text-xs font-bold border transition-colors"
              style={filterSem === val
                ? { background: primary, color: '#fff', borderColor: primary }
                : { background: '#F0EDE8', color: '#4A3F32', borderColor: '#E2D9CC' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        {/* Active filter label */}
        <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">
          {selectedYearName} · {semLabel}
        </p>

        {error && (
          <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{error}</p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E2D9CC] h-24 animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-8 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto text-[#E2D9CC] mb-3">
              <polyline points="12 8 12 12 14 14" />
              <path d="M3.05 11a9 9 0 1 0 .5-4.5" />
              <polyline points="3 3 3 9 9 9" />
            </svg>
            <p className="text-[#8C7E6E] text-sm">No records for {selectedYearName} · {semLabel}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((rec) => (
              <div key={rec.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2C2218] truncate">{rec.subject} — {rec.class_names}</p>
                    <p className="text-xs text-[#8C7E6E] mt-0.5">{formatDate(rec.date)}</p>
                    {rec.topic && (
                      <p className="text-xs text-[#8C7E6E] mt-1 truncate">
                        <span className="font-medium">Topic:</span> {rec.topic}
                      </p>
                    )}
                    {rec.location_name && (
                      <p className="text-xs text-[#8C7E6E] truncate">
                        <span className="font-medium">Location:</span> {rec.location_name}
                      </p>
                    )}
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
              <button
                onClick={() => fetchPage(offset, true)}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl text-sm font-semibold border border-[#E2D9CC] bg-white text-[#8C7E6E] disabled:opacity-40"
              >
                {loadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-[#8C7E6E] border-t-transparent animate-spin" />
                    Loading...
                  </span>
                ) : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
