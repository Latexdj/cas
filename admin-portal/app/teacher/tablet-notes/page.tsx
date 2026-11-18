'use client';

import { useCallback, useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

// Teacher notes for the student tablets. The school's CAS School Server
// downloads them at its next sync and puts them in the TEACHER NOTES folder
// for the classes picked here; tablets copy them over the school Wi-Fi.

interface Subject { subject: string; classes: string[] }
interface Note { id: string; subject: string; class_names: string; file_name: string; size: number; created_at: string }

const MAX = 25 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.odt,.odp,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mp3,.m4a';
const fmt = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

export default function TabletNotesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [subject, setSubject] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    teacherApi.get<{ subjects: Subject[]; notes: Note[] }>('/api/lm-notes/mine')
      .then(r => {
        setSubjects(r.data.subjects); setNotes(r.data.notes);
        setSubject(s => (s && r.data.subjects.some(x => x.subject === s)) ? s : (r.data.subjects[0]?.subject ?? ''));
      })
      .catch(() => setMsg({ text: 'Could not load your notes. Check your connection and try again.', tone: 'bad' }))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const classes = subjects.find(x => x.subject === subject)?.classes ?? [];
  useEffect(() => { setPicked(classes); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(files: File[]) {
    if (!subject) return setMsg({ text: 'Choose a subject.', tone: 'bad' });
    if (!picked.length) return setMsg({ text: 'Tick at least one class.', tone: 'bad' });
    setBusy(true);
    let ok = 0;
    for (const [i, f] of files.entries()) {
      if (f.size > MAX) { setMsg({ text: `${f.name} is larger than 25 MB. Upload it on the school server's teacher page instead.`, tone: 'bad' }); continue; }
      setMsg({ text: `Uploading ${i + 1} of ${files.length}: ${f.name}…`, tone: 'info' });
      try {
        const data = await readAsDataUrl(f);
        await teacherApi.post('/api/lm-notes', { subject, class_names: picked, file_name: f.name, data }, { timeout: 300000 });
        ok++;
      } catch (e: unknown) {
        const err = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setMsg({ text: `${f.name}: ${err || 'The upload failed. Try again.'}`, tone: 'bad' });
        setBusy(false); load(); return;
      }
    }
    setBusy(false);
    if (ok) setMsg({ text: `Added ${ok} file${ok === 1 ? '' : 's'}. The school server picks ${ok === 1 ? 'it' : 'them'} up within about 10 minutes when it is online, and tablets get ${ok === 1 ? 'it' : 'them'} on the school Wi-Fi after that.`, tone: 'ok' });
    load();
  }

  async function remove(id: string) {
    try { await teacherApi.delete(`/api/lm-notes/${id}`); setMsg({ text: 'Removed. Tablets drop it after the school server next syncs.', tone: 'ok' }); }
    catch { setMsg({ text: 'Could not remove it. Try again.', tone: 'bad' }); }
    setConfirmId(null); load();
  }

  const tone = msg?.tone === 'ok' ? 'bg-[#E8F4EE] text-[#145C44]' : msg?.tone === 'bad' ? 'bg-[#FBEAEA] text-[#9B2C2C]' : 'bg-[#FBF3E4] text-[#8A5A12]';

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Notes for Tablets</h1>
          <p className="text-sm text-[#8C7E6E] mt-1">
            Your notes go into the TEACHER NOTES folder for the classes you tick, on every student tablet. The school server downloads them and the tablets copy them over the school Wi-Fi.
          </p>
        </div>

        {msg && <p role={msg.tone === 'bad' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${tone}`}>{msg.text}</p>}

        <div className="rounded-2xl border border-[#E2D9CC] bg-[#FDFAF5] p-5 space-y-4">
          {!loaded ? <p className="text-sm text-[#8C7E6E]">Loading…</p> : subjects.length === 0 ? (
            <p className="text-sm text-[#4A3F32]">No lessons on your timetable yet, so there is nothing to add notes for.</p>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-[#2C2218]">Subject</span>
                <select value={subject} onChange={e => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E2D9CC] bg-white px-3 min-h-[48px] text-base text-[#2C2218] focus:outline-none focus:ring-2 focus:ring-[#145C44]">
                  {subjects.map(s => <option key={s.subject}>{s.subject}</option>)}
                </select>
              </label>
              <fieldset>
                <legend className="text-sm font-semibold text-[#2C2218]">Classes</legend>
                <div className="flex flex-wrap gap-2 mt-2">
                  {classes.map(c => (
                    <label key={c} className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-full border border-[#E2D9CC] bg-white text-sm text-[#2C2218] cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-[#145C44]" checked={picked.includes(c)}
                        onChange={e => setPicked(p => e.target.checked ? [...p, c] : p.filter(x => x !== c))} />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <label className={`inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl font-semibold text-base text-white ${busy ? 'bg-[#8C7E6E]' : 'bg-[#145C44] hover:bg-[#0B3D2E] cursor-pointer'}`}>
                  {busy ? 'Uploading…' : 'Choose files to upload'}
                  <input type="file" multiple accept={ACCEPT} hidden disabled={busy}
                    onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) upload(f); }} />
                </label>
                <span className="text-sm text-[#8C7E6E]">PDF, Word, PowerPoint, pictures or video. 25 MB each at most.</span>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-[#E2D9CC] bg-[#FDFAF5] p-5">
          <h2 className="text-base font-semibold text-[#2C2218] mb-3">My notes</h2>
          {notes.length === 0 ? <p className="text-sm text-[#8C7E6E]">No notes yet.</p> : (
            <ul className="divide-y divide-[#E2D9CC]">
              {notes.map(n => (
                <li key={n.id} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2C2218] break-words">{n.file_name}</p>
                    <p className="text-sm text-[#8C7E6E]">{n.subject}, {n.class_names}, {fmt(n.size)}, added {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  {confirmId === n.id ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[#4A3F32]">Remove from the tablets?</span>
                      <button onClick={() => remove(n.id)} className="min-h-[44px] px-3 rounded-lg text-[#9B2C2C] font-semibold">Remove</button>
                      <button onClick={() => setConfirmId(null)} className="min-h-[44px] px-3 rounded-lg text-[#4A3F32]">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(n.id)} className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-[#9B2C2C]">Remove</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
