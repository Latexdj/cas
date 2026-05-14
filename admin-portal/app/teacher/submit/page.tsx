'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

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

  const [step, setStep] = useState<1 | 2>(1);
  const [primary, setPrimary] = useState('#2ab289');

  // Step 1
  const [slots,       setSlots]       = useState<TimetableSlot[]>([]);
  const [submitted,   setSubmitted]   = useState<AttendanceRecord[]>([]);
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
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [attendanceId,  setAttendanceId]  = useState('');
  const [students,      setStudents]      = useState<Student[]>([]);
  const [absentIds,     setAbsentIds]     = useState<Set<string>>(new Set());
  const [studLoading,   setStudLoading]   = useState(false);
  const [step2Loading,  setStep2Loading]  = useState(false);
  const [step2Error,    setStep2Error]    = useState('');

  const load = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    const [slotsRes, locsRes, attRes] = await Promise.allSettled([
      teacherApi.get<TimetableSlot[]>(`/api/timetable/today/${teacher.id}`),
      teacherApi.get<Location[]>('/api/locations'),
      teacherApi.get<AttendanceRecord[]>(`/api/attendance/today/${teacher.id}`),
    ]);
    if (slotsRes.status === 'fulfilled') setSlots(slotsRes.value.data ?? []);
    if (locsRes.status === 'fulfilled')  setLocations(locsRes.value.data ?? []);
    if (attRes.status  === 'fulfilled')  setSubmitted(attRes.value.data ?? []);
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
    grabGps();
  }, [load]);

  function grabGps() {
    if (!navigator.geolocation) { setGpsError('GPS not available in this browser.'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setGpsLoading(false); },
      ()  => { setGpsError('Could not get location. Tap Refresh to retry.'); setGpsLoading(false); },
      { timeout: 15000 }
    );
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

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string,string> = {};
    if (!selectedId)    errs.slot  = 'Please select a lesson slot.';
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

      // Load students
      const primaryClass = slot.class_names.split(',')[0].trim();
      setStudLoading(true);
      try {
        const sr = await teacherApi.get<Student[]>(`/api/students?class_name=${encodeURIComponent(primaryClass)}&status=Active`);
        setStudents(sr.data ?? []);
      } finally { setStudLoading(false); }
      setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setApiError(msg ?? 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  async function handleStep2() {
    const slot = slots.find(s => s.id === selectedId)!;
    const teacher = getTeacher()!;
    const primaryClass = slot.class_names.split(',')[0].trim();
    setStep2Loading(true); setStep2Error('');
    try {
      await teacherApi.post('/api/student-attendance/submit', {
        attendanceId,
        teacherId:      teacher.id,
        subject:        slot.subject,
        className:      primaryClass,
        lessonEndTime:  slot.end_time,
        records: students.map(s => ({ studentId: s.id, status: absentIds.has(s.id) ? 'Absent' : 'Present' })),
      });
      router.push('/teacher');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setStep2Error(msg ?? 'Failed to submit student attendance.');
    } finally { setStep2Loading(false); }
  }

  const selectedSlot = slots.find(s => s.id === selectedId);
  const presentCount = students.length - absentIds.size;

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => step === 2 ? setStep(1) : router.push('/teacher')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">{step === 1 ? 'Submit Attendance' : 'Student Attendance'}</h1>
          <p className="text-xs text-[#8C7E6E]">Step {step} of 2</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-2 mb-6">
        {[1,2].map(s => <div key={s} className="h-1 flex-1 rounded-full" style={{ background: s <= step ? primary : '#E2D9CC' }} />)}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <form onSubmit={handleStep1} className="space-y-4">
          {/* Slot picker */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Select Lesson *</p>
            {slots.length === 0
              ? <p className="text-sm text-[#8C7E6E]">No timetable slots for today.</p>
              : slots.map(slot => {
                  const done = isSubmitted(slot);
                  const sel  = selectedId === slot.id;
                  return (
                    <label key={slot.id} className={`flex items-start gap-3 p-3 rounded-xl border mb-2 cursor-pointer transition-colors ${done ? 'opacity-50' : ''}`}
                      style={{ borderColor: sel ? primary : '#E2D9CC', background: sel ? `${primary}10` : 'white' }}>
                      <input type="radio" name="slot" value={slot.id} checked={sel} disabled={done}
                        onChange={() => setSelectedId(slot.id)} className="mt-1 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#2C2218]">{slot.subject} — {slot.class_names}</p>
                        <p className="text-xs text-[#8C7E6E]">{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</p>
                        {done && <p className="text-xs font-semibold mt-0.5" style={{ color: '#2D7A4F' }}>✓ Submitted</p>}
                      </div>
                    </label>
                  );
                })
            }
            {errors.slot && <p className="text-xs text-[#B83232] mt-1">{errors.slot}</p>}
          </div>

          {/* Topic */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Topic *</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What was covered in this lesson?"
              className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none" />
            {errors.topic && <p className="text-xs text-[#B83232] mt-1">{errors.topic}</p>}
          </div>

          {/* Location */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Location *</label>
            <select value={locName} onChange={e => setLocName(e.target.value)}
              className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none">
              <option value="">Select classroom...</option>
              {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            {errors.loc && <p className="text-xs text-[#B83232] mt-1">{errors.loc}</p>}
          </div>

          {/* GPS */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">GPS Coordinates *</p>
            <div className="flex items-center justify-between">
              {gpsLoading
                ? <p className="text-sm text-[#8C7E6E] italic">Acquiring location…</p>
                : gps
                  ? <p className="text-sm text-[#2C2218] font-mono">{gps}</p>
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
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Classroom Photo *</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhoto} className="hidden" />
            {photoUrl ? (
              <div>
                <img src={photoUrl} alt="preview" className="w-full rounded-xl object-cover" style={{ maxHeight: 200 }} />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-[#8C7E6E]">{photoKb} KB</p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-xs font-semibold" style={{ color: primary }}>Retake</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-[#E2D9CC] flex flex-col items-center justify-center gap-2 text-[#8C7E6E]">
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
            <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Lesson</p>
              <p className="text-sm font-semibold text-[#2C2218]">{selectedSlot.subject} — {selectedSlot.class_names.split(',')[0].trim()}</p>
              <p className="text-xs text-[#8C7E6E]">{selectedSlot.start_time.slice(0,5)} – {selectedSlot.end_time.slice(0,5)}</p>
            </div>
          )}

          {/* Counts */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Present', count: presentCount,      color: '#2D7A4F', bg: '#E4F4EB' },
              { label: 'Absent',  count: absentIds.size,    color: '#DC2626', bg: '#FEF2F2' },
              { label: 'Total',   count: students.length,   color: '#64748B', bg: '#F8FAFC' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className="rounded-2xl p-3 text-center" style={{ background: bg }}>
                <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color }}>{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">
            Tap a student to mark absent
          </p>

          {studLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-xl h-14 animate-pulse border border-[#E2D9CC]" />)}
            </div>
          ) : students.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-5 text-center">
              <p className="text-sm text-[#8C7E6E]">No students found for this class.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {students.map(s => {
                const absent = absentIds.has(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => setAbsentIds(prev => {
                    const n = new Set(prev); absent ? n.delete(s.id) : n.add(s.id); return n;
                  })} className="w-full flex items-center justify-between p-3.5 rounded-xl border transition-colors text-left"
                    style={{ borderColor: absent ? '#FCA5A5' : '#E2D9CC', background: absent ? '#FEF2F2' : 'white' }}>
                    <div>
                      <p className="text-xs font-bold text-[#8C7E6E]">{s.student_code}</p>
                      <p className="text-sm font-semibold" style={{ color: absent ? '#DC2626' : '#2C2218' }}>{s.name}</p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: absent ? '#FEE2E2' : '#DCFCE7', color: absent ? '#DC2626' : '#166534' }}>
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
            {step2Loading ? 'Submitting…' : 'Submit Student Attendance ✓'}
          </button>
        </div>
      )}
    </div>
  );
}
