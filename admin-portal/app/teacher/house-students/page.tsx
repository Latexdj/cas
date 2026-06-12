'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { teacherApi } from '@/lib/teacher-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoomSummary {
  id:            string;
  room_name:     string;
  capacity:      number | null;
  notes:         string | null;
  student_count: number;
}

interface RoomStats {
  total_rooms:       number;
  total_capacity:    number;
  assigned_students: number;
  rooms:             RoomSummary[];
}

interface HouseStats {
  house_name: string;
  total:      number;
  male:       number;
  female:     number;
  boarding:   number;
  day:        number;
  by_class:   { class_name: string; count: number }[];
  room_stats: RoomStats;
}

interface Student {
  id:                 string;
  student_code:       string;
  name:               string;
  class_name:         string;
  gender:             string;
  residential_status: string;
  house?:             string;
  room_name?:         string;
}

type Role = 'loading' | 'none' | 'housemaster' | 'senior_housemaster';
type Tab  = 'overview' | 'rooms' | 'students' | 'exeat';

const ACCENT = '#15803d';

// ── Small shared components ───────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 flex flex-col items-center justify-center text-center">
      <p className="text-2xl font-bold" style={{ color: color ?? undefined }}
         {...(!color && { className: 'text-2xl font-bold text-slate-900 dark:text-white' })}>{value}</p>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
        <span>{label}</span>
        <span>{count} <span className="text-slate-400">({pct}%)</span></span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function OccupancyBar({ count, capacity }: { count: number; capacity: number | null }) {
  if (!capacity) return <span className="text-xs text-slate-400">{count} students</span>;
  const pct = Math.min(100, Math.round((count / capacity) * 100));
  const color = pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : ACCENT;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-slate-500 whitespace-nowrap">{count}/{capacity}</span>
    </div>
  );
}

// ── Assign Students Modal ─────────────────────────────────────────────────────

function AssignModal({
  roomId, houseName, isSenior, onDone, onClose,
}: {
  roomId: string; houseName: string; isSenior: boolean;
  onDone: () => void; onClose: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (isSenior) params.set('house', houseName);
    teacherApi.get<Student[]>(`/api/houses/my-rooms/${roomId}/unassigned?${params}`)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId, houseName, isSenior]);

  const filtered = useMemo(() =>
    search.trim()
      ? students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.student_code.toLowerCase().includes(search.toLowerCase()))
      : students,
  [students, search]);

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function assign() {
    if (!selected.size) return;
    setSaving(true);
    try {
      await teacherApi.post(`/api/houses/my-rooms/${roomId}/assign`, {
        student_ids: [...selected],
        house_name: isSenior ? houseName : undefined,
      });
      onDone();
    } catch { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <p className="font-bold text-slate-900 dark:text-white">Assign Students</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">{search ? 'No matches' : 'All students are assigned to rooms'}</p>
          ) : filtered.map(s => (
            <label key={s.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)}
                className="w-4 h-4 accent-green-600 rounded flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.name}</p>
                <p className="text-xs text-slate-500">{s.student_code} · {s.class_name}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <button
            onClick={assign} disabled={!selected.size || saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            {saving ? 'Assigning…' : `Assign ${selected.size > 0 ? `(${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Room detail view ──────────────────────────────────────────────────────────

function RoomDetail({
  room, houseName, isSenior, onBack, onRoomUpdated,
}: {
  room: RoomSummary; houseName: string; isSenior: boolean;
  onBack: () => void; onRoomUpdated: () => void;
}) {
  const [students,    setStudents]    = useState<Student[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showAssign,  setShowAssign]  = useState(false);
  const [removing,    setRemoving]    = useState<string | null>(null);

  const houseParam = isSenior ? `?house=${encodeURIComponent(houseName)}` : '';

  const load = useCallback(() => {
    setLoading(true);
    teacherApi.get<Student[]>(`/api/houses/my-rooms/${room.id}/students${houseParam}`)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [room.id, houseParam]);

  useEffect(() => { load(); }, [load]);

  async function remove(studentId: string) {
    setRemoving(studentId);
    try {
      await teacherApi.delete(`/api/houses/my-rooms/${room.id}/students/${studentId}${houseParam}`);
      setStudents(prev => prev.filter(s => s.id !== studentId));
      onRoomUpdated();
    } catch { setRemoving(null); }
  }

  const pct = room.capacity ? Math.min(100, Math.round((students.length / room.capacity) * 100)) : null;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white">{room.room_name}</h2>
            {room.capacity ? (
              <p className="text-xs text-slate-500">{students.length} / {room.capacity} · {pct}% full</p>
            ) : (
              <p className="text-xs text-slate-500">{students.length} students</p>
            )}
          </div>
          <button
            onClick={() => { setShowAssign(true); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
            style={{ backgroundColor: ACCENT }}
          >
            + Assign
          </button>
        </div>

        {room.capacity && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3">
            <OccupancyBar count={students.length} capacity={room.capacity} />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
        ) : students.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-500">No students assigned to this room.</div>
        ) : (
          <div className="space-y-2">
            {students.map(s => (
              <div key={s.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.student_code} · {s.class_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.residential_status && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.residential_status.toLowerCase() === 'boarding' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {s.residential_status}
                    </span>
                  )}
                  <button
                    onClick={() => remove(s.id)}
                    disabled={removing === s.id}
                    className="text-xs text-red-500 hover:underline disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAssign && (
        <AssignModal
          roomId={room.id} houseName={houseName} isSenior={isSenior}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); load(); onRoomUpdated(); }}
        />
      )}
    </>
  );
}

// ── Rooms tab ─────────────────────────────────────────────────────────────────

function RoomsTab({
  houseName, isSenior, onRoomsChanged,
}: {
  houseName: string; isSenior: boolean; onRoomsChanged: () => void;
}) {
  const [rooms,        setRooms]        = useState<RoomSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomSummary | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [editRoom,     setEditRoom]     = useState<RoomSummary | null>(null);
  const [formName,     setFormName]     = useState('');
  const [formCap,      setFormCap]      = useState('');
  const [formNotes,    setFormNotes]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');

  const houseParam = isSenior ? `?house=${encodeURIComponent(houseName)}` : '';

  const load = useCallback(() => {
    setLoading(true);
    teacherApi.get<{ house_name: string; rooms: RoomSummary[] }>(`/api/houses/my-rooms${houseParam}`)
      .then(r => setRooms(r.data.rooms))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [houseParam]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditRoom(null); setFormName(''); setFormCap(''); setFormNotes(''); setFormError(''); setShowForm(true); }
  function openEdit(r: RoomSummary) { setEditRoom(r); setFormName(r.room_name); setFormCap(r.capacity?.toString() ?? ''); setFormNotes(r.notes ?? ''); setFormError(''); setShowForm(true); }

  async function saveRoom() {
    if (!formName.trim()) { setFormError('Room name is required'); return; }
    setSaving(true); setFormError('');
    try {
      if (editRoom) {
        const r = await teacherApi.put<RoomSummary>(`/api/houses/my-rooms/${editRoom.id}`, {
          room_name: formName.trim(), capacity: formCap ? parseInt(formCap) : null, notes: formNotes || null,
          house_name: isSenior ? houseName : undefined,
        });
        setRooms(prev => prev.map(x => x.id === editRoom.id ? { ...x, ...r.data } : x));
      } else {
        const r = await teacherApi.post<RoomSummary>('/api/houses/my-rooms', {
          room_name: formName.trim(), capacity: formCap ? parseInt(formCap) : null, notes: formNotes || null,
          house_name: isSenior ? houseName : undefined,
        });
        setRooms(prev => [...prev, r.data].sort((a, b) => a.room_name.localeCompare(b.room_name)));
        onRoomsChanged();
      }
      setShowForm(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setFormError(err.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function deleteRoom(r: RoomSummary) {
    if (!confirm(`Delete "${r.room_name}"? All student assignments in this room will be removed.`)) return;
    try {
      await teacherApi.delete(`/api/houses/my-rooms/${r.id}${houseParam}`);
      setRooms(prev => prev.filter(x => x.id !== r.id));
      onRoomsChanged();
    } catch {}
  }

  if (selectedRoom) {
    return (
      <RoomDetail
        room={selectedRoom} houseName={houseName} isSenior={isSenior}
        onBack={() => { setSelectedRoom(null); load(); }}
        onRoomUpdated={() => { load(); onRoomsChanged(); }}
      />
    );
  }

  const totalAssigned = rooms.reduce((s, r) => s + r.student_count, 0);
  const totalCapacity = rooms.reduce((s, r) => s + (r.capacity ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {rooms.length} room{rooms.length !== 1 ? 's' : ''}
          {totalAssigned > 0 ? ` · ${totalAssigned} assigned` : ''}
          {totalCapacity > 0 ? ` · ${totalCapacity} total capacity` : ''}
        </p>
        <button onClick={openAdd} className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white" style={{ backgroundColor: ACCENT }}>
          + Add Room
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500">No rooms yet. Add a room to get started.</div>
      ) : (
        <div className="space-y-2">
          {rooms.map(r => (
            <div key={r.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{r.room_name}</p>
                  {r.notes && <p className="text-xs text-slate-400 mt-0.5">{r.notes}</p>}
                </div>
                <div className="flex gap-3 flex-shrink-0">
                  <button onClick={() => setSelectedRoom(r)} className="text-xs font-semibold text-green-700 dark:text-green-400 hover:underline">Manage</button>
                  <button onClick={() => openEdit(r)}         className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  <button onClick={() => deleteRoom(r)}       className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              </div>
              <OccupancyBar count={r.student_count} capacity={r.capacity} />
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Room bottom sheet */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
          <div className="bg-white dark:bg-slate-800 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">{editRoom ? 'Edit Room' : 'Add Room'}</p>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Room Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Room 1A"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Capacity (optional)</label>
                <input type="number" min="1" value={formCap} onChange={e => setFormCap(e.target.value)} placeholder="Max students"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Notes (optional)</label>
                <input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="e.g. Ground floor"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
              <button onClick={saveRoom} disabled={saving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: ACCENT }}>
                {saving ? 'Saving…' : editRoom ? 'Save' : 'Add Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── House overview card (senior HM per-house card) ────────────────────────────

function HouseOverviewCard({ h, accent }: { h: HouseStats; accent: string }) {
  const maxClass = Math.max(...h.by_class.map(c => c.count), 1);
  const rs = h.room_stats;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 dark:text-white">{h.house_name}</h3>
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{h.total} students</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {([
          { label: 'Male',     value: h.male,     color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Female',   value: h.female,   color: 'text-pink-600 dark:text-pink-400' },
          { label: 'Boarding', value: h.boarding, color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Day',      value: h.day,      color: 'text-amber-600 dark:text-amber-400' },
        ] as const).map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl py-2">
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      {rs.total_rooms > 0 && (
        <div className="flex gap-3 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/40 rounded-xl px-3 py-2">
          <span><strong className="text-slate-900 dark:text-white">{rs.total_rooms}</strong> rooms</span>
          <span><strong className="text-slate-900 dark:text-white">{rs.assigned_students}</strong> assigned</span>
          <span><strong className="text-slate-900 dark:text-white">{h.total - rs.assigned_students}</strong> unassigned</span>
        </div>
      )}
      {h.by_class.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">By Class</p>
          {h.by_class.map(c => (
            <div key={c.class_name} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0 truncate">{c.class_name || '—'}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((c.count / maxClass) * 100)}%`, backgroundColor: accent }} />
              </div>
              <span className="text-xs text-slate-500 w-6 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Exeat types ───────────────────────────────────────────────────────────────

interface HouseStudent { id: string; student_code: string; name: string; class_name: string; house: string; guardian_mobile: string | null; }
interface Exeat {
  id: string; exeat_type: 'internal' | 'external'; status: string;
  destination: string | null; reason: string | null; parent_contact: string | null; notes: string | null; sms_sent: boolean;
  departure_date: string; departure_time: string;
  expected_return_date: string; expected_return_time: string;
  actual_return_date: string | null; actual_return_time: string | null;
  granted_at: string | null; created_at: string;
  student_id: string; student_name: string; student_code: string; class_name: string; house: string;
  granted_by_name: string | null;
}

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  pending:  { label: 'Pending',  dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  active:   { label: 'Out',      dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  overdue:  { label: 'Overdue',  dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  returned: { label: 'Returned', dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: 'Rejected', dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

function fmtTime(t: string | null | undefined) { return t?.slice(0, 5) ?? ''; }
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  // Use first 10 chars to handle both 'YYYY-MM-DD' and full ISO timestamps
  const dt = new Date(d.slice(0, 10) + 'T12:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Create Exeat Modal ────────────────────────────────────────────────────────

function CreateExeatModal({
  role, houseOptions, onClose, onCreated,
}: {
  role: 'housemaster' | 'senior_housemaster'; houseOptions: string[];
  onClose: () => void; onCreated: (e: Exeat) => void;
}) {
  const exeatType = role === 'senior_housemaster' ? 'external' : 'internal';
  const [students,     setStudents]     = useState<HouseStudent[]>([]);
  const [stuLoading,   setStuLoading]   = useState(true);
  const [search,       setSearch]       = useState('');
  const [selectedStu,  setSelectedStu]  = useState<HouseStudent | null>(null);
  const [destination,  setDestination]  = useState('');
  const [reason,       setReason]       = useState('');
  const [contact,      setContact]      = useState('');
  const [depDate,      setDepDate]      = useState(new Date().toISOString().slice(0,10));
  const [depTime,      setDepTime]      = useState('08:00');
  const [retDate,      setRetDate]      = useState('');
  const [retTime,      setRetTime]      = useState('18:00');
  const [grantNow,     setGrantNow]     = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    teacherApi.get<HouseStudent[]>('/api/exeat/house-students')
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setStuLoading(false));
  }, []);

  const filtered = useMemo(() =>
    search.trim()
      ? students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.student_code.toLowerCase().includes(search.toLowerCase()))
      : students,
  [students, search]);

  function pickStudent(s: HouseStudent) {
    setSelectedStu(s);
    setContact(s.guardian_mobile ?? '');
    setSearch('');
  }

  async function submit() {
    if (!selectedStu) { setError('Select a student'); return; }
    if (!destination.trim()) { setError('Destination is required'); return; }
    if (!reason.trim()) { setError('Reason is required'); return; }
    if (!retDate) { setError('Expected return date is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await teacherApi.post<Exeat>('/api/exeat', {
        student_id: selectedStu.id, exeat_type: exeatType,
        destination: destination.trim(), reason: reason.trim(),
        parent_contact: contact.trim() || null,
        departure_date: depDate, departure_time: depTime,
        expected_return_date: retDate, expected_return_time: retTime,
        grant_immediately: grantNow,
      });
      onCreated(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to create exeat');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">New {exeatType === 'internal' ? 'Internal' : 'External'} Exeat</p>
            <p className="text-xs text-slate-400 mt-0.5">{exeatType === 'internal' ? 'Few hours outside campus' : 'Student goes home / overnight stay'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Student selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Student *</label>
            {selectedStu ? (
              <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedStu.name}</p>
                  <p className="text-xs text-slate-500">{selectedStu.student_code} · {selectedStu.class_name}{houseOptions.length > 1 ? ` · ${selectedStu.house}` : ''}</p>
                </div>
                <button onClick={() => { setSelectedStu(null); setContact(''); }} className="text-xs text-slate-400 hover:text-red-500">Change</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID…"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                {stuLoading ? (
                  <div className="flex justify-center py-4"><div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
                ) : search.trim() ? (
                  <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No matches</p>
                    ) : filtered.slice(0, 20).map(s => (
                      <button key={s.id} onClick={() => pickStudent(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.student_code} · {s.class_name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Destination *</label>
              <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Kumasi — family home"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Reason *</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Medical appointment"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Parent Contact (SMS)</label>
              <input value={contact} onChange={e => setContact(e.target.value)} placeholder="e.g. 0244123456"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
              <p className="text-[11px] text-slate-400 mt-1">Pre-filled from student record. Edit to override.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Departure Date *</label>
              <input type="date" value={depDate} onChange={e => setDepDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Departure Time *</label>
              <input type="time" value={depTime} onChange={e => setDepTime(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Expected Return *</label>
              <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Return Time *</label>
              <input type="time" value={retTime} onChange={e => setRetTime(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={grantNow} onChange={e => setGrantNow(e.target.checked)}
              className="w-4 h-4 accent-green-600 rounded" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Grant immediately (mark as active now)</span>
          </label>

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}>
            {saving ? 'Creating…' : grantNow ? 'Grant Exeat' : 'Save as Pending'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mark Return Modal ─────────────────────────────────────────────────────────

function ReturnModal({ exeat, onClose, onReturned }: { exeat: Exeat; onClose: () => void; onReturned: (e: Exeat) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toTimeString().slice(0, 5);
  const [retDate, setRetDate] = useState(today);
  const [retTime, setRetTime] = useState(now);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function submit() {
    setSaving(true); setError('');
    try {
      const r = await teacherApi.post<Exeat>(`/api/exeat/${exeat.id}/return`, {
        actual_return_date: retDate, actual_return_time: retTime + ':00',
      });
      onReturned(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white dark:bg-slate-800 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900 dark:text-white">Mark Returned</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">Confirm return for <strong>{exeat.student_name}</strong></p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Return Date</label>
            <input type="date" value={retDate} onChange={e => setRetDate(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Return Time</label>
            <input type="time" value={retTime} onChange={e => setRetTime(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}>
            {saving ? 'Saving…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ExeatTab ──────────────────────────────────────────────────────────────────

function ExeatTab({ role, houseOptions }: { role: 'housemaster' | 'senior_housemaster'; houseOptions: string[] }) {
  type SubTab = 'pending' | 'out' | 'history';
  const [subTab,      setSubTab]      = useState<SubTab>('out');
  const [exeats,      setExeats]      = useState<Exeat[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [returning,   setReturning]   = useState<Exeat | null>(null);
  const [actioning,   setActioning]   = useState<string | null>(null);
  const [rejectId,    setRejectId]    = useState<string | null>(null);
  const [rejectNote,  setRejectNote]  = useState('');
  const [error,       setError]       = useState('');

  const load = useCallback(() => {
    setLoading(true);
    teacherApi.get<{ role: string; houses: string[]; exeats: Exeat[] }>('/api/exeat/my-house')
      .then(r => setExeats(r.data.exeats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending  = exeats.filter(e => e.status === 'pending');
  const active   = exeats.filter(e => e.status === 'active' || e.status === 'overdue');
  const history  = exeats.filter(e => e.status === 'returned' || e.status === 'rejected');
  const overdue  = active.filter(e => e.status === 'overdue');

  async function approve(id: string) {
    setActioning(id); setError('');
    try {
      const r = await teacherApi.post<Exeat>(`/api/exeat/${id}/approve`, {});
      setExeats(prev => prev.map(e => e.id === id ? r.data : e));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to approve');
    } finally { setActioning(null); }
  }

  async function reject(id: string) {
    setActioning(id); setError('');
    try {
      await teacherApi.post(`/api/exeat/${id}/reject`, { notes: rejectNote });
      setExeats(prev => prev.map(e => e.id === id ? { ...e, status: 'rejected', notes: rejectNote || e.notes } : e));
      setRejectId(null); setRejectNote('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to reject');
    } finally { setActioning(null); }
  }

  const canCreate = role === 'housemaster' || role === 'senior_housemaster';

  const TABS: { key: SubTab; label: string; count?: number }[] = [
    { key: 'pending', label: 'Pending',      count: pending.length  },
    { key: 'out',     label: 'Currently Out', count: active.length   },
    { key: 'history', label: 'History'                               },
  ];

  function ExeatCard({ e }: { e: Exeat }) {
    const meta = STATUS_META[e.status] ?? STATUS_META.pending;
    const isOverdue = e.status === 'overdue';
    return (
      <div className={`bg-white dark:bg-slate-800 rounded-xl border ${isOverdue ? 'border-red-200 dark:border-red-700' : 'border-slate-100 dark:border-slate-700'} p-4 space-y-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{e.student_name}</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${e.exeat_type === 'external' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}>
                {e.exeat_type}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>
                {meta.label}
              </span>
              {houseOptions.length > 1 && <span className="text-[10px] text-slate-400">{e.house}</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{e.student_code} · {e.class_name}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {e.destination && <div><span className="text-slate-400">Destination: </span><span className="text-slate-700 dark:text-slate-300 font-medium">{e.destination}</span></div>}
          {e.reason      && <div><span className="text-slate-400">Reason: </span><span className="text-slate-700 dark:text-slate-300">{e.reason}</span></div>}
          <div><span className="text-slate-400">Departed: </span><span className="text-slate-700 dark:text-slate-300">{fmtDate(e.departure_date)} {fmtTime(e.departure_time)}</span></div>
          <div className={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
            <span className="text-slate-400">Expected back: </span>
            <span>{fmtDate(e.expected_return_date)} {fmtTime(e.expected_return_time)}</span>
          </div>
          {e.actual_return_date && (
            <div><span className="text-slate-400">Returned: </span><span className="text-green-700 dark:text-green-400 font-medium">{fmtDate(e.actual_return_date)} {fmtTime(e.actual_return_time ?? '')}</span></div>
          )}
          {e.granted_by_name && <div><span className="text-slate-400">Granted by: </span><span className="text-slate-700 dark:text-slate-300">{e.granted_by_name}</span></div>}
        </div>

        {isOverdue && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            Student has not returned by the expected time. Parent may need to be contacted.
          </p>
        )}

        {/* Actions */}
        {e.status === 'pending' && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => approve(e.id)} disabled={actioning === e.id}
              className="flex-1 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}>
              {actioning === e.id ? 'Approving…' : 'Approve'}
            </button>
            <button
              onClick={() => { setRejectId(e.id); setRejectNote(''); }}
              className="flex-1 py-2 rounded-xl border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20">
              Reject
            </button>
          </div>
        )}
        {(e.status === 'active' || e.status === 'overdue') && (
          <button
            onClick={() => setReturning(e)}
            className="w-full py-2 rounded-xl text-white text-xs font-semibold"
            style={{ backgroundColor: ACCENT }}>
            Mark Returned
          </button>
        )}
      </div>
    );
  }

  const displayList = subTab === 'pending' ? pending : subTab === 'out' ? active : history;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {overdue.length > 0 && (
            <span className="text-red-600 dark:text-red-400 font-semibold">{overdue.length} overdue · </span>
          )}
          {active.length} currently out
        </p>
        {canCreate && (
          <button onClick={() => setShowCreate(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
            style={{ backgroundColor: ACCENT }}>
            + New Exeat
          </button>
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
            style={subTab === t.key ? { backgroundColor: '#fff', color: ACCENT, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748b' }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.key === 'pending' ? 'bg-amber-100 text-amber-700' : t.key === 'out' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
      ) : displayList.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500">
          {subTab === 'pending' ? 'No pending exeat requests.' : subTab === 'out' ? 'No students currently on exeat.' : 'No exeat history.'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayList.map(e => <ExeatCard key={e.id} e={e} />)}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
          <div className="bg-white dark:bg-slate-800 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-900 dark:text-white">Reject Exeat</p>
              <button onClick={() => setRejectId(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-sm">✕</button>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-1">Reason (optional)</label>
              <input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Insufficient reason provided"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectId(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
              <button onClick={() => reject(rejectId)} disabled={actioning === rejectId}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40">
                {actioning === rejectId ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateExeatModal
          role={role} houseOptions={houseOptions}
          onClose={() => setShowCreate(false)}
          onCreated={e => { setExeats(prev => [e, ...prev]); setShowCreate(false); setSubTab(e.status === 'active' ? 'out' : 'pending'); }}
        />
      )}

      {returning && (
        <ReturnModal
          exeat={returning}
          onClose={() => setReturning(null)}
          onReturned={updated => { setExeats(prev => prev.map(e => e.id === updated.id ? updated : e)); setReturning(null); }}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HouseStudentsPage() {
  const [role,         setRole]         = useState<Role>('loading');
  const [tab,          setTab]          = useState<Tab>('overview');
  const [dashboard,    setDashboard]    = useState<HouseStats | null>(null);
  const [allHouses,    setAllHouses]    = useState<HouseStats[]>([]);
  const [students,     setStudents]     = useState<Student[]>([]);
  const [stuLoading,   setStuLoading]   = useState(false);
  const [filterHouse,  setFilterHouse]  = useState('');
  const [filterClass,  setFilterClass]  = useState('');
  const [filterRes,    setFilterRes]    = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [roomHouse,    setRoomHouse]    = useState(''); // active house for rooms tab (senior HM)

  const loadDashboard = useCallback(() => {
    teacherApi.get<HouseStats>('/api/houses/my-dashboard')
      .then(r => { setDashboard(r.data); setRole('housemaster'); })
      .catch(e => {
        if (e?.response?.status === 404) {
          teacherApi.get<HouseStats[]>('/api/houses/all-dashboard')
            .then(r => { setAllHouses(r.data); setRole('senior_housemaster'); setRoomHouse(r.data[0]?.house_name ?? ''); })
            .catch(() => setRole('none'));
        } else setRole('none');
      });
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (tab !== 'students' || (role !== 'housemaster' && role !== 'senior_housemaster')) return;
    setStuLoading(true);
    const params = new URLSearchParams();
    if (role === 'senior_housemaster' && filterHouse) params.set('house', filterHouse);
    if (filterClass)  params.set('class_name', filterClass);
    if (filterRes)    params.set('residential_status', filterRes);
    if (filterGender) params.set('gender', filterGender);
    const endpoint = role === 'senior_housemaster'
      ? `/api/houses/all-students?${params}`
      : `/api/houses/my-students?${params}`;
    teacherApi.get<Student[]>(endpoint)
      .then(r => setStudents(r.data))
      .catch(() => {})
      .finally(() => setStuLoading(false));
  }, [tab, role, filterHouse, filterClass, filterRes, filterGender]);

  const classOptions = useMemo(() => {
    if (role === 'housemaster' && dashboard) return dashboard.by_class.map(c => c.class_name).sort();
    if (role === 'senior_housemaster') {
      const src = filterHouse
        ? allHouses.find(h => h.house_name === filterHouse)?.by_class ?? []
        : allHouses.flatMap(h => h.by_class);
      return [...new Set(src.map(c => c.class_name))].sort();
    }
    return [];
  }, [role, dashboard, allHouses, filterHouse]);

  const houseOptions  = useMemo(() => allHouses.map(h => h.house_name), [allHouses]);
  const isSenior      = role === 'senior_housemaster';
  const houseName     = isSenior ? (roomHouse || houseOptions[0] || '') : (dashboard?.house_name ?? '');

  if (role === 'loading') {
    return <div className="flex items-center justify-center min-h-64"><div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>;
  }

  if (role === 'none') {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-slate-400">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No house assigned</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Contact your administrator to be assigned as a housemaster.</p>
      </div>
    );
  }

  // Derive totals
  const seniorTotals = isSenior ? allHouses.reduce(
    (a, h) => ({ total: a.total + h.total, male: a.male + h.male, female: a.female + h.female, boarding: a.boarding + h.boarding, day: a.day + h.day, rooms: a.rooms + h.room_stats.total_rooms, assigned: a.assigned + h.room_stats.assigned_students }),
    { total: 0, male: 0, female: 0, boarding: 0, day: 0, rooms: 0, assigned: 0 }
  ) : null;

  const d = dashboard;
  const rs = d?.room_stats;

  const headerTotal = isSenior ? seniorTotals!.total : d!.total;
  const displayName = isSenior ? 'All Houses' : d!.house_name;

  return (
    <div className="p-4 space-y-4 pb-24 md:pb-6">
      {/* Header */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{displayName}</h1>
          {isSenior && <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Senior Housemaster</span>}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {headerTotal} active student{headerTotal !== 1 ? 's' : ''}
          {isSenior ? ` across ${allHouses.length} house${allHouses.length !== 1 ? 's' : ''}` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {(['overview', 'rooms', 'students', 'exeat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize"
            style={tab === t ? { backgroundColor: '#fff', color: ACCENT, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : { color: '#64748b' }}>
            {t === 'exeat' ? 'Exeat' : t}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {isSenior ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard label="Total"    value={seniorTotals!.total} />
                <StatCard label="Male"     value={seniorTotals!.male}    sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.male / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Female"   value={seniorTotals!.female}  sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.female / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Boarding" value={seniorTotals!.boarding} sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.boarding / seniorTotals!.total * 100)}%` : '—'} />
                <StatCard label="Day"      value={seniorTotals!.day}     sub={seniorTotals!.total > 0 ? `${Math.round(seniorTotals!.day / seniorTotals!.total * 100)}%` : '—'} />
              </div>
              {seniorTotals!.rooms > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Rooms"      value={seniorTotals!.rooms} />
                  <StatCard label="In a Room"  value={seniorTotals!.assigned} sub={`${Math.round(seniorTotals!.assigned / seniorTotals!.total * 100)}%`} />
                  <StatCard label="Unassigned" value={seniorTotals!.total - seniorTotals!.assigned} />
                </div>
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 pt-1">Per House</p>
              <div className="space-y-4">
                {allHouses.map(h => <HouseOverviewCard key={h.house_name} h={h} accent={ACCENT} />)}
              </div>
            </>
          ) : (
            <>
              {/* Regular housemaster */}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                <StatCard label="Total"    value={d!.total} />
                <StatCard label="Male"     value={d!.male}    sub={d!.total > 0 ? `${Math.round(d!.male / d!.total * 100)}%` : '—'} />
                <StatCard label="Female"   value={d!.female}  sub={d!.total > 0 ? `${Math.round(d!.female / d!.total * 100)}%` : '—'} />
                <StatCard label="Boarding" value={d!.boarding} sub={d!.total > 0 ? `${Math.round(d!.boarding / d!.total * 100)}%` : '—'} />
                <StatCard label="Day"      value={d!.day}     sub={d!.total > 0 ? `${Math.round(d!.day / d!.total * 100)}%` : '—'} />
              </div>
              {rs && rs.total_rooms > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Rooms"      value={rs.total_rooms} />
                  <StatCard label="In a Room"  value={rs.assigned_students} sub={d!.total > 0 ? `${Math.round(rs.assigned_students / d!.total * 100)}%` : '—'} />
                  <StatCard label="Unassigned" value={d!.total - rs.assigned_students}
                    sub={d!.total > 0 ? `${Math.round((d!.total - rs.assigned_students) / d!.total * 100)}%` : '—'} />
                </div>
              )}
              {rs && rs.total_rooms > 0 && rs.rooms.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Room Occupancy</p>
                  {rs.rooms.map(r => (
                    <div key={r.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>{r.room_name}</span>
                        <span className="text-slate-500">{r.capacity ? `${r.student_count}/${r.capacity}` : `${r.student_count} students`}</span>
                      </div>
                      <OccupancyBar count={r.student_count} capacity={r.capacity} />
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Gender Distribution</p>
                <DistBar label="Male"   count={d!.male}   total={d!.total} color="#3b82f6" />
                <DistBar label="Female" count={d!.female} total={d!.total} color="#ec4899" />
                {d!.total - d!.male - d!.female > 0 && <DistBar label="Not specified" count={d!.total - d!.male - d!.female} total={d!.total} color="#94a3b8" />}
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Residential Status</p>
                <DistBar label="Boarding" count={d!.boarding} total={d!.total} color="#6366f1" />
                <DistBar label="Day"      count={d!.day}      total={d!.total} color="#f59e0b" />
                {d!.total - d!.boarding - d!.day > 0 && <DistBar label="Not specified" count={d!.total - d!.boarding - d!.day} total={d!.total} color="#94a3b8" />}
              </div>
              {d!.by_class.length > 0 && (() => {
                const max = Math.max(...d!.by_class.map(c => c.count), 1);
                return (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">By Class / Form</p>
                    {d!.by_class.map(c => (
                      <div key={c.class_name} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                          <span>{c.class_name || 'Unassigned'}</span><span>{c.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.round((c.count / max) * 100)}%`, backgroundColor: ACCENT }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Rooms tab ── */}
      {tab === 'rooms' && (
        <div className="space-y-3">
          {isSenior && houseOptions.length > 1 && (
            <select value={roomHouse} onChange={e => setRoomHouse(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500 w-full sm:w-auto">
              {houseOptions.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          )}
          {houseName && (
            <RoomsTab key={houseName} houseName={houseName} isSenior={isSenior} onRoomsChanged={loadDashboard} />
          )}
        </div>
      )}

      {/* ── Exeat tab ── */}
      {tab === 'exeat' && (
        <ExeatTab role={role as 'housemaster' | 'senior_housemaster'} houseOptions={houseOptions} />
      )}

      {/* ── Students tab ── */}
      {tab === 'students' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {isSenior && (
              <select value={filterHouse} onChange={e => { setFilterHouse(e.target.value); setFilterClass(''); }}
                className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">All Houses</option>
                {houseOptions.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Classes</option>
              {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterRes} onChange={e => setFilterRes(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Residential</option>
              <option value="Boarding">Boarding</option>
              <option value="Day">Day</option>
            </select>
            <select value={filterGender} onChange={e => setFilterGender(e.target.value)}
              className="text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          {stuLoading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
          ) : students.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">No students found.</div>
          ) : (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Showing {students.length} student{students.length !== 1 ? 's' : ''}</p>
              <div className="space-y-2">
                {students.map(s => (
                  <div key={s.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {s.student_code}{isSenior && s.house ? ` · ${s.house}` : ''}{s.room_name ? ` · ${s.room_name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {s.class_name && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{s.class_name}</span>}
                      {s.residential_status && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.residential_status.toLowerCase() === 'boarding' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                          {s.residential_status}
                        </span>
                      )}
                      {s.gender && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.gender.toLowerCase() === 'male' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}>
                          {s.gender}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
