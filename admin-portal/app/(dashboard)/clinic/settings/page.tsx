'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface Settings { sms_on_every_visit: boolean; sms_on_serious_only: boolean; }

export default function ClinicSettingsPage() {
  const [form,    setForm]    = useState<Settings>({ sms_on_every_visit: false, sms_on_serious_only: true });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get<Settings>('/api/clinic-admin/settings')
      .then(r => setForm(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await api.put('/api/clinic-admin/settings', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.response?.data?.error ?? 'Could not save, try again'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Clinic settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Control when a parent/guardian or staff contact is notified by SMS</p>
      </div>

      <Card>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox" className="w-4 h-4 mt-0.5 accent-[#145C44] rounded"
              checked={form.sms_on_serious_only}
              onChange={e => setForm(p => ({ ...p, sms_on_serious_only: e.target.checked }))}
            />
            <span>
              <span className="text-sm font-medium text-slate-900 dark:text-white block">Notify on serious visits</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Send an SMS when a visit is marked serious severity, or closed with an outcome of referred to hospital or admitted in clinic</span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox" className="w-4 h-4 mt-0.5 accent-[#145C44] rounded"
              checked={form.sms_on_every_visit}
              onChange={e => setForm(p => ({ ...p, sms_on_every_visit: e.target.checked }))}
            />
            <span>
              <span className="text-sm font-medium text-slate-900 dark:text-white block">Notify on every visit</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Send an SMS for every closed visit, including minor ones</span>
            </span>
          </label>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            {saved && <span className="text-xs text-[#145C44] dark:text-[#2ab289]">Saved</span>}
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
