'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface Location {
  id: string;
  name: string;
}

function formatDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function RemedialPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const absenceId = searchParams.get('absenceId') ?? '';
  const subject = searchParams.get('subject') ?? '';
  const className = searchParams.get('className') ?? '';
  const date = searchParams.get('date') ?? '';

  const [primary, setPrimary] = useState('#2ab289');
  const [locations, setLocations] = useState<Location[]>([]);

  const [remedialDate, setRemedialDate] = useState('');
  const [remedialTime, setRemedialTime] = useState('');
  const [duration, setDuration] = useState('');
  const [topic, setTopic] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadLocations = useCallback(async () => {
    try {
      const res = await teacherApi.get('/api/locations');
      const d = res.data;
      setLocations(Array.isArray(d) ? d : d?.locations ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadLocations();
  }, [loadLocations]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!remedialDate) errs.date = 'Remedial date is required.';
    if (!remedialTime) errs.time = 'Remedial time is required.';
    if (!duration || isNaN(Number(duration))) errs.duration = 'Duration (minutes) is required.';
    if (!topic.trim()) errs.topic = 'Topic is required.';
    if (!locationId) errs.location = 'Location is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setError('');
    try {
      await teacherApi.post('/api/remedial', {
        absenceId,
        subject,
        className,
        originalDate: date,
        remedialDate,
        remedialTime,
        duration: Number(duration),
        topic: topic.trim(),
        locationId,
        notes: notes.trim(),
      });
      router.push('/teacher/absences');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setError(axiosErr.response?.data?.message ?? 'Failed to schedule remedial lesson.');
      } else {
        setError('Failed to schedule remedial lesson.');
      }
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
        {/* Remedial Date */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Remedial Date</label>
          <input
            type="date"
            value={remedialDate}
            onChange={(e) => setRemedialDate(e.target.value)}
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          />
          {fieldErrors.date && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.date}</p>}
        </div>

        {/* Remedial Time */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Remedial Time</label>
          <input
            type="time"
            value={remedialTime}
            onChange={(e) => setRemedialTime(e.target.value)}
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          />
          {fieldErrors.time && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.time}</p>}
        </div>

        {/* Duration */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Duration (minutes)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 60"
            min="1"
            max="480"
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          />
          {fieldErrors.duration && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.duration}</p>}
        </div>

        {/* Topic */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
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
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none"
          >
            <option value="">Select a location...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          {fieldErrors.location && <p className="text-xs text-[#B83232] mt-1">{fieldErrors.location}</p>}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          disabled={loading}
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
