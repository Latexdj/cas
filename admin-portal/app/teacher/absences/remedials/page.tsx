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
}

function fmt(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusColor(status: string, primary: string): { bg: string; color: string } {
  if (status === 'Completed')  return { bg: '#DCFCE7', color: '#15803D' };
  if (status === 'Verified')   return { bg: '#DBEAFE', color: '#1D4ED8' };
  if (status === 'Cancelled')  return { bg: '#F1F5F9', color: '#64748B' };
  return { bg: `${primary}18`, color: primary }; // Scheduled
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

  const [step,        setStep]        = useState<'camera' | 'preview'>('camera');
  const [imageBase64, setImageBase64] = useState('');
  const [gps,         setGps]         = useState('');
  const [gpsError,    setGpsError]    = useState('');
  const [topic,       setTopic]       = useState(remedial.topic ?? '');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  // Start camera and get GPS on mount
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch {
        setError('Camera not available. Please allow camera access.');
      }
    })();

    navigator.geolocation?.getCurrentPosition(
      pos => setGps(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => setGpsError('GPS unavailable — submission will proceed without location verification.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setImageBase64(dataUrl.split(',')[1]);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setStep('preview');
  }

  function retake() {
    setImageBase64('');
    setStep('camera');
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button onClick={onClose} className="text-white text-sm font-semibold py-1 px-3 rounded-lg bg-white/10">
          Cancel
        </button>
        <p className="text-white text-sm font-bold">Submit Proof</p>
        <div className="w-16" />
      </div>

      {step === 'camera' ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="bg-black px-4 py-6 flex flex-col items-center gap-3">
            <p className="text-white/70 text-xs text-center">
              {remedial.subject} — {remedial.class_name} · {fmt(remedial.remedial_date)}
            </p>
            {gpsError && <p className="text-amber-400 text-xs text-center">{gpsError}</p>}
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button
              onClick={capture}
              className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/40"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto bg-[#F4EFE6]">
          <img
            src={`data:image/jpeg;base64,${imageBase64}`}
            alt="Captured proof"
            className="w-full max-h-64 object-cover"
          />
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
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                GPS captured ✓
              </p>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                {gpsError || 'Acquiring GPS…'}
              </p>
            )}

            {error && (
              <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={retake}
                className="flex-1 py-3 rounded-xl border border-[#E2D9CC] text-sm font-semibold text-[#8C7E6E]"
              >
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
  const [primary,   setPrimary]   = useState('#2ab289');
  const [remedials, setRemedials] = useState<RemedialLesson[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState<RemedialLesson | null>(null);
  const [successId,  setSuccessId]  = useState<string | null>(null);

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

  async function handleSuccess() {
    setSuccessId(submitting?.id ?? null);
    setSubmitting(null);
    await loadData();
    setTimeout(() => setSuccessId(null), 3000);
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
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
          <h1 className="text-xl font-bold text-[#2C2218]">Remedial Lessons</h1>
          <p className="text-sm text-[#8C7E6E]">{loading ? '…' : `${remedials.length} total`}</p>
        </div>
      </div>

      {successId && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 font-semibold">
          Proof submitted successfully! The admin will review and verify it.
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

                {rem.status === 'Scheduled' && (
                  <button
                    onClick={() => setSubmitting(rem)}
                    className="mt-1 w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                    style={{ background: primary }}
                  >
                    Submit Proof of Attendance
                  </button>
                )}

                {rem.status === 'Completed' && (
                  <p className="mt-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    Proof submitted — awaiting admin verification.
                  </p>
                )}

                {rem.status === 'Verified' && (
                  <p className="mt-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
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
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
