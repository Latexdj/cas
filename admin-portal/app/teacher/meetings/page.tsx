'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

// ── Interfaces ────────────────────────────────────────────────────────────────

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

interface PlcSession {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_name: string;
  has_coordinates: boolean;
}

interface PlcTodayData {
  session: PlcSession;
  submitted: { id: string; submitted_at: string } | null;
}

type ActiveTab = 'meetings' | 'plc';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeacherMeetingsPage() {
  const [primary, setPrimary] = useState('#2ab289');

  // Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('meetings');

  // Meetings state
  const [loadingMeetings,  setLoadingMeetings]  = useState(true);
  const [meetings,         setMeetings]         = useState<Meeting[]>([]);
  const [activeMeetingId,  setActiveMeetingId]  = useState<string | null>(null);
  const [meetingNotes,     setMeetingNotes]     = useState('');

  // PLC state
  const [loadingPlc, setLoadingPlc] = useState(true);
  const [plcData,    setPlcData]    = useState<PlcTodayData | null>(null);
  const [agenda,     setAgenda]     = useState('');
  const [plcErrors,  setPlcErrors]  = useState<Record<string, string>>({});

  // Shared form state
  const [gps,          setGps]          = useState('');
  const [gpsAcquiring, setGpsAcquiring] = useState(false);
  const [gpsError,     setGpsError]     = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoSizeKb,  setPhotoSizeKb]  = useState<number | null>(null);
  const [qrVerified,   setQrVerified]   = useState(false);
  const [qrLocation,   setQrLocation]   = useState('');
  const [qrScanning,   setQrScanning]   = useState(false);
  const [qrError,      setQrError]      = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');

  // QR refs (shared between tabs)
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plcFileRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    loadMeetings();
    loadPlc();
    grabGps();
    return () => stopQrScanner();
  }, []);

  // ── Data loaders ───────────────────────────────────────────────────────────

  async function loadMeetings() {
    setLoadingMeetings(true);
    try {
      const res = await teacherApi.get<Meeting[]>('/api/meetings/today');
      setMeetings(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMeetings([]);
    } finally {
      setLoadingMeetings(false);
    }
  }

  async function loadPlc() {
    setLoadingPlc(true);
    try {
      const res = await teacherApi.get<PlcTodayData | null>('/api/plc/today');
      setPlcData(res.data);
    } catch {
      setPlcData(null);
    } finally {
      setLoadingPlc(false);
    }
  }

  function grabGps() {
    if (!navigator.geolocation) { setGpsError('GPS not available in this browser.'); return; }
    setGpsAcquiring(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
        setGpsAcquiring(false);
      },
      () => { setGpsError('GPS unavailable. Click Refresh.'); setGpsAcquiring(false); },
      { timeout: 15000 },
    );
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  function switchTab(tab: ActiveTab) {
    stopQrScanner();
    setActiveTab(tab);
    setActiveMeetingId(null);
    setMeetingNotes('');
    setAgenda('');
    setPlcErrors({});
    setPhotoDataUrl(null);
    setPhotoSizeKb(null);
    setQrVerified(false);
    setQrLocation('');
    setQrError('');
    setSubmitError('');
  }

  // ── Meetings form helpers ──────────────────────────────────────────────────

  function openForm(meetingId: string) {
    setActiveMeetingId(meetingId);
    setMeetingNotes('');
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

  // ── Photo ──────────────────────────────────────────────────────────────────

  async function handlePhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, kb } = await compressImage(file);
      setPhotoDataUrl(dataUrl);
      setPhotoSizeKb(kb);
    } catch {
      setSubmitError('Failed to process image.');
    }
    e.target.value = '';
  }

  // ── QR scanner ────────────────────────────────────────────────────────────

  async function startQrScanner() {
    setQrError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
      await video.play();
      setQrScanning(true);
      const jsQR = (await import('jsqr')).default;
      qrIntervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        if (v.readyState !== v.HAVE_ENOUGH_DATA) return;
        const c = canvasRef.current;
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (code?.data) handleQrDetected(code.data);
      }, 300);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setQrError('Camera permission denied. In Safari, go to Settings → Safari → Camera and allow access.');
      } else if (name === 'NotFoundError') {
        setQrError('No camera found on this device.');
      } else {
        setQrError('Could not open camera. Make sure no other app is using it and try again.');
      }
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
    stopQrScanner();
    try {
      if (activeTab === 'plc' && plcData?.session) {
        const res = await teacherApi.post<{ valid: boolean; locationName: string }>(
          '/api/plc/verify-qr', { token: data, sessionId: plcData.session.id },
        );
        if (res.data.valid) { setQrVerified(true); setQrLocation(res.data.locationName); }
        else { setQrError('Wrong venue QR code. Scan the QR posted at the PLC room.'); }
      } else if (activeMeetingId) {
        const res = await teacherApi.post<{ valid: boolean; locationName: string }>(
          '/api/meetings/verify-qr', { token: data, meetingId: activeMeetingId },
        );
        if (res.data.valid) { setQrVerified(true); setQrLocation(res.data.locationName); }
        else { setQrError('Wrong venue QR code. Scan the QR posted at the meeting location.'); }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setQrError(msg ?? 'Invalid QR code. Try again.');
    }
  }

  // ── Submit handlers ────────────────────────────────────────────────────────

  async function handleMeetingSubmit() {
    if (!activeMeetingId) return;
    if (gpsAcquiring)  { setSubmitError('GPS is still acquiring. Please wait.'); return; }
    if (!gps)          { setSubmitError(gpsError || 'GPS coordinates required. Click Refresh.'); return; }
    if (!photoDataUrl) { setSubmitError('Please take a photo at the meeting venue.'); return; }
    if (!qrVerified)   { setSubmitError('Please scan the venue QR code to verify your presence.'); return; }

    setSubmitting(true); setSubmitError('');
    try {
      await teacherApi.post('/api/meetings/submit', {
        meetingId:      activeMeetingId,
        notes:          meetingNotes.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoDataUrl,
        photoSizeKb:    photoSizeKb ?? undefined,
      });
      closeForm();
      await loadMeetings();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSubmitError(msg ?? 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  async function handlePlcSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!qrVerified)   errs.qr    = 'Please scan the PLC venue QR code.';
    if (!gps)          errs.gps   = gpsError || 'GPS is required. Click Refresh.';
    if (!photoDataUrl) errs.photo = 'Please take a photo at the PLC venue.';
    setPlcErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true); setSubmitError('');
    try {
      await teacherApi.post('/api/plc/submit', {
        sessionId:      plcData!.session.id,
        agenda:         agenda.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoDataUrl,
        photoSizeKb:    photoSizeKb ?? undefined,
      });
      setAgenda('');
      setPhotoDataUrl(null); setPhotoSizeKb(null);
      setQrVerified(false); setQrLocation('');
      setPlcErrors({});
      await loadPlc();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSubmitError(msg ?? 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  // ── Shared UI blocks ───────────────────────────────────────────────────────

  function renderGps() {
    return (
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
    );
  }

  function renderPhotoInput(errorKey: string) {
    return photoDataUrl ? (
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
    );
  }

  function renderQrScanner() {
    return qrVerified ? (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-600 shrink-0">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-bold text-green-800">Venue Verified</p>
          <p className="text-xs text-green-600">{qrLocation}</p>
        </div>
        <button onClick={() => { setQrVerified(false); setQrLocation(''); }} className="text-xs font-bold text-green-700">
          Rescan
        </button>
      </div>
    ) : (
      <>
        <div style={{ display: qrScanning ? 'block' : 'none' }}>
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
              type="button"
              onClick={stopQrScanner}
              className="absolute top-2 right-2 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
        {!qrScanning && (
          <button
            type="button"
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
              <p className="text-xs text-[#8C7E6E]">Scan the QR code posted at the venue</p>
            </div>
            {qrError && <span className="text-xs text-red-500 shrink-0">Failed — retry</span>}
          </button>
        )}
      </>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  const loading = loadingMeetings || loadingPlc;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-24" style={{ background: '#F4EFE6' }}>
      <div className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-bold text-[#2C2218]">Today</h1>
        <p className="text-sm text-[#8C7E6E]">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Segmented control */}
      <div className="px-4 mb-4">
        <div className="flex bg-white border border-[#E2D9CC] rounded-xl overflow-hidden">
          <button
            onClick={() => switchTab('meetings')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
            style={activeTab === 'meetings'
              ? { backgroundColor: '#F0FAF4', color: primary, borderBottom: `2px solid ${primary}` }
              : { color: '#A09282', borderBottom: '2px solid transparent' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Meetings
          </button>
          <button
            onClick={() => switchTab('plc')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors"
            style={activeTab === 'plc'
              ? { backgroundColor: '#F0FAF4', color: primary, borderBottom: `2px solid ${primary}` }
              : { color: '#A09282', borderBottom: '2px solid transparent' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            PLC
          </button>
        </div>
      </div>

      {/* ── Meetings tab ── */}
      {activeTab === 'meetings' && (
        <div className="px-4 space-y-3">
          {meetings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-10 text-center">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-base font-bold text-[#2C2218]">No meetings today</p>
              <p className="text-sm text-[#8C7E6E] mt-1">Check back when a meeting is scheduled.</p>
            </div>
          ) : meetings.map(m => (
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

              {/* Inline submission form */}
              {activeMeetingId === m.id && !m.submitted && (
                <div className="border-t border-[#E2D9CC] p-4 space-y-4 bg-[#FAFAF8]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">GPS Location</p>
                    {renderGps()}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">
                      Notes <span className="font-normal normal-case">(optional)</span>
                    </p>
                    <textarea
                      rows={2}
                      value={meetingNotes}
                      onChange={e => setMeetingNotes(e.target.value)}
                      placeholder="Any notes about the meeting…"
                      className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none focus:ring-2 resize-none"
                      style={{ '--tw-ring-color': primary } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Photo *</p>
                    {renderPhotoInput('photo')}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Venue QR Code *</p>
                    {renderQrScanner()}
                  </div>
                  {submitError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{submitError}</p>
                  )}
                  <button
                    onClick={handleMeetingSubmit}
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

      {/* ── PLC tab ── */}
      {activeTab === 'plc' && (
        <div className="px-4">
          {!plcData ? (
            <div className="bg-white rounded-2xl border border-[#E2D9CC] p-10 text-center">
              <p className="text-4xl mb-3">👥</p>
              <p className="text-base font-bold text-[#2C2218]">No PLC Session Today</p>
              <p className="text-sm text-[#8C7E6E] mt-1 max-w-xs mx-auto">
                There is no PLC session scheduled for today. Check back on your next scheduled day.
              </p>
            </div>
          ) : plcData.submitted ? (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-[#A7D7B8] shadow-sm p-5" style={{ background: '#F0FAF4' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold shrink-0">✓</span>
                  <div>
                    <p className="text-sm font-bold text-[#1A4D2E]">Attendance Submitted</p>
                    <p className="text-xs text-[#2D7A4F]">
                      {new Date(plcData.submitted.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="border-t border-[#A7D7B8] pt-3 space-y-1">
                  <p className="text-sm font-semibold text-[#1A4D2E]">{plcData.session.title}</p>
                  <p className="text-xs text-[#2D7A4F]">
                    {plcData.session.start_time.slice(0, 5)} – {plcData.session.end_time.slice(0, 5)} · {plcData.session.location_name}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePlcSubmit} className="space-y-4">
              {/* Session card */}
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Today's Session</p>
                <p className="text-base font-bold text-[#2C2218]">{plcData.session.title}</p>
                <p className="text-sm text-[#8C7E6E] mt-0.5">
                  {plcData.session.start_time.slice(0, 5)} – {plcData.session.end_time.slice(0, 5)}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5 text-[#8C7E6E] shrink-0">
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <p className="text-xs text-[#8C7E6E] font-medium">{plcData.session.location_name}</p>
                </div>
              </div>

              {/* QR scan */}
              <div className="bg-white rounded-2xl border shadow-sm p-4"
                style={{ borderColor: qrVerified ? '#86EFAC' : plcErrors.qr ? '#FCA5A5' : '#E2D9CC' }}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">PLC Venue QR *</p>
                {renderQrScanner()}
                {plcErrors.qr && !qrVerified && <p className="text-xs text-[#B83232] mt-1">{plcErrors.qr}</p>}
              </div>

              {/* GPS */}
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">GPS Coordinates *</p>
                {renderGps()}
                {plcErrors.gps && <p className="text-xs text-[#B83232] mt-1">{plcErrors.gps}</p>}
              </div>

              {/* Agenda */}
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">
                  Agenda <span className="font-normal normal-case">(optional)</span>
                </label>
                <input
                  value={agenda}
                  onChange={e => setAgenda(e.target.value)}
                  placeholder="What was discussed in this PLC session?"
                  className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none"
                />
              </div>

              {/* Photo */}
              <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Venue Photo *</p>
                {renderPhotoInput('photo')}
                {plcErrors.photo && <p className="text-xs text-[#B83232] mt-1">{plcErrors.photo}</p>}
              </div>

              {submitError && (
                <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{submitError}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: primary }}
              >
                {submitting ? 'Submitting…' : 'Submit PLC Attendance ✓'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
