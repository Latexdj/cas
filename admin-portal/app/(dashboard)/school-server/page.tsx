'use client';

// Connect this school's CAS School Server (the PC on the school network that
// serves tablets) to CAS, so it can run LMS tests offline and send results back.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import LmUploads from '@/components/school-server/LmUploads';

interface Server { id: string; name: string; last_seen_at: string | null; last_sync_summary: string | null; created_at: string }
// Addresses on the school network and a 5-minute sign-in pass, per server.
interface OpenLink { id: string; urls: string[]; ticket: string }
const hostOf = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}
function ago(iso: string | null) {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleString();
}

export default function SchoolServerPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [opens, setOpens] = useState<Record<string, OpenLink>>({});

  const load = useCallback(async () => {
    try { const { data } = await api.get<Server[]>('/api/school-server/servers'); setServers(data); setError(''); }
    catch (e) { setError(errMsg(e, 'Could not load the school servers.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Fresh passes every 4 minutes (each lasts 5).
  useEffect(() => {
    const get = () => api.get<{ servers: OpenLink[] }>('/api/school-server/admin-open')
      .then(r => setOpens(Object.fromEntries(r.data.servers.map(x => [x.id, x])))).catch(() => {});
    get();
    const t = setInterval(get, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // Refresh while a code is showing, so a newly connected server appears.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => { setNow(Date.now()); load(); }, 5000);
    return () => clearInterval(t);
  }, [code, load]);

  async function makeCode() {
    setBusy(true);
    try { const { data } = await api.post('/api/school-server/pairing-code'); setCode(data); }
    catch (e) { setError(errMsg(e, 'Could not make a pairing code.')); }
    finally { setBusy(false); }
  }
  async function disconnect(id: string) {
    try { await api.delete(`/api/school-server/servers/${id}`); setConfirmId(null); load(); }
    catch (e) { setError(errMsg(e, 'Could not disconnect the server.')); }
  }

  const secsLeft = code ? Math.max(0, Math.round((new Date(code.expires_at).getTime() - now) / 1000)) : 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-ink">School Server</h1>
        <p className="text-sm mt-0.5 text-ink-muted">
          The CAS School Server is a PC on your school network that serves tablets without internet. Connected to CAS, it lets teachers give LMS tests on the school Wi-Fi and sends the results here when it is online.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-[#E2D9CC] p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">Connect a school server</h2>
        <ol className="text-sm text-[#4A3F32] list-decimal pl-5 space-y-1">
          <li>On the server PC, open its page at <span className="font-mono">http://localhost:8787</span> and find Connect to CAS.</li>
          <li>Make a pairing code here and type it there, with your school code.</li>
        </ol>
        {code && secsLeft > 0 ? (
          <div className="rounded-lg bg-[#F4EFE6] p-4 flex flex-wrap items-center gap-4">
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-[#145C44]" aria-label={`Pairing code ${code.code.split('').join(' ')}`}>{code.code}</span>
            <span className="text-sm text-ink-muted">Valid for {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}. It works once.</span>
          </div>
        ) : (
          <button onClick={makeCode} disabled={busy}
            className="min-h-[44px] px-4 rounded-lg bg-[#145C44] hover:bg-[#0B3D2E] text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Making a code…' : code ? 'Make a new pairing code' : 'Make a pairing code'}
          </button>
        )}
      </section>

      <section className="bg-white rounded-xl border border-[#E2D9CC] p-5 space-y-3">
        <h2 className="text-base font-bold text-ink">Connected servers</h2>
        {loading ? <p className="text-sm text-ink-muted">Loading…</p>
          : error ? <p className="text-sm text-[#B83232]">{error}</p>
          : servers.length === 0 ? <p className="text-sm text-ink-muted">No school server is connected yet. Make a pairing code above to connect one.</p>
          : (
            <ul className="divide-y divide-[#E2D9CC]">
              {servers.map(s => (
                <li key={s.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="text-sm text-ink-muted">Last in touch {ago(s.last_seen_at)}{s.last_sync_summary ? `. ${s.last_sync_summary}` : ''}</p>
                    {(() => {
                      const o = opens[s.id];
                      if (!o) return null;
                      if (!o.urls.length) return <p className="text-sm text-ink-muted mt-2">Its school network address arrives with its next sync. Until then, open its settings on the server PC at <span className="font-mono">http://localhost:8787</span>.</p>;
                      const [main, ...others] = o.urls;
                      return (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={`${main}#ticket=${o.ticket}`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-[#145C44] hover:bg-[#0B3D2E] text-white text-sm font-semibold">
                              Open school server
                            </a>
                            {others.map(u => (
                              <a key={u} href={`${u}#ticket=${o.ticket}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center min-h-[44px] px-3 rounded-lg border border-[#E2D9CC] text-sm font-semibold text-[#145C44] font-mono">
                                {hostOf(u)}
                              </a>
                            ))}
                          </div>
                          <p className="text-xs text-ink-muted">
                            Opens its settings in a new tab, on a laptop or phone on the school Wi-Fi; the browser stays signed in there for 12 hours. Not opening? Try the other address. On the server PC itself, use <span className="font-mono">http://localhost:8787</span>.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  {confirmId === s.id ? (
                    <span className="flex items-center gap-2 text-sm text-[#4A3F32]">
                      Disconnect it? It stops syncing until connected again.
                      <button onClick={() => disconnect(s.id)} className="min-h-[40px] px-3 rounded-lg border border-[#B83232] text-[#B83232] font-semibold">Disconnect</button>
                      <button onClick={() => setConfirmId(null)} className="min-h-[40px] px-3 rounded-lg border border-[#E2D9CC] font-semibold">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(s.id)} className="min-h-[40px] px-3 rounded-lg border border-[#E2D9CC] text-sm font-semibold text-[#B83232]">Disconnect</button>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>

      <LmUploads />
    </div>
  );
}
