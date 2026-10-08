'use client';
import { useCallback, useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface Letter {
  id: string;
  ref_number: string | null;
  subject: string;
  issued_date: string | null;
  issued_by_name: string;
  issued_by_title: string | null;
  classification: string;
  requires_acceptance: boolean;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  pdf_url: string | null;
  created_at: string;
  body?: string;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(l: Letter): { label: string; color: string; bg: string } | null {
  if (!l.requires_acceptance) return null;
  if (l.accepted_at) return { label: 'Accepted', color: '#1C8A62', bg: '#E8F4EE' };
  if (l.declined_at) return { label: 'Declined', color: '#B83232', bg: '#FEF2F2' };
  return { label: 'Awaiting your response', color: '#C8780A', bg: '#FFFBEB' };
}

export default function TeacherLettersPage() {
  const [items,   setItems]   = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState<Letter | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await teacherApi.get<Letter[]>('/api/general-letters/mine');
      setItems(data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openLetter(l: Letter) {
    setOpen(l);
    setDeclining(false);
    setDeclineReason('');
    setActionError('');
    try {
      const { data } = await teacherApi.get<Letter>(`/api/general-letters/${l.id}`);
      setOpen(prev => prev && prev.id === l.id ? { ...prev, ...data } : prev);
    } catch { /* keep the list-row view */ }
  }

  async function accept() {
    if (!open) return;
    setActing(true); setActionError('');
    try {
      const { data } = await teacherApi.post<{ accepted_at: string }>(`/api/general-letters/${open.id}/accept`, {});
      setItems(prev => prev.map(x => x.id === open.id ? { ...x, accepted_at: data.accepted_at } : x));
      setOpen(prev => prev && prev.id === open.id ? { ...prev, accepted_at: data.accepted_at } : prev);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err.response?.data?.error ?? 'Failed to accept this letter.');
    } finally { setActing(false); }
  }

  async function decline() {
    if (!open || !declineReason.trim()) return;
    setActing(true); setActionError('');
    try {
      const { data } = await teacherApi.post<{ declined_at: string; decline_reason: string }>(
        `/api/general-letters/${open.id}/decline`, { reason: declineReason.trim() }
      );
      setItems(prev => prev.map(x => x.id === open.id ? { ...x, declined_at: data.declined_at, decline_reason: data.decline_reason } : x));
      setOpen(prev => prev && prev.id === open.id ? { ...prev, declined_at: data.declined_at, decline_reason: data.decline_reason } : prev);
      setDeclining(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err.response?.data?.error ?? 'Failed to decline this letter.');
    } finally { setActing(false); }
  }

  const awaitingCount = items.filter(l => l.requires_acceptance && !l.accepted_at && !l.declined_at).length;

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#2C2218]">My Letters</h1>
        <p className="text-xs text-[#8C7E6E] mt-0.5">
          {awaitingCount > 0 ? `${awaitingCount} awaiting your response` : 'All caught up'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-[#E2D9CC]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2D9CC] p-10 text-center">
          <p className="text-sm font-semibold text-[#2C2218]">No letters yet</p>
          <p className="text-xs text-[#8C7E6E] mt-1">Letters addressed to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(l => {
            const status = statusLabel(l);
            return (
              <button key={l.id} onClick={() => openLetter(l)} className="w-full text-left" style={{ display: 'block', minWidth: 0 }}>
                <div
                  className="bg-white rounded-xl border p-4 transition-colors"
                  style={{
                    minWidth: 0,
                    borderColor: status && !l.accepted_at && !l.declined_at ? '#C8780A' : '#E2D9CC',
                    background: status && !l.accepted_at && !l.declined_at ? '#FFFBF0' : 'white',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="text-sm font-bold text-[#2C2218]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subject}</p>
                      <p className="text-xs text-[#8C7E6E] mt-1">
                        {l.ref_number ?? '—'} · {fmtDate(l.issued_date)} · from {l.issued_by_name}{l.issued_by_title ? `, ${l.issued_by_title}` : ''}
                      </p>
                    </div>
                    {status && (
                      <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ color: status.color, background: status.bg, flexShrink: 0 }}>
                        {status.label}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
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
              <div><span className="font-semibold">From:</span> {open.issued_by_name}{open.issued_by_title ? `, ${open.issued_by_title}` : ''}</div>
              <div><span className="font-semibold">Date:</span> {fmtDate(open.issued_date)}</div>
            </div>
            {open.body && (
              <div className="bg-[#F4EFE6] border border-[#E2D9CC] rounded-lg p-3 text-sm text-[#2C2218] leading-relaxed mb-4"
                dangerouslySetInnerHTML={{ __html: open.body }} />
            )}

            {open.requires_acceptance && (
              <div className="mb-4">
                {open.accepted_at ? (
                  <p className="text-sm font-semibold" style={{ color: '#1C8A62' }}>You accepted this letter on {fmtDate(open.accepted_at)}.</p>
                ) : open.declined_at ? (
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#B83232' }}>You declined this letter on {fmtDate(open.declined_at)}.</p>
                    {open.decline_reason && <p className="text-xs text-[#5C4F42] mt-1">&quot;{open.decline_reason}&quot;</p>}
                  </div>
                ) : declining ? (
                  <div>
                    <label className="text-xs font-semibold text-[#5C4F42] block mb-1">Reason for declining</label>
                    <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={3}
                      className="w-full border rounded-lg p-2 text-sm" style={{ borderColor: '#E2D9CC' }} />
                    {actionError && <p className="text-xs mt-1" style={{ color: '#B83232' }}>{actionError}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={decline} disabled={acting || !declineReason.trim()}
                        className="px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: '#B83232' }}>
                        {acting ? 'Submitting…' : 'Submit Decline'}
                      </button>
                      <button onClick={() => { setDeclining(false); setDeclineReason(''); }} className="px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#E2D9CC', color: '#5C4F42' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {actionError && <p className="text-xs mb-2" style={{ color: '#B83232' }}>{actionError}</p>}
                    <div className="flex gap-2">
                      <button onClick={accept} disabled={acting}
                        className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#145C44' }}>
                        {acting ? 'Submitting…' : 'Accept'}
                      </button>
                      <button onClick={() => setDeclining(true)} disabled={acting}
                        className="px-3 py-2 rounded-lg text-sm font-semibold border disabled:opacity-50" style={{ borderColor: '#B83232', color: '#B83232' }}>
                        Decline
                      </button>
                    </div>
                  </div>
                )}
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
