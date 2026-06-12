'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface RemedialLesson {
  id: string;
  subject: string;
  class_name: string;
  original_absence_date: string;
  remedial_date: string;
  remedial_time: string;
  duration_periods: number | null;
  topic: string | null;
  location_name: string | null;
  status: string;
  photo_url?: string | null;
  has_register: boolean;
}

interface StudentRecord {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  status: 'Present' | 'Absent' | 'Late' | null;
}

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function remedialStartDate(date: string, time: string): Date {
  // Combines "2026-06-10" + "08:30:00" into a local Date
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  const [h, mi, s] = time.slice(0, 8).split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s ?? 0);
}

function isStarted(date: string, time: string): boolean {
  return Date.now() >= remedialStartDate(date, time).getTime();
}

function RemedialCountdown({ target, onExpired }: { target: Date; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(id);
        setRemaining(0);
        onExpired();
      } else {
        setRemaining(diff);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpired]);

  if (remaining <= 0) return null;

  const totalSec = Math.floor(remaining / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;

  const parts = days > 0
    ? `${days}d ${hours}h ${mins}m`
    : `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2 border border-[#E2D9CC] bg-[#F4EFE6]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[#8C7E6E] shrink-0">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <p className="text-xs text-[#8C7E6E]">
        Starts in <span className="font-bold text-[#4A3F32] tabular-nums">{parts}</span>
      </p>
    </div>
  );
}

function statusColor(status: string, primary: string): { bg: string; color: string } {
  if (status === 'Completed')  return { bg: '#DCFCE7', color: '#15803D' };
  if (status === 'Verified')   return { bg: '#DBEAFE', color: '#1D4ED8' };
  if (status === 'Cancelled')  return { bg: '#F1F5F9', color: '#64748B' };
  return { bg: `${primary}18`, color: primary };
}

// ── Register Modal ────────────────────────────────────────────────────────────

function RegisterModal({
  remedial,
  primary,
  onClose,
  onSuccess,
}: {
  remedial: RemedialLesson;
  primary: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [students,    setStudents]    = useState<StudentRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [statuses,    setStatuses]    = useState<Record<string, 'Present' | 'Absent' | 'Late'>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await teacherApi.get(`/api/remedial/${remedial.id}/register`);
        const data: { students: StudentRecord[] } = res.data;
        setStudents(data.students);
        const init: Record<string, 'Present' | 'Absent' | 'Late'> = {};
        data.students.forEach(s => { init[s.id] = (s.status as 'Present' | 'Absent' | 'Late') || 'Present'; });
        setStatuses(init);
      } catch {
        setError('Failed to load student list.');
      } finally {
        setLoading(false);
      }
    })();
  }, [remedial.id]);

  function toggle(studentId: string) {
    setStatuses(prev => {
      const cur = prev[studentId] || 'Present';
      const next = cur === 'Present' ? 'Absent' : cur === 'Absent' ? 'Late' : 'Present';
      return { ...prev, [studentId]: next };
    });
  }

  function markAll(status: 'Present' | 'Absent') {
    setStatuses(prev => {
      const next = { ...prev };
      students.forEach(s => { next[s.id] = status; });
      return next;
    });
  }

  async function submit() {
    if (!students.length) return;
    setSubmitting(true); setError('');
    try {
      const records = students.map(s => ({ studentId: s.id, status: statuses[s.id] || 'Present' }));
      await teacherApi.post(`/api/remedial/${remedial.id}/register`, { records });
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save register.');
    } finally {
      setSubmitting(false);
    }
  }

  const present = students.filter(s => (statuses[s.id] || 'Present') === 'Present').length;
  const absent  = students.filter(s => statuses[s.id] === 'Absent').length;
  const late    = students.filter(s => statuses[s.id] === 'Late').length;
  const isMerged = new Set(students.map(s => s.class_name)).size > 1;

  function statusBadge(s: 'Present' | 'Absent' | 'Late') {
    if (s === 'Present') return { bg: '#DCFCE7', color: '#15803D', label: 'P' };
    if (s === 'Absent')  return { bg: '#FEE2E2', color: '#B91C1C', label: 'A' };
    return { bg: '#FEF9C3', color: '#92400E', label: 'L' };
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F4EFE6] dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-[#E2D9CC] dark:border-slate-700">
        <button onClick={onClose} className="text-sm font-semibold text-[#8C7E6E] dark:text-slate-400 py-1 px-3 rounded-lg bg-[#F4EFE6] dark:bg-slate-700">
          Cancel
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-[#2C2218] dark:text-white">Mark Register</p>
          <p className="text-xs text-[#8C7E6E] dark:text-slate-400">{remedial.subject} · {remedial.class_name}</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Quick-mark row */}
      <div className="flex gap-2 px-4 py-2 bg-white dark:bg-slate-800 border-b border-[#E2D9CC] dark:border-slate-700">
        <button
          onClick={() => markAll('Present')}
          className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700"
        >
          All Present
        </button>
        <button
          onClick={() => markAll('Absent')}
          className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700"
        >
          All Absent
        </button>
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          [1,2,3,4,5].map(i => <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl h-14 animate-pulse border border-[#E2D9CC] dark:border-slate-700" />)
        ) : students.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center border border-[#E2D9CC] dark:border-slate-700">
            <p className="text-sm text-[#8C7E6E] dark:text-slate-400">No students found in {remedial.class_name}</p>
          </div>
        ) : students.map(s => {
          const st = statuses[s.id] || 'Present';
          const badge = statusBadge(st);
          return (
            <div key={s.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-[#E2D9CC] dark:border-slate-700 flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2C2218] dark:text-white truncate">{s.name}</p>
                <p className="text-xs text-[#C0B5A5] dark:text-slate-400">{s.student_code}{isMerged ? ` · ${s.class_name}` : ''}</p>
              </div>
              <button
                onClick={() => toggle(s.id)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary + Submit */}
      <div className="bg-white dark:bg-slate-800 border-t border-[#E2D9CC] dark:border-slate-700 px-4 py-3">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex gap-4 text-xs font-semibold mb-3">
          <span className="text-green-700 dark:text-green-400">Present: {present}</span>
          <span className="text-red-700 dark:text-red-400">Absent: {absent}</span>
          <span className="text-amber-700 dark:text-amber-400">Late: {late}</span>
        </div>
        <button
          onClick={submit}
          disabled={submitting || loading || students.length === 0}
          className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
          style={{ background: primary }}
        >
          {submitting ? 'Saving…' : 'Save Register'}
        </button>
      </div>
    </div>
  );
}

// ── Submit Proof Modal ────────────────────────────────────────────────────────

function SubmitProofModal({
  remedial,
  primary,
  onClose,
  onSuccess,
}: {
  remedial: RemedialLesson;
  primary: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  function compressFrame(src: HTMLCanvasElement): string {
    const compress = (maxW: number, q: number) => {
      const c = document.createElement('canvas');
      const scale = Math.min(1, maxW / src.width);
      c.width  = Math.round(src.width  * scale);
      c.height = Math.round(src.height * scale);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    let dataUrl = compress(640, 0.4);
    if (dataUrl.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
    return dataUrl;
  }

  const [step,        setStep]        = useState<'camera' | 'preview'>('camera');
  const [imageBase64, setImageBase64] = useState('');
  const [gps,         setGps]         = useState('');
  const [gpsError,    setGpsError]    = useState('');
  const [topic,       setTopic]       = useState(remedial.topic ?? '');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [facingMode,  setFacingMode]  = useState<'environment' | 'user'>('environment');

  async function startCamera(facing: 'environment' | 'user') {
    streamRef.current?.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setError('');
    } catch {
      setError('Camera not available. Please allow camera access.');
    }
  }

  useEffect(() => {
    startCamera('environment');
    navigator.geolocation?.getCurrentPosition(
      pos => setGps(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => setGpsError('GPS unavailable — submission will proceed without location verification.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function flipCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await startCamera(next);
  }

  function capture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setImageBase64(compressFrame(canvas));
    streamRef.current?.getTracks().forEach(t => t.stop());
    setStep('preview');
  }

  function retake() {
    setImageBase64('');
    setStep('camera');
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      } catch { setError('Camera not available.'); }
    })();
  }

  async function submit() {
    if (!imageBase64) { setError('Please capture a photo first.'); return; }
    setSubmitting(true); setError('');
    try {
      await teacherApi.post(`/api/remedial/${remedial.id}/submit`, {
        imageBase64,
        gpsCoordinates: gps || undefined,
        topic: topic.trim() || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to submit proof. Please try again.');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button onClick={onClose} className="text-white text-sm font-semibold py-1 px-3 rounded-lg bg-white/10">
          Cancel
        </button>
        <p className="text-white text-sm font-bold">Submit Proof</p>
        <div className="w-16" />
      </div>

      {step === 'camera' ? (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="flex-1 w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="bg-black px-4 py-6 flex flex-col items-center gap-3">
            <p className="text-white/70 text-xs text-center">
              {remedial.subject} — {remedial.class_name} · {fmt(remedial.remedial_date)}
            </p>
            {gpsError && <p className="text-amber-400 text-xs text-center">{gpsError}</p>}
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <div className="flex items-center gap-8">
              <button
                onClick={flipCamera}
                className="w-10 h-10 rounded-full bg-white/15 active:bg-white/30 flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 9A8 8 0 0 0 5.5 5.5L4 9m16 6A8 8 0 0 1 4 15l-1.5 3.5" />
                </svg>
              </button>
              <button onClick={capture} className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/40" />
              <div className="w-10 h-10" />
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto bg-[#F4EFE6]">
          <img src={imageBase64} alt="Captured proof" className="w-full max-h-64 object-cover" />
          <div className="px-4 py-4 space-y-3">
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-1">Remedial</p>
              <p className="text-sm font-semibold text-[#2C2218]">{remedial.subject} — {remedial.class_name}</p>
              <p className="text-xs text-[#8C7E6E] mt-0.5">{fmt(remedial.remedial_date)} at {remedial.remedial_time?.slice(0, 5)}</p>
              {remedial.location_name && <p className="text-xs text-[#8C7E6E]">{remedial.location_name}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
              <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">
                Topic covered <span className="text-[#C0B5A5] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="What topic did you cover?"
                className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
              />
            </div>

            {gps ? (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">GPS captured ✓</p>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {gpsError || 'Acquiring GPS…'}
              </p>
            )}

            {error && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={retake} className="flex-1 py-3 rounded-xl border border-[#E2D9CC] text-sm font-semibold text-[#8C7E6E]">
                Retake
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ background: primary }}
              >
                {submitting ? 'Submitting…' : 'Submit Proof'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RemedialsPage() {
  const router = useRouter();
  const [primary,    setPrimary]    = useState('#2ab289');
  const [remedials,  setRemedials]  = useState<RemedialLesson[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState<RemedialLesson | null>(null);
  const [registering, setRegistering] = useState<RemedialLesson | null>(null);
  const [successId,  setSuccessId]  = useState<string | null>(null);
  const [regSuccessId, setRegSuccessId] = useState<string | null>(null);
  // tracks which scheduled remedial IDs have had their timer expire mid-session
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    setLoading(true);
    try {
      const res = await teacherApi.get(`/api/remedial/teacher/${teacher.id}`);
      setRemedials(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPrimary(getTeacherColors().primary);
    loadData();
  }, [loadData]);

  async function handleProofSuccess() {
    setSuccessId(submitting?.id ?? null);
    setSubmitting(null);
    await loadData();
    setTimeout(() => setSuccessId(null), 3000);
  }

  async function handleRegisterSuccess() {
    setRegSuccessId(registering?.id ?? null);
    setRegistering(null);
    await loadData();
    setTimeout(() => setRegSuccessId(null), 3000);
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
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
          <h1 className="text-xl font-bold text-[#2C2218]">Remedial Lessons</h1>
          <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${remedials.length} total`}</p>
        </div>
      </div>

      {successId && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 font-semibold">
          Proof submitted successfully! The admin will review and verify it.
        </div>
      )}
      {regSuccessId && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 font-semibold">
          Register saved successfully!
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl h-24 animate-pulse border border-[#E2D9CC]" />
          ))}
        </div>
      ) : remedials.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm font-semibold text-[#2C2218]">No remedial lessons</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Schedule one from an outstanding absence</p>
        </div>
      ) : (
        <div className="space-y-3">
          {remedials.map(rem => {
            const sc = statusColor(rem.status, primary);
            const started = rem.status === 'Scheduled'
              ? (liveIds.has(rem.id) || isStarted(rem.remedial_date, rem.remedial_time))
              : true;

            return (
              <div key={rem.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-semibold text-[#2C2218]">{rem.subject} — {rem.class_name}</p>
                    <p className="text-xs text-[#8C7E6E] mt-0.5">
                      {fmt(rem.remedial_date)} at {rem.remedial_time?.slice(0, 5)}
                      {rem.duration_periods ? ` · ${rem.duration_periods} period${rem.duration_periods !== 1 ? 's' : ''}` : ''}
                    </p>
                    {rem.topic && <p className="text-xs text-[#4A3F32] mt-1 italic">{rem.topic}</p>}
                    {rem.location_name && <p className="text-xs text-[#8C7E6E] mt-0.5">{rem.location_name}</p>}
                    <p className="text-[10px] text-[#C0B5A5] mt-1">
                      Absence: {fmt(rem.original_absence_date)}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: sc.bg, color: sc.color }}
                  >
                    {rem.status}
                  </span>
                </div>

                {/* Countdown — only shown while lesson hasn't started */}
                {rem.status === 'Scheduled' && !started && (
                  <RemedialCountdown
                    target={remedialStartDate(rem.remedial_date, rem.remedial_time)}
                    onExpired={() => setLiveIds(prev => new Set(prev).add(rem.id))}
                  />
                )}

                {rem.status !== 'Cancelled' && (
                  <div className={`flex gap-2 mt-2 ${!started ? 'opacity-40 pointer-events-none' : ''}`}>
                    {rem.status === 'Scheduled' && (
                      <button
                        disabled={!started}
                        onClick={() => setSubmitting(rem)}
                        className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:cursor-not-allowed"
                        style={{ background: primary }}
                      >
                        Submit Proof
                      </button>
                    )}

                    <button
                      disabled={!started}
                      onClick={() => started && setRegistering(rem)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border disabled:cursor-not-allowed ${rem.has_register
                        ? 'text-green-700 bg-green-50 border-green-200'
                        : 'text-[#8C7E6E] bg-[#F4EFE6] border-[#E2D9CC]'
                      } ${rem.status === 'Scheduled' ? 'flex-none px-4' : 'flex-1'}`}
                    >
                      {rem.has_register ? 'Register taken ✓' : 'Mark Register'}
                    </button>
                  </div>
                )}

                {rem.status === 'Completed' && !rem.has_register && (
                  <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    Proof submitted — awaiting admin verification.
                  </p>
                )}

                {rem.status === 'Verified' && (
                  <p className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    Verified by admin ✓
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {submitting && (
        <SubmitProofModal
          remedial={submitting}
          primary={primary}
          onClose={() => setSubmitting(null)}
          onSuccess={handleProofSuccess}
        />
      )}

      {registering && (
        <RegisterModal
          remedial={registering}
          primary={primary}
          onClose={() => setRegistering(null)}
          onSuccess={handleRegisterSuccess}
        />
      )}
    </div>
  );
}
