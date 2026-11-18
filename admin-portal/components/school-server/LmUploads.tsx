'use client';

// Send learning materials to the school server from anywhere with internet.
// The admin picks one of the server's LM folders (reported at each sync),
// uploads files in 8 MB parts, and the server fetches them at its next sync;
// tablets then get them over the school Wi-Fi.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

interface Upload {
  id: string; folder: string; file_name: string; size: number;
  status: 'uploading' | 'ready' | 'delivered' | 'failed'; error: string | null;
  created_at: string; delivered_at: string | null; created_by_name: string | null;
}
interface Data { server: { name: string; last_seen_at: string | null } | null; folders: string[]; uploads: Upload[] }

const NEW = '__new';
const fmt = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const safePart = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
const errMsg = (e: unknown, f: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function LmUploads() {
  const [data, setData] = useState<Data | null>(null);
  const [parts, setParts] = useState<string[]>([]);          // chosen folder, level by level
  const [newName, setNewName] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Data>('/api/lm-uploads').then(r => setData(r.data)).catch(e => setMsg({ text: errMsg(e, 'Could not load the learning materials.'), tone: 'bad' }));
  }, []);
  useEffect(() => { load(); }, [load]);
  // While files wait for the server, check now and then for delivery.
  useEffect(() => {
    if (!data?.uploads.some(u => u.status === 'ready')) return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [data, load]);

  // Folder tree from the reported paths: parent path -> child names.
  const children = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const f of data?.folders ?? []) {
      const segs = f.split('/');
      segs.forEach((s, i) => {
        const parent = segs.slice(0, i).join('/');
        if (!m.has(parent)) m.set(parent, new Set());
        m.get(parent)!.add(s);
      });
    }
    return m;
  }, [data]);
  const kids = (parent: string) => [...(children.get(parent) ?? [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const chosen = parts.map((p, i) => (p === NEW ? safePart(newName[i] ?? '') : p));
  const folder = chosen.every(Boolean) ? chosen.join('/') : '';

  function pick(level: number, value: string) {
    const next = parts.slice(0, level);
    if (value) next.push(value);
    setParts(next);
  }

  async function upload(files: File[]) {
    if (!folder) return setMsg({ text: 'Choose the folder first (and name any new folder).', tone: 'bad' });
    setBusy(true);
    let ok = 0;
    for (const [i, f] of files.entries()) {
      try {
        const { data: start } = await api.post<{ id: string; parts: number; part_size: number }>('/api/lm-uploads', { folder, file_name: f.name, size: f.size });
        for (let n = 0; n < start.parts; n++) {
          const blob = f.slice(n * start.part_size, Math.min(f.size, (n + 1) * start.part_size));
          setMsg({ text: `Uploading ${i + 1} of ${files.length}: ${f.name}, ${Math.round((n / start.parts) * 100)}%…`, tone: 'info' });
          let tries = 0;
          for (;;) {
            try { await api.put(`/api/lm-uploads/${start.id}/parts/${n}`, blob, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 180000 }); break; }
            catch (e) { if (++tries >= 3) throw e; await new Promise(r => setTimeout(r, 2000 * tries)); }
          }
        }
        await api.post(`/api/lm-uploads/${start.id}/finish`);
        ok++;
      } catch (e) {
        setMsg({ text: `${f.name}: ${errMsg(e, 'The upload stopped. Check your connection and try again.')}`, tone: 'bad' });
        setBusy(false); load(); return;
      }
    }
    setBusy(false);
    setMsg({ text: `Sent ${ok} file${ok === 1 ? '' : 's'}. The school server fetches ${ok === 1 ? 'it' : 'them'} at its next sync (every 10 minutes when it has internet); tablets get ${ok === 1 ? 'it' : 'them'} on the school Wi-Fi after that.`, tone: 'ok' });
    load();
  }

  async function remove(id: string) {
    try { await api.delete(`/api/lm-uploads/${id}`); setMsg(null); }
    catch (e) { setMsg({ text: errMsg(e, 'Could not remove it.'), tone: 'bad' }); }
    setConfirmId(null); load();
  }

  const tone = msg?.tone === 'ok' ? 'bg-[#E8F4EE] text-[#145C44]' : msg?.tone === 'bad' ? 'bg-[#FBEAEA] text-[#9B2C2C]' : 'bg-[#FBF3E4] text-[#8A5A12]';
  const selectCls = 'w-full sm:w-auto max-w-full min-h-[44px] rounded-lg border border-[#E2D9CC] bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[#145C44]';

  return (
    <section className="bg-white rounded-xl border border-[#E2D9CC] p-5 space-y-3">
      <div>
        <h2 className="text-base font-bold text-ink">Learning materials</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          Send files to the school server from anywhere. It fetches them at its next sync and every tablet on the school Wi-Fi gets them.
        </p>
      </div>
      {msg && <p role={msg.tone === 'bad' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${tone}`}>{msg.text}</p>}

      {!data ? <p className="text-sm text-ink-muted">Loading…</p> : !data.server ? (
        <p className="text-sm text-ink-muted">Connect a school server above first.</p>
      ) : data.folders.length === 0 ? (
        <p className="text-sm text-ink-muted">The school server has not reported its LM folders yet. They arrive with its next sync, once its learning materials are set up.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {Array.from({ length: parts.length + 1 }).map((_, i) => {
              const parent = chosen.slice(0, i).join('/');
              const opts = parts[i - 1] === NEW ? [] : kids(parent);
              if (i > 0 && !opts.length && parts[i] === undefined) {
                return (
                  <label key={i} className="grid gap-1 w-full sm:w-auto max-w-full min-w-0 text-xs font-semibold text-ink-muted">Level {i + 1}
                    <select className={selectCls} value="" onChange={e => pick(i, e.target.value)}>
                      <option value="">Put it here</option><option value={NEW}>New folder…</option>
                    </select>
                  </label>
                );
              }
              return (
                <span key={i} className="flex flex-wrap items-end gap-2 w-full sm:w-auto max-w-full min-w-0">
                  <label className="grid gap-1 w-full sm:w-auto max-w-full min-w-0 text-xs font-semibold text-ink-muted">{i === 0 ? 'Folder' : `Level ${i + 1}`}
                    <select className={selectCls} value={parts[i] ?? ''} onChange={e => pick(i, e.target.value)}>
                      <option value="">{i === 0 ? 'Choose…' : 'Put it here'}</option>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      <option value={NEW}>New folder…</option>
                    </select>
                  </label>
                  {parts[i] === NEW && (
                    <label className="grid gap-1 w-full sm:w-auto max-w-full min-w-0 text-xs font-semibold text-ink-muted">New folder name
                      <input className={selectCls} value={newName[i] ?? ''} onChange={e => setNewName(n => ({ ...n, [i]: e.target.value }))} />
                    </label>
                  )}
                </span>
              );
            })}
          </div>
          <p className="text-sm text-[#4A3F32]">Goes into <span className="font-mono font-semibold text-ink break-words">{folder ? `LM / ${folder.split('/').join(' / ')}` : 'choose a folder'}</span></p>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex items-center min-h-[44px] px-4 rounded-lg text-sm font-semibold text-white ${busy || !folder ? 'bg-[#8C7E6E]' : 'bg-[#145C44] hover:bg-[#0B3D2E] cursor-pointer'}`}>
              {busy ? 'Uploading…' : 'Choose files to send'}
              <input type="file" multiple hidden disabled={busy || !folder} onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) upload(f); }} />
            </label>
            <span className="text-xs text-ink-muted">Up to 2 GB each. A file with the same name in that folder is replaced.</span>
          </div>
        </div>
      )}

      {!!data?.uploads.length && (
        <ul className="divide-y divide-[#E2D9CC]">
          {data.uploads.map(u => (
            <li key={u.id} className="py-2.5 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink break-words">{u.file_name} <span className="font-normal text-ink-muted">({fmt(u.size)})</span></p>
                <p className="text-xs text-ink-muted break-words">LM / {u.folder.split('/').join(' / ')}</p>
                <p className={`text-xs mt-0.5 ${u.status === 'failed' ? 'text-[#9B2C2C]' : u.status === 'delivered' ? 'text-[#145C44]' : 'text-[#8A5A12]'}`}>
                  {u.status === 'delivered' ? `On the school server since ${when(u.delivered_at!)}`
                    : u.status === 'ready' ? 'Waiting for the school server to fetch it'
                    : u.status === 'failed' ? `Not saved: ${u.error}`
                    : 'Upload not finished'}
                </p>
              </div>
              {u.status !== 'delivered' && (confirmId === u.id ? (
                <span className="flex items-center gap-2 text-sm">
                  <button onClick={() => remove(u.id)} className="min-h-[40px] px-3 rounded-lg border border-[#B83232] text-[#B83232] font-semibold">Remove</button>
                  <button onClick={() => setConfirmId(null)} className="min-h-[40px] px-3 rounded-lg border border-[#E2D9CC] font-semibold">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmId(u.id)} className="min-h-[40px] px-3 rounded-lg border border-[#E2D9CC] text-sm font-semibold text-[#B83232]">Remove</button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
