'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface Location {
  id: string;
  name: string;
}

function formatDate(iso: string) {
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

// Returns the banner content for period coverage feedback
function coverageBanner(
  periodsCovered: number,
  periodsLost: number,
  periodDuration: number,
  startTime: string,
  endTime: string,
): { kind: 'ok' | 'warn' | 'error'; text: string } | null {
  if (!startTime || !endTime) return null;
  const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (mins <= 0) return { kind: 'error', text: 'End time must be after start time.' };
  if (periodsCovered === 0) {
    return {
      kind: 'error',
      text: `The time selected (${mins} min) is shorter than one period (${periodDuration} min). Increase the duration.`,
    };
  }
  if (periodsCovered >= periodsLost) {
    return {
      kind: 'ok',
      text: `All ${periodsLost} period${periodsLost !== 1 ? 's' : ''} (${periodsLost * periodDuration} min) will be covered — the absence will be fully resolved on verification.`,
    };
  }
  const remaining = periodsLost - periodsCovered;
  return {
    kind: 'warn',
    text: `You are scheduling ${periodsCovered} of ${periodsLost} periods (${periodsCovered * periodDuration} min of ${periodsLost * periodDuration} min). ${remaining} period${remaining !== 1 ? 's' : ''} will remain outstanding after verification.`,
  };
}

export default function RemedialPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const absenceId     = searchParams.get('absenceId')     ?? '';
  const subject       = searchParams.get('subject')       ?? '';
  const className     = searchParams.get('className')     ?? '';
  const date          = searchParams.get('date')          ?? '';
  const periodsLost   = Math.max(1, parseInt(searchParams.get('periodsLost')     ?? '1'));
  const periodDuration = Math.max(1, parseInt(searchParams.get('periodDuration') ?? '60'));

  const [primary,    setPrimary]    = useState('#2ab289');
  const [locations,  setLocations]  = useState<Location[]>([]);

  const [remedialDate, setRemedialDate] = useState('');
  const [startTime,    setStartTime]    = useState('');
  const [endTime,      setEndTime]      = useState('');
  const [topic,        setTopic]        = useState('');
  const [locationId,   setLocationId]   = useState('');
  const [notes,        setNotes]        = useState('');

  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});

  // Live calculation of periods covered from start/end time
  const periodsCovered = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const mins = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (mins <= 0) return 0;
    return Math.floor(mins / periodDuration);
  }, [startTime, endTime, periodDuration]);

  const banner = useMemo(
    () => coverageBanner(periodsCovered, periodsLost, periodDuration, startTime, endTime),
    [periodsCovered, periodsLost, periodDuration, startTime, endTime],
  );

  const loadLocations = useCallback(async () => {
    try {
      const res = await teacherApi.get('/api/locations');
      const d = res.data;
      setLocations(Array.isArray(d) ? d : d?.locations ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setPrimary(getTeacherColors().primary);
    loadLocations();
  }, [loadLocations]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!remedialDate) errs.date      = 'Remedial date is required.';
    if (!startTime)    errs.startTime = 'Start time is required.';
    if (!endTime)      errs.endTime   = 'End time is required.';
    if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime))
      errs.endTime = 'End time must be after start time.';
    if (!topic.trim()) errs.topic     = 'Topic is required.';
    if (!locationId)   errs.location  = 'Location is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setError('');
    try {
      const teacher = getTeacher();
      await teacherApi.post('/api/remedial', {
        teacherId:            teacher?.id,
        absenceId,
        subject,
        className,
        originalAbsenceDate:  date,
        remedialDate,
        remedialTime:         startTime,
        remedialEndTime:      endTime,
        periodsCovered,
        durationPeriods:      periodsCovered,
        topic:                topic.trim(),
        locationId,
        notes:                notes.trim(),
      });
      router.push('/teacher/absences');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to schedule remedial lesson.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/teacher/absences')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Schedule Remedial</h1>
          <p className="text-xs text-[#8C7E6E]">Make up a missed lesson</p>
        </div>
      </div>

      {/* Absence info card */}
      {(subject || date) && (
        <div className="rounded-2xl px-4 py-4 border mb-5" style={{ background: '#FEF3C7', borderColor: '#FCD34D' }}>
          <p className="text-xs font-bold uppercase tracking-wide text-[#92400E] mb-1">Absence to make up</p>
          {subject && <p className="text-sm font-semibold text-[#78350F]">{subject} — {className}</p>}
          {date && <p className="text-xs text-[#92400E] mt-0.5">{formatDate(date)}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Periods Outstanding — read-only */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">
            Periods Outstanding
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1 border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-[#F4EFE6] text-[#2C2218] font-semibold">
              {periodsLost} period{periodsLost !== 1 ? 's' : ''} ({periodsLost * periodDuration} min)
            </div>
            <span className="text-xs text-[#8C7E6E] shrink-0">1 period = {periodDuration} min</span>
          </div>
          <p className="text-xs text-[#C0B5A5] mt-1">Set by timetable — cannot be changed</p>
        </div>

        {/* Remedial Date */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Remedial Date</label>
          <input
            type="date"
            value={remedialDate}
            onChange={e => setRemedialDate(e.target.value)}
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          />
          {fieldErrors.date && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.date}</p>}
        </div>

        {/* Start + End Time */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-3">
            Remedial Time
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#8C7E6E] mb-1.5">Start time</p>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
              />
              {fieldErrors.startTime && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.startTime}</p>}
            </div>
            <div>
              <p className="text-xs text-[#8C7E6E] mb-1.5">End time</p>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
              />
              {fieldErrors.endTime && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.endTime}</p>}
            </div>
          </div>

          {/* Live coverage feedback */}
          {banner && (
            <div
              className="mt-3 rounded-xl px-3 py-2.5 text-xs font-medium"
              style={
                banner.kind === 'ok'
                  ? { background: '#DCFCE7', color: '#15803D' }
                  : banner.kind === 'warn'
                  ? { background: '#FEF3C7', color: '#92400E' }
                  : { background: '#FEE2E2', color: '#B91C1C' }
              }
            >
              {banner.kind === 'ok'   && '✓ '}
              {banner.kind === 'warn' && '⚠ '}
              {banner.kind === 'error' && '✕ '}
              {banner.text}
            </div>
          )}
        </div>

        {/* Topic */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="What will you cover?"
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          />
          {fieldErrors.topic && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.topic}</p>}
        </div>

        {/* Location */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Location</label>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          >
            <option value="">Select a location...</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          {fieldErrors.location && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.location}</p>}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">
            Notes <span className="text-[#C0B5A5] font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes..."
            rows={3}
            className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || (!!banner && banner.kind === 'error')}
          className="w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
          style={{ background: primary }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Scheduling...
            </span>
          ) : 'Schedule Remedial Lesson'}
        </button>
      </form>
    </div>
  );
}
