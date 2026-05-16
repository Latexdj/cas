'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface ClassQr {
  className: string;
  dataUrl: string | null;
}

async function tokenToDataUrl(token: string): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', width: 240, margin: 2 });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function ClassroomQrPage() {
  const [items,          setItems]          = useState<ClassQr[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [rotatedAt,      setRotatedAt]      = useState<string | null>(null);
  const [showModal,      setShowModal]      = useState(false);
  const [rotating,       setRotating]       = useState(false);
  const [rotateError,    setRotateError]    = useState('');
  const [justRotated,    setJustRotated]    = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  async function loadQrCodes() {
    setLoading(true);
    setJustRotated(false);
    try {
      const [classRes, infoRes] = await Promise.all([
        api.get<string[]>('/api/classroom-qr/classes'),
        api.get<{ qr_rotated_at: string | null }>('/api/classroom-qr/info'),
      ]);
      setRotatedAt(infoRes.data.qr_rotated_at);
      const classes = classRes.data ?? [];
      const results = await Promise.all(
        classes.map(async (className): Promise<ClassQr> => {
          try {
            const tkRes = await api.get<{ token: string }>(`/api/classroom-qr/token?class_name=${encodeURIComponent(className)}`);
            const dataUrl = await tokenToDataUrl(tkRes.data.token);
            return { className, dataUrl };
          } catch {
            return { className, dataUrl: null };
          }
        })
      );
      setItems(results);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQrCodes(); }, []);

  async function handleRotate() {
    setRotating(true);
    setRotateError('');
    try {
      await api.post('/api/classroom-qr/rotate', {});
      setShowModal(false);
      setJustRotated(true);
      await loadQrCodes();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRotateError(msg ?? 'Failed to rotate QR codes.');
    } finally {
      setRotating(false);
    }
  }

  const days    = daysSince(rotatedAt);
  const ageText = rotatedAt === null
    ? 'Never rotated'
    : days === 0
      ? 'Rotated today'
      : days === 1
        ? 'Rotated yesterday'
        : `Rotated ${days} days ago`;
  const ageWarn = days !== null && days >= 7;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Classroom QR Codes</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Print and stick each code on the classroom wall. Teachers scan it before submitting attendance.
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button onClick={() => { setShowModal(true); setRotateError(''); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
            style={{ borderColor: '#FCA5A5', color: '#DC2626', background: '#FFF8F8' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            Rotate Codes
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#0F172A' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print All
          </button>
        </div>
      </div>

      {/* Rotation age badge */}
      <div className={`no-print rounded-xl px-4 py-3 text-sm flex items-center justify-between flex-wrap gap-2 ${ageWarn ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
        <span>
          <strong>Last rotation:</strong>{' '}
          {rotatedAt ? new Date(rotatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          {' · '}{ageText}
        </span>
        {ageWarn && (
          <span className="text-xs font-semibold text-amber-700">
            ⚠ Codes are over a week old — consider rotating
          </span>
        )}
      </div>

      {/* Success banner after rotation */}
      {justRotated && (
        <div className="no-print rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
          ✓ New QR codes generated. Print this page and replace all classroom sheets before the next lesson.
        </div>
      )}

      {/* How it works */}
      <div className="no-print rounded-xl px-4 py-3 text-sm" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
        <strong>How it works:</strong> Each QR code is unique to this school and classroom.
        Teachers open the app, select their lesson, then scan the QR code on the wall — proving they are physically present in the correct room before they can submit.
        Rotate codes weekly or immediately if you suspect a code has been photographed.
      </div>

      {/* QR grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 h-60 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>
          No active classes found. Add students with class names first.
        </div>
      ) : (
        <div ref={printRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print-grid">
          {items.map(({ className, dataUrl }) => (
            <div key={className}
              className="qr-card bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col items-center gap-3 text-center">
              {dataUrl
                ? <img src={dataUrl} alt={`QR for ${className}`} width={160} height={160} className="rounded" />
                : <div className="w-40 h-40 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400">Error</div>
              }
              <div>
                <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{className}</p>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Scan before submitting attendance</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rotate confirmation modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} className="w-5 h-5">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Rotate QR Codes?</h2>
                <p className="text-sm text-slate-500">This cannot be undone.</p>
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1">
              <p className="font-semibold">All currently printed codes will stop working immediately.</p>
              <ul className="list-disc list-inside text-red-700 space-y-0.5 mt-1">
                <li>New codes will be generated for every classroom</li>
                <li>You must print and replace every sheet on classroom walls</li>
                <li>Teachers will not be able to scan until the new codes are in place</li>
              </ul>
            </div>

            <p className="text-sm text-slate-600">
              Do this when you suspect codes have been photographed for fraudulent use, or as a routine weekly security measure.
            </p>

            {rotateError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {rotateError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowModal(false)} disabled={rotating}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button onClick={handleRotate} disabled={rotating}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: '#DC2626' }}>
                {rotating ? 'Rotating…' : 'Yes, Rotate All Codes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
          nav, aside, header { display: none !important; }
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12mm !important;
          }
          .qr-card {
            break-inside: avoid;
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
            border-radius: 8px !important;
            padding: 8mm !important;
            height: calc((297mm - 24mm - 12mm) / 2) !important;
            justify-content: center !important;
          }
          .qr-card img { width: 55mm !important; height: 55mm !important; }
          .qr-card p:first-child { font-size: 18pt !important; }
          .qr-card p:last-child { font-size: 9pt !important; }
        }
      `}</style>
    </div>
  );
}
