'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface CalEvent {
  id: string; date: string; name: string; type: string; notes: string | null;
  start_time: string | null; end_time: string | null;
}

const EVENT_TYPES = ['Holiday', 'School Event', 'Closed Day'];
const TYPE_COLOR: Record<string, string> = {
  'Holiday':      'bg-red-100 text-red-700',
  'School Event': 'bg-blue-100 text-blue-600',
  'Closed Day':   'bg-amber-100 text-amber-700',
};

export default function PrimarySchoolCalendarPage() {
  const now = new Date();
  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Modal state
  const [modal,   setModal]   = useState(false);
  const [form, setForm] = useState({ date: '', name: '', type: 'Holiday', notes: '', start_time: '', end_time: '', whole_day: true });
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get<CalEvent[]>(`/api/school-calendar?year=${year}&month=${month}`);
      setEvents(data);
    } catch { setError('Failed to load calendar.'); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function saveEvent() {
    if (!form.date || !form.name) return;
    setSaving(true);
    try {
      await api.post('/api/school-calendar', {
        date: form.date, name: form.name, type: form.type,
        notes: form.notes || null,
        start_time: form.whole_day ? null : (form.start_time || null),
        end_time:   form.whole_day ? null : (form.end_time   || null),
      });
      setModal(false);
      setForm({ date: '', name: '', type: 'Holiday', notes: '', start_time: '', end_time: '', whole_day: true });
      loadEvents();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save event');
    } finally { setSaving(false); }
  }

  async function deleteEvent(id: string) {
    if (!confirm('Delete this calendar event?')) return;
    await api.delete(`/api/school-calendar/${id}`);
    setEvents(ev => ev.filter(e => e.id !== id));
  }

  async function reapply(id: string) {
    await api.post(`/api/school-calendar/${id}/reapply`, {});
    alert('Absences on this date have been updated to Excused.');
  }

  const monthName = new Date(year, month - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const cells: (number | null)[] = [...Array(firstDayDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate = new Map<string, CalEvent[]>();
  events.forEach(e => {
    const key = e.date.slice(0, 10);
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(e);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">School Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">Holidays and events exempt teachers from automated absence</p>
        </div>
        <button onClick={() => { setForm(f => ({ ...f, date: `${year}-${String(month).padStart(2,'0')}-01` })); setModal(true); }}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: '#15803D' }}>
          + Add Event
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {EVENT_TYPES.map(t => (
          <span key={t} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_COLOR[t]}`}>{t}</span>
        ))}
      </div>

      {/* Month nav + calendar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-slate-500 hover:bg-gray-50 text-lg">‹</button>
          <h2 className="text-sm font-bold text-slate-800">{monthName}</h2>
          <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-slate-500 hover:bg-gray-50 text-lg">›</button>
        </div>
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-2 text-center text-xs font-bold text-slate-400 uppercase">{d}</div>
          ))}
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-16 border-b border-r border-gray-50" />;
              const key = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayEvents = eventsByDate.get(key) ?? [];
              const isToday = key === new Date().toISOString().slice(0, 10);
              return (
                <div key={i} className={`min-h-16 border-b border-r border-gray-50 p-1.5 ${isToday ? 'bg-green-50' : ''}`}>
                  <span className={`text-xs font-bold ${isToday ? 'text-green-700' : 'text-slate-600'}`}>{day}</span>
                  {dayEvents.map(ev => (
                    <div key={ev.id} className={`mt-0.5 text-[10px] font-medium px-1 py-0.5 rounded truncate cursor-pointer ${TYPE_COLOR[ev.type] ?? 'bg-gray-100 text-gray-600'}`}
                      title={ev.name}>
                      {ev.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Events list */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-slate-700">Events in {monthName}</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {events.map(e => (
              <div key={e.id} className="flex items-start gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[e.type] ?? 'bg-gray-100 text-gray-600'}`}>{e.type}</span>
                    <p className="text-sm font-semibold text-slate-800 truncate">{e.name}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {e.start_time && e.end_time ? ` · ${e.start_time.slice(0,5)} – ${e.end_time.slice(0,5)}` : ' · All day'}
                  </p>
                  {e.notes && <p className="text-xs text-slate-400 mt-0.5">{e.notes}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => reapply(e.id)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">Fix Absences</button>
                  <button onClick={() => deleteEvent(e.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add Calendar Event</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Event Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Independence Day"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="wholeday" checked={form.whole_day} onChange={e => setForm(f => ({ ...f, whole_day: e.target.checked }))} className="rounded" />
                <label htmlFor="wholeday" className="text-sm text-slate-700">Whole day (exempts teachers all day)</label>
              </div>
              {!form.whole_day && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>
                    <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">End Time</label>
                    <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-slate-600">Cancel</button>
              <button onClick={saveEvent} disabled={saving || !form.date || !form.name}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
