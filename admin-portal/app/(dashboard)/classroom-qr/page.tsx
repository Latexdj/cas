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

export default function ClassroomQrPage() {
  const [items,   setItems]   = useState<ClassQr[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const classRes = await api.get<string[]>('/api/classroom-qr/classes');
        const classes  = classRes.data ?? [];

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
    })();
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Classroom QR Codes</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Print and stick each code on the classroom wall. Teachers scan it before submitting attendance.
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="no-print flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0F172A' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          Print All
        </button>
      </div>

      {/* Info banner */}
      <div className="no-print rounded-xl px-4 py-3 text-sm" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
        <strong>How it works:</strong> Each QR code is unique and permanent for that classroom.
        Teachers open the app, select their lesson, then scan the QR code on the wall — proving they are physically present in the correct room before they can submit.
      </div>

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

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 16px !important; }
          .qr-card { break-inside: avoid; border: 1px solid #cbd5e1 !important; box-shadow: none !important; border-radius: 8px !important; }
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
