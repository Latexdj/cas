'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saApi } from '@/lib/super-admin-api';

// Publishes new CAS Teacher / CAS Student APKs. Phones update from here over
// the internet, and CAS School Servers copy them to the school Wi-Fi.

type AppKey = 'teacher' | 'student';
interface Release { id: string; versionCode: number; versionName: string | null; size: number; published_at: string; notes: string | null }
type Releases = Record<AppKey, { current: Release | null; history: Release[] }>;

const C = {
  card: '#132B1C', border: '#2A3D28', ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.6)',
  primary: '#C8973A', onPrimary: '#0E1A0C', good: '#7DD3A8', bad: '#F87171', track: 'rgba(255,255,255,0.12)',
};
const APPS: { key: AppKey; name: string; who: string }[] = [
  { key: 'teacher', name: 'CAS Teacher', who: "teachers' phones" },
  { key: 'student', name: 'CAS Student', who: 'student tablets' },
];
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const when = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const errText = (e: unknown, f: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

async function sha256(file: File) {
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function Publish({ app, onDone }: { app: (typeof APPS)[number]; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function publish() {
    if (!file) return;
    setMsg(null);
    let id: string | null = null;
    try {
      setProgress({ label: 'Checking the file…', value: 0 });
      const sum = await sha256(file);
      const { data } = await saApi.post<{ id: string; part_size: number; parts: number }>(`/api/app-releases/${app.key}/uploads`, { size: file.size, sha256: sum, notes });
      id = data.id;
      for (let n = 0; n < data.parts; n++) {
        setProgress({ label: `Uploading part ${n + 1} of ${data.parts}…`, value: n / data.parts });
        const part = file.slice(n * data.part_size, Math.min(file.size, (n + 1) * data.part_size));
        for (let attempt = 1; ; attempt++) {
          try {
            await saApi.put(`/api/app-releases/uploads/${id}/parts/${n}`, part, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 120000 });
            break;
          } catch (e) { if (attempt >= 3) throw e; await new Promise(r => setTimeout(r, 2000)); }
        }
      }
      setProgress({ label: 'Checking the app and publishing…', value: 1 });
      const { data: rel } = await saApi.post<Release>(`/api/app-releases/uploads/${id}/finish`, {}, { timeout: 300000 });
      setMsg({ text: `${app.name} ${rel.versionName ?? ''} (build ${rel.versionCode}) is live. ${app.who[0].toUpperCase()}${app.who.slice(1)} will offer the update.`, ok: true });
      setFile(null); setNotes(''); onDone();
    } catch (e) {
      if (id) saApi.delete(`/api/app-releases/uploads/${id}`).catch(() => {});
      setMsg({ text: errText(e, 'The upload stopped. Check your connection and try again.'), ok: false });
    } finally { setProgress(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input ref={input} type="file" accept=".apk,application/vnd.android.package-archive" hidden
        onChange={e => { setFile(e.target.files?.[0] ?? null); setMsg(null); e.target.value = ''; }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => input.current?.click()} disabled={!!progress}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink, fontWeight: 600, cursor: 'pointer' }}>
          {file ? 'Choose another file' : `Choose the ${app.name} .apk`}
        </button>
        {file && <span style={{ color: C.ink2, fontSize: 14 }}>{file.name}, {mb(file.size)}</span>}
      </div>
      {file && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: C.muted }}>
            What changed (optional, for your records)
            <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}
              style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#0B1A0E', color: C.ink, padding: '0 12px', fontSize: 15 }} />
          </label>
          <button type="button" onClick={publish} disabled={!!progress}
            style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 20px', borderRadius: 10, border: 'none', background: C.primary, color: C.onPrimary, fontWeight: 700, cursor: progress ? 'default' : 'pointer', opacity: progress ? 0.6 : 1 }}>
            Publish this version
          </button>
        </>
      )}
      {progress && (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 6, borderRadius: 3, background: C.track, overflow: 'hidden' }}>
            <div style={{ height: 6, width: `${Math.round(progress.value * 100)}%`, background: C.primary }} />
          </div>
          <span style={{ fontSize: 13, color: C.muted }}>{progress.label}</span>
        </div>
      )}
      {msg && <p role="status" style={{ margin: 0, fontSize: 14, color: msg.ok ? C.good : C.bad }}>{msg.text}</p>}
    </div>
  );
}

// The CAS School Server program: each school's server downloads a newer
// version when it syncs and installs it outside school hours.
interface ServerRelease { id: string; version: string; notes: string | null; size: number; status: string; published_at: string }
interface ServerRow { name: string; school: string; version: string | null; last_seen_at: string | null }
function ServerSection() {
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<{ releases: ServerRelease[]; latest: string | null; servers: ServerRow[] } | null>(null);
  const [bundle, setBundle] = useState<{ version: string; files: Record<string, string>; built_at?: string } | null>(null);
  const [fileName, setFileName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const load = useCallback(() => {
    saApi.get('/api/server-releases').then(r => setData(r.data)).catch(e => setMsg({ text: errText(e, 'Could not load the server versions.'), ok: false }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pick(f: File) {
    setMsg(null); setFileName(f.name);
    try {
      const b = JSON.parse(await f.text());
      if (!b?.version || !b?.files) throw new Error('x');
      setBundle(b);
    } catch { setBundle(null); setMsg({ text: 'That is not a CAS School Server update file (cas-school-server-<version>.json).', ok: false }); }
  }
  async function publish() {
    if (!bundle) return;
    setBusy(true); setMsg(null);
    try {
      await saApi.post('/api/server-releases', { bundle, notes }, { timeout: 120000 });
      setMsg({ text: `Version ${bundle.version} published. School servers install it outside school hours after their next sync.`, ok: true });
      setBundle(null); setNotes(''); setFileName(''); load();
    } catch (e) { setMsg({ text: errText(e, 'It could not be published.'), ok: false }); }
    setBusy(false);
  }
  async function withdraw(id: string) {
    try { await saApi.delete(`/api/server-releases/${id}`); setConfirmId(null); load(); }
    catch (e) { setMsg({ text: errText(e, 'It could not be withdrawn.'), ok: false }); }
  }
  const current = data?.releases.find(r => r.status === 'live' && r.version === data.latest);
  const behind = (s: ServerRow) => !!(s.version && data?.latest && s.version !== data.latest);
  return (
    <section aria-labelledby="h-server" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 id="h-server" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>CAS School Server</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: C.ink2 }}>
          {!data ? 'Loading…' : current ? <>Latest: version {current.version}, published {when(current.published_at)}.</> : 'No server version published yet.'}
        </p>
        {current?.notes && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{current.notes}</p>}
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>
          Each school&apos;s server downloads a newer version when it syncs and installs it outside school hours, when no test is underway. If it will not start, the server goes back to its previous version by itself.
        </p>
      </div>
      {!!data?.servers.length && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr>{['School', 'Server', 'Version', 'Last in touch'].map(h => <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 600, padding: '6px 8px' }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.servers.map((s, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', color: C.ink }}>{s.school}</td>
                  <td style={{ padding: '6px 8px', color: C.ink2 }}>{s.name}</td>
                  <td style={{ padding: '6px 8px', color: behind(s) ? C.primary : C.ink2 }}>
                    {s.version ?? 'not reported yet'}{behind(s) ? ', update waiting' : ''}
                  </td>
                  <td style={{ padding: '6px 8px', color: C.muted }}>{s.last_seen_at ? when(s.last_seen_at) : 'never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <input ref={input} type="file" accept=".json,application/json" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink, fontWeight: 600, cursor: 'pointer' }}>
          {bundle ? 'Choose another file' : 'Choose the server update file'}
        </button>
        {fileName && <span style={{ color: C.ink2, fontSize: 14 }}>{fileName}{bundle ? `, version ${bundle.version}, ${Object.keys(bundle.files).length} files` : ''}</span>}
      </div>
      {bundle && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: C.muted }}>
            What changed (shown on each server&apos;s Settings page)
            <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}
              style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#0B1A0E', color: C.ink, padding: '0 12px', fontSize: 15 }} />
          </label>
          <button type="button" onClick={publish} disabled={busy}
            style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 20px', borderRadius: 10, border: 'none', background: C.primary, color: C.onPrimary, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Publishing…' : `Publish version ${bundle.version}`}
          </button>
        </>
      )}
      {msg && <p role="status" style={{ margin: 0, fontSize: 14, color: msg.ok ? C.good : C.bad }}>{msg.text}</p>}
      {current && (confirmId === current.id ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14, color: C.ink2 }}>
          Withdraw version {current.version}? Servers that have not installed it yet will not get it.
          <button type="button" onClick={() => withdraw(current.id)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.bad}`, background: 'transparent', color: C.bad, fontWeight: 600 }}>Withdraw</button>
          <button type="button" onClick={() => setConfirmId(null)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink, fontWeight: 600 }}>Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmId(current.id)}
          style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.bad, fontWeight: 600, cursor: 'pointer' }}>
          Withdraw version {current.version}
        </button>
      ))}
    </section>
  );
}

export default function AppReleasesPage() {
  const [data, setData] = useState<Releases | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    saApi.get<Releases>('/api/app-releases').then(r => setData(r.data)).catch(e => setErr(errText(e, 'Could not load the releases.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.ink }}>App Releases</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: C.muted, maxWidth: 680 }}>
          Publish a new version of the phone apps. Phones with internet see &quot;A newer app is ready&quot; and install it, and every CAS School
          Server copies it to its school Wi-Fi the next time it is online. Raise the app&apos;s versionCode for every build.
        </p>
      </div>
      {err && <p style={{ color: C.bad, margin: 0 }}>{err}</p>}
      {APPS.map(app => {
        const r = data?.[app.key];
        return (
          <section key={app.key} aria-labelledby={`h-${app.key}`}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 id={`h-${app.key}`} style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>{app.name}</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: C.ink2 }}>
                {!data ? 'Loading…' : r?.current
                  ? <>Live: version {r.current.versionName ?? r.current.versionCode} (build {r.current.versionCode}), {mb(r.current.size)}, published {when(r.current.published_at)}.</>
                  : 'No version published yet.'}
              </p>
              {r?.current?.notes && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{r.current.notes}</p>}
              {!!r?.history.length && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>
                  Earlier: {r.history.map(h => `build ${h.versionCode}`).join(', ')}.
                </p>
              )}
            </div>
            <Publish app={app} onDone={load} />
          </section>
        );
      })}
      <ServerSection />
    </div>
  );
}
