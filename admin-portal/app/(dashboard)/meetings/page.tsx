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

function dayName(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
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

// ─── QrModal ─────────────────────────────────────────────────────────────────

function QrModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [dataUrl,  setDataUrl]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [locName,  setLocName]  = useState(meeting.location_name ?? '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ token: string; location_name: string; title: string }>(
          `/api/meetings/${meeting.id}/token`
        );
        if (data.location_name) setLocName(data.location_name);
        const QRCode = (await import('qrcode')).default;
        const url    = await QRCode.toDataURL(data.token, { errorCorrectionLevel: 'M', width: 280, margin: 2 });
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setDataUrl(null);
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
            <div className="w-[280px] h-[280px] flex items-center justify-center">
              <Spinner size={8} />
            </div>
          ) : dataUrl ? (
            <img src={dataUrl} alt="Meeting QR code" className="w-[280px] h-[280px] rounded-xl border border-slate-100" />
          ) : (
            <div className="w-[280px] h-[280px] flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-400">
              Failed to generate QR
            </div>
          )}

          <p className="text-xs text-slate-400 text-center">
            Print this QR and post it at the venue. Teachers scan it to register their attendance.
          </p>

          {dataUrl && (
            <a
              href={dataUrl}
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
              <p className="text-slate-800 font-medium">{record.date}</p>
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
  const [editMeeting,  setEditMeeting]  = useState<Partial<Meeting> | null | false>(false);
  const [qrMeeting,    setQrMeeting]    = useState<Meeting | null>(null);
  const [photoRecord,  setPhotoRecord]  = useState<AttendanceRecord | null>(null);

  // ── Loaders ────────────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    const params: Record<string, string> = {};
    if (typeFilter) params.type = typeFilter;
    if (mFrom)      params.from = mFrom;
    if (mTo)        params.to   = mTo;
    const [m, l] = await Promise.all([
      api.get<Meeting[]>('/api/meetings', { params }),
      locations.length ? Promise.resolve({ data: locations }) : api.get<Location[]>('/api/locations'),
    ]);
    setMeetings(m.data);
    setLocations(l.data);
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
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={mFrom} onChange={e => setMFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={aFrom} onChange={e => setAFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={aTo} onChange={e => setATo(e.target.value)} />
          </div>
          {tab === 'attendance' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
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
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Date', 'Day', 'Type', 'Title', 'Time', 'Venue', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {meetings.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{m.date}</td>
                          <td className="px-4 py-3 text-slate-500">{dayName(m.date)}</td>
                          <td className="px-4 py-3"><TypeBadge type={m.meeting_type} /></td>
                          <td className="px-4 py-3 text-slate-700 font-medium max-w-[200px] truncate">{m.title}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmt(m.start_time)} – {fmt(m.end_time)}</td>
                          <td className="px-4 py-3 text-slate-600">{m.location_name}</td>
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
              </div>
              {attendance.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No attendance records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{r.date}</td>
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
                  <table className="w-full text-sm">
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
                          <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{a.date}</td>
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
    </div>
  );
}
