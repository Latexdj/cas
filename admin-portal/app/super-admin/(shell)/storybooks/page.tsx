'use client';

// Storybooks: picture books added here appear in every student app next to
// the African Storybook stories built into the app. Phones download them
// online; tablets get them through the school server.

import { useEffect, useRef, useState } from 'react';
import { saApi } from '@/lib/super-admin-api';

const P = {
  card: '#132B1C', border: '#2A3D28', sunken: '#0E1A0C', inputBg: '#0B1A0E',
  ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.6)',
  primary: '#C8973A', onPrimary: '#0E1A0C',
  good: '#7DD3A8', goodBg: 'rgba(125,211,168,0.14)', warn: '#E2C07A', warnBg: 'rgba(200,151,58,0.15)', bad: '#F87171',
};

// 1-4 follow the African Storybook (the built-in stories); 5-10 go up to SHS.
const LEVELS = [
  { level: 1, label: 'Level 1: First words (KG to P1)', hint: 'up to about 12 words a page' },
  { level: 2, label: 'Level 2: First sentences (P1 to P2)', hint: 'up to about 30 words a page' },
  { level: 3, label: 'Level 3: First paragraphs (P2 to P3)', hint: 'up to about 55 words a page' },
  { level: 4, label: 'Level 4: Longer stories (P3 to P4)', hint: 'more than 55 words a page' },
  { level: 5, label: 'Level 5: Chapter stories (P5 to P6)', hint: 'short chapters, a few paragraphs a page' },
  { level: 6, label: 'Level 6: JHS 1', hint: 'short stories and fables for JHS' },
  { level: 7, label: 'Level 7: JHS 2 and 3', hint: 'longer stories for JHS' },
  { level: 8, label: 'Level 8: SHS 1', hint: 'short stories and novellas for SHS' },
  { level: 9, label: 'Level 9: SHS 2', hint: 'longer fiction for SHS' },
  { level: 10, label: 'Level 10: SHS 3 and beyond', hint: 'literature-length reading' },
];
const MAX_PAGES = 80;
const LICENCES = [
  { key: 'Own work', label: 'Own work, with permission' },
  { key: 'CC BY 4.0', label: 'Creative Commons CC BY 4.0' },
  { key: 'CC BY 3.0', label: 'Creative Commons CC BY 3.0' },
];

interface Page { text: string; image: string | null }
interface Story {
  id: string; title: string; author: string; illustrator: string; licence: string; level: number;
  status: 'draft' | 'published'; cover: string | null; pages: Page[]; updated_at: string; published_at: string | null;
}

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}
const input: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '8px 12px', borderRadius: 10, fontSize: 14,
  background: P.inputBg, color: P.ink, border: `1px solid ${P.border}`, boxSizing: 'border-box',
};
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: P.ink2, marginBottom: 6 };
function btn(kind: 'primary' | 'quiet' | 'danger' = 'quiet', disabled = false): React.CSSProperties {
  return {
    minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    background: kind === 'primary' ? P.primary : 'transparent',
    color: kind === 'primary' ? P.onPrimary : kind === 'danger' ? P.bad : P.ink,
    border: kind === 'primary' ? 'none' : `1px solid ${kind === 'danger' ? 'rgba(248,113,113,0.5)' : P.border}`,
  };
}
const chip = (fg: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: fg, background: bg,
});
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Pictures are shrunk in the browser (longest side 1024 px, JPEG) so a
// story stays light for tablets on slow Wi-Fi.
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);   // transparent PNGs get a white page
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export default function StorybooksPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <StoryEditor id={openId} onBack={() => setOpenId(null)} /> : <StoryList onOpen={setOpenId} />;
}

// ── List ──────────────────────────────────────────────────────────────────────

function StoryList({ onOpen }: { onOpen: (id: string) => void }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    saApi.get<Story[]>('/api/storybooks/admin')
      .then(r => setStories(r.data))
      .catch(e => setError(errMsg(e, 'Could not load the stories.')))
      .finally(() => setLoading(false));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setFormErr(''); setSaving(true);
    try {
      const { data } = await saApi.post<Story>('/api/storybooks/admin', { title });
      onOpen(data.id);
    } catch (err) { setFormErr(errMsg(err, 'Could not add the story.')); }
    finally { setSaving(false); }
  }

  const published = stories.filter(s => s.status === 'published').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.ink }}>Storybooks</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: P.muted, maxWidth: 720, lineHeight: 1.5 }}>
            Stories published here appear in every student app, next to the 283 African Storybook stories built into the app.
            Phones get them online; tablets get them through the school server.
          </p>
        </div>
        <button style={btn('primary')} onClick={() => { setAdding(a => !a); setFormErr(''); }}>{adding ? 'Close' : 'Add story'}</button>
      </div>

      {adding && (
        <form onSubmit={create} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px' }}>
            <label style={label} htmlFor="sb-title">Title</label>
            <input id="sb-title" style={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Kofi and the Talking Drum" autoFocus />
          </div>
          <button type="submit" style={btn('primary', saving || !title.trim())} disabled={saving || !title.trim()}>{saving ? 'Adding…' : 'Add and open'}</button>
          {formErr && <span role="alert" style={{ fontSize: 13, color: P.bad }}>{formErr}</span>}
        </form>
      )}

      {loading ? <p style={{ color: P.muted }}>Loading…</p>
        : error ? <p style={{ color: P.bad }}>{error}</p>
        : stories.length === 0 ? (
          <p style={{ color: P.muted, fontSize: 14 }}>No stories added yet. Add a story, write its pages and give each a picture, then publish it.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, color: P.ink2 }}>{published} published, {stories.length - published} draft{stories.length - published === 1 ? '' : 's'}.</p>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {stories.map(s => (
                <button key={s.id} onClick={() => onOpen(s.id)}
                  style={{ textAlign: 'left', background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 0, overflow: 'hidden', cursor: 'pointer', color: P.ink }}>
                  <div style={{ aspectRatio: '4 / 3', background: P.sunken, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.cover
                      ? <img src={s.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 13, color: P.muted }}>No cover yet</span>}
                  </div>
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <strong style={{ fontSize: 15 }}>{s.title}</strong>
                    <span style={{ fontSize: 13, color: P.muted }}>Level {s.level}, {s.pages.length} page{s.pages.length === 1 ? '' : 's'}{s.author ? `, by ${s.author}` : ''}</span>
                    <span style={s.status === 'published' ? chip(P.good, P.goodBg) : chip(P.warn, P.warnBg)}>{s.status === 'published' ? 'Published' : 'Draft'}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

function StoryEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // what is saving: 'save', 'pic-0', ...
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    saApi.get<Story>(`/api/storybooks/admin/${id}`).then(r => setStory(r.data)).catch(e => setError(errMsg(e, 'Could not load the story.')));
  }, [id]);

  const edit = (patch: Partial<Story>) => { setStory(s => (s ? { ...s, ...patch } : s)); setDirty(true); setNote(null); };
  const editPage = (i: number, patch: Partial<Page>) => story && edit({ pages: story.pages.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const movePage = (i: number, by: number) => {
    if (!story) return;
    const pages = [...story.pages]; const [p] = pages.splice(i, 1); pages.splice(i + by, 0, p);
    edit({ pages });
  };

  async function save(status?: 'draft' | 'published'): Promise<Story | null> {
    if (!story) return null;
    setBusy('save'); setNote(null);
    try {
      const { data } = await saApi.put<Story>(`/api/storybooks/admin/${id}`, {
        title: story.title, author: story.author, illustrator: story.illustrator, licence: story.licence, level: story.level,
        pages: story.pages, status: status ?? story.status,
      });
      setStory(data); setDirty(false);
      setNote({ ok: true, text: status === 'published' ? 'Published. Phones get it next time Storybooks opens online; tablets after the school server syncs.' : status === 'draft' ? 'Unpublished. It stays here as a draft and leaves the apps when they next update.' : 'Saved.' });
      return data;
    } catch (e) { setNote({ ok: false, text: errMsg(e, 'Could not save the story.') }); return null; }
    finally { setBusy(null); }
  }

  async function setPicture(slot: number, file: File | null) {
    // Unsaved page edits go first, so the page exists and nothing typed is lost.
    if (dirty && !(await save())) return;
    setBusy(`pic-${slot}`); setNote(null);
    try {
      const image = file ? await shrink(file) : null;
      const { data } = await saApi.post<Story>(`/api/storybooks/admin/${id}/picture/${slot}`, { image });
      setStory(data);
    } catch (e) { setNote({ ok: false, text: errMsg(e, 'Could not save that picture. Try a JPG or PNG.') }); }
    finally { setBusy(null); }
  }

  async function remove() {
    setBusy('delete');
    try { await saApi.delete(`/api/storybooks/admin/${id}`); onBack(); }
    catch (e) { setNote({ ok: false, text: errMsg(e, 'Could not delete the story.') }); setBusy(null); }
  }

  if (error) return <div style={{ color: P.bad }}>{error} <button style={btn()} onClick={onBack}>Back</button></div>;
  if (!story) return <p style={{ color: P.muted }}>Loading…</p>;

  const totalWords = story.pages.reduce((n, p) => n + words(p.text), 0);
  const perPage = story.pages.length ? Math.round(totalWords / story.pages.length) : 0;
  const suggested = perPage <= 12 ? 1 : perPage <= 30 ? 2 : perPage <= 55 ? 3 : 4;
  const missingPics = story.pages.filter(p => !p.image).length + (story.cover ? 0 : 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={btn()} onClick={() => { if (!dirty || window.confirm('Leave without saving your changes?')) onBack(); }}>Back to stories</button>
          <span style={story.status === 'published' ? chip(P.good, P.goodBg) : chip(P.warn, P.warnBg)}>{story.status === 'published' ? 'Published' : 'Draft'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button style={btn('quiet', !!busy || !dirty)} disabled={!!busy || !dirty} onClick={() => save()}>{busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
          {story.status === 'published'
            ? <button style={btn('quiet', !!busy)} disabled={!!busy} onClick={() => save('draft')}>Unpublish</button>
            : <button style={btn('primary', !!busy)} disabled={!!busy} onClick={() => save('published')}>Publish to student apps</button>}
        </div>
      </div>

      {note && <p role={note.ok ? 'status' : 'alert'} style={{ margin: 0, fontSize: 14, color: note.ok ? P.good : P.bad }}>{note.text}</p>}

      <section style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 16, gridTemplateColumns: 'minmax(180px, 240px) 1fr' }}>
        <PictureSlot url={story.cover} label="Cover picture" busy={busy === 'pic-0'} onPick={f => setPicture(0, f)} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignContent: 'start' }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={label} htmlFor="sb-t">Title</label>
            <input id="sb-t" style={input} value={story.title} onChange={e => edit({ title: e.target.value })} /></div>
          <div><label style={label} htmlFor="sb-a">Written by</label>
            <input id="sb-a" style={input} value={story.author} onChange={e => edit({ author: e.target.value })} placeholder="Name, or e.g. Ghanaian folktale" /></div>
          <div><label style={label} htmlFor="sb-i">Pictures by</label>
            <input id="sb-i" style={input} value={story.illustrator} onChange={e => edit({ illustrator: e.target.value })} placeholder="Illustrator's name" /></div>
          <div><label style={label} htmlFor="sb-l">Reading level</label>
            <select id="sb-l" style={input} value={story.level} onChange={e => edit({ level: Number(e.target.value) })}>
              {LEVELS.map(l => <option key={l.level} value={l.level}>{l.label}</option>)}
            </select>
            <span style={{ fontSize: 12, color: P.muted }}>
              {story.level >= 5
                ? `${LEVELS[story.level - 1].hint}. ${totalWords} words in all.`
                : perPage ? `About ${perPage} words a page: ${LEVELS[suggested - 1].label}${suggested === story.level ? ', as chosen.' : ' fits best (or choose 5 to 10 for older readers).'}` : LEVELS[story.level - 1].hint}
            </span></div>
          <div><label style={label} htmlFor="sb-c">Licence</label>
            <select id="sb-c" style={input} value={story.licence} onChange={e => edit({ licence: e.target.value })}>
              {LICENCES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <span style={{ fontSize: 12, color: P.muted }}>Only add stories and pictures you have the right to share with every school.</span></div>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, color: P.ink }}>Pages</h2>
        <span style={{ fontSize: 13, color: P.muted }}>
          {story.pages.length} page{story.pages.length === 1 ? '' : 's'}{missingPics ? `, ${missingPics} without a picture` : ', every page has a picture'}. Pictures are optional but children read better with them.
        </span>
      </div>

      {story.pages.map((p, i) => (
        <section key={i} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 16, gridTemplateColumns: 'minmax(160px, 220px) 1fr' }}>
          <PictureSlot url={p.image} label={`Picture for page ${i + 1}`} busy={busy === `pic-${i + 1}`} onPick={f => setPicture(i + 1, f)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...label, marginBottom: 0 }} htmlFor={`sb-p${i}`}>Page {i + 1}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn('quiet', i === 0)} disabled={i === 0} onClick={() => movePage(i, -1)} aria-label={`Move page ${i + 1} up`}>Up</button>
                <button style={btn('quiet', i === story.pages.length - 1)} disabled={i === story.pages.length - 1} onClick={() => movePage(i, 1)} aria-label={`Move page ${i + 1} down`}>Down</button>
                <button style={btn('danger', story.pages.length === 1)} disabled={story.pages.length === 1} onClick={() => edit({ pages: story.pages.filter((_, k) => k !== i) })}>Remove page</button>
              </div>
            </div>
            <textarea id={`sb-p${i}`} value={p.text} onChange={e => editPage(i, { text: e.target.value })} rows={story.level >= 5 ? 12 : 5} maxLength={5000}
              placeholder={i === 0 ? 'Once upon a time, in a village by the river…' : 'What happens next…'}
              style={{ ...input, minHeight: 120, resize: 'vertical', lineHeight: 1.5, fontSize: 15 }} />
            <span style={{ fontSize: 12, color: P.muted }}>{words(p.text)} words{p.text.length > 4500 ? `, ${5000 - p.text.length} characters left on this page` : ''}. A blank line starts a new paragraph.</span>
          </div>
        </section>
      ))}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={btn('quiet', story.pages.length >= MAX_PAGES)} disabled={story.pages.length >= MAX_PAGES} onClick={() => edit({ pages: [...story.pages, { text: '', image: null }] })}>Add page</button>
        {confirmDelete ? (
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: P.ink2 }}>Delete &quot;{story.title}&quot; for good?{story.status === 'published' ? ' It leaves the apps when they next update.' : ''}</span>
            <button style={btn('danger', busy === 'delete')} disabled={busy === 'delete'} onClick={remove}>Delete story</button>
            <button style={btn()} onClick={() => setConfirmDelete(false)}>Keep it</button>
          </span>
        ) : <button style={btn('danger')} onClick={() => setConfirmDelete(true)}>Delete story</button>}
      </div>
    </div>
  );
}

function PictureSlot({ url, label: name, busy, onPick }: { url: string | null; label: string; busy: boolean; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ aspectRatio: '1 / 1', borderRadius: 12, background: P.sunken, border: `1px dashed ${P.border}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <span style={{ fontSize: 13, color: P.muted }}>Uploading…</span>
          : url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#FFFFFF' }} />
          : <span style={{ fontSize: 13, color: P.muted, padding: 12, textAlign: 'center' }}>{name}: none yet</span>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={name}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={btn('quiet', busy)} disabled={busy} onClick={() => ref.current?.click()}>{url ? 'Change picture' : 'Add picture'}</button>
        {url && <button style={btn('danger', busy)} disabled={busy} onClick={() => onPick(null)}>Remove</button>}
      </div>
    </div>
  );
}
