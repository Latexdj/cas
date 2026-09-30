'use client';
import { useCallback, useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface Memo {
  id: string;
  ref_number: string | null;
  subject: string;
  audience_label: string;
  issued_date: string | null;
  issued_by_name: string;
  issued_by_title: string | null;
  pdf_url: string | null;
  created_at: string;
  read_at: string | null;
  body?: string;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TeacherMemosPage() {
  const [items,   setItems]   = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState<Memo | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await teacherApi.get<Memo[]>('/api/memos/mine');
      setItems(data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openMemo(m: Memo) {
    setOpen(m);
    if (!m.read_at) {
      try {
        const { data } = await teacherApi.patch<{ read_at: string }>(`/api/memos/${m.id}/read`, {});
        setItems(prev => prev.map(x => x.id === m.id ? { ...x, read_at: data.read_at } : x));
        setOpen(prev => prev && prev.id === m.id ? { ...prev, read_at: data.read_at } : prev);
      } catch { /* non-fatal — viewing still works even if the read receipt fails to save */ }
    }
    try {
      const { data } = await teacherApi.get<Memo>(`/api/memos/${m.id}`);
      setOpen(prev => prev && prev.id === m.id ? { ...prev, ...data } : prev);
    } catch { /* keep the list-row view */ }
  }

  const unread = items.filter(m => !m.read_at).length;

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#2C2218]">Memos</h1>
        <p className="text-xs text-[#8C7E6E] mt-0.5">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2D9CC] p-10 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: 'rgba(200,151,58,0.12)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#C8973A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-[#2C2218]">No memos yet</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Circulars addressed to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <button key={m.id} onClick={() => openMemo(m)} className="w-full text-left"
              style={{ display: 'block' }}>
              <div
                className="bg-white rounded-xl border p-4 transition-colors"
                style={{ borderColor: m.read_at ? '#E2D9CC' : '#C8973A', background: m.read_at ? 'white' : '#FFFBF0' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!m.read_at && <span className="w-2 h-2 rounded-full bg-[#C8973A] shrink-0" />}
                      <p className="text-sm font-bold text-[#2C2218] truncate">{m.subject}</p>
                    </div>
                    <p className="text-xs text-[#5C4F42]">To: {m.audience_label}</p>
                    <p className="text-xs text-[#8C7E6E] mt-1">
                      {m.ref_number ?? '—'} · {fmtDate(m.issued_date)} · from {m.issued_by_name}{m.issued_by_title ? `, ${m.issued_by_title}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#2C2218]">{open.subject}</h2>
              <button onClick={() => setOpen(null)} className="text-[#8C7E6E]">✕</button>
            </div>
            <div className="text-xs text-[#5C4F42] space-y-1 mb-4">
              <div><span className="font-semibold">Ref:</span> {open.ref_number ?? '—'}</div>
              <div><span className="font-semibold">To:</span> {open.audience_label}</div>
              <div><span className="font-semibold">From:</span> {open.issued_by_name}{open.issued_by_title ? `, ${open.issued_by_title}` : ''}</div>
              <div><span className="font-semibold">Date:</span> {fmtDate(open.issued_date)}</div>
            </div>
            {open.body && (
              <div className="bg-[#F4EFE6] border border-[#E2D9CC] rounded-lg p-3 text-sm text-[#2C2218] whitespace-pre-wrap leading-relaxed mb-4">
                {open.body}
              </div>
            )}
            <div className="flex gap-2">
              {open.pdf_url && (
                <a href={open.pdf_url} target="_blank" rel="noreferrer"
                  className="px-3 py-2 rounded-lg text-sm border border-[#E2D9CC] text-[#5C4F42]">View PDF</a>
              )}
              <button onClick={() => setOpen(null)} className="px-3 py-2 rounded-lg text-sm text-white" style={{ background: '#145C44' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
