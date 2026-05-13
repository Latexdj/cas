'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface TimetableSlot {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  className: string;
}

interface Location {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  studentId?: string;
}

async function compressImage(file: File): Promise<{ blob: Blob; kb: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Try 640px, quality 0.4
      const canvas640 = document.createElement('canvas');
      const ratio640 = Math.min(640 / img.width, 1);
      canvas640.width = Math.floor(img.width * ratio640);
      canvas640.height = Math.floor(img.height * ratio640);
      const ctx640 = canvas640.getContext('2d')!;
      ctx640.drawImage(img, 0, 0, canvas640.width, canvas640.height);

      canvas640.toBlob((blob640) => {
        if (blob640 && blob640.size <= 40 * 1024) {
          resolve({ blob: blob640, kb: Math.round(blob640.size / 1024) });
          return;
        }
        // Try 480px, quality 0.25
        const canvas480 = document.createElement('canvas');
        const ratio480 = Math.min(480 / img.width, 1);
        canvas480.width = Math.floor(img.width * ratio480);
        canvas480.height = Math.floor(img.height * ratio480);
        const ctx480 = canvas480.getContext('2d')!;
        ctx480.drawImage(img, 0, 0, canvas480.width, canvas480.height);
        canvas480.toBlob((blob480) => {
          if (blob480) resolve({ blob: blob480, kb: Math.round(blob480.size / 1024) });
          else reject(new Error('Compression failed'));
        }, 'image/jpeg', 0.25);
      }, 'image/jpeg', 0.4);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function SubmitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSlotId = searchParams.get('slotId');

  const [step, setStep] = useState<1 | 2>(1);
  const [primary, setPrimary] = useState('#2ab289');

  // Step 1 state
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState(preselectedSlotId ?? '');
  const [topic, setTopic] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoKb, setPhotoKb] = useState(0);
  const [photoError, setPhotoError] = useState('');
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({});
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1ApiError, setStep1ApiError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [students, setStudents] = useState<Student[]>([]);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState('');
  const [submittedAttendanceId, setSubmittedAttendanceId] = useState('');

  const loadInitial = useCallback(async () => {
    const teacher = getTeacher();
    if (!teacher) return;
    try {
      const [slotsRes, locsRes] = await Promise.allSettled([
        teacherApi.get(`/api/timetable/today/${teacher.id}`),
        teacherApi.get('/api/locations'),
      ]);
      if (slotsRes.status === 'fulfilled') {
        const d = slotsRes.value.data;
        setSlots(Array.isArray(d) ? d : d?.slots ?? d?.timetable ?? []);
      }
      if (locsRes.status === 'fulfilled') {
        const d = locsRes.value.data;
        setLocations(Array.isArray(d) ? d : d?.locations ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadInitial();
    // Get GPS on mount
    if (navigator.geolocation) {
      getGps();
    }
  }, [loadInitial]); // eslint-disable-line react-hooks/exhaustive-deps

  function getGps() {
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsError('Could not get location. Please enable GPS.');
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    try {
      const { blob, kb } = await compressImage(file);
      setPhotoBlob(blob);
      setPhotoKb(kb);
      const preview = URL.createObjectURL(blob);
      setPhotoPreview(preview);
    } catch {
      setPhotoError('Failed to process image. Please try again.');
    }
  }

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!selectedSlotId) errs.slot = 'Please select a lesson slot.';
    if (!topic.trim()) errs.topic = 'Topic is required.';
    if (!locationId) errs.location = 'Please select a location.';
    if (!gps) errs.gps = 'GPS location is required.';
    if (!photoBlob) errs.photo = 'Photo is required.';
    setStep1Errors(errs);
    if (Object.keys(errs).length > 0) return;

    setStep1Loading(true);
    setStep1ApiError('');
    try {
      const teacher = getTeacher()!;
      const formData = new FormData();
      formData.append('teacherId', teacher.id);
      formData.append('slotId', selectedSlotId);
      formData.append('topic', topic.trim());
      formData.append('locationId', locationId);
      formData.append('latitude', String(gps!.lat));
      formData.append('longitude', String(gps!.lng));
      formData.append('photo', photoBlob!, 'attendance.jpg');

      const res = await teacherApi.post('/api/attendance/submit', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const attendanceId = res.data?.id ?? res.data?.attendanceId ?? '';
      setSubmittedAttendanceId(attendanceId);

      // Load students for selected slot
      const selectedSlot = slots.find((s) => s.id === selectedSlotId);
      if (selectedSlot) {
        setStudentsLoading(true);
        try {
          const studRes = await teacherApi.get(`/api/students?class_name=${encodeURIComponent(selectedSlot.className)}&status=Active`);
          const d = studRes.data;
          setStudents(Array.isArray(d) ? d : d?.students ?? []);
        } catch { /* ignore */ } finally {
          setStudentsLoading(false);
        }
      }
      setStep(2);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
        setStep1ApiError(axiosErr.response?.data?.message ?? axiosErr.response?.data?.error ?? 'Submission failed. Please try again.');
      } else {
        setStep1ApiError('Submission failed. Please try again.');
      }
    } finally {
      setStep1Loading(false);
    }
  }

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStep2Submit() {
    setStep2Loading(true);
    setStep2Error('');
    try {
      const teacher = getTeacher()!;
      const records = students.map((s) => ({
        studentId: s.id,
        status: absentIds.has(s.id) ? 'Absent' : 'Present',
      }));
      await teacherApi.post('/api/student-attendance/submit', {
        teacherId: teacher.id,
        attendanceId: submittedAttendanceId,
        slotId: selectedSlotId,
        records,
      });
      router.push('/teacher');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { message?: string; error?: string } } };
        setStep2Error(axiosErr.response?.data?.message ?? axiosErr.response?.data?.error ?? 'Failed to submit student attendance.');
      } else {
        setStep2Error('Failed to submit student attendance.');
      }
    } finally {
      setStep2Loading(false);
    }
  }

  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  const presentCount = students.length - absentIds.size;
  const absentCount = absentIds.size;

  return (
    <div className="min-h-screen px-4 pt-6 pb-6" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => step === 2 ? setStep(1) : router.push('/teacher')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">
            {step === 1 ? 'Submit Attendance' : 'Student Attendance'}
          </h1>
          <p className="text-xs text-[#8C7E6E]">Step {step} of 2</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map((s) => (
          <div
            key={s}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: s <= step ? primary : '#E2D9CC' }}
          />
        ))}
      </div>

      {/* ===== STEP 1 ===== */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="space-y-4">
          {/* Slot selector */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Lesson Slot</p>
            {slots.length === 0 ? (
              <p className="text-sm text-[#8C7E6E]">No slots available for today.</p>
            ) : (
              <div className="space-y-2">
                {slots.map((slot) => (
                  <label
                    key={slot.id}
                    className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                    style={{
                      borderColor: selectedSlotId === slot.id ? primary : '#E2D9CC',
                      background: selectedSlotId === slot.id ? `${primary}0d` : 'white',
                    }}
                  >
                    <input
                      type="radio"
                      name="slot"
                      value={slot.id}
                      checked={selectedSlotId === slot.id}
                      onChange={() => setSelectedSlotId(slot.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#2C2218]">{slot.subject} — {slot.className}</p>
                      <p className="text-xs text-[#8C7E6E]">{slot.startTime} – {slot.endTime}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {step1Errors.slot && <p className="text-xs text-[#B83232] mt-2">{step1Errors.slot}</p>}
          </div>

          {/* Topic */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">Topic Taught</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What did you teach today?"
              className="w-full border border-[#E2D9CC] rounded-xl px-4 py-3 text-sm bg-white text-[#2C2218] focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': primary } as React.CSSProperties}
            />
            {step1Errors.topic && <p className="text-xs text-[#B83232] mt-1.5">{step1Errors.topic}</p>}
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
            {step1Errors.location && <p className="text-xs text-[#B83232] mt-1.5">{step1Errors.location}</p>}
          </div>

          {/* GPS */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">GPS Location</p>
              <button
                type="button"
                onClick={getGps}
                disabled={gpsLoading}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E2D9CC] text-[#8C7E6E] bg-white"
              >
                {gpsLoading ? 'Getting...' : 'Refresh'}
              </button>
            </div>
            {gps ? (
              <p className="text-sm text-[#2C2218] font-mono">
                {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </p>
            ) : (
              <p className="text-sm text-[#8C7E6E]">Not captured yet</p>
            )}
            {gpsError && <p className="text-xs text-[#B83232] mt-1">{gpsError}</p>}
            {step1Errors.gps && <p className="text-xs text-[#B83232] mt-1">{step1Errors.gps}</p>}
          </div>

          {/* Photo */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Selfie / Proof Photo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <div className="space-y-2">
                <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8C7E6E]">{photoKb} KB</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E2D9CC] text-[#8C7E6E]"
                  >
                    Retake
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-[#E2D9CC] rounded-xl flex flex-col items-center gap-2 text-[#8C7E6E] text-sm"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-8 h-8">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Tap to take photo
              </button>
            )}
            {photoError && <p className="text-xs text-[#B83232] mt-1.5">{photoError}</p>}
            {step1Errors.photo && <p className="text-xs text-[#B83232] mt-1.5">{step1Errors.photo}</p>}
          </div>

          {step1ApiError && (
            <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{step1ApiError}</p>
          )}

          <button
            type="submit"
            disabled={step1Loading}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: primary }}
          >
            {step1Loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Submitting...
              </span>
            ) : 'Continue to Student Attendance'}
          </button>
        </form>
      )}

      {/* ===== STEP 2 ===== */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Info card */}
          {selectedSlot && (
            <div className="rounded-2xl px-4 py-3 border" style={{ background: `${primary}12`, borderColor: `${primary}33` }}>
              <p className="text-sm font-semibold" style={{ color: primary }}>{selectedSlot.subject} — {selectedSlot.className}</p>
              <p className="text-xs mt-0.5" style={{ color: primary, opacity: 0.75 }}>
                {selectedSlot.startTime} – {selectedSlot.endTime}
              </p>
            </div>
          )}

          {/* Count bar */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-3 text-center">
              <p className="text-2xl font-bold" style={{ color: primary }}>{presentCount}</p>
              <p className="text-xs text-[#8C7E6E]">Present</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-3 text-center">
              <p className="text-2xl font-bold text-[#B83232]">{absentCount}</p>
              <p className="text-xs text-[#8C7E6E]">Absent</p>
            </div>
          </div>

          {/* Student list */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm">
            <div className="px-4 py-3 border-b border-[#E2D9CC]">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E]">
                Tap a student to mark absent
              </p>
            </div>
            {studentsLoading ? (
              <div className="p-8 flex items-center justify-center">
                <span className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary }} />
              </div>
            ) : students.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-[#8C7E6E]">No students found for this class.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#F4EFE6]">
                {students.map((student) => {
                  const isAbsent = absentIds.has(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleAbsent(student.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                      style={{ background: isAbsent ? '#FEE2E2' : 'white' }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: isAbsent ? '#991B1B' : '#2C2218' }}>
                          {student.name}
                        </p>
                        {student.studentId && (
                          <p className="text-xs text-[#8C7E6E]">{student.studentId}</p>
                        )}
                      </div>
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={
                          isAbsent
                            ? { background: '#FCA5A5', color: '#991B1B' }
                            : { background: `${primary}18`, color: primary }
                        }
                      >
                        {isAbsent ? 'Absent' : 'Present'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {step2Error && (
            <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{step2Error}</p>
          )}

          <button
            onClick={handleStep2Submit}
            disabled={step2Loading}
            className="w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: primary }}
          >
            {step2Loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Submitting...
              </span>
            ) : 'Submit Student Attendance'}
          </button>
        </div>
      )}
    </div>
  );
}
