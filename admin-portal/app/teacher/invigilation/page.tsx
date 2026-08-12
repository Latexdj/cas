'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExamDuty {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  subject: string;
  class_name: string;
  hall_name: string;
  role: string;
  check_in_id: string | null;
  checked_in_at: string | null;
  check_in_photo: string | null;
  location_verified: boolean | null;
  register_count: number;
  student_count: number;
}

interface Student {
  id: string;
  student_code: string;
  name: string;
  class_name: string;
  status: 'Present' | 'Absent' | null;
  attendance_notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
function fmtTime(t: string) { return t.slice(0, 5); }

function compressImage(file: File): Promise<{ dataUrl: string; kb: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const compress = (w: number, q: number) => {
        const c = document.createElement('canvas');
        const scale = Math.min(1, w / img.width);
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', q);
      };
      let dataUrl = compress(640, 0.4);
      if ((dataUrl.split(',')[1] ?? '').length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
      resolve({ dataUrl, kb: Math.round(dataUrl.length * 0.75 / 1024) });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvigilationPage() {
  const [primary, setPrimary] = useState('#2ab289');
  const today = new Date().toISOString().slice(0, 10);

  const [duties,  setDuties]  = useState<ExamDuty[]>([]);
  const [loading, setLoading] = useState(true);

  // Check-in state
  const [checkingIn,    setCheckingIn]    = useState<string | null>(null); // duty id being checked in
  const [gps,           setGps]           = useState('');
  const [gpsAcquiring,  setGpsAcquiring]  = useState(false);
  const [gpsError,      setGpsError]      = useState('');
  const [photoDataUrl,  setPhotoDataUrl]  = useState<string | null>(null);
  const [photoSizeKb,   setPhotoSizeKb]   = useState<number | null>(null);
  const [checkInNotes,  setCheckInNotes]  = useState('');
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [checkInError,  setCheckInError]  = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  // Register state
  const [registerDutyId, setRegisterDutyId] = useState<string | null>(null);
  const [students,        setStudents]        = useState<Student[]>([]);
  const [attendance,      setAttendance]      = useState<Record<string, 'Present' | 'Absent'>>({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [regSubmitting,   setRegSubmitting]   = useState(false);
  const [regError,        setRegError]        = useState('');
  const [regSubmitted,    setRegSubmitted]    = useState(false);

  useEffect(() => {
    setPrimary(getTeacherColors().primary);
    loadDuties();
    grabGps();
  }, []);

  const loadDuties = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<ExamDuty[]>('/api/exams/sessions/duties/mine');
      setDuties(Array.isArray(data) ? data : []);
    } catch { setDuties([]); }
    finally { setLoading(false); }
  }, []);

  function grabGps() {
    if (!navigator.geolocation) { setGpsError('GPS not available.'); return; }
    setGpsAcquiring(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
        setGpsAcquiring(false);
      },
      () => { setGpsError('Could not get GPS. Tap Refresh.'); setGpsAcquiring(false); },
      { timeout: 15000 },
    );
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  function openCheckIn(dutyId: string) {
    setCheckingIn(dutyId);
    setPhotoDataUrl(null); setPhotoSizeKb(null);
    setCheckInNotes(''); setCheckInError('');
    grabGps();
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, kb } = await compressImage(file);
      setPhotoDataUrl(dataUrl); setPhotoSizeKb(kb);
    } catch { setCheckInError('Failed to process image.'); }
    e.target.value = '';
  }

  async function submitCheckIn() {
    if (!gps)         { setCheckInError('GPS location is required.'); return; }
    if (!photoDataUrl){ setCheckInError('A selfie photo is required.'); return; }
    setCheckInSubmitting(true); setCheckInError('');
    try {
      await teacherApi.post(`/api/exams/sessions/${checkingIn}/check-in`, {
        gpsCoordinates: gps,
        imageBase64: photoDataUrl,
        photoSizeKb,
        notes: checkInNotes || undefined,
      });
      setCheckingIn(null);
      await loadDuties();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCheckInError(msg ?? 'Check-in failed. Please try again.');
    } finally { setCheckInSubmitting(false); }
  }

  // ── Register ──────────────────────────────────────────────────────────────

  async function openRegister(dutyId: string) {
    setRegisterDutyId(dutyId);
    setRegSubmitted(false); setRegError('');
    setLoadingStudents(true);
    try {
      const { data } = await teacherApi.get<Student[]>(`/api/exams/sessions/${dutyId}/register`);
      setStudents(data);
      // Pre-populate from existing records
      const map: Record<string, 'Present' | 'Absent'> = {};
      for (const s of data) map[s.id] = s.status ?? 'Present';
      setAttendance(map);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRegError(msg ?? 'Failed to load students.');
    } finally { setLoadingStudents(false); }
  }

  function toggleStatus(studentId: string) {
    setAttendance(prev => ({ ...prev, [studentId]: prev[studentId] === 'Absent' ? 'Present' : 'Absent' }));
  }

  async function submitRegister() {
    if (!registerDutyId) return;
    setRegSubmitting(true); setRegError('');
    try {
      const records = students.map(s => ({ student_id: s.id, status: attendance[s.id] ?? 'Present' }));
      await teacherApi.post(`/api/exams/sessions/${registerDutyId}/register`, { records });
      setRegSubmitted(true);
      await loadDuties();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRegError(msg ?? 'Failed to submit register.');
    } finally { setRegSubmitting(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const todayDuties    = duties.filter(d => d.date === today);
  const upcomingDuties = duties.filter(d => d.date > today);

  const presentCount = students.filter(s => (attendance[s.id] ?? 'Present') === 'Present').length;
  const absentCount  = students.length - presentCount;

  // ── Render ────────────────────────────────────────────────────────────────

  // Register screen
  if (registerDutyId !== null) {
    const duty = duties.find(d => d.id === registerDutyId);
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 shadow-sm"
          style={{ backgroundColor: primary }}>
          <button onClick={() => setRegisterDutyId(null)} className="text-white/80 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <p className="text-white font-bold text-sm">{duty?.subject} — {duty?.class_name}</p>
            <p className="text-white/70 text-xs">{duty ? fmtDate(duty.date) : ''} · {duty?.hall_name}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {regSubmitted && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
              <p className="text-green-700 dark:text-green-400 font-semibold text-sm">Register submitted successfully</p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                {presentCount} present · {absentCount} absent
              </p>
            </div>
          )}

          {/* Summary bar */}
          <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
            <span className="text-xs text-slate-500">{students.length} students</span>
            <div className="flex gap-4 text-xs font-semibold">
              <span className="text-green-600">{presentCount} Present</span>
              <span className="text-red-500">{absentCount} Absent</span>
            </div>
          </div>

          {loadingStudents ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 rounded-full border-3 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
            </div>
          ) : regError && !students.length ? (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 text-center">{regError}</div>
          ) : (
            <div className="space-y-2">
              {students.map(s => {
                const status = attendance[s.id] ?? 'Present';
                const isPresent = status === 'Present';
                return (
                  <button key={s.id} onClick={() => !regSubmitted && toggleStatus(s.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                      isPresent
                        ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      isPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {isPresent ? '✓' : '✗'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.student_code} · {s.class_name}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isPresent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>{status}</span>
                  </button>
                );
              })}
            </div>
          )}

          {regError && students.length > 0 && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">{regError}</p>
          )}

          {students.length > 0 && !regSubmitted && (
            <button onClick={submitRegister} disabled={regSubmitting}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: primary }}>
              {regSubmitting ? 'Submitting…' : `Submit Register (${presentCount} present, ${absentCount} absent)`}
            </button>
          )}

          {regSubmitted && (
            <button onClick={() => setRegisterDutyId(null)}
              className="w-full py-3 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              Back to Duties
            </button>
          )}
        </div>
      </div>
    );
  }

  // Check-in overlay
  if (checkingIn !== null) {
    const duty = duties.find(d => d.id === checkingIn);
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 shadow-sm"
          style={{ backgroundColor: primary }}>
          <button onClick={() => setCheckingIn(null)} className="text-white/80 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <p className="text-white font-bold text-sm">Check In — {duty?.hall_name}</p>
            <p className="text-white/70 text-xs">{duty?.subject} · {duty?.class_name}</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* GPS */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Your Location</p>
            {gpsAcquiring ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
                Acquiring GPS…
              </p>
            ) : gpsError ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-red-500">{gpsError}</p>
                <button onClick={grabGps} className="text-xs font-semibold px-3 py-1 rounded-lg border border-slate-200">Refresh</button>
              </div>
            ) : gps ? (
              <div className="flex items-center justify-between">
                <p className="text-xs font-mono text-slate-600 dark:text-slate-300">{gps}</p>
                <button onClick={grabGps} className="text-xs font-semibold px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-600">Refresh</button>
              </div>
            ) : null}
          </div>

          {/* Photo */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Selfie Photo</p>
            {photoDataUrl ? (
              <div className="space-y-2">
                <img src={photoDataUrl} alt="selfie" className="w-32 h-32 rounded-xl object-cover" />
                <p className="text-xs text-slate-400">{photoSizeKb} KB</p>
                <button onClick={() => photoRef.current?.click()} className="text-xs font-semibold text-blue-500">Retake</button>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()}
                className="w-full py-8 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-sm text-slate-400 hover:border-slate-300 transition-colors">
                Tap to take or upload photo
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
          </div>

          {/* Notes */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Notes (optional)</p>
            <textarea rows={2} value={checkInNotes} onChange={e => setCheckInNotes(e.target.value)}
              placeholder="Any notes about your attendance…"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {checkInError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">{checkInError}</div>
          )}

          <button onClick={submitCheckIn} disabled={checkInSubmitting || !gps || !photoDataUrl}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: primary }}>
            {checkInSubmitting ? 'Submitting…' : 'Submit Check-In'}
          </button>
        </div>
      </div>
    );
  }

  // Main duties list
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="px-4 py-5">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Invigilation Duties</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your assigned exam sessions</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} />
        </div>
      ) : duties.length === 0 ? (
        <div className="mx-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 py-16 text-center">
          <p className="text-sm text-slate-400">No invigilation duties assigned</p>
        </div>
      ) : (
        <div className="px-4 space-y-6">
          {todayDuties.length > 0 && (
            <section>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Today</p>
              <div className="space-y-3">
                {todayDuties.map(d => <DutyCard key={d.id} duty={d} isToday primary={primary}
                  onCheckIn={() => openCheckIn(d.id)}
                  onRegister={() => openRegister(d.id)} />)}
              </div>
            </section>
          )}
          {upcomingDuties.length > 0 && (
            <section>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Upcoming</p>
              <div className="space-y-3">
                {upcomingDuties.map(d => <DutyCard key={d.id} duty={d} isToday={false} primary={primary}
                  onCheckIn={() => {}} onRegister={() => {}} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Duty Card ─────────────────────────────────────────────────────────────────

function DutyCard({ duty, isToday, primary, onCheckIn, onRegister }: {
  duty: ExamDuty;
  isToday: boolean;
  primary: string;
  onCheckIn: () => void;
  onRegister: () => void;
}) {
  const checkedIn     = !!duty.check_in_id;
  const registerDone  = duty.register_count > 0;
  const canRegister   = checkedIn && isToday;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-700">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-slate-800 dark:text-white text-sm">{duty.subject}</p>
            <p className="text-xs text-slate-500 mt-0.5">{duty.class_name} · {duty.hall_name}</p>
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            {fmtTime(duty.start_time)}–{fmtTime(duty.end_time)}
          </span>
        </div>
        {!isToday && (
          <p className="text-xs text-slate-400 mt-1">{fmtDate(duty.date)}</p>
        )}
      </div>

      {/* Status + actions */}
      <div className="px-4 py-3 space-y-3">
        {/* Status pills */}
        <div className="flex gap-2 flex-wrap">
          <StatusPill done={checkedIn} label="Check-In" doneLabel={duty.checked_in_at
            ? `Checked in ${new Date(duty.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Checked In'} />
          <StatusPill done={registerDone}
            label={`Register (${duty.register_count}/${duty.student_count})`}
            doneLabel={`Register done · ${duty.register_count}/${duty.student_count}`} />
        </div>

        {/* Action buttons — only for today */}
        {isToday && (
          <div className="flex gap-2">
            {!checkedIn ? (
              <button onClick={onCheckIn}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: primary }}>
                Check In
              </button>
            ) : (
              <div className="flex-1 flex items-center gap-1.5 text-xs font-semibold text-green-600">
                <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">✓</span>
                Checked in
              </div>
            )}
            <button onClick={onRegister} disabled={!canRegister}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                canRegister
                  ? 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                  : 'border-slate-100 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
              }`}>
              {registerDone ? 'Edit Register' : 'Take Register'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ done, label, doneLabel }: { done: boolean; label: string; doneLabel: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      done ? 'bg-green-100 text-green-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
    }`}>
      {done ? '✓' : '○'} {done ? doneLabel : label}
    </span>
  );
}
