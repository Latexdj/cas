'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Location, Teacher } from '@/types/api';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface PlcSession {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_id: string;
  location_name: string;
  has_coordinates: boolean;
  is_active: boolean;
}

interface PlcAttendanceRecord {
  id: string;
  date: string;
  submitted_at: string;
  agenda: string | null;
  photo_url: string | null;
  location_name: string;
  location_verified: boolean;
  gps_coordinates: string | null;
  photo_size_kb: number | null;
  teacher_id: string;
  teacher_name: string;
  session_title: string;
}

interface PlcAbsence {
  id: string;
  date: string;
  status: string;
  reason: string | null;
  detected_at: string | null;
  teacher_id: string;
  teacher_name: string;
  session_title: string;
  start_time: string;
  end_time: string;
}

type Tab = 'sessions' | 'attendance' | 'absences';

function SessionFormModal({
  initial,
  locations,
  onSave,
  onClose,
}: {
  initial: Partial<PlcSession> | null;
  locations: Location[];
  onSave: () => void;
  onClose: () => void;
}) {
  const [title,      setTitle]      = useState(initial?.title       ?? '');
  const [dayOfWeek,  setDayOfWeek]  = useState(initial?.day_of_week ?? 1);
  const [startTime,  setStartTime]  = useState(initial?.start_time?.slice(0, 5) ?? '');
  const [endTime,    setEndTime]    = useState(initial?.end_time?.slice(0, 5)   ?? '');
  const [locationId, setLocationId] = useState(initial?.location_id ?? '');
  const [isActive,   setIsActive]   = useState(initial?.is_active   ?? true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !startTime || !endTime || !locationId) {
      setError('All fields are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const payload = { title, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, location_id: locationId, is_active: isActive };
      if (initial?.id) {
        await api.put(`/api/plc/sessions/${initial.id}`, payload);
      } else {
        await api.post('/api/plc/sessions', payload);
      }
      onSave();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save session.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">{initial?.id ? 'Edit PLC Session' : 'New PLC Session'}</h3>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Session Title</label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. Weekly PLC Meeting"
              value={title} onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Day of Week</label>
              <select
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))}
              >
                {DAYS.slice(1).map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Location / Venue</label>
              <select
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={locationId} onChange={e => setLocationId(e.target.value)}
              >
                <option value="">Select location…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Time</label>
              <input type="time" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Time</label>
              <input type="time" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          {initial?.id && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="w-4 h-4 accent-green-600" />
              Active (visible to teachers)
            </label>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : 'Save Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PhotoModal({ record, onClose }: { record: PlcAttendanceRecord; onClose: () => void }) {
  const mapsUrl = record.gps_coordinates ? `https://www.google.com/maps?q=${record.gps_coordinates}` : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        {record.photo_url
          ? <img src={record.photo_url} alt="PLC photo" className="w-full max-h-80 object-cover" />
          : <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400">No photo</div>}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Photo Details</h3>
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
                ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium break-all">{record.gps_coordinates}</a>
                : <span className="text-slate-400">—</span>}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {record.photo_url && (
              <a href={record.photo_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-sm font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                Open full size
              </a>
            )}
            <button onClick={onClose} className="flex-1 text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlcPage() {
  const [tab,           setTab]          = useState<Tab>('sessions');
  const [sessions,      setSessions]     = useState<PlcSession[]>([]);
  const [locations,     setLocations]    = useState<Location[]>([]);
  const [teachers,      setTeachers]     = useState<Teacher[]>([]);
  const [attendance,    setAttendance]   = useState<PlcAttendanceRecord[]>([]);
  const [absences,      setAbsences]     = useState<PlcAbsence[]>([]);
  const [loading,       setLoading]      = useState(true);

  // Filters
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [teacherId,   setTeacherId]   = useState('');

  // Modals
  const [editSession,  setEditSession]  = useState<Partial<PlcSession> | null | false>(false);
  const [photoRecord,  setPhotoRecord]  = useState<PlcAttendanceRecord | null>(null);
  const [qrSession,    setQrSession]    = useState<PlcSession | null>(null);
  const [qrDataUrl,    setQrDataUrl]    = useState<string | null>(null);
  const [qrLoading,    setQrLoading]    = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.get<PlcSession[]>('/api/plc/sessions'),
        api.get<Location[]>('/api/locations'),
      ]);
      setSessions(s.data);
      setLocations(l.data);
    } catch {}
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      if (teacherId) params.teacherId = teacherId;
      const [a, t] = await Promise.all([
        api.get<PlcAttendanceRecord[]>('/api/plc/attendance', { params }),
        teachers.length ? Promise.resolve({ data: teachers }) : api.get<Teacher[]>('/api/teachers'),
      ]);
      setAttendance(a.data);
      setTeachers(t.data);
    } catch {}
  }, [dateFrom, dateTo, teacherId, teachers]);

  const loadAbsences = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      if (teacherId) params.teacherId = teacherId;
      const a = await api.get<PlcAbsence[]>('/api/plc/absences', { params });
      setAbsences(a.data);
    } catch {}
  }, [dateFrom, dateTo, teacherId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadSessions(), loadAttendance(), loadAbsences()]);
    setLoading(false);
  }, [loadSessions, loadAttendance, loadAbsences]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await Promise.allSettled([loadAttendance(), loadAbsences()]);
    setLoading(false);
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this PLC session? All attendance records for this session will also be deleted.')) return;
    try { await api.delete(`/api/plc/sessions/${id}`); await loadSessions(); }
    catch { alert('Failed to delete session.'); }
  }

  async function deleteAttendance(id: string) {
    if (!confirm('Remove this PLC attendance record?')) return;
    try { await api.delete(`/api/plc/attendance/${id}`); await loadAttendance(); }
    catch { alert('Failed to delete record.'); }
  }

  async function clearAbsence(id: string) {
    if (!confirm('Clear this PLC absence record?')) return;
    try { await api.delete(`/api/plc/absences/${id}`); await loadAbsences(); }
    catch { alert('Failed to clear absence.'); }
  }

  async function openQr(session: PlcSession) {
    setQrSession(session);
    setQrDataUrl(null);
    setQrLoading(true);
    try {
      const { data } = await api.get<{ token: string }>(`/api/plc/sessions/${session.id}/token`);
      const QRCode   = (await import('qrcode')).default;
      const dataUrl  = await QRCode.toDataURL(data.token, { errorCorrectionLevel: 'M', width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    } finally {
      setQrLoading(false);
    }
  }

  const tabClass = (t: Tab) =>
    `px-5 py-2.5 text-sm font-semibold rounded-xl transition-all ${tab === t ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`;
  const tabStyle = (t: Tab) => tab === t ? { backgroundColor: '#15803D' } : {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">PLC Attendance</h2>
          <p className="text-sm text-slate-500 mt-0.5">Professional Learning Community sessions</p>
        </div>
        {tab === 'sessions' && (
          <button
            onClick={() => setEditSession({})}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ backgroundColor: '#15803D' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Session
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-50 rounded-2xl p-1.5 w-fit">
        {(['sessions', 'attendance', 'absences'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={tabClass(t)} style={tabStyle(t)}>
            {t === 'sessions' ? 'Sessions' : t === 'attendance' ? 'Attendance' : 'Absences'}
          </button>
        ))}
      </div>

      {/* Filters (attendance + absences) */}
      {tab !== 'sessions' && (
        <form onSubmit={search} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Teacher</label>
            <select className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button type="submit" className="px-5 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>Search</button>
          <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setTeacherId(''); }} className="px-5 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Reset</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <>
          {/* ── Sessions ── */}
          {tab === 'sessions' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              {sessions.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No PLC sessions configured. Click <strong>New Session</strong> to create one.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Title', 'Day', 'Time', 'Venue', 'Status', 'QR', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{s.title}</td>
                        <td className="px-4 py-3 text-slate-600">{DAYS[s.day_of_week]}</td>
                        <td className="px-4 py-3 text-slate-600">{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {s.location_name}
                          {s.has_coordinates && <span className="ml-2 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">GPS</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openQr(s)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5"><rect x="3" y="3" width="5" height="5" rx="1" strokeWidth={1.8} /><rect x="16" y="3" width="5" height="5" rx="1" strokeWidth={1.8} /><rect x="3" y="16" width="5" height="5" rx="1" strokeWidth={1.8} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 10h5M16 14h3M21 14v5M10 3v5M10 16v5M3 10h5M10 10h.01" /></svg>
                            QR Code
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => setEditSession(s)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                            <button onClick={() => deleteSession(s.id)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Attendance ── */}
          {tab === 'attendance' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-600">{attendance.length} record{attendance.length !== 1 ? 's' : ''}</p>
              </div>
              {attendance.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No PLC attendance records found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Date', 'Teacher', 'Session', 'Venue', 'GPS', 'Agenda', 'Photo', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map(r => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{fmtDate(r.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{r.teacher_name}</td>
                        <td className="px-4 py-3 text-slate-600">{r.session_title}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.location_name}
                          {r.location_verified && <span className="ml-1.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">✓</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.gps_coordinates
                            ? <a href={`https://www.google.com/maps?q=${r.gps_coordinates}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Map</a>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{r.agenda || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3">
                          {r.photo_url
                            ? <button onClick={() => setPhotoRecord(r)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">View</button>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => deleteAttendance(r.id)} className="text-xs font-semibold text-red-500 hover:text-red-700">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Absences ── */}
          {tab === 'absences' && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-50">
                <p className="text-sm font-semibold text-slate-600">{absences.length} absence{absences.length !== 1 ? 's' : ''}</p>
              </div>
              {absences.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No PLC absences found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Date', 'Teacher', 'Session', 'Time', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map(a => (
                      <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{fmtDate(a.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{a.teacher_name}</td>
                        <td className="px-4 py-3 text-slate-600">{a.session_title}</td>
                        <td className="px-4 py-3 text-slate-500">{a.start_time?.slice(0,5)} – {a.end_time?.slice(0,5)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">{a.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => clearAbsence(a.id)} className="text-xs font-semibold text-slate-500 hover:text-red-600">Clear</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Session form modal */}
      {editSession !== false && (
        <SessionFormModal
          initial={editSession}
          locations={locations}
          onSave={async () => { setEditSession(false); await loadSessions(); }}
          onClose={() => setEditSession(false)}
        />
      )}

      {/* Photo modal */}
      {photoRecord && <PhotoModal record={photoRecord} onClose={() => setPhotoRecord(null)} />}

      {/* QR modal */}
      {qrSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setQrSession(null); setQrDataUrl(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">PLC Venue QR Code</h3>
              <p className="text-sm text-slate-500 mt-0.5">{qrSession.title} — {qrSession.location_name}</p>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              {qrLoading ? (
                <div className="w-60 h-60 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
                </div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="PLC QR code" className="w-60 h-60 rounded-xl border border-slate-100" />
              ) : (
                <div className="w-60 h-60 flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-400">Failed to load QR</div>
              )}
              <p className="text-xs text-slate-400 text-center">Print this QR and post it at the PLC venue. Teachers scan it to verify they are present.</p>
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`plc-qr-${qrSession.location_name}.png`}
                  className="w-full text-center py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: '#15803D' }}
                >
                  Download PNG
                </a>
              )}
              <button onClick={() => { setQrSession(null); setQrDataUrl(null); }} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
