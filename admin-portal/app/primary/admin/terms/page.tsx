'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; }
interface Term {
  id: string; name: string; term_number: number; academic_year_id: string;
  academic_year_name: string; start_date: string | null; end_date: string | null; is_current: boolean;
}

export default function PrimaryTermsPage() {
  const [years,   setYears]   = useState<AcademicYear[]>([]);
  const [terms,   setTerms]   = useState<Term[]>([]);
  const [yearId,  setYearId]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Term | null>(null);
  const [form, setForm] = useState({ term_number: '1', name: 'Term 1', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<AcademicYear[]>('/api/academic-years').then(r => {
      setYears(r.data);
      const cur = r.data.find(y => y.is_current);
      if (cur) setYearId(cur.id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!yearId) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.get<Term[]>(`/api/primary/terms?academic_year_id=${yearId}`);
      setTerms(data);
    } catch { setError('Failed to load terms.'); }
    finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ term_number: '1', name: 'Term 1', start_date: '', end_date: '' });
    setShowForm(true);
  }
  function openEdit(t: Term) {
    setEditing(t);
    setForm({ term_number: String(t.term_number), name: t.name, start_date: t.start_date?.slice(0,10) ?? '', end_date: t.end_date?.slice(0,10) ?? '' });
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/primary/terms/${editing.id}`, { name: form.name, start_date: form.start_date || null, end_date: form.end_date || null });
      } else {
        await api.post('/api/primary/terms', { academic_year_id: yearId, term_number: parseInt(form.term_number), name: form.name, start_date: form.start_date || null, end_date: form.end_date || null });
      }
      setShowForm(false); load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  async function setCurrent(id: string) {
    try { await api.put(`/api/primary/terms/${id}/set-current`); load(); }
    catch { setError('Failed to set current term.'); }
  }

  async function del(id: string) {
    if (!confirm('Delete this term?')) return;
    try { await api.delete(`/api/primary/terms/${id}`); load(); }
    catch { setError('Delete failed.'); }
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Terms</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage the three terms per academic year.</p>
        </div>
        <button onClick={openAdd} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>
          + Add Term
        </button>
      </div>

      <div className="flex gap-3 items-center">
        <select value={yearId} onChange={e => setYearId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900">
          <option value="">Select year…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {terms.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.academic_year_name}</p>
                </div>
                {t.is_current && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-green-700 bg-green-50">Current</span>
                )}
              </div>
              <div className="text-xs text-slate-500 space-y-0.5">
                <p>Start: <span className="text-slate-700">{fmtDate(t.start_date)}</span></p>
                <p>End: <span className="text-slate-700">{fmtDate(t.end_date)}</span></p>
              </div>
              <div className="flex gap-2 pt-1">
                {!t.is_current && (
                  <button onClick={() => setCurrent(t.id)} className="text-xs px-2.5 py-1 rounded-md border border-green-200 text-green-700 hover:bg-green-50 transition-colors">
                    Set Current
                  </button>
                )}
                <button onClick={() => openEdit(t)} className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors">
                  Edit
                </button>
                <button onClick={() => del(t.id)} className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {terms.length === 0 && !loading && (
            <div className="col-span-3 text-center py-12 text-slate-400 text-sm">No terms yet. Add up to 3 terms for the selected year.</div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-slate-900">{editing ? 'Edit Term' : 'Add Term'}</h2>
            {!editing && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Term Number</label>
                <select value={form.term_number} onChange={e => { setForm(f => ({ ...f, term_number: e.target.value, name: `Term ${e.target.value}` })); }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">End Date</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
