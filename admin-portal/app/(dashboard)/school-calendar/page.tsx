'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SchoolCalendarEntry } from '@/types/api';

const TYPE_STYLES: Record<string, { bg: string; color: string; dot: string }> = {
  'Holiday':      { bg: '#FEF2F2', color: '#DC2626', dot: '#DC2626' },
  'School Event': { bg: '#EFF6FF', color: '#2563EB', dot: '#2563EB' },
  'Closed Day':   { bg: '#FFF7ED', color: '#C2410C', dot: '#C2410C' },
};

const TYPES = ['Holiday', 'School Event', 'Closed Day'] as const;

function Badge({ type }: { type: string }) {
  const s = TYPE_STYLES[type] ?? { bg: '#F1F5F9', color: '#64748B', dot: '#64748B' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.dot }} />
      {type}
    </span>
  );
}

export default function SchoolCalendarPage() {
  const thisYear  = new Date().getFullYear();
  const [entries, setEntries] = useState<SchoolCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [year,    setYear]    = useState(thisYear);

  // Add form
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState({ date: '', name: '', type: 'Holiday' as typeof TYPES[number], notes: '' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<SchoolCalendarEntry[]>(`/api/school-calendar?year=${year}`);
      setEntries(data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form.date || !form.name.trim()) { setError('Date and name are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/school-calendar', form);
      setAdding(false);
      setForm({ date: '', name: '', type: 'Holiday', notes: '' });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the school calendar?`)) return;
    try { await api.delete(`/api/school-calendar/${id}`); await load(); }
    catch { alert('Failed to delete.'); }
  }

  // Group by month
  const byMonth: Record<string, SchoolCalendarEntry[]> = {};
  for (const e of entries) {
    const month = e.date.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(e);
  }
  const monthKeys = Object.keys(byMonth).sort();

  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600'
    + ' ' + 'border-slate-200 bg-white text-slate-900';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>School Calendar</h1>
          <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
            Holidays and events — teachers are not marked absent on these days
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year picker */}
          <select
            className="border rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ borderColor: '#E2D9CC', color: '#0F172A' }}
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {[thisYear - 1, thisYear, thisYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => { setAdding(a => !a); setError(''); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: adding ? '#64748B' : '#15803D' }}>
            {adding ? 'Cancel' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-xl p-5 space-y-4" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
          <h2 className="text-sm font-bold" style={{ color: '#0F172A' }}>New Calendar Entry</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Date *</label>
              <input type="date" className={inputCls} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Type *</label>
              <select className={inputCls} value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof TYPES[number] }))}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Name *</label>
              <input className={inputCls} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Independence Day" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Notes</label>
              <input className={inputCls} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Calendar list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl text-center py-16 text-sm" style={{ border: '1px solid #F1F5F9', color: '#94A3B8' }}>
          No entries for {year}. Add a holiday or school event above.
        </div>
      ) : (
        <div className="space-y-5">
          {monthKeys.map(month => {
            const label = new Date(month + '-01T12:00:00').toLocaleString('default', { month: 'long', year: 'numeric' });
            return (
              <div key={month}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2 px-1" style={{ color: '#94A3B8' }}>{label}</p>
                <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
                  <table className="w-full text-sm">
                    <tbody>
                      {byMonth[month].map((e, i) => (
                        <tr key={e.id} className="hover:bg-slate-50 transition-colors"
                          style={{ borderBottom: i < byMonth[month].length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                          <td className="px-4 py-3 font-mono text-xs w-28" style={{ color: '#64748B' }}>
                            {new Date(e.date + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{e.name}</td>
                          <td className="px-4 py-3"><Badge type={e.type} /></td>
                          <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{e.notes ?? ''}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => del(e.id, e.name)}
                              className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-center" style={{ color: '#94A3B8' }}>
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} in {year} · teachers are not marked absent on these days
        </p>
      )}
    </div>
  );
}
