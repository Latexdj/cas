'use client';
import { useEffect, useRef, useState } from 'react';
import type jsQRType from 'jsqr';
import type { AxiosInstance } from 'axios';

interface VerifyResponse {
  valid: boolean;
  status?: 'active' | 'revoked' | 'expired';
  school?: string;
  message?: string;
  issue_number?: number;
  exeat_approved?: boolean;
  student?: {
    name: string;
    class_name: string;
    index_number: string | null;
    student_code: string;
    photo_url: string | null;
  };
}

type ResultState = { kind: 'valid' | 'invalid'; data: VerifyResponse } | { kind: 'error'; message: string } | null;

// Shared scanner used by the admin dashboard, teacher portal, and Staff
// Portal — each supplies its own authenticated axios instance so this
// component never needs to know which portal it's running in (same prop
// pattern as components/fees/FeeReportsPanel.tsx's `apiClient`).
// Camera/decode mechanism is the same one already used for the unrelated
// classroom-QR feature in app/teacher/submit/page.tsx: getUserMedia -> a
// hidden <canvas> frame grab every 250ms -> jsqr decode.
export function IdCardScanner({ apiClient }: { apiClient: AxiosInstance }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<ResultState>(null);

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (scanTimer.current) { clearInterval(scanTimer.current); scanTimer.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScanning(false);
  }

  async function startScan() {
    setCameraError(''); setResult(null); setScanning(true);
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
          verify(code.data);
        }
      }, 250);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Allow camera access in your browser settings, or enter the code manually below.');
      } else if (name === 'NotFoundError') {
        setCameraError('No camera found on this device. Enter the code manually below.');
      } else {
        setCameraError('Could not open camera. Make sure no other app is using it, or enter the code manually below.');
      }
      setScanning(false);
    }
  }

  async function verify(token: string) {
    setVerifying(true); setResult(null);
    try {
      const { data } = await apiClient.get<VerifyResponse>(`/api/verify/${encodeURIComponent(token)}`);
      setResult({ kind: data.valid ? 'valid' : 'invalid', data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: VerifyResponse } })?.response?.status;
      const data   = (err as { response?: { data?: VerifyResponse } })?.response?.data;
      if (status === 404) {
        setResult({ kind: 'invalid', data: data ?? { valid: false, message: 'QR code not recognised.' } });
      } else {
        setResult({ kind: 'error', message: 'Could not reach the server. Check your connection and try again.' });
      }
    } finally {
      setVerifying(false);
    }
  }

  function scanAnother() {
    setResult(null);
    setManualToken('');
    startScan();
  }

  const outcomeColor = result?.kind === 'valid'
    ? (result.data.exeat_approved ? '#C8780A' : '#2D7A4F')
    : result?.kind === 'invalid'
      ? (result.data.status === 'expired' ? '#C8780A' : '#B83232')
      : '#B83232';

  return (
    <div className="space-y-4">
      {!result && (
        <>
          <div style={{ display: scanning ? 'block' : 'none' }} className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '1' }}>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white rounded-xl opacity-70" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <button type="button" onClick={stopCamera}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
              Cancel
            </button>
          </div>

          {!scanning && (
            <button type="button" onClick={startScan}
              className="w-full h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 shrink-0">
                <rect x="3" y="3" width="5" height="5" rx="1" /><rect x="16" y="3" width="5" height="5" rx="1" />
                <rect x="3" y="16" width="5" height="5" rx="1" /><rect x="10" y="10" width="4" height="4" rx="0.5" />
                <path d="M16 10h5M16 14h3M21 14v2M10 3v5M10 16v5M3 10h5" />
              </svg>
              <span className="text-sm font-semibold">Tap to scan an ID card</span>
            </button>
          )}
          {cameraError && <p className="text-xs text-red-500">{cameraError}</p>}

          <div className="flex gap-2 items-center pt-1">
            <input
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              placeholder="Or enter the code manually…"
              className="flex-1 rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <button
              type="button"
              disabled={!manualToken.trim() || verifying}
              onClick={() => verify(manualToken.trim())}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 bg-[#145C44] hover:bg-[#0B3D2E]"
            >
              {verifying ? 'Checking…' : 'Check'}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: outcomeColor, background: `${outcomeColor}10` }}>
          {result.kind === 'error' ? (
            <p className="text-sm font-semibold" style={{ color: outcomeColor }}>{result.message}</p>
          ) : result.kind === 'valid' ? (
            <>
              <div className="flex items-center gap-3">
                {result.data.student?.photo_url ? (
                  <img src={result.data.student.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-600" />
                ) : result.data.student && (
                  <div className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-slate-400 dark:text-slate-500">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{result.data.student?.name ?? 'Valid CAS student'}</p>
                  {result.data.student && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{result.data.student.student_code} · {result.data.student.class_name}</p>
                  )}
                </div>
              </div>
              <p className="text-sm font-semibold" style={{ color: outcomeColor }}>
                {result.data.exeat_approved ? 'Exeat approved — permitted off campus' : 'No active exeat — should be on campus'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{result.data.message}</p>
            </>
          ) : (
            <p className="text-sm font-semibold" style={{ color: outcomeColor }}>
              {result.data.message ?? 'QR code not recognised.'}
            </p>
          )}
          <button type="button" onClick={scanAnother}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#145C44] hover:bg-[#0B3D2E]">
            Scan another
          </button>
        </div>
      )}
    </div>
  );
}
