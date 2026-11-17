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
    </div>
  );
}
