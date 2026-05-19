'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacher, getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';
import type jsQRType from 'jsqr';

interface PlcSession {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_name: string;
  has_coordinates: boolean;
}

interface TodayData {
  session: PlcSession;
  submitted: { id: string; submitted_at: string } | null;
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

export default function TeacherPlcPage() {
  const router = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [loading,     setLoading]     = useState(true);
  const [todayData,   setTodayData]   = useState<TodayData | null>(null);

  const [agenda,      setAgenda]      = useState('');
  const [gps,         setGps]         = useState('');
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState('');
  const [photoUrl,    setPhotoUrl]    = useState('');
  const [photoB64,    setPhotoB64]    = useState('');
  const [photoKb,     setPhotoKb]     = useState(0);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState('');

  const [qrVerified,   setQrVerified]   = useState(false);
  const [qrScanning,   setQrScanning]   = useState(false);
  const [qrError,      setQrError]      = useState('');
  const [qrLocation,   setQrLocation]   = useState('');

  const fileRef   = useRef<HTMLInputElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<TodayData | null>('/api/plc/today');
      setTodayData(data);
    } catch {
      setTodayData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const colors = getTeacherColors();
    setPrimary(colors.primary);
    load();
    grabGps();
  }, [load]);

  useEffect(() => () => stopCamera(), []);

  function grabGps() {
    if (!navigator.geolocation) { setGpsError('GPS not available in this browser.'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
        setGpsLoading(false);
      },
      () => { setGpsError('Could not get location. Tap Refresh to retry.'); setGpsLoading(false); },
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

  function stopCamera() {
    if (scanTimer.current) { clearInterval(scanTimer.current); scanTimer.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setQrScanning(false);
  }

  async function startQrScan() {
    setQrError(''); setQrScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
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
    } catch {
      setQrError('Camera access denied. Please allow camera permissions and try again.');
      setQrScanning(false);
    }
  }

  async function verifyQrToken(token: string) {
    if (!todayData?.session) return;
    setQrError('');
    try {
      const res = await teacherApi.post<{ valid: boolean; locationName: string }>(
        '/api/plc/verify-qr',
        { token, sessionId: todayData.session.id }
      );
      if (res.data.valid) {
        setQrVerified(true);
        setQrLocation(res.data.locationName);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setQrError(msg ?? 'QR verification failed. Please try again.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!qrVerified) errs.qr    = 'Please scan the PLC venue QR code.';
    if (!gps)        errs.gps   = gpsError || 'GPS is required. Tap Refresh.';
    if (!photoB64)   errs.photo = 'Please take a photo.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true); setApiError('');
    try {
      await teacherApi.post('/api/plc/submit', {
        sessionId:      todayData!.session.id,
        agenda:         agenda.trim() || undefined,
        gpsCoordinates: gps,
        imageBase64:    photoB64,
        photoSizeKb:    photoKb,
      });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setApiError(msg ?? 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE6' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${primary} transparent transparent transparent` }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/teacher')}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">PLC Attendance</h1>
          <p className="text-xs text-[#8C7E6E]">Professional Learning Community</p>
        </div>
      </div>

      {/* No PLC today */}
      {!todayData && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#E2D9CC] flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[#C0B8AF]">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p className="text-base font-bold text-[#2C2218] mb-1">No PLC Session Today</p>
          <p className="text-sm text-[#8C7E6E] max-w-xs">
            There is no PLC session scheduled for today. Check back on your next scheduled day.
          </p>
        </div>
      )}

      {/* Already submitted */}
      {todayData?.submitted && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#A7D7B8] shadow-sm p-5" style={{ background: '#F0FAF4' }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold shrink-0">✓</span>
              <div>
                <p className="text-sm font-bold text-[#1A4D2E]">Attendance Submitted</p>
                <p className="text-xs text-[#2D7A4F]">
                  {new Date(todayData.submitted.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="border-t border-[#A7D7B8] pt-3 space-y-1">
              <p className="text-sm font-semibold text-[#1A4D2E]">{todayData.session.title}</p>
              <p className="text-xs text-[#2D7A4F]">
                {todayData.session.start_time.slice(0, 5)} – {todayData.session.end_time.slice(0, 5)} · {todayData.session.location_name}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4 text-center">
            <p className="text-sm text-[#8C7E6E]">Your PLC attendance for today has been recorded successfully.</p>
          </div>
        </div>
      )}

      {/* Submission form */}
      {todayData && !todayData.submitted && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Session info card */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-2">Today&apos;s Session</p>
            <p className="text-base font-bold text-[#2C2218]">{todayData.session.title}</p>
            <p className="text-sm text-[#8C7E6E] mt-0.5">
              {todayData.session.start_time.slice(0, 5)} – {todayData.session.end_time.slice(0, 5)}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5 text-[#8C7E6E] shrink-0">
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <p className="text-xs text-[#8C7E6E] font-medium">{todayData.session.location_name}</p>
            </div>
          </div>

          {/* QR scan */}
          <div className="bg-white rounded-2xl border shadow-sm p-4"
            style={{ borderColor: qrVerified ? '#86EFAC' : errors.qr ? '#FCA5A5' : '#E2D9CC' }}>
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">PLC Venue QR *</p>

            {qrVerified ? (
              <div className="flex items-center gap-3 py-1">
                <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg shrink-0">✓</span>
                <div>
                  <p className="text-sm font-semibold text-[#2C2218]">Verified — {qrLocation}</p>
                  <button type="button" onClick={() => { setQrVerified(false); setQrLocation(''); }}
                    className="text-xs mt-0.5" style={{ color: primary }}>Scan again</button>
                </div>
              </div>
            ) : (
              <>
                {qrScanning ? (
                  <div className="space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '1' }}>
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-white rounded-xl opacity-70" />
                      </div>
                      <canvas ref={canvasRef} className="hidden" />
                    </div>
                    <button type="button" onClick={stopCamera}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#E2D9CC] text-[#8C7E6E] bg-white">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={startQrScan}
                    className="w-full h-20 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 text-[#8C7E6E]"
                    style={{ borderColor: '#E2D9CC' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 shrink-0">
                      <rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" />
                      <rect x="3" y="16" width="5" height="5" rx="1" /><rect x="10" y="10" width="4" height="4" rx="0.5" />
                      <path d="M16 10h5M16 14h3M21 14v2M10 3v5M10 16v5M3 10h5" />
                    </svg>
                    <span className="text-sm font-semibold">Tap to scan venue QR code</span>
                  </button>
                )}
                {qrError && <p className="text-xs text-[#B83232] mt-2">{qrError}</p>}
              </>
            )}
            {errors.qr && !qrVerified && <p className="text-xs text-[#B83232] mt-1">{errors.qr}</p>}
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

          {/* Agenda (optional) */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <label className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] block mb-2">
              Agenda <span className="font-normal normal-case">(optional)</span>
            </label>
            <input value={agenda} onChange={e => setAgenda(e.target.value)}
              placeholder="What was discussed in this PLC session?"
              className="w-full border border-[#E2D9CC] rounded-xl px-3 py-2.5 text-sm bg-white text-[#2C2218] focus:outline-none" />
          </div>

          {/* Photo */}
          <div className="bg-white rounded-2xl border border-[#E2D9CC] shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8C7E6E] mb-3">Venue Photo *</p>
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

          {apiError && (
            <p className="text-sm text-[#B83232] bg-red-50 border border-red-200 rounded-xl px-4 py-3">{apiError}</p>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: primary }}>
            {submitting ? 'Submitting…' : 'Submit PLC Attendance ✓'}
          </button>
        </form>
      )}
    </div>
  );
}
