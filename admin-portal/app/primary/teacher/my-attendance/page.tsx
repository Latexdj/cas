'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface TodayRecord {
  id: string; status: string; is_auto_generated: boolean;
  clock_in_time: string | null; clock_in_location_verified: boolean;
  clock_out_time: string | null; clock_out_location_verified: boolean;
  manual_entry_by: string | null; manual_entry_note: string | null;
}
interface TermRecord {
  id: string; date: string; status: string; is_auto_generated: boolean;
  clock_in_time: string | null; clock_out_time: string | null;
  clock_in_location_verified: boolean;
}
interface Term { id: string; name: string; is_current: boolean; }

type ClockStep = 'idle' | 'camera' | 'gps' | 'submitting';

function compressPhoto(file: File, targetKb = 19): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const tryCompress = (width: number, quality: number): string => {
          const ratio = width / img.width;
          canvas.width  = Math.min(width, img.width);
          canvas.height = Math.round(img.height * (canvas.width / img.width));
          canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };
        let result = tryCompress(480, 0.25);
        if (result.length * 0.75 / 1024 > targetKb) result = tryCompress(360, 0.20);
        if (result.length * 0.75 / 1024 > targetKb) result = tryCompress(320, 0.15);
        resolve(result);
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MyAttendancePage() {
  const [today,     setToday]     = useState<TodayRecord | null | undefined>(undefined);
  const [step,      setStep]      = useState<ClockStep>('idle');
  const [action,    setAction]    = useState<'in' | 'out'>('in');
  const [photo,     setPhoto]     = useState<string | null>(null);
  const [gps,       setGps]       = useState<string | null>(null);
  const [gpsMsg,    setGpsMsg]    = useState('');
  const [error,     setError]     = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // History
  const [terms,    setTerms]    = useState<Term[]>([]);
  const [termId,   setTermId]   = useState('');
  const [history,  setHistory]  = useState<TermRecord[]>([]);
  const [histLoad, setHistLoad] = useState(false);

  const loadToday = useCallback(async () => {
    const { data } = await api.get<TodayRecord | null>('/api/primary/me/attendance/today');
    setToday(data);
  }, []);

  useEffect(() => {
    loadToday();
    api.get<Term[]>('/api/primary/terms').then(r => {
      setTerms(r.data);
      const cur = r.data.find(t => t.is_current);
      if (cur) setTermId(cur.id);
    }).catch(() => {});
  }, [loadToday]);

  useEffect(() => {
    if (!termId) return;
    setHistLoad(true);
    api.get<TermRecord[]>(`/api/primary/me/attendance?term_id=${termId}`)
      .then(r => setHistory(r.data))
      .catch(() => {})
      .finally(() => setHistLoad(false));
  }, [termId]);

  async function startClock(type: 'in' | 'out') {
    setAction(type); setPhoto(null); setGps(null); setGpsMsg(''); setError('');
    setStep('camera');
    fileRef.current?.click();
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setStep('idle'); return; }
    try {
      const compressed = await compressPhoto(file);
      setPhoto(compressed);
      setStep('gps');
      navigator.geolocation.getCurrentPosition(
        pos => {
          const coords = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
          setGps(coords);
          setGpsMsg(`Location acquired (±${Math.round(pos.coords.accuracy)}m accuracy)`);
        },
        () => { setGpsMsg(''); setError('Could not get GPS. Please enable location and try again.'); setStep('idle'); },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } catch { setError('Failed to process photo. Please try again.'); setStep('idle'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submitClock() {
    if (!photo || !gps) return;
    setStep('submitting'); setError('');
    try {
      const endpoint = action === 'in' ? '/api/primary/me/attendance/clock-in' : '/api/primary/me/attendance/clock-out';
      await api.post(endpoint, { photo, gps });
      await loadToday();
      if (termId) {
        const r = await api.get<TermRecord[]>(`/api/primary/me/attendance?term_id=${termId}`);
        setHistory(r.data);
      }
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to submit');
    } finally { setStep('idle'); setPhoto(null); setGps(null); setGpsMsg(''); }
  }

  const stats = {
    present: history.filter(r => r.status === 'present' && !r.is_auto_generated).length,
    absent:  history.filter(r => r.status === 'absent'  &&  r.is_auto_generated).length,
    excused: history.filter(r => r.status === 'excused').length,
    total:   history.length,
  };
  const pct = stats.total > 0 ? Math.round(stats.present / stats.total * 100) : null;

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Attendance</h1>
        <p className="text-sm text-slate-500 mt-0.5">{dateStr}</p>
      </div>

      {/* Hidden file input for camera */}
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={onPhotoSelected} />

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* Today's status card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-700">Today</h2>

        {today === undefined && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        )}

        {today !== undefined && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-4 ${today?.clock_in_time ? 'bg-green-50' : 'bg-gray-50'}`}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Clock In</p>
                <p className={`text-2xl font-black tabular-nums ${today?.clock_in_time ? 'text-green-700' : 'text-slate-300'}`}>
                  {fmtTime(today?.clock_in_time ?? null)}
                </p>
                {today?.clock_in_location_verified && (
                  <p className="text-xs text-green-600 font-semibold mt-0.5">✓ GPS verified</p>
                )}
                {today?.manual_entry_by && (
                  <p className="text-xs text-slate-400 mt-0.5">Manual entry</p>
                )}
              </div>
              <div className={`rounded-xl p-4 ${today?.clock_out_time ? 'bg-purple-50' : 'bg-gray-50'}`}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Clock Out</p>
                <p className={`text-2xl font-black tabular-nums ${today?.clock_out_time ? 'text-purple-700' : 'text-slate-300'}`}>
                  {fmtTime(today?.clock_out_time ?? null)}
                </p>
                {today?.clock_out_location_verified && (
                  <p className="text-xs text-purple-600 font-semibold mt-0.5">✓ GPS verified</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            {step === 'idle' && (
              <div className="flex gap-3">
                {!today?.clock_in_time && (
                  <button onClick={() => startClock('in')}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: '#15803D' }}>
                    Clock In
                  </button>
                )}
                {today?.clock_in_time && !today?.clock_out_time && (
                  <button onClick={() => startClock('out')}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm bg-purple-600 hover:bg-purple-700">
                    Clock Out
                  </button>
                )}
                {today?.clock_in_time && today?.clock_out_time && (
                  <p className="text-sm text-green-700 font-semibold flex-1 text-center py-2.5">
                    ✓ All done for today
                  </p>
                )}
              </div>
            )}

            {step === 'gps' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800">
                  {gps ? '✓ Location ready' : 'Acquiring GPS location…'}
                </p>
                {gpsMsg && <p className="text-xs text-blue-600">{gpsMsg}</p>}
                {photo && <img src={photo} alt="Preview" className="w-full rounded-lg max-h-36 object-cover" />}
                {gps && (
                  <button onClick={submitClock}
                    className="w-full py-2.5 rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: '#15803D' }}>
                    Submit Clock {action === 'in' ? 'In' : 'Out'}
                  </button>
                )}
              </div>
            )}

            {step === 'submitting' && (
              <div className="flex items-center justify-center py-4 gap-3">
                <div className="w-5 h-5 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                <p className="text-sm text-slate-600">Submitting…</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Term stats */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Term Summary</h2>
          <select value={termId} onChange={e => setTermId(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs">
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-green-50 py-3">
            <p className="text-2xl font-black text-green-700">{stats.present}</p>
            <p className="text-xs text-slate-500 mt-0.5">Present</p>
          </div>
          <div className="rounded-xl bg-red-50 py-3">
            <p className="text-2xl font-black text-red-600">{stats.absent}</p>
            <p className="text-xs text-slate-500 mt-0.5">Absent</p>
          </div>
          <div className="rounded-xl bg-blue-50 py-3">
            <p className="text-2xl font-black text-blue-600">{stats.excused}</p>
            <p className="text-xs text-slate-500 mt-0.5">Excused</p>
          </div>
        </div>
        {pct !== null && (
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
              <span>Attendance</span><span>{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? '#15803D' : pct >= 75 ? '#D97706' : '#DC2626' }} />
            </div>
          </div>
        )}
      </div>

      {/* History list */}
      {histLoad ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-slate-700">Attendance History</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {history.map(r => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-2.5">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{fmtDate(r.date)}</p>
                  <p className="text-xs text-slate-400">{fmtTime(r.clock_in_time)} → {fmtTime(r.clock_out_time)}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  r.status === 'present' ? 'bg-green-100 text-green-700' :
                  r.status === 'excused' ? 'bg-blue-100 text-blue-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {r.is_auto_generated && r.status === 'absent' ? 'Auto-Absent' : r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
