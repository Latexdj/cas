'use client';

import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

const inputCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#145C44]';
const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden';

interface Letter {
  id: string; ref_number: string | null; subject: string; status: string; issued_date: string | null;
  ext_recipient_name: string | null; ext_recipient_title: string | null; created_at: string; pdf_url: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  issued: 'Issued', pending_approval: 'Pending Approval', draft: 'Draft',
};
const STATUS_BADGE: Record<string, string> = {
  issued: 'bg-[#D1EAD9] dark:bg-green-900/30 text-[#145C44] dark:text-[#2ab289]',
  pending_approval: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  draft: 'bg-slate-100 dark:bg-slate-700 text-slate-500',
};

const emptyForm = {
  ext_recipient_name: '', ext_recipient_title: '', ext_recipient_org: '', ext_recipient_address: '',
  subject: '', body: '', issued_date: new Date().toISOString().slice(0, 10),
};

export function LettersSection({ api, primary }: { api: AxiosInstance; primary: string }) {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.get<Letter[]>('/api/general-letters').then(r => setLetters(r.data)).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!form.ext_recipient_name.trim() && !form.ext_recipient_title.trim()) {
      setError('Provide a parent/guardian name or a title (e.g. "The Guardian of …").'); return;
    }
    if (!form.subject.trim()) { setError('Subject is required.'); return; }
    if (!form.body.trim()) { setError('Letter body is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/general-letters', {
        classification: 'parent_communication',
        recipient_type: 'parent',
        ...form,
      });
      setComposing(false); setForm(emptyForm); load();
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to send letter.'); }
    finally { setSaving(false); }
  }

  async function downloadPdf(id: string) {
    setPdfBusy(id);
    try {
      const r = await api.post<{ pdf_url: string }>(`/api/general-letters/${id}/pdf`);
      window.open(r.data.pdf_url, '_blank');
    } catch (e: any) { alert(e?.response?.data?.error ?? 'Failed to generate PDF.'); }
    finally { setPdfBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Parent / Guardian Correspondence</h2>
        <p className="text-xs text-slate-400 mt-0.5">Fee reminders and other letters to parents or guardians. Only your own letters are shown here.</p>
      </div>

      <button onClick={() => { setComposing(true); setError(''); }} className="py-2.5 px-4 rounded-xl text-sm font-semibold text-white" style={{ background: primary }}>+ New Letter</button>

      {composing && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Parent/Guardian name" value={form.ext_recipient_name} onChange={e => setForm(f => ({ ...f, ext_recipient_name: e.target.value }))} />
            <input className={inputCls} placeholder='Title (e.g. "The Guardian of …")' value={form.ext_recipient_title} onChange={e => setForm(f => ({ ...f, ext_recipient_title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Organization (optional)" value={form.ext_recipient_org} onChange={e => setForm(f => ({ ...f, ext_recipient_org: e.target.value }))} />
            <input className={inputCls} placeholder="Address (optional)" value={form.ext_recipient_address} onChange={e => setForm(f => ({ ...f, ext_recipient_address: e.target.value }))} />
          </div>
          <input className={inputCls} placeholder="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
          <textarea rows={6} className={inputCls} placeholder="Letter body…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-1">Issue Date</label>
            <input type="date" className={inputCls} value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setComposing(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>{saving ? 'Sending…' : 'Send Letter'}</button>
          </div>
        </div>
      )}

      <div className={cardCls}>
        {loading ? <p className="p-5 text-center text-slate-400 text-sm">Loading…</p> : letters.length === 0 ? (
          <p className="p-5 text-center text-slate-400 text-sm">No letters sent yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {letters.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{l.subject}</p>
                  <p className="text-xs text-slate-400">
                    {l.ext_recipient_name || l.ext_recipient_title}{l.ref_number ? ` · ${l.ref_number}` : ''}
                    {l.issued_date ? ` · ${l.issued_date.slice(0, 10)}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[l.status] ?? 'bg-slate-100 text-slate-500'}`}>
                  {STATUS_LABEL[l.status] ?? l.status}
                </span>
                {l.status === 'issued' && (
                  <button onClick={() => downloadPdf(l.id)} disabled={pdfBusy === l.id}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0 disabled:opacity-50">
                    {pdfBusy === l.id ? '…' : 'PDF'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
