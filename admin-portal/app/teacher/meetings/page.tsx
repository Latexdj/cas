'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string;
  has_coordinates: boolean;
  submitted: { id: string; submitted_at: string } | null;
}

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  'PLC':              { bg: '#DCFCE7', color: '#15803D' },
  'Morning Briefing': { bg: '#DBEAFE', color: '#1D4ED8' },
  'Staff Meeting':    { bg: '#F3E8FF', color: '#7E22CE' },
  'PTA':              { bg: '#FEF3C7', color: '#B45309' },
  'Other':            { bg: '#F1F5F9', color: '#475569' },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_BADGE[type] ?? TYPE_BADGE['Other'];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>
      {type}
    </span>
  );
}

export default function TeacherMeetingsPage() {
  const [primary, setPrimary] = useState('#2ab289');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  // Form state
  const [gps, setGps] = useState('');
  const [gpsAcquiring, setGpsAcquiring] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [notes, setNotes] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number | null>(null);
  const [qrVerified, setQrVerified] = useState(false);
  const [qrLocation, setQrLocation] = useState('');
  const [qrScanning, setQrScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // QR scanner refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadMeetings();
  }, []);

  async function loadMeetings() {
    setLoading(true);
    try {
      const res = await teacherApi.get<Meeting[]>('/api/meetings/today');
      setMeetings(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }

  function openForm(meetingId: string) {
    setActiveMeetingId(meetingId);
    setNotes('');
    setPhotoDataUrl(null);
    setPhotoSizeKb(null);
    setQrVerified(false);
    setQrLocation('');
    setQrError('');
    setSubmitError('');
    grabGps();
  }

  function closeForm() {
    setActiveMeetingId(null);
    stopQrScanner();
  }

  async function grabGps() {
    setGpsAcquiring(true);
    setGps('');
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('GPS not available in this browser.');
      setGpsAcquiring(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
        setGpsAcquiring(false);
      },
      () => {
        setGpsError('GPS unavailable. Click Refresh.');
        setGpsAcquiring(false);
      },
      { timeout: 15000 }
    );
  }

  function handlePhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const compress = (w: number, q: number) => {
        const c = document.createElement('canvas');
        const scale = Math.min(1, w / img.width);
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', q);
      };
      let dataUrl = compress(640, 0.4);
      const raw = dataUrl.split(',')[1] ?? '';
      if (raw.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
      const b64 = dataUrl.split(',')[1] ?? '';
      setPhotoDataUrl(dataUrl);
      setPhotoSizeKb(Math.round((b64.length * 0.75) / 1024));
      URL.revokeObjectURL(url);
    };
    img.src = url;
    e.target.value = '';
  }

  async function startQrScanner() {
    setQrError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setQrScanning(true);
      const jsQR = (await import('jsqr')).default;
      qrIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        if (v.readyState !== v.HAVE_ENOUGH_DATA) return;
        const c = canvasRef.current;
        c.width  = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) handleQrDetected(code.data);
      }, 300);
    } catch {
      setQrError('Camera access denied or not available.');
    }
  }

  function stopQrScanner() {
    if (qrIntervalRef.current) { clearInterval(qrIntervalRef.current); qrIntervalRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setQrScanning(false);
  }

  async function handleQrDetected(data: string) {
    if (!activeMeetingId) return;
    stopQrScanner();
    try {
      const res = await teacherApi.post<{ valid: boolean; locationName: string }>('/api/meetings/verify-qr', {
        token: data,
        meetingId: activeMeetingId,
      });
      if (res.data.valid) {
        setQrVerified(true);
        setQrLocation(res.data.locationName);
      } else {
        setQrError('Wrong venue QR code. Scan the QR posted at the meeting location.');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setQrError(msg ?? 'Invalid QR code.');
    }
  }

  async function handleSubmit() {
    if (!activeMeetingId) return;
    if (gpsAcquiring) { setSubmitError('GPS is still acquiring. Please wait.'); return; }
    if (!gps)         { setSubmitError(gpsError || 'GPS coordinates required. Click Refresh.'); return; }
    if (!photoDataUrl) { setSubmitError('Please take a photo at the meeting venue.'); return; }
    if (!qrVerified)   { setSubmitError('Please scan the venue QR code to verify your presence.'); return; }

    setSubmitting(true);
    setSubmitError('');
    try {
      await teacherApi.post('/api/meetings/submit', {
        meetingId:      activeMeetingId,
        notes:          notes.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoDataUrl,
        photoSizeKb:    photoSizeKb ?? undefined,
      });
      closeForm();
      await loadMeetings();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSubmitError(msg ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const activeMeeting = meetings.find(m => m.id === activeMeetingId) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: '#F4EFE6' }}>
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[#2C2218]">Today's Meetings</h1>
        <p className="text-sm text-[#8C7E6E]">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {meetings.length === 0 ? (
        <div className="mx-4 bg-white rounded-2xl border border-[#E2D9CC] p-10 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-base font-bold text-[#2C2218]">No meetings today</p>
          <p className="text-sm text-[#8C7E6E] mt-1">Check back when a meeting is scheduled.</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {meetings.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <TypeBadge type={m.meeting_type} />
                    </div>
                    <p className="text-base font-bold text-[#2C2218] truncate">{m.title}</p>
                    <p className="text-xs text-[#8C7E6E] mt-0.5">
                      {m.start_time.slice(0, 5)} – {m.end_time.slice(0, 5)} · {m.location_name}
                    </p>
                  </div>
                  {m.submitted ? (
                    <div className="shrink-0 flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-bold text-green-700">Submitted</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => activeMeetingId === m.id ? closeForm() : openForm(m.id)}
                      className="shrink-0 text-xs font-bold px-4 py-2 rounded-xl text-white"
                      style={{ background: primary }}
                    >
                      {activeMeetingId === m.id ? 'Cancel' : 'Submit'}
                    </button>
                  )}
                </div>

                {m.submitted && (
                  <p className="text-xs text-green-600 mt-2">
                    Submitted at {new Date(m.submitted.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              {/* Inline submission form for this meeting */}
              {activeMeetingId === m.id && !m.submitted && (
                <div className="border-t border-[#E2D9CC] p-4 space-y-4 bg-[#FAFAF8]">

                  {/* GPS */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">GPS Location</p>
                    <div className="flex items-center gap-3 bg-white border border-[#E2D9CC] rounded-xl px-3 py-2.5">
                      {gpsAcquiring ? (
                        <span className="text-sm text-[#8C7E6E] italic flex-1">Acquiring GPS…</span>
                      ) : gps ? (
                        <span className="text-sm text-[#2C2218] flex-1 truncate">{gps}</span>
                      ) : (
                        <span className="text-sm text-amber-600 flex-1">{gpsError || 'GPS not acquired'}</span>
                      )}
                      <button onClick={grabGps} className="text-xs font-bold shrink-0" style={{ color: primary }}>
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Notes (optional) */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">
                      Notes <span className="font-normal normal-case">(optional)</span>
                    </p>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Any notes about the meeting…"
                      className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none focus:ring-2 resize-none"
                      style={{ '--tw-ring-color': primary } as React.CSSProperties}
                    />
                  </div>

                  {/* Photo */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Photo *</p>
                    {photoDataUrl ? (
                      <div>
                        <img src={photoDataUrl} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-[#E2D9CC]" />
                        <div className="flex items-center justify-between mt-2">
                          {photoSizeKb && <span className="text-xs text-[#8C7E6E]">{photoSizeKb} KB</span>}
                          <label className="text-xs font-bold cursor-pointer" style={{ color: primary }}>
                            Retake
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoInput} />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-[#E2D9CC] rounded-xl bg-white cursor-pointer hover:bg-[#F9F7F5]">
                        <span className="text-3xl mb-1">📷</span>
                        <span className="text-sm text-[#8C7E6E]">Tap to take photo</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoInput} />
                      </label>
                    )}
                  </div>

                  {/* QR scan */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Venue QR Code *</p>
                    {qrVerified ? (
                      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-3">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 shrink-0">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-green-800">Venue Verified</p>
                          <p className="text-xs text-green-600">{qrLocation}</p>
                        </div>
                        <button onClick={() => { setQrVerified(false); setQrLocation(''); }} className="text-xs font-bold text-green-700">Rescan</button>
                      </div>
                    ) : qrScanning ? (
                      <div className="relative rounded-xl overflow-hidden border border-[#E2D9CC]">
                        <video ref={videoRef} className="w-full h-48 object-cover bg-black" playsInline muted />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-40 h-40 border-2 border-white rounded-xl" />
                        </div>
                        {qrError && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-center">
                            <p className="text-xs text-red-300">{qrError}</p>
                          </div>
                        )}
                        <button
                          onClick={stopQrScanner}
                          className="absolute top-2 right-2 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startQrScanner}
                        className="w-full flex items-center gap-3 bg-white border border-[#E2D9CC] rounded-xl px-4 py-3"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5 shrink-0" style={{ color: primary }}>
                          <rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" />
                          <rect x="3" y="16" width="5" height="5" rx="1" />
                          <path strokeLinecap="round" d="M16 10h5M16 14h3M21 14v5M10 3v5M10 16v5M3 10h5M10 10h.01" />
                        </svg>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-bold text-[#2C2218]">Scan Venue QR Code</p>
                          <p className="text-xs text-[#8C7E6E]">Scan the QR code posted at {m.location_name}</p>
                        </div>
                        {qrError && <span className="text-xs text-red-500 shrink-0">Failed — retry</span>}
                      </button>
                    )}
                  </div>

                  {submitError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{submitError}</p>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: primary }}
                  >
                    {submitting ? 'Submitting…' : 'Submit Attendance'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
