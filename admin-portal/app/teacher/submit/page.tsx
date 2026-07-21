'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';
import type jsQRType from 'jsqr';

interface TimetableSlot {
  id: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_names: string;
  periods?: number;
}

interface AttendanceRecord {
  id: string;
  subject: string;
  class_names: string;
}

interface TodayAbsence {
  id: string;
  subject: string;
  class_name: string;
  is_auto_generated: boolean;
}

interface Location {
  id: string;
  name: string;
  has_coordinates: boolean;
}

interface Student {
  id: string;
  student_code: string;
  name: string;
}

type PendingCheckpoint = {
  attendanceId: string; classNames: string; endTime: string;
  subject: string; slotId: string; date: string;
};

function compressToBase64(file: File): Promise<{ dataUrl: string; kb: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const compress = (w: number, q: number): string => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, w / img.width);
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', q);
      };
      let dataUrl = compress(640, 0.4);
      if (dataUrl.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
      resolve({ dataUrl, kb: Math.round(dataUrl.length * 0.75 / 1024) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function SubmitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSlotId = searchParams.get('slotId') ?? '';
  const { resolvedTheme } = useTheme();

  const [mounted,       setMounted]       = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [primary, setPrimary] = useState('#2ab289');

  // Step 1
  const [slots,       setSlots]       = useState<TimetableSlot[]>([]);
  const [submitted,   setSubmitted]   = useState<AttendanceRecord[]>([]);
  const [absences,    setAbsences]    = useState<TodayAbsence[]>([]);
  const [selectedId,  setSelectedId]  = useState(preselectedSlotId);
  const [topic,       setTopic]       = useState('');
  const [locations,   setLocations]   = useState<Location[]>([]);
  const [locName,     setLocName]     = useState('');
  const [gps,         setGps]         = useState('');
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState('');
  const [photoUrl,    setPhotoUrl]    = useState('');
  const [photoB64,    setPhotoB64]    = useState('');
  const [photoKb,     setPhotoKb]     = useState(0);
  const [errors,      setErrors]      = useState<Record<string,string>>({});
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState('');
  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // QR scan state
  const [qrVerified,  setQrVerified]  = useState(false);
  const [qrScanning,  setQrScanning]  = useState(false);
  const [qrError,     setQrError]     = useState('');
  const [qrClassName, setQrClassName] = useState('');

  // Step 2
  const [attendanceId,  setAttendanceId]  = useState('');
  const [students,      setStudents]      = useState<Student[]>([]);
  const [absentIds,     setAbsentIds]     = useState<Set<string>>(new Set());
  const [exeatIds,      setExeatIds]      = useState<Set<string>>(new Set());
  const [studLoading,   setStudLoading]   = useState(false);
  const [step2Loading,  setStep2Loading]  = useState(false);
  const [step2Error,    setStep2Error]    = useState('');
  const [classQueue,    setClassQueue]    = useState<string[]>([]);
  const [classQueueIdx, setClassQueueIdx] = useState(0);

  // Resume banner: shown when a previous Step 1 completed but Step 2 was never finished
  const [resumePending, setResumePending] = useState<PendingCheckpoint | null>(null);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  const dk = {
    pageBg:          isDark ? '#0F172A' : '#F4EFE6',
    cardBg:          isDark ? '#1E293B' : '#FFFFFF',
    cardBgAlt:       isDark ? '#0F172A' : '#F8FAFC',
    border:          isDark ? 'rgba(255,255,255,0.08)' : '#E2D9CC',
    text:            isDark ? '#F1F5F9' : '#2C2218',
    muted:           isDark ? '#94A3B8' : '#8C7E6E',
    inputBg:         isDark ? '#0F172A' : '#FFFFFF',
    inputText:       isDark ? '#F1F5F9' : '#2C2218',
    absentSlotBg:    isDark ? '#2D0A0A' : '#FFF8F8',
    pendingChipBg:   isDark ? '#334155' : '#F0EDE8',
    pendingChipText: isDark ? '#94A3B8' : '#8C7E6E',
    skeletonBg:      isDark ? '#334155' : '#F1F5F9',
    presentCountBg:  isDark ? '#14532D' : '#E4F4EB',
    absentCountBg:   isDark ? '#450A0A' : '#FEF2F2',
    totalCountBg:    isDark ? '#1E293B' : '#F8FAFC',
    presentCountText:isDark ? '#86EFAC' : '#2D7A4F',
    absentCountText: isDark ? '#FCA5A5' : '#DC2626',
    totalCountText:  isDark ? '#94A3B8' : '#64748B',
    absentCardBg:    isDark ? '#2D0A0A' : '#FEF2F2',
    absentCardBorder:isDark ? '#7F1D1D' : '#FCA5A5',
    presentCardBg:   isDark ? '#1E293B' : '#FFFFFF',
    presentCardBorder:isDark ? 'rgba(255,255,255,0.08)' : '#E2D9CC',
  };

  const load = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    const [slotsRes, locsRes, attRes, absRes] = await Promise.allSettled([
      teacherApi.get<TimetableSlot[]>(`/api/timetable/today/${teacher.id}`),
      teacherApi.get<Location[]>('/api/locations'),
      teacherApi.get<AttendanceRecord[]>(`/api/attendance/today/${teacher.id}`),
      teacherApi.get<TodayAbsence[]>(`/api/absences/today/${teacher.id}`),
    ]);
    if (slotsRes.status === 'fulfilled') setSlots(slotsRes.value.data ?? []);
    if (locsRes.status === 'fulfilled')  setLocations(locsRes.value.data ?? []);
    if (attRes.status  === 'fulfilled')  setSubmitted(attRes.value.data ?? []);
    if (absRes.status  === 'fulfilled')  setAbsences(absRes.value.data ?? []);
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
    grabGps();

    // Resume check: if Step 1 completed but Step 2 was never finished (e.g. tab closed, phone call),
    // the checkpoint in localStorage lets the teacher pick up where they left off.
    try {
      const raw = localStorage.getItem('pending_student_att');
      if (raw) {
        const pending = JSON.parse(raw) as PendingCheckpoint;
        const today = new Date().toISOString().slice(0, 10);
        if (pending.date === today) {
          setResumePending(pending);
        } else {
          localStorage.removeItem('pending_student_att');
        }
      }
    } catch { /* ignore */ }
  }, [load]);

  // Warn the teacher before closing/refreshing the tab while in Step 2
  useEffect(() => {
    if (step === 1) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);

  function stopCamera() {
    if (scanTimer.current) { clearInterval(scanTimer.current); scanTimer.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setQrScanning(false);
  }

  async function startQrScan() {
    setQrError(''); setQrScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
      await video.play();
      const jsQR: typeof jsQRType = (await import('jsqr')).default;
      const canvas = canvasRef.current!;
      const ctx    = canvas.getContext('2d')!;
      scanTimer.current = setInterval(() => {
        if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          stopCamera();
          verifyQrToken(code.data);
        }
      }, 250);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setQrError('Camera permission denied. In Safari, go to Settings → Safari → Camera and allow access.');
      } else if (name === 'NotFoundError') {
        setQrError('No camera found on this device.');
      } else {
        setQrError('Could not open camera. Make sure no other app is using it and try again.');
      }
      setQrScanning(false);
    }
  }

  async function verifyQrToken(token: string) {
    const slot = slots.find(s => s.id === selectedId);
    setQrError('');
    try {
      const res = await teacherApi.post<{ valid: boolean; className: string }>(
        '/api/classroom-qr/verify',
        { token, expectedClassName: slot?.class_names ?? '' }
      );
      if (res.data.valid) {
        setQrVerified(true);
        setQrClassName(res.data.className);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setQrError(msg ?? 'QR verification failed. Please try again.');
    }
  }

  function grabGps() {
    if (!navigator.geolocation) { setGpsError('GPS not available in this browser.'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setGpsLoading(false); },
      ()  => { setGpsError('Could not get location. Tap Refresh to retry.'); setGpsLoading(false); },
      { timeout: 15000 }
    );
  }

  async function handleResume(pending: PendingCheckpoint) {
    setResumePending(null);
    setAttendanceId(pending.attendanceId);
    setSelectedId(pending.slotId);
    const queue = pending.classNames.split(',').map(c => c.trim()).filter(Boolean);
    setClassQueue(queue);
    setClassQueueIdx(0);
    await loadClassAtIndex(queue, 0, pending.attendanceId);
    setStep(2);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, kb } = await compressToBase64(file);
      setPhotoB64(dataUrl);
      setPhotoUrl(dataUrl);
      setPhotoKb(kb);
    } catch { setErrors(p => ({ ...p, photo: 'Failed to process image.' })); }
  }

  function isSubmitted(slot: TimetableSlot) {
    return submitted.some(a =>
      a.subject.toLowerCase() === slot.subject.toLowerCase() &&
      slot.class_names.split(',').map(c => c.trim().toLowerCase())
        .some(c => a.class_names.split(',').map(x => x.trim().toLowerCase()).includes(c))
    );
  }

  function isAutoAbsent(slot: TimetableSlot) {
    const slotClasses = slot.class_names.split(',').map(c => c.trim().toLowerCase());
    return absences.some(a =>
      a.subject.toLowerCase() === slot.subject.toLowerCase() &&
      slotClasses.includes(a.class_name.toLowerCase())
    );
  }

  useEffect(() => () => stopCamera(), []);

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string,string> = {};
    if (!selectedId)    errs.slot  = 'Please select a lesson slot.';
    if (!qrVerified)    errs.qr    = 'Please scan the classroom QR code.';
    if (!topic.trim())  errs.topic = 'Topic is required.';
    if (!locName)       errs.loc   = 'Please select a location.';
    if (!gps)           errs.gps   = gpsError || 'GPS is required. Tap Refresh.';
    if (!photoB64)      errs.photo = 'Please take a photo.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const slot = slots.find(s => s.id === selectedId)!;
    const teacher = getTeacher()!;
    setSubmitting(true); setApiError('');
    try {
      const res = await teacherApi.post('/api/attendance/submit', {
        teacherId:      teacher.id,
        subject:        slot.subject,
        classNames:     slot.class_names,
        periods:        slot.periods ?? 1,
        topic:          topic.trim(),
        gpsCoordinates: gps,
        locationName:   locName,
        imageBase64:    photoB64,
        photoSizeKb:    photoKb,
      });
      const newId = res.data?.record?.id ?? res.data?.id ?? '';
      setAttendanceId(newId);

      // Persist checkpoint so Step 2 can be resumed if the page is closed or the browser loses focus
      try {
        localStorage.setItem('pending_student_att', JSON.stringify({
          attendanceId: newId,
          classNames:   slot.class_names,
          endTime:      slot.end_time,
          subject:      slot.subject,
          slotId:       slot.id,
          date:         new Date().toISOString().slice(0, 10),
        } satisfies PendingCheckpoint));
      } catch { /* non-critical */ }

      const queue = slot.class_names.split(',').map(c => c.trim()).filter(Boolean);
      setClassQueue(queue);
      setClassQueueIdx(0);
      await loadClassAtIndex(queue, 0, newId);
      setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setApiError(msg ?? 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  async function loadClassAtIndex(queue: string[], index: number, attId: string) {
    setStudLoading(true);
    try {
      const className = queue[index];
      const [sr, er] = await Promise.allSettled([
        teacherApi.get<Student[]>(`/api/students?class_name=${encodeURIComponent(className)}&status=Active`),
        teacherApi.get<string[]>('/api/exeat/on-exeat-ids'),
      ]);
      setStudents(sr.status === 'fulfilled' ? sr.value.data ?? [] : []);
      setExeatIds(new Set(er.status === 'fulfilled' ? er.value.data : []));
      setAbsentIds(new Set());
    } finally {
      setStudLoading(false);
    }
  }

  async function handleStep2() {
    const slot = slots.find(s => s.id === selectedId)!;
    const teacher = getTeacher()!;
    const currentClass = classQueue[classQueueIdx];
    setStep2Loading(true); setStep2Error('');
    try {
      await teacherApi.post('/api/student-attendance/submit', {
        attendanceId,
        teacherId:      teacher.id,
        subject:        slot.subject,
        className:      currentClass,
        lessonEndTime:  slot.end_time,
        records: students
          .filter(s => !exeatIds.has(s.id))
          .map(s => ({ studentId: s.id, status: absentIds.has(s.id) ? 'Absent' : 'Present' })),
      });

      const nextIdx = classQueueIdx + 1;
      if (nextIdx < classQueue.length) {
        setClassQueueIdx(nextIdx);
        await loadClassAtIndex(classQueue, nextIdx, attendanceId);
      } else {
        try { localStorage.removeItem('pending_student_att'); } catch { /* ignore */ }
        router.push('/teacher');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setStep2Error(msg ?? 'Failed to submit student attendance.');
    } finally { setStep2Loading(false); }
  }

  const selectedSlot = slots.find(s => s.id === selectedId);
  const exeatCount   = students.filter(s => exeatIds.has(s.id)).length;
  const presentCount = students.length - absentIds.size - exeatCount;

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: dk.pageBg }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => step === 2 ? setStep(1) : router.push('/teacher')}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4" style={{ color: dk.muted }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: dk.text }}>{step === 1 ? 'Submit Attendance' : 'Student Attendance'}</h1>
          <p className="text-xs" style={{ color: dk.muted }}>
            {step === 2 && classQueue.length > 1
              ? `Register (${classQueueIdx + 1}/${classQueue.length})`
              : `Step ${step} of 2`}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-2 mb-6">
        {[1,2].map(s => <div key={s} className="h-1 flex-1 rounded-full" style={{ background: s <= step ? primary : dk.border }} />)}
      </div>

      {/* Resume banner — shown when Step 1 completed but Step 2 was never finished */}
      {resumePending && step === 1 && (
        <div className="rounded-2xl p-4 mb-2" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
          <p className="text-sm font-bold" style={{ color: '#92400E' }}>Incomplete Attendance Detected</p>
          <p className="text-xs mt-1" style={{ color: '#92400E' }}>
            Your teacher attendance for <strong>{resumePending.subject}</strong> was saved but student attendance was not completed.
            This may have been caused by a phone call or the page being closed.
          </p>
          <div className="flex gap-3 mt-3">
            <button type="button" onClick={() => handleResume(resumePending)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: primary }}>
              Continue Marking Students →
            </button>
            <button type="button" onClick={() => { setResumePending(null); try { localStorage.removeItem('pending_student_att'); } catch { /* ignore */ } }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold"
              style={{ color: '#92400E', background: '#FDE68A' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <form onSubmit={handleStep1} className="space-y-4">
          {/* Slot picker */}
          <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: dk.muted }}>Select Lesson *</p>
            {slots.length === 0
              ? <p className="text-sm" style={{ color: dk.muted }}>No timetable slots for today.</p>
              : slots.map(slot => {
                  const done   = isSubmitted(slot);
                  const absent = !done && isAutoAbsent(slot);
                  const locked = done || absent;
                  const sel    = selectedId === slot.id;
                  return (
                    <label key={slot.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border mb-2 transition-colors ${locked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                      style={{
                        borderColor: absent ? '#FCA5A5' : sel ? primary : dk.border,
                        background:  absent ? dk.absentSlotBg : sel ? `${primary}18` : dk.cardBg,
                      }}>
                      <input type="radio" name="slot" value={slot.id} checked={sel} disabled={locked}
                        onChange={() => { setSelectedId(slot.id); setQrVerified(false); setQrError(''); setQrClassName(''); }}
                        className="mt-1 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: dk.text }}>{slot.subject} — {slot.class_names}</p>
                        <p className="text-xs" style={{ color: dk.muted }}>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}{slot.periods ? ` · ${slot.periods} period${slot.periods !== 1 ? 's' : ''}` : ''}</p>
                        {done   && <p className="text-xs font-semibold mt-0.5" style={{ color: '#2D7A4F' }}>✓ Submitted</p>}
                        {absent && <p className="text-xs font-semibold mt-0.5" style={{ color: '#DC2626' }}>✗ Marked Absent — contact admin to resubmit</p>}
                      </div>
                    </label>
                  );
                })
            }
            {errors.slot && <p className="text-xs text-[#B83232] mt-1">{errors.slot}</p>}
          </div>

          {/* QR scan */}
          {selectedId && (
            <div className="rounded-2xl shadow-sm p-4"
              style={{ background: dk.cardBg, border: `1px solid ${qrVerified ? '#86EFAC' : errors.qr ? '#FCA5A5' : dk.border}` }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: dk.muted }}>Classroom QR *</p>

              {qrVerified ? (
                <div className="flex items-center gap-3 py-1">
                  <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg shrink-0">✓</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: dk.text }}>Verified — {qrClassName}</p>
                    <button type="button" onClick={() => { setQrVerified(false); setQrClassName(''); }}
                      className="text-xs mt-0.5" style={{ color: primary }}>Scan again</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: qrScanning ? 'block' : 'none' }} className="space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '1' }}>
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-white rounded-xl opacity-70" />
                      </div>
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                    <button type="button" onClick={stopCamera}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: dk.cardBg, border: `1px solid ${dk.border}`, color: dk.muted }}>
                      Cancel
                    </button>
                  </div>

                  {!qrScanning && (
                    <button type="button" onClick={startQrScan}
                      className="w-full h-20 rounded-xl border-2 border-dashed flex items-center justify-center gap-3"
                      style={{ borderColor: dk.border, color: dk.muted }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 shrink-0">
                        <rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" />
                        <rect x="3" y="16" width="5" height="5" rx="1" /><rect x="10" y="10" width="4" height="4" rx="0.5" />
                        <path d="M16 10h5M16 14h3M21 14v2M10 3v5M10 16v5M3 10h5" />
                      </svg>
                      <span className="text-sm font-semibold">Tap to scan room QR code</span>
                    </button>
                  )}
                  {qrError && <p className="text-xs text-[#B83232] mt-2">{qrError}</p>}
                </>
              )}
              {errors.qr && !qrVerified && <p className="text-xs text-[#B83232] mt-1">{errors.qr}</p>}
            </div>
          )}

          {/* Topic */}
          <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
            <label className="text-xs font-bold uppercase tracking-wide block mb-2" style={{ color: dk.muted }}>Topic *</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What was covered in this lesson?"
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: dk.inputBg, border: `1px solid ${dk.border}`, color: dk.inputText }} />
            {errors.topic && <p className="text-xs text-[#B83232] mt-1">{errors.topic}</p>}
          </div>

          {/* Location */}
          <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
            <label className="text-xs font-bold uppercase tracking-wide block mb-2" style={{ color: dk.muted }}>Location *</label>
            <select value={locName} onChange={e => setLocName(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: dk.inputBg, border: `1px solid ${dk.border}`, color: dk.inputText }}>
              <option value="">Select classroom...</option>
              {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            {errors.loc && <p className="text-xs text-[#B83232] mt-1">{errors.loc}</p>}
          </div>

          {/* GPS */}
          <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: dk.muted }}>GPS Coordinates *</p>
            <div className="flex items-center justify-between">
              {gpsLoading
                ? <p className="text-sm italic" style={{ color: dk.muted }}>Acquiring location…</p>
                : gps
                  ? <p className="text-sm font-mono" style={{ color: dk.text }}>{gps}</p>
                  : <p className="text-sm text-[#B83232]">{gpsError || 'GPS unavailable'}</p>
              }
              <button type="button" onClick={grabGps} disabled={gpsLoading}
                className="text-xs font-semibold ml-3 disabled:opacity-40" style={{ color: primary }}>
                ↻ Refresh
              </button>
            </div>
            {errors.gps && <p className="text-xs text-[#B83232] mt-1">{errors.gps}</p>}
          </div>

          {/* Photo */}
          <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: dk.muted }}>Classroom Photo *</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhoto} className="hidden" />
            {photoUrl ? (
              <div>
                <img src={photoUrl} alt="preview" className="w-full rounded-xl object-cover" style={{ maxHeight: 200 }} />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs" style={{ color: dk.muted }}>{photoKb} KB</p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-xs font-semibold" style={{ color: primary }}>Retake</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2"
                style={{ borderColor: dk.border, color: dk.muted }}>
                <span className="text-3xl">📷</span>
                <span className="text-sm">Tap to take photo</span>
              </button>
            )}
            {errors.photo && <p className="text-xs text-[#B83232] mt-1">{errors.photo}</p>}
          </div>

          {apiError && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{apiError}</p>}
          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: primary }}>
            {submitting ? 'Submitting…' : 'Next: Student Attendance →'}
          </button>
        </form>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Lesson summary */}
          {selectedSlot && (
            <div className="rounded-2xl shadow-sm p-4" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: dk.muted }}>Lesson</p>
              <p className="text-sm font-semibold" style={{ color: dk.text }}>
                {selectedSlot.subject} — {classQueue[classQueueIdx] ?? selectedSlot.class_names.split(',')[0].trim()}
              </p>
              <p className="text-xs" style={{ color: dk.muted }}>
                {selectedSlot.start_time.slice(0,5)} – {selectedSlot.end_time.slice(0,5)}
                {selectedSlot.periods ? ` · ${selectedSlot.periods} period${selectedSlot.periods !== 1 ? 's' : ''}` : ''}
              </p>
              {classQueue.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {classQueue.map((cls, i) => {
                    const isDone    = i < classQueueIdx;
                    const isCurrent = i === classQueueIdx;
                    return (
                      <span key={cls} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{
                          background: isDone ? '#DCFCE7' : isCurrent ? primary : dk.pendingChipBg,
                          color:      isDone ? '#166534' : isCurrent ? '#fff'   : dk.pendingChipText,
                        }}>
                        {isDone ? `✓ ${cls}` : cls}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Counts */}
          <div className={`grid gap-3 ${exeatCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {[
              { label: 'Present',  count: presentCount,    color: dk.presentCountText, bg: dk.presentCountBg },
              { label: 'Absent',   count: absentIds.size,  color: dk.absentCountText,  bg: dk.absentCountBg  },
              ...(exeatCount > 0 ? [{ label: 'On Exeat', count: exeatCount, color: isDark ? '#FCD34D' : '#92400E', bg: isDark ? '#44403C' : '#FEF3C7' }] : []),
              { label: 'Total',    count: students.length, color: dk.totalCountText,   bg: dk.totalCountBg   },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className="rounded-2xl p-3 text-center" style={{ background: bg }}>
                <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color }}>{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: dk.muted }}>
            Tap a student to mark absent
          </p>

          {studLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="rounded-xl h-14 animate-pulse" style={{ background: dk.skeletonBg, border: `1px solid ${dk.border}` }} />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-2xl p-5 text-center" style={{ background: dk.cardBg, border: `1px solid ${dk.border}` }}>
              <p className="text-sm" style={{ color: dk.muted }}>No students found for this class.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {students.map(s => {
                const onExeat = exeatIds.has(s.id);
                const absent  = !onExeat && absentIds.has(s.id);
                if (onExeat) {
                  return (
                    <div key={s.id} className="w-full flex items-center justify-between p-3.5 rounded-xl"
                      style={{
                        background: isDark ? '#1C1917' : '#FFFBEB',
                        border:     `1px solid ${isDark ? '#44403C' : '#FDE68A'}`,
                        opacity: 0.85,
                      }}>
                      <div>
                        <p className="text-xs font-bold" style={{ color: dk.muted }}>{s.student_code}</p>
                        <p className="text-sm font-semibold" style={{ color: isDark ? '#D6D3D1' : '#78350F' }}>{s.name}</p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: isDark ? '#44403C' : '#FEF3C7', color: isDark ? '#FCD34D' : '#92400E' }}>
                        On Exeat
                      </span>
                    </div>
                  );
                }
                return (
                  <button key={s.id} type="button" onClick={() => setAbsentIds(prev => {
                    const n = new Set(prev); absent ? n.delete(s.id) : n.add(s.id); return n;
                  })} className="w-full flex items-center justify-between p-3.5 rounded-xl transition-colors text-left"
                    style={{
                      background:   absent ? dk.absentCardBg    : dk.presentCardBg,
                      border:       `1px solid ${absent ? dk.absentCardBorder : dk.presentCardBorder}`,
                    }}>
                    <div>
                      <p className="text-xs font-bold" style={{ color: dk.muted }}>{s.student_code}</p>
                      <p className="text-sm font-semibold" style={{ color: absent ? '#F87171' : dk.text }}>{s.name}</p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        background: absent ? (isDark ? '#7F1D1D' : '#FEE2E2') : (isDark ? '#14532D' : '#DCFCE7'),
                        color:      absent ? (isDark ? '#FCA5A5' : '#DC2626') : (isDark ? '#86EFAC' : '#166634'),
                      }}>
                      {absent ? 'Absent' : 'Present'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step2Error && <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{step2Error}</p>}
          <button onClick={handleStep2} disabled={step2Loading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: primary }}>
            {step2Loading
              ? 'Submitting…'
              : classQueueIdx < classQueue.length - 1
                ? `Submit & Mark ${classQueue[classQueueIdx + 1]} →`
                : 'Submit Student Attendance ✓'}
          </button>
        </div>
      )}
    </div>
  );
}
