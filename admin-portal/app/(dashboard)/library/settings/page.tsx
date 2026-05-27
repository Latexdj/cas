'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

interface Settings { loan_period_days: number; fine_per_day: number; max_loans_per_student: number; }

export default function LibrarySettingsPage() {
  const [form,    setForm]    = useState<Settings>({ loan_period_days: 14, fine_per_day: 0.50, max_loans_per_student: 3 });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get<Settings>('/api/library-admin/settings')
      .then(r => setForm(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put('/api/library-admin/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.response?.data?.error ?? 'Failed to save'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Loan Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure default loan rules and fines</p>
      </div>

      <Card>
        <div className="space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">
              Loan Period (days)
            </label>
            <input
              type="number" min={1} max={90}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              value={form.loan_period_days}
              onChange={e => setForm(p => ({ ...p, loan_period_days: parseInt(e.target.value) || 14 }))}
            />
            <p className="text-xs text-slate-400 mt-1">Number of days before a borrowed book is due</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">
              Fine Per Day (GHS)
            </label>
            <input
              type="number" min={0} step={0.10}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              value={form.fine_per_day}
              onChange={e => setForm(p => ({ ...p, fine_per_day: parseFloat(e.target.value) || 0 }))}
            />
            <p className="text-xs text-slate-400 mt-1">Fine charged per overdue day. Set to 0 to disable fines.</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1.5">
              Max Active Loans per Student
            </label>
            <input
              type="number" min={1} max={20}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              value={form.max_loans_per_student}
              onChange={e => setForm(p => ({ ...p, max_loans_per_student: parseInt(e.target.value) || 3 }))}
            />
            <p className="text-xs text-slate-400 mt-1">Maximum number of books a student can borrow at once</p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {saved && <p className="text-xs text-green-600 dark:text-green-400">Settings saved successfully.</p>}

          <Button loading={saving} onClick={save}>Save Settings</Button>
        </div>
      </Card>
    </div>
  );
}
