'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type MeetingType = 'PLC' | 'Morning Briefing' | 'Staff Meeting' | 'PTA' | 'Other';
type RepeatMode  = 'none' | 'daily' | 'weekly';
type Tab         = 'meetings' | 'attendance' | 'absences';

interface Location {
  id: string;
  name: string;
  has_coordinates: boolean;
}

interface Meeting {
  id: string;
  title: string;
  meeting_type: MeetingType;
  date: string;
  start_time: string;
  end_time: string;
  location_id: string;
  location_name: string;
  minutes_url: string | null;
  minutes_filename: string | null;
  minutes_uploaded_at: string | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  teacher_name: string;
  meeting_title: string;
  meeting_type: MeetingType;
  location_name: string;
  gps_coordinates: string | null;
  photo_url: string | null;
}

interface AbsenceRecord {
  id: string;
  date: string;
  teacher_name: string;
  meeting_title: string;
  meeting_type: MeetingType;
  status: string;
}

interface Teacher {
  id: string;
  name: string;
  department: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEETING_TYPES: MeetingType[] = ['PLC', 'Morning Briefing', 'Staff Meeting', 'PTA', 'Other'];

const TYPE_BADGE: Record<MeetingType, { bg: string; color: string }> = {
  'PLC':              { bg: '#DCFCE7', color: '#15803D' },
  'Morning Briefing': { bg: '#DBEAFE', color: '#1D4ED8' },
  'Staff Meeting':    { bg: '#F3E8FF', color: '#7E22CE' },
  'PTA':              { bg: '#FEF3C7', color: '#B45309' },
  'Other':            { bg: '#F1F5F9', color: '#475569' },
};

const INPUT_CLS =
  'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-slate-900';

const GREEN = '#15803D';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(t: string) { return t?.slice(0, 5) ?? '—'; }

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dayName(dateStr: string) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
}

/** Estimate number of occurrences when repeating from `start` until `end`. */
function estimateCount(start: string, end: string, mode: RepeatMode): number {
  if (!start || !end || mode === 'none') return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  if (e < s) return 0;
  if (mode === 'weekly') {
    return Math.floor((e.getTime() - s.getTime()) / (7 * 86400000)) + 1;
  }
  // daily = Mon–Fri only
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: MeetingType }) {
  const s = TYPE_BADGE[type] ?? TYPE_BADGE['Other'];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {type}
    </span>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ size = 8 }: { size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full border-4 border-t-transparent animate-spin`}
      style={{ borderColor: GREEN, borderTopColor: 'transparent' }}
    />
  );
}

// ─── FilterChips ─────────────────────────────────────────────────────────────

function TypeChips({ value, onChange }: { value: MeetingType | ''; onChange: (v: MeetingType | '') => void }) {
  const chips: Array<MeetingType | ''> = ['', ...MEETING_TYPES];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(c => {
        const active = value === c;
        const label  = c === '' ? 'All' : c;
        const s      = c ? TYPE_BADGE[c] : null;
        return (
          <button
            key={label}
            onClick={() => onChange(c)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={
              active
                ? { backgroundColor: s?.bg ?? '#0F172A', color: s?.color ?? '#fff', borderColor: s?.color ?? '#0F172A' }
                : { backgroundColor: '#fff', color: '#64748B', borderColor: '#E2E8F0' }
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MeetingFormModal ─────────────────────────────────────────────────────────

interface MeetingFormProps {
  initial: Partial<Meeting> | null;
  locations: Location[];
  onSave: () => void;
  onClose: () => void;
}

function MeetingFormModal({ initial, locations, onSave, onClose }: MeetingFormProps) {
  const isEdit = !!initial?.id;

  const [title,          setTitle]          = useState(initial?.title        ?? '');
  const [meetingType,    setMeetingType]    = useState<MeetingType>(initial?.meeting_type ?? 'PLC');
  const [date,           setDate]           = useState(initial?.date         ?? '');
  const [startTime,      setStartTime]      = useState(fmt(initial?.start_time ?? ''));
  const [endTime,        setEndTime]        = useState(fmt(initial?.end_time   ?? ''));
  const [locationId,     setLocationId]     = useState(initial?.location_id   ?? '');
  const [repeat,         setRepeat]         = useState<RepeatMode>('none');
  const [repeatEnd,      setRepeatEnd]      = useState('');
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  const estimate = estimateCount(date, repeatEnd, repeat);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime || !locationId) {
      setError('All fields are required.'); return;
    }
    if (!isEdit && repeat !== 'none' && !repeatEnd) {
      setError('Please set a repeat end date.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(), meeting_type: meetingType, date,
        start_time: startTime, end_time: endTime, location_id: locationId,
      };
      if (!isEdit && repeat !== 'none') {
        payload.repeat          = repeat;
        payload.repeat_end_date = repeatEnd;
      }
      if (isEdit && initial?.id) {
        await api.put(`/api/meetings/${initial.id}`, payload);
      } else {
        await api.post('/api/meetings', payload);
      }
      onSave();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save meeting.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Edit Meeting' : 'New Meeting'}
          </h3>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title</label>
            <input
              className={INPUT_CLS}
              placeholder="e.g. Weekly Staff Meeting"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Type + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Meeting Type</label>
              <select
                className={INPUT_CLS}
                value={meetingType}
                onChange={e => setMeetingType(e.target.value as MeetingType)}
              >
                {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date</label>
              <input type="date" className={INPUT_CLS} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Start + End time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Time</label>
              <input type="time" className={INPUT_CLS} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Time</label>
              <input type="time" className={INPUT_CLS} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Location / Venue</label>
            <select className={INPUT_CLS} value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Repeat — create only */}
          {!isEdit && (
            <div className="space-y-3 pt-1">
              <div className="border-t border-slate-100" />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Repeat</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Repeat</label>
                  <select className={INPUT_CLS} value={repeat} onChange={e => setRepeat(e.target.value as RepeatMode)}>
                    <option value="none">None</option>
                    <option value="daily">Daily (Mon–Fri)</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                {repeat !== 'none' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Repeat Until</label>
                    <input type="date" className={INPUT_CLS} value={repeatEnd} onChange={e => setRepeatEnd(e.target.value)} />
                  </div>
                )}
              </div>

              {repeat !== 'none' && repeatEnd && date && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  This will create <strong className="text-slate-700">{estimate}</strong> meeting{estimate !== 1 ? 's' : ''}.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: GREEN }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── QR print-sheet builder ───────────────────────────────────────────────────

async function buildPrintSheet(
  meeting: Meeting,
  qrDataUrl: string,
  locName: string,
): Promise<string> {
  const W      = 560;
  const MAX_H  = 1200;
  const QR_SZ  = 260;

  const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const cv  = document.createElement('canvas');
  cv.width  = W;
  cv.height = MAX_H;
  const ctx = cv.getContext('2d')!;

  // white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, MAX_H);

  // ── Green header ──
  ctx.fillStyle = '#15803D';
  ctx.fillRect(0, 0, W, 76);

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign    = 'left';
  ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
  ctx.fillText('CAS SCHOOL', 20, 32);
  ctx.font = '13px Arial, Helvetica, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText('Meeting Attendance Registration', 20, 56);

  // type badge (top-right of header)
  ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
  const typeLabel = meeting.meeting_type.toUpperCase();
  const bW = ctx.measureText(typeLabel).width + 20;
  const bX = W - bW - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(bX, 22, bW, 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(typeLabel, bX + 10, 38);

  let y = 76 + 22;

  // ── Meeting title ──
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(meeting.title, 20, y, W - 40);
  y += 36;

  // ── Details ──
  const meetDate = (() => {
    if (!meeting.date) return '—';
    const [y, m, d] = meeting.date.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '—';
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  })();

  ctx.font = '13px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.fillText(`Date:    ${meetDate}`, 20, y);                                                   y += 22;
  ctx.fillText(`Time:    ${meeting.start_time?.slice(0, 5) ?? '—'} – ${meeting.end_time?.slice(0, 5) ?? '—'}`, 20, y); y += 22;
  ctx.fillText(`Venue:  ${locName || meeting.location_name || '—'}`, 20, y);                     y += 28;

  // ── Divider ──
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
  y += 22;

  // ── QR label + code ──
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN QR CODE TO REGISTER ATTENDANCE', W / 2, y);
  y += 22;

  ctx.drawImage(qrImg, (W - QR_SZ) / 2, y, QR_SZ, QR_SZ);
  y += QR_SZ + 22;

  // ── Divider ──
  ctx.textAlign    = 'left';
  ctx.strokeStyle  = '#CBD5E1'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
  y += 22;

  // ── Steps header ──
  ctx.fillStyle = '#15803D';
  ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HOW TO REGISTER YOUR ATTENDANCE', 20, y);
  y += 28;

  const STEPS = [
    'Open the CAS Teacher App on your phone.',
    'Tap "Meetings" in the bottom navigation bar.',
    'Find and select this meeting from the list.',
    'Tap "Scan QR Code" and point your camera at the code above.',
    'Complete the attendance form and tap "Submit".',
  ];

  STEPS.forEach((step, i) => {
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.arc(31, y - 5, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle    = '#FFFFFF';
    ctx.font         = 'bold 11px Arial, Helvetica, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 31, y - 5);

    ctx.fillStyle    = '#1E293B';
    ctx.font         = '13px Arial, Helvetica, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(step, 50, y);
    y += 32;
  });

  y += 14;

  // ── Footer ──
  ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
  y += 20;

  ctx.fillStyle    = '#94A3B8';
  ctx.font         = '11px Arial, Helvetica, sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Generated by CAS School Management System  •  For teacher use only', W / 2, y);
  y += 28;

  // crop to actual content
  const out = document.createElement('canvas');
  out.width  = W;
  out.height = y;
  out.getContext('2d')!.drawImage(cv, 0, 0);

  return out.toDataURL('image/png');
}

// ─── MinutesModal ────────────────────────────────────────────────────────────

function MinutesModal({ meeting, onClose, onSaved }: { meeting: Meeting; onClose: () => void; onSaved: () => void }) {
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [removing,   setRemoving]   = useState(false);
  const [error,      setError]      = useState('');

  async function handleUpload() {
    if (!file) { setError('Please select a file.'); return; }
    setUploading(true); setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post(`/api/meetings/${meeting.id}/minutes`, {
        fileBase64: dataUrl,
        filename:   file.name,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Upload failed.');
    } finally { setUploading(false); }
  }

  async function handleRemove() {
    if (!confirm('Remove the uploaded minutes for this meeting?')) return;
    setRemoving(true);
    try {
      await api.delete(`/api/meetings/${meeting.id}/minutes`);
      onSaved();
      onClose();
    } catch {
      setError('Failed to remove minutes.');
    } finally { setRemoving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Meeting Minutes</h3>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{meeting.title} — {fmtDate(meeting.date)}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {meeting.minutes_url && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-green-700 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800 truncate">{meeting.minutes_filename}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  Uploaded {meeting.minutes_uploaded_at ? fmtDate(meeting.minutes_uploaded_at) : ''}
                </p>
              </div>
              <a href={meeting.minutes_url} target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold text-green-700 hover:text-green-900 shrink-0">
                Download
              </a>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {meeting.minutes_url ? 'Replace Minutes' : 'Upload Minutes'}
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
            />
            <p className="text-xs text-slate-400 mt-1">PDF or Word document (.pdf, .doc, .docx)</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            {meeting.minutes_url && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            )}
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: GREEN }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QrModal ─────────────────────────────────────────────────────────────────

function QrModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [locName,  setLocName]  = useState(meeting.location_name ?? '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ token: string; location_name: string; title: string }>(
          `/api/meetings/${meeting.id}/token`
        );
        const venue = data.location_name || meeting.location_name || '';
        if (venue) setLocName(venue);

        const QRCode = (await import('qrcode')).default;
        const qrUrl  = await QRCode.toDataURL(data.token, { errorCorrectionLevel: 'M', width: 280, margin: 2 });
        const sheet  = await buildPrintSheet(meeting, qrUrl, venue);

        if (!cancelled) setPrintUrl(sheet);
      } catch {
        if (!cancelled) setPrintUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [meeting.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Meeting QR Code</h3>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{meeting.title} — {locName}</p>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          {loading ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-3">
              <Spinner size={8} />
              <p className="text-xs text-slate-400">Generating print sheet…</p>
            </div>
          ) : printUrl ? (
            <div className="w-full max-h-[440px] overflow-y-auto rounded-xl border border-slate-100">
              <img src={printUrl} alt="Meeting QR print sheet" className="w-full" />
            </div>
          ) : (
            <div className="w-full h-48 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-400">
              Failed to generate print sheet
            </div>
          )}

          {printUrl && (
            <a
              href={printUrl}
              download={`meeting-qr-${meeting.title.replace(/\s+/g, '-').toLowerCase()}.png`}
              className="w-full text-center py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: GREEN }}
            >
              Download PNG
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────

function PhotoModal({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  const mapsUrl = record.gps_coordinates
    ? `https://www.google.com/maps?q=${record.gps_coordinates}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {record.photo_url
          ? <img src={record.photo_url} alt="Meeting attendance photo" className="w-full max-h-80 object-cover" />
          : <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400">No photo</div>}

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Attendance Photo</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Teacher</p>
              <p className="text-slate-800 font-medium">{record.teacher_name}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Date</p>
              <p className="text-slate-800 font-medium">{fmtDate(record.date)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Venue</p>
              <p className="text-slate-800 font-medium">{record.location_name}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">GPS</p>
              {mapsUrl
                ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium break-all text-xs">{record.gps_coordinates}</a>
                : <span className="text-slate-400">—</span>}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            {record.photo_url && (
              <a href={record.photo_url} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                Open full size
              </a>
            )}
            <button onClick={onClose} className="flex-1 text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QR icon ─────────────────────────────────────────────────────────────────

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5">
      <rect x="3" y="3" width="5" height="5" rx="1" strokeWidth={1.8} />
      <rect x="16" y="3" width="5" height="5" rx="1" strokeWidth={1.8} />
      <rect x="3" y="16" width="5" height="5" rx="1" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 10h5M16 14h3M21 14v5M10 3v5M10 16v5M3 10h5M10 10h.01" />
    </svg>
  );
}

// ─── ManualAttendanceModal ─────────────────────────────────────────────────────

function ManualAttendanceModal({
  meetings,
  onSaved,
  onClose,
}: {
  meetings: Meeting[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [meetingId,  setMeetingId]  = useState('');
  const [teacherId,  setTeacherId]  = useState('');
  const [date,       setDate]       = useState('');
  const [notes,      setNotes]      = useState('');
  const [teachers,   setTeachers]   = useState<Teacher[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
  }, []);

  // Pre-fill date when a meeting is selected
  useEffect(() => {
    if (meetingId) {
      const m = meetings.find(x => x.id === meetingId);
      if (m?.date) setDate(m.date.slice(0, 10));
    }
  }, [meetingId, meetings]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingId || !teacherId || !date) { setError('Meeting, teacher, and date are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/meetings/attendance/manual', { meetingId, teacherId, date, notes: notes.trim() || undefined });
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to record attendance.');
    } finally { setSaving(false); }
  }

  const INPUT = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Record Attendance Manually</h3>
          <p className="text-xs text-slate-500 mt-0.5">Use when a teacher attended but could not log in</p>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Meeting *</label>
            <select className={INPUT} value={meetingId} onChange={e => setMeetingId(e.target.value)}>
              <option value="">Select a meeting…</option>
              {meetings.map(m => (
                <option key={m.id} value={m.id}>
                  {fmtDate(m.date)} — {m.title} ({m.meeting_type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Teacher *</label>
            <select className={INPUT} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
              <option value="">Select a teacher…</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.department ? ` — ${t.department}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Date *</label>
            <input type="date" className={INPUT} value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
              Reason / Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              className={INPUT}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Phone battery died, network issue…"
            />
          </div>

          <div className="rounded-xl px-3 py-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200">
            This will create an attendance record without GPS or photo proof and clear any absence recorded for this teacher on this date.
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: GREEN }}>
              {saving ? 'Saving…' : 'Record Attendance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const [tab,        setTab]        = useState<Tab>('meetings');
  const [meetings,   setMeetings]   = useState<Meeting[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [absences,   setAbsences]   = useState<AbsenceRecord[]>([]);
  const [locations,  setLocations]  = useState<Location[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Meetings tab filters
  const [typeFilter, setTypeFilter] = useState<MeetingType | ''>('');
  const [mFrom,      setMFrom]      = useState('');
  const [mTo,        setMTo]        = useState('');

  // Attendance / Absences filters
  const [aFrom,      setAFrom]      = useState('');
  const [aTo,        setATo]        = useState('');
  const [aType,      setAType]      = useState<MeetingType | ''>('');

  // Modals
  const [editMeeting,    setEditMeeting]    = useState<Partial<Meeting> | null | false>(false);
  const [qrMeeting,      setQrMeeting]      = useState<Meeting | null>(null);
  const [photoRecord,    setPhotoRecord]    = useState<AttendanceRecord | null>(null);
  const [minutesMeeting, setMinutesMeeting] = useState<Meeting | null>(null);
  const [manualModal,    setManualModal]    = useState(false);

  // ── Loaders ────────────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    const params: Record<string, string> = {};
    if (typeFilter) params.type = typeFilter;
    if (mFrom)      params.from = mFrom;
    if (mTo)        params.to   = mTo;
    const [m, l] = await Promise.allSettled([
      api.get<Meeting[]>('/api/meetings', { params }),
      locations.length ? Promise.resolve({ data: locations }) : api.get<Location[]>('/api/locations'),
    ]);
    if (m.status === 'fulfilled') setMeetings(m.value.data);
    if (l.status === 'fulfilled') setLocations(l.value.data);
  }, [typeFilter, mFrom, mTo, locations]);

  const loadAttendance = useCallback(async () => {
    const params: Record<string, string> = {};
    if (aFrom)  params.from = aFrom;
    if (aTo)    params.to   = aTo;
    if (aType)  params.type = aType;
    const { data } = await api.get<AttendanceRecord[]>('/api/meetings/attendance', { params });
    setAttendance(data);
  }, [aFrom, aTo, aType]);

  const loadAbsences = useCallback(async () => {
    const params: Record<string, string> = {};
    if (aFrom) params.from = aFrom;
    if (aTo)   params.to   = aTo;
    const { data } = await api.get<AbsenceRecord[]>('/api/meetings/absences', { params });
    setAbsences(data);
  }, [aFrom, aTo]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadMeetings(), loadAttendance(), loadAbsences()]);
    setLoading(false);
  }, [loadMeetings, loadAttendance, loadAbsences]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch meetings when their filters change
  useEffect(() => {
    if (!loading) {
      setLoading(true);
      loadMeetings().finally(() => setLoading(false));
    }
  }, [typeFilter, mFrom, mTo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function searchAttendanceAbsences(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await Promise.allSettled([loadAttendance(), loadAbsences()]);
    setLoading(false);
  }

  // ── Actions ────────────────────────────────────────────────────

  async function deleteMeeting(id: string) {
    if (!confirm('Delete this meeting? All attendance records for this meeting will also be deleted.')) return;
    try {
      await api.delete(`/api/meetings/${id}`);
      await loadMeetings();
    } catch { alert('Failed to delete meeting.'); }
  }

  async function deleteAttendanceRecord(id: string) {
    if (!confirm('Remove this attendance record?')) return;
    try {
      await api.delete(`/api/meetings/attendance/${id}`);
      await loadAttendance();
    } catch { alert('Failed to delete attendance record.'); }
  }

  // ── Tab bar ────────────────────────────────────────────────────

  const tabClass = (t: Tab) =>
    `px-5 py-2.5 text-sm font-semibold rounded-xl transition-all ${tab === t ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`;
  const tabStyle = (t: Tab): React.CSSProperties =>
    tab === t ? { backgroundColor: GREEN } : {};

  const TABS: [Tab, string][] = [
    ['meetings',   'Meetings'],
    ['attendance', 'Attendance'],
    ['absences',   'Absences'],
  ];

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Meetings Attendance</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage meetings and track staff attendance</p>
        </div>
        {tab === 'meetings' && (
          <button
            onClick={() => setEditMeeting({})}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: GREEN }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Meeting
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 bg-slate-50 rounded-2xl p-1.5 w-fit">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={tabClass(t)} style={tabStyle(t)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Meetings filters ── */}
      {tab === 'meetings' && (
        <div className="space-y-3">
          <TypeChips value={typeFilter} onChange={setTypeFilter} />
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
              <input
                type="date"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                value={mFrom} onChange={e => setMFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                value={mTo} onChange={e => setMTo(e.target.value)}
              />
            </div>
            {(mFrom || mTo) && (
              <button
                onClick={() => { setMFrom(''); setMTo(''); }}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Clear dates
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Attendance / Absences filters ── */}
      {tab !== 'meetings' && (
        <form onSubmit={searchAttendanceAbsences} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500" value={aFrom} onChange={e => setAFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500" value={aTo} onChange={e => setATo(e.target.value)} />
          </div>
          {tab === 'attendance' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={aType}
                onChange={e => setAType(e.target.value as MeetingType | '')}
              >
                <option value="">All types</option>
                {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <button type="submit" className="px-5 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: GREEN }}>
            Search
          </button>
          <button
            type="button"
            onClick={() => { setAFrom(''); setATo(''); setAType(''); }}
            className="px-5 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
        </form>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={8} />
        </div>
      ) : (
        <>
          {/* ════ Meetings tab ════ */}
          {tab === 'meetings' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              {meetings.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">
                  No meetings found.{!typeFilter && !mFrom && !mTo && <> Click <strong>New Meeting</strong> to create one.</>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[850px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Date', 'Day', 'Type', 'Title', 'Time', 'Venue', 'Minutes', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {meetings.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{fmtDate(m.date)}</td>
                          <td className="px-4 py-3 text-slate-500">{dayName(m.date)}</td>
                          <td className="px-4 py-3"><TypeBadge type={m.meeting_type} /></td>
                          <td className="px-4 py-3 text-slate-700 font-medium max-w-[200px] truncate">{m.title}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(m.start_time)} – {fmt(m.end_time)}</td>
                          <td className="px-4 py-3 text-slate-600">{m.location_name}</td>
                          <td className="px-4 py-3">
                            {m.minutes_url ? (
                              <button
                                onClick={() => setMinutesMeeting(m)}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
                                style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                                </svg>
                                Uploaded
                              </button>
                            ) : (
                              <button
                                onClick={() => setMinutesMeeting(m)}
                                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                              >
                                Upload
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setEditMeeting(m)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setQrMeeting(m)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                              >
                                <QrIcon />
                                QR
                              </button>
                              <button
                                onClick={() => deleteMeeting(m.id)}
                                className="text-xs font-semibold text-red-500 hover:text-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════ Attendance tab ════ */}
          {tab === 'attendance' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-600">
                  {attendance.length} record{attendance.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => setManualModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                  style={{ backgroundColor: GREEN }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Record Manually
                </button>
              </div>
              {attendance.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No attendance records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[950px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Date', 'Teacher', 'Meeting', 'Type', 'Location', 'GPS', 'Photo', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map(r => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{r.teacher_name}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate">{r.meeting_title}</td>
                          <td className="px-4 py-3"><TypeBadge type={r.meeting_type} /></td>
                          <td className="px-4 py-3 text-slate-600">{r.location_name}</td>
                          <td className="px-4 py-3">
                            {r.gps_coordinates
                              ? <a href={`https://www.google.com/maps?q=${r.gps_coordinates}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs font-medium">Map</a>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {r.photo_url
                              ? <button onClick={() => setPhotoRecord(r)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View</button>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => deleteAttendanceRecord(r.id)} className="text-xs font-semibold text-red-500 hover:text-red-700">
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════ Absences tab ════ */}
          {tab === 'absences' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-50">
                <p className="text-sm font-semibold text-slate-600">
                  {absences.length} absence{absences.length !== 1 ? 's' : ''}
                </p>
              </div>
              {absences.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No absences found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[700px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Date', 'Teacher', 'Meeting', 'Type', 'Status'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {absences.map(a => (
                        <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{fmtDate(a.date)}</td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{a.teacher_name}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{a.meeting_title}</td>
                          <td className="px-4 py-3"><TypeBadge type={a.meeting_type} /></td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}

      {editMeeting !== false && (
        <MeetingFormModal
          initial={editMeeting}
          locations={locations}
          onSave={async () => { setEditMeeting(false); setLoading(true); await loadMeetings(); setLoading(false); }}
          onClose={() => setEditMeeting(false)}
        />
      )}

      {qrMeeting && (
        <QrModal meeting={qrMeeting} onClose={() => setQrMeeting(null)} />
      )}

      {photoRecord && (
        <PhotoModal record={photoRecord} onClose={() => setPhotoRecord(null)} />
      )}

      {minutesMeeting && (
        <MinutesModal
          meeting={minutesMeeting}
          onClose={() => setMinutesMeeting(null)}
          onSaved={async () => { setLoading(true); await loadMeetings(); setLoading(false); }}
        />
      )}

      {manualModal && (
        <ManualAttendanceModal
          meetings={meetings}
          onClose={() => setManualModal(false)}
          onSaved={async () => { setManualModal(false); setLoading(true); await loadAttendance(); setLoading(false); }}
        />
      )}
    </div>
  );
}
