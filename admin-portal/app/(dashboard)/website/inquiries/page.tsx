'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Submission {
  id: string; name: string; email: string; phone: string | null;
  message: string; is_read: boolean; created_at: string;
}

export default function WebsiteInquiriesPage() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/api/admin/website/contact');
    setSubmissions(data.submissions);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function open(s: Submission) {
    setOpenId(openId === s.id ? null : s.id);
    if (!s.is_read) {
      await api.patch(`/api/admin/website/contact/${s.id}`, { is_read: true });
      load();
    }
  }

  async function remove(id: string) {
    await api.delete(`/api/admin/website/contact/${id}`);
    load();
  }

  if (!submissions) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/website" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; Website</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Inquiries</h1>
        <p className="text-sm text-slate-400 mt-0.5">Messages sent through your public website&apos;s contact form.</p>
      </div>

      {submissions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-500">No messages yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(s => (
            <div key={s.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${s.is_read ? 'border-slate-100' : 'border-[#145C44]/30'}`}>
              <button onClick={() => open(s)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!s.is_read && <span className="w-2 h-2 rounded-full bg-[#145C44] flex-shrink-0" />}
                    <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-400 truncate">{s.email}</p>
                  </div>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{s.message}</p>
                </div>
                <p className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">{new Date(s.created_at).toLocaleDateString()}</p>
              </button>
              {openId === s.id && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.message}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="space-x-3">
                      <a href={`mailto:${s.email}`} className="font-semibold text-[#145C44] hover:underline">{s.email}</a>
                      {s.phone && <span>{s.phone}</span>}
                    </div>
                    <button onClick={() => remove(s.id)} className="font-semibold text-red-600 hover:underline">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
