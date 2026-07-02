'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface GradeRow { id: string; grade: string; min_score: number; max_score: number; description: string; sort_order: number; }

const DEFAULT_SCALE = [
  { grade: 'A1', min_score: 80, max_score: 100, description: 'Excellent',         sort_order: 1 },
  { grade: 'B2', min_score: 70, max_score:  79, description: 'Very Good',         sort_order: 2 },
  { grade: 'B3', min_score: 60, max_score:  69, description: 'Good',              sort_order: 3 },
  { grade: 'C4', min_score: 55, max_score:  59, description: 'Credit',            sort_order: 4 },
  { grade: 'C5', min_score: 50, max_score:  54, description: 'Credit',            sort_order: 5 },
  { grade: 'C6', min_score: 45, max_score:  49, description: 'Credit',            sort_order: 6 },
  { grade: 'D7', min_score: 40, max_score:  44, description: 'Pass',              sort_order: 7 },
  { grade: 'E8', min_score: 35, max_score:  39, description: 'Pass',              sort_order: 8 },
  { grade: 'F9', min_score:  0, max_score:  34, description: 'Fail',              sort_order: 9 },
];

type EditRow = { grade: string; min_score: string; max_score: string; description: string; };

function rowsToEdit(rows: GradeRow[]): EditRow[] {
  return rows.map(r => ({ grade: r.grade, min_score: String(r.min_score), max_score: String(r.max_score), description: r.description }));
}

export default function PrimaryGradeScalePage() {
  const [rows,    setRows]    = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<EditRow[]>([]);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    api.get<GradeRow[]>('/api/primary/grade-scale')
      .then(r => { setRows(r.data); })
      .catch(() => setError('Failed to load grade scale.'))
      .finally(() => setLoading(false));
  }, []);

  function startEdit() {
    setDraft(rows.length ? rowsToEdit(rows) : DEFAULT_SCALE.map(r => ({ grade: r.grade, min_score: String(r.min_score), max_score: String(r.max_score), description: r.description })));
    setEditing(true);
  }

  function resetToDefault() {
    setDraft(DEFAULT_SCALE.map(r => ({ grade: r.grade, min_score: String(r.min_score), max_score: String(r.max_score), description: r.description })));
  }

  function addRow() {
    setDraft(d => [...d, { grade: '', min_score: '0', max_score: '0', description: '' }]);
  }

  function removeRow(i: number) {
    setDraft(d => d.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, field: keyof EditRow, val: string) {
    setDraft(d => d.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const payload = draft.map((r, i) => ({
        grade: r.grade.trim(),
        min_score: parseFloat(r.min_score),
        max_score: parseFloat(r.max_score),
        description: r.description.trim(),
        sort_order: i + 1,
      }));
      const { data } = await api.put<GradeRow[]>('/api/primary/grade-scale', { rows: payload });
      setRows(data); setEditing(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Save failed.');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Grade Scale</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure your school's grading scale. Default is Ghana GES A1–F9.</p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#15803D' }}>
            Edit Scale
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

      {!editing ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Grade','Min Score','Max Score','Description'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{r.grade}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.min_score}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.max_score}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.description}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-12 text-slate-400 text-sm">No grade scale configured. The default A1–F9 scale is used automatically.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <button onClick={resetToDefault} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
              Reset to GES Default
            </button>
            <button onClick={addRow} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
              + Add Row
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Grade','Min Score','Max Score','Description',''].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input value={r.grade} onChange={e => updateRow(i, 'grade', e.target.value)}
                          className="w-16 border border-slate-200 rounded-md px-2 py-1 text-sm font-bold uppercase" maxLength={3} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={r.min_score} onChange={e => updateRow(i, 'min_score', e.target.value)}
                          className="w-20 border border-slate-200 rounded-md px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={r.max_score} onChange={e => updateRow(i, 'max_score', e.target.value)}
                          className="w-20 border border-slate-200 rounded-md px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.description} onChange={e => updateRow(i, 'description', e.target.value)}
                          className="w-36 border border-slate-200 rounded-md px-2 py-1 text-sm" />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#15803D' }}>
              {saving ? 'Saving…' : 'Save Scale'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
