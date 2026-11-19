'use client';

// Past Questions: the shared question bank behind the student app's offline
// quiz and every school's online Pasco. Papers are read in with AI, checked
// here, then published.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saApi } from '@/lib/super-admin-api';
import { RichQuestion, insertMarker, renumberMarkers } from '@/components/past-questions/RichQuestion';

const P = {
  card: '#132B1C', border: '#2A3D28', sunken: '#0E1A0C', inputBg: '#0B1A0E',
  ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.6)',
  primary: '#C8973A', onPrimary: '#0E1A0C', link: '#E2C07A',
  good: '#7DD3A8', goodBg: 'rgba(125,211,168,0.14)', warn: '#E2C07A', warnBg: 'rgba(200,151,58,0.15)', bad: '#F87171',
};

const EXAMS = [
  { key: 'WASSCE', label: 'WASSCE' }, { key: 'BECE', label: 'BECE' }, { key: 'NOVDEC', label: 'Nov/Dec' },
  { key: 'CTVET', label: 'CTVET' }, { key: 'MOCK', label: 'Mock' }, { key: 'PRACTICE', label: 'Practice' }, { key: 'OTHER', label: 'Other' },
];
const examLabel = (k: string) => EXAMS.find(e => e.key === k)?.label ?? k;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface Paper {
  id: string; exam: string; subject_name: string; year: number | null; paper_label: string | null;
  status: 'draft' | 'published'; import_status: 'idle' | 'running' | 'done' | 'failed'; import_note: string | null;
  source_files: { url: string; mime: string; name: string }[];
  question_count?: number; review_count?: number; theory_count?: number;
}
interface Question {
  id: string; question_no: number | null; question_type: 'objective' | 'theory'; question_text: string;
  options: string[]; correct: string | null; explanation: string | null; marking_scheme: string | null;
  image_url: string | null; images: string[]; option_images: (string | null)[]; topic: string | null; difficulty: 'easy' | 'medium' | 'hard';
  answer_source: string | null; needs_review: boolean; has_diagram: boolean;
}
interface Summary {
  version: number; published_at: string | null;
  subjects: { name: string; count: number }[]; papers: { published: number; drafts: number };
}

function errMsg(e: unknown, fallback: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}
const paperName = (p: Pick<Paper, 'exam' | 'subject_name' | 'year' | 'paper_label'>) =>
  [p.subject_name, examLabel(p.exam), p.year, p.paper_label].filter(Boolean).join(' · ');

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

export default function PastQuestionsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <PaperView id={openId} onBack={() => setOpenId(null)} />
    : <PaperList onOpen={setOpenId} />;
}

// ── Paper list ────────────────────────────────────────────────────────────────

function PaperList({ onOpen }: { onOpen: (id: string) => void }) {
  const [papers,  setPapers]  = useState<Paper[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [exam,    setExam]    = useState('');
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState({ exam: 'WASSCE', subject_name: '', year: '', paper_label: '' });
  const [formErr, setFormErr] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [zipping, setZipping] = useState(false);
  const [zipErr,  setZipErr]  = useState('');

  useEffect(() => {
    Promise.all([saApi.get<Paper[]>('/api/pasco-bank/papers'), saApi.get<Summary>('/api/pasco-bank/summary')])
      .then(([a, b]) => { setPapers(a.data); setSummary(b.data); })
      .catch(e => setError(errMsg(e, 'Could not load the papers.')))
      .finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(() => [...new Set(papers.map(p => p.subject_name))].sort(), [papers]);
  const shown = papers.filter(p =>
    (!exam || p.exam === exam) &&
    (!search.trim() || paperName(p).toLowerCase().includes(search.trim().toLowerCase())));

  async function create(e: React.FormEvent) {
    e.preventDefault(); setFormErr(''); setSaving(true);
    try {
      const { data } = await saApi.post<Paper>('/api/pasco-bank/papers', form);
      onOpen(data.id);
    } catch (err) { setFormErr(errMsg(err, 'Could not add the paper.')); }
    finally { setSaving(false); }
  }

  async function downloadZip() {
    setZipping(true); setZipErr('');
    try {
      const r = await saApi.get('/api/pasco-bank/pack/zip', { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `past-questions-v${summary?.version ?? 0}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { setZipErr('Could not build the pack. Try again.'); }
    finally { setZipping(false); }
  }

  const total = summary?.subjects.reduce((n, s) => n + s.count, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.ink }}>Past Questions</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: P.muted }}>
            Shared with every school: the student app&apos;s offline quiz and each school&apos;s Pasco.
          </p>
        </div>
        <button style={btn('primary')} onClick={() => { setAdding(a => !a); setFormErr(''); }}>{adding ? 'Close' : 'Add paper'}</button>
      </div>

      {summary && (
        <section style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, color: P.ink2, lineHeight: 1.6 }}>
            <strong style={{ color: P.ink }}>{total} published question{total === 1 ? '' : 's'}</strong> in {summary.subjects.length} subject{summary.subjects.length === 1 ? '' : 's'}
            {' · '}{summary.papers.published} published paper{summary.papers.published === 1 ? '' : 's'}, {summary.papers.drafts} draft{summary.papers.drafts === 1 ? '' : 's'}
            <br />
            <span style={{ color: P.muted }}>
              Pack version {summary.version}{summary.published_at ? `, last changed ${new Date(summary.published_at).toLocaleString()}` : ''}. Tablets update when they next go online.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button style={btn('quiet', zipping || total === 0)} disabled={zipping || total === 0} onClick={downloadZip}>
              {zipping ? 'Building pack…' : 'Download pack for USB'}
            </button>
            <span style={{ fontSize: 12, color: P.muted, maxWidth: 300, textAlign: 'right' }}>
              Copy the .zip onto a flash drive as it is. On the tablet: Past Questions, Load from USB drive.
            </span>
            {zipErr && <span style={{ fontSize: 13, color: P.bad }}>{zipErr}</span>}
          </div>
        </section>
      )}

      {adding && (
        <form onSubmit={create} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div><label style={label} htmlFor="pq-exam">Exam</label>
            <select id="pq-exam" style={input} value={form.exam} onChange={e => setForm({ ...form, exam: e.target.value })}>
              {EXAMS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select></div>
          <div><label style={label} htmlFor="pq-subject">Subject</label>
            <input id="pq-subject" style={input} list="pq-subjects" value={form.subject_name} onChange={e => setForm({ ...form, subject_name: e.target.value })} placeholder="Integrated Science" />
            <datalist id="pq-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist></div>
          <div><label style={label} htmlFor="pq-year">Year</label>
            <input id="pq-year" style={input} inputMode="numeric" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="2023" /></div>
          <div><label style={label} htmlFor="pq-label">Paper (optional)</label>
            <input id="pq-label" style={input} value={form.paper_label} onChange={e => setForm({ ...form, paper_label: e.target.value })} placeholder="Paper 1" /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="submit" style={btn('primary', saving)} disabled={saving}>{saving ? 'Adding…' : 'Add and open'}</button>
            <span style={{ fontSize: 13, color: P.muted }}>You upload the paper on the next screen.</span>
            {formErr && <span role="alert" style={{ fontSize: 13, color: P.bad }}>{formErr}</span>}
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input type="search" aria-label="Search papers" placeholder="Search by subject or year" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, maxWidth: 320 }} />
        <select aria-label="Exam" value={exam} onChange={e => setExam(e.target.value)} style={{ ...input, maxWidth: 180 }}>
          <option value="">All exams</option>
          {EXAMS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </div>

      {loading ? <p style={{ color: P.muted }}>Loading…</p>
        : error ? <p style={{ color: P.bad }}>{error}</p>
        : shown.length === 0 ? (
          <p style={{ color: P.muted, fontSize: 14 }}>
            {papers.length === 0 ? 'No papers yet. Add a paper, then upload its PDF, Word file or photos of its pages.' : 'No paper matches.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto', background: P.card, border: `1px solid ${P.border}`, borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: P.ink2 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: P.muted, fontSize: 13 }}>
                  {['Subject', 'Exam', 'Year', 'Paper', 'Questions', 'Status', ''].map(h => <th key={h} style={{ padding: '10px 12px', fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${P.border}` }}>
                    <td style={{ padding: '10px 12px', color: P.ink, fontWeight: 600 }}>{p.subject_name}</td>
                    <td style={{ padding: '10px 12px' }}>{examLabel(p.exam)}</td>
                    <td style={{ padding: '10px 12px' }}>{p.year ?? ''}</td>
                    <td style={{ padding: '10px 12px' }}>{p.paper_label ?? ''}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {p.question_count ?? 0}{p.theory_count ? ` (${p.theory_count} theory)` : ''}
                      {(p.review_count ?? 0) > 0 && <span style={{ ...chip(P.warn, P.warnBg), marginLeft: 8 }}>{p.review_count} to check</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {p.import_status === 'running' ? <span style={chip(P.warn, P.warnBg)}>Reading…</span>
                        : p.status === 'published' ? <span style={chip(P.good, P.goodBg)}>Published</span>
                        : <span style={chip(P.muted, 'rgba(255,255,255,0.08)')}>Draft</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button style={btn()} onClick={() => onOpen(p.id)} aria-label={`Open ${paperName(p)}`}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ── One paper ─────────────────────────────────────────────────────────────────

function PaperView({ id, onBack }: { id: string; onBack: () => void }) {
  const [paper,   setPaper]   = useState<(Paper & { questions: Question[] }) | null>(null);
  const [error,   setError]   = useState('');
  const [notice,  setNotice]  = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [filter,  setFilter]  = useState<'all' | 'check'>('all');
  const [confirmDelPaper, setConfirmDelPaper] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await saApi.get(`/api/pasco-bank/papers/${id}`); setPaper(data); setError(''); }
    catch (e) { setError(errMsg(e, 'Could not load the paper.')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Poll while the AI is reading the paper.
  useEffect(() => {
    if (paper?.import_status !== 'running') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [paper?.import_status, load]);

  async function setPublished(publish: boolean) {
    setPubBusy(true); setNotice('');
    try {
      await saApi.post(`/api/pasco-bank/papers/${id}/publish`, { publish });
      await load();
      setNotice(publish ? 'Published. Tablets get it the next time they go online.' : 'Moved back to draft. Students no longer see it.');
    } catch (e) { setNotice(errMsg(e, 'Could not change the status.')); }
    finally { setPubBusy(false); }
  }

  async function deletePaper() {
    try { await saApi.delete(`/api/pasco-bank/papers/${id}`); onBack(); }
    catch (e) { setNotice(errMsg(e, 'Could not delete the paper.')); setConfirmDelPaper(false); }
  }

  if (error) return <div><button style={btn()} onClick={onBack}>Back to papers</button><p style={{ color: P.bad }}>{error}</p></div>;
  if (!paper) return <p style={{ color: P.muted }}>Loading…</p>;

  const qs = paper.questions;
  const toCheck = qs.filter(q => q.needs_review).length;
  const shown = filter === 'check' ? qs.filter(q => q.needs_review) : qs;
  const source = paper.source_files[paper.source_files.length - 1];
  const objectives = qs.filter(q => q.question_type === 'objective');
  const theory = qs.filter(q => q.question_type === 'theory');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1400 }}>
      <div>
        <button style={{ ...btn(), border: 'none', padding: 0, color: P.link }} onClick={onBack}>‹ All papers</button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: P.ink }}>{paperName(paper)}</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: P.muted }}>
              {objectives.length} objective, {theory.length} theory
              {toCheck > 0 && <> · <span style={{ color: P.warn }}>{toCheck} to check</span></>}
              {' · '}{paper.status === 'published' ? <span style={{ color: P.good }}>Published</span> : 'Draft'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn()} onClick={() => setMetaOpen(o => !o)}>Edit details</button>
            {paper.status === 'published'
              ? <button style={btn('quiet', pubBusy)} disabled={pubBusy} onClick={() => setPublished(false)}>Unpublish</button>
              : <button style={btn('primary', pubBusy || toCheck > 0 || qs.length === 0)} disabled={pubBusy || toCheck > 0 || qs.length === 0} onClick={() => setPublished(true)}
                  title={toCheck > 0 ? 'Check every flagged question first' : undefined}>Publish</button>}
            {confirmDelPaper ? (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: P.ink2 }}>
                Delete the paper and its {qs.length} question{qs.length === 1 ? '' : 's'}?
                <button style={btn('danger')} onClick={deletePaper}>Delete</button>
                <button style={btn()} onClick={() => setConfirmDelPaper(false)}>Cancel</button>
              </span>
            ) : <button style={btn('danger')} onClick={() => setConfirmDelPaper(true)}>Delete paper</button>}
          </div>
        </div>
        {paper.status !== 'published' && toCheck > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: P.muted }}>Publish unlocks once every flagged question has been checked.</p>
        )}
        {notice && <p role="status" style={{ margin: '8px 0 0', fontSize: 14, color: P.ink2 }}>{notice}</p>}
      </div>

      {metaOpen && <PaperMeta paper={paper} onSaved={async () => { setMetaOpen(false); await load(); }} />}

      <ImportPanel paper={paper} questionCount={qs.length} onChanged={load} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: source ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }} className="pq-grid">
        {source && (
          <section aria-label="Source paper" style={{ position: 'sticky', top: 16, alignSelf: 'start', background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: P.muted }}>
              Source:
              {paper.source_files.map((f, i) => <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: P.link }}>{f.name || `File ${i + 1}`}</a>)}
            </div>
            {source.mime === 'application/pdf'
              ? <iframe src={source.url} title="Source paper" style={{ width: '100%', height: '78vh', border: 'none', background: '#fff' }} />
              : source.mime.startsWith('image/')
                ? <div style={{ maxHeight: '78vh', overflow: 'auto' }}>{paper.source_files.filter(f => f.mime.startsWith('image/')).map((f, i) => <img key={i} src={f.url} alt={`Page ${i + 1}`} style={{ width: '100%', display: 'block' }} />)}</div>
                : <p style={{ padding: 12, fontSize: 13, color: P.muted }}>Word files can&apos;t be previewed here. Open it with the link above.</p>}
          </section>
        )}

        <section aria-label="Questions" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div role="group" aria-label="Show" style={{ display: 'flex', gap: 6 }}>
              {(['all', 'check'] as const).map(f => (
                <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}
                  style={{ ...btn(), background: filter === f ? 'rgba(200,151,58,0.18)' : 'transparent', borderColor: filter === f ? P.primary : P.border }}>
                  {f === 'all' ? `All (${qs.length})` : `To check (${toCheck})`}
                </button>
              ))}
            </div>
            <button style={btn()} onClick={() => setEditing('new')}>Add question</button>
          </div>

          {editing === 'new' && (
            <QuestionForm paperId={paper.id} onDone={async () => { setEditing(null); await load(); }} onCancel={() => setEditing(null)} />
          )}

          {shown.length === 0 && editing !== 'new' && (
            <p style={{ fontSize: 14, color: P.muted }}>
              {qs.length === 0 ? 'No questions yet. Read the paper with AI, paste its text, import a spreadsheet, or add questions by hand.' : 'Nothing left to check.'}
            </p>
          )}

          {shown.map(q => editing === q.id
            ? <QuestionForm key={q.id} paperId={paper.id} question={q} onDone={async () => { setEditing(null); await load(); }} onCancel={() => setEditing(null)} />
            : <QuestionCard key={q.id} q={q} onEdit={() => setEditing(q.id)} onChanged={load} />)}
        </section>
      </div>
      <style>{`@media (max-width: 1000px) { .pq-grid { grid-template-columns: minmax(0,1fr) !important; } .pq-grid > section[aria-label="Source paper"] { position: static !important; } }`}</style>
    </div>
  );
}

function PaperMeta({ paper, onSaved }: { paper: Paper; onSaved: () => void }) {
  const [form, setForm] = useState({ exam: paper.exam, subject_name: paper.subject_name, year: paper.year ? String(paper.year) : '', paper_label: paper.paper_label ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await saApi.put(`/api/pasco-bank/papers/${paper.id}`, form); onSaved(); }
    catch (x) { setErr(errMsg(x, 'Could not save.')); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      <div><label style={label} htmlFor="pm-exam">Exam</label>
        <select id="pm-exam" style={input} value={form.exam} onChange={e => setForm({ ...form, exam: e.target.value })}>
          {EXAMS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select></div>
      <div><label style={label} htmlFor="pm-subject">Subject</label><input id="pm-subject" style={input} value={form.subject_name} onChange={e => setForm({ ...form, subject_name: e.target.value })} /></div>
      <div><label style={label} htmlFor="pm-year">Year</label><input id="pm-year" style={input} inputMode="numeric" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></div>
      <div><label style={label} htmlFor="pm-label">Paper</label><input id="pm-label" style={input} value={form.paper_label} onChange={e => setForm({ ...form, paper_label: e.target.value })} /></div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" style={btn('primary', busy)} disabled={busy}>Save details</button>
        {err && <span role="alert" style={{ fontSize: 13, color: P.bad }}>{err}</span>}
      </div>
    </form>
  );
}

// ── Getting questions in: AI, pasted text, or a spreadsheet ──────────────────

const SHEET_HEADERS = ['No', 'Type', 'Question', 'A', 'B', 'C', 'D', 'E', 'Answer', 'Explanation', 'Marking scheme', 'Topic', 'Difficulty'];

async function downloadTemplate(paper: Paper) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const qs = XLSX.utils.aoa_to_sheet([SHEET_HEADERS]);
  qs['!cols'] = [6, 11, 60, 18, 18, 18, 18, 18, 8, 40, 50, 18, 11].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, qs, 'Questions');
  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill in the Questions sheet'],
    ['One row per question. Keep the headings in row 1.'],
    ['No: the question number on the paper.'],
    ['Type: Objective or Theory. Empty means Objective.'],
    ['Question: the full question. Press Alt+Enter for a new line inside the cell.'],
    ['A to E: the options of an objective question. Leave E empty when there are four.'],
    ['Answer: the letter of the correct option, for example B.'],
    ['Explanation (optional): why the answer is right.'],
    ['Marking scheme: for theory questions, the answer a marker expects.'],
    ['Topic and Difficulty (optional): Difficulty is Easy, Medium or Hard.'],
    ['Diagrams: add the question here, then attach the picture on the CAS page after importing.'],
    [],
    ['Examples'],
    SHEET_HEADERS,
    [1, 'Objective', 'Which of the following is a non-metal?', 'Sodium', 'Sulphur', 'Calcium', 'Iron', '', 'B', 'Sulphur is a non-metal.', '', 'Matter', 'Easy'],
    [1, 'Theory', '(a) Define photosynthesis.\n(b) State two conditions necessary for it.', '', '', '', '', '', '', '', '(a) Green plants make food from carbon dioxide and water using light.\n(b) Any two: light, chlorophyll, carbon dioxide, water.', 'Plants', 'Medium'],
  ]);
  help['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, help, 'How to fill');
  const name = [paper.subject_name, examLabel(paper.exam), paper.year, paper.paper_label].filter(Boolean).join(' ').replace(/[^\w .-]+/g, '');
  XLSX.writeFile(wb, `${name || 'Past questions'} template.xlsx`);
}

async function readSheet(file: File) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames.find(n => /question/i.test(n)) ?? wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const headIdx = grid.findIndex(r => r.some(c => /^question$/i.test(String(c).trim())));
  if (headIdx < 0) throw new Error('No "Question" column was found. Use the CAS template, with the headings in the first row.');
  const head = grid[headIdx].map(c => String(c).trim().toLowerCase().replace(/^option\s+/, ''));
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const at = {
    no: col('no', 'no.', 'number', 'question no', '#'), type: col('type'), q: col('question'),
    opts: ['a', 'b', 'c', 'd', 'e'].map(l => col(l)), answer: col('answer', 'correct', 'correct answer'),
    explanation: col('explanation'), scheme: col('marking scheme', 'model answer', 'scheme'),
    topic: col('topic'), difficulty: col('difficulty'),
  };
  const cell = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const rows = [];
  for (let i = headIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!cell(r, at.q) && at.opts.every(o => !cell(r, o))) continue;
    rows.push({
      row: i + 1, question_no: cell(r, at.no), question_type: cell(r, at.type), question_text: cell(r, at.q),
      options: at.opts.map(o => cell(r, o)), answer: cell(r, at.answer), explanation: cell(r, at.explanation),
      marking_scheme: cell(r, at.scheme), topic: cell(r, at.topic), difficulty: cell(r, at.difficulty),
    });
  }
  return rows;
}

type Method = 'ai' | 'text' | 'sheet';

function ImportPanel({ paper, questionCount, onChanged }: { paper: Paper; questionCount: number; onChanged: () => Promise<void> }) {
  const [method, setMethod] = useState<Method>('ai');
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ added: number; to_check: number; problems: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);

  function pick(m: Method) { setMethod(m); setErr(''); setResult(null); }

  async function readWithAi() {
    if (!files.length) return;
    setBusy(true); setErr(''); setResult(null);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      await saApi.post(`/api/pasco-bank/papers/${paper.id}/import`, fd);
      setFiles([]); if (fileRef.current) fileRef.current.value = '';
      await onChanged();
    } catch (e) { setErr(errMsg(e, 'Could not upload the file.')); }
    finally { setBusy(false); }
  }
  async function importText() {
    setBusy(true); setErr(''); setResult(null);
    try {
      const { data } = await saApi.post(`/api/pasco-bank/papers/${paper.id}/import-text`, { text });
      setResult(data); setText('');
      await onChanged();
    } catch (e) { setErr(errMsg(e, 'Could not read the text.')); }
    finally { setBusy(false); }
  }
  async function importSheet(file: File) {
    setBusy(true); setErr(''); setResult(null);
    try {
      const rows = await readSheet(file);
      if (!rows.length) throw new Error('The sheet has no questions under the headings.');
      const { data } = await saApi.post(`/api/pasco-bank/papers/${paper.id}/import-rows`, { rows });
      setResult(data);
      await onChanged();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string; problems?: string[] } } };
      setErr(ax.response?.data?.error ?? (e instanceof Error ? e.message : 'Could not read the spreadsheet.'));
      if (ax.response?.data?.problems?.length) setResult({ added: 0, to_check: 0, problems: ax.response.data.problems });
    } finally { setBusy(false); if (sheetRef.current) sheetRef.current.value = ''; }
  }

  const tabs: [Method, string][] = [['ai', 'Read with AI'], ['text', 'Paste text'], ['sheet', 'Spreadsheet']];
  return (
    <section style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 16, color: P.ink }}>{questionCount ? 'Add more questions' : 'Add the questions'}</h2>
        <div role="tablist" aria-label="How to add questions" style={{ display: 'flex', gap: 4, background: P.sunken, padding: 4, borderRadius: 10 }}>
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={method === k} onClick={() => pick(k)}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: method === k ? P.primary : 'transparent', color: method === k ? P.onPrimary : P.ink2 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {method === 'ai' && (
        <>
          <p style={{ margin: 0, fontSize: 13, color: P.muted }}>
            A PDF, a Word file (.docx), or photos of the pages in order. AI copies out the questions; answers it had to work out itself, and questions with diagrams, are flagged for you to check. Uses AI credit.
          </p>
          {paper.import_status === 'running' ? (
            <p role="status" style={{ margin: 0, fontSize: 14, color: P.warn }}>Reading the paper. This usually takes 1 to 3 minutes; you can leave this page.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,image/*" aria-label="Paper files"
                onChange={e => setFiles(Array.from(e.target.files ?? []))} style={{ color: P.ink2, fontSize: 14 }} />
              <button style={btn('primary', busy || !files.length)} disabled={busy || !files.length} onClick={readWithAi}>
                {busy ? 'Uploading…' : 'Read with AI'}
              </button>
            </div>
          )}
          {paper.import_note && paper.import_status !== 'running' && (
            <p style={{ margin: 0, fontSize: 13, color: paper.import_status === 'failed' ? P.bad : P.ink2 }}>{paper.import_note}</p>
          )}
        </>
      )}

      {method === 'text' && (
        <>
          <p style={{ margin: 0, fontSize: 13, color: P.muted }}>
            For typed papers. Copy the text from Word or a PDF and paste it here. Each question should start with its number (1. or 1)), with options starting A. B. C. D. on one line or separate lines.
            Put &quot;Answer: B&quot; under a question, or an ANSWERS list at the end (1. B 2. C ...). Questions after a PAPER 2, SECTION B or THEORY heading are read as theory; a &quot;Marking scheme:&quot; line under one becomes its scheme. No AI is used.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} aria-label="Paper text" spellCheck={false}
            placeholder={'1. Which of the following is a non-metal?\nA. Sodium  B. Sulphur  C. Calcium  D. Iron\n2. ...\n\nANSWERS\n1. B  2. C'}
            style={{ ...input, minHeight: 220, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btn('primary', busy || !text.trim())} disabled={busy || !text.trim()} onClick={importText}>
              {busy ? 'Reading…' : 'Read the text'}
            </button>
            <span style={{ fontSize: 12, color: P.muted }}>{text.trim() ? `${text.trim().split('\n').length} lines` : ''}</span>
          </div>
        </>
      )}

      {method === 'sheet' && (
        <>
          <p style={{ margin: 0, fontSize: 13, color: P.muted }}>
            Fill in the CAS Excel template (one row per question: options A to E, the answer letter, and a marking scheme for theory), then import it. Good for scanned papers someone types up. No AI is used.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button style={btn()} onClick={() => downloadTemplate(paper)}>Download template</button>
            <label style={{ ...btn('primary', busy), display: 'inline-flex', alignItems: 'center' }}>
              {busy ? 'Importing…' : 'Import spreadsheet'}
              <input ref={sheetRef} type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; if (f) importSheet(f); }} />
            </label>
          </div>
        </>
      )}

      {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: P.bad }}>{err}</p>}
      {result && (
        <div role="status" style={{ fontSize: 13, color: P.ink2, background: P.sunken, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.added > 0 && (
            <strong style={{ color: P.good }}>
              Added {result.added} question{result.added === 1 ? '' : 's'}{result.to_check ? `; ${result.to_check} marked to check` : ''}.
            </strong>
          )}
          {result.problems.slice(0, 12).map((p, i) => <span key={i}>{p}</span>)}
          {result.problems.length > 12 && <span>And {result.problems.length - 12} more.</span>}
        </div>
      )}
    </section>
  );
}

// ── Question card and form ────────────────────────────────────────────────────

function readAsDataUrl(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file);
  });
}

// A hidden file input opened by a button; calls onPick with the chosen image.
function usePicker(onPick: (file: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
      onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); if (ref.current) ref.current.value = ''; }} />
  );
  return { open: () => ref.current?.click(), input };
}

const thumb: React.CSSProperties = { width: 72, height: 54, objectFit: 'contain', background: '#fff', borderRadius: 6, flexShrink: 0 };

function QuestionCard({ q, onEdit, onChanged }: { q: Question; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');
  const picker = usePicker(async (file) => {
    setBusy(true); setErr('');
    try { await saApi.post(`/api/pasco-bank/questions/${q.id}/images`, { image: await readAsDataUrl(file) }); onChanged(); }
    catch (e) { setErr(errMsg(e, 'Could not save the image.')); }
    finally { setBusy(false); }
  });

  async function markChecked() {
    setBusy(true); setErr('');
    try { await saApi.put(`/api/pasco-bank/questions/${q.id}`, { ...q, checked: true }); onChanged(); }
    catch (e) { setErr(errMsg(e, 'Could not save. Edit the question to fix it.')); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await saApi.delete(`/api/pasco-bank/questions/${q.id}`); onChanged(); }
    catch (e) { setErr(errMsg(e, 'Could not delete.')); setBusy(false); }
  }

  const missingOptionPic = q.question_type === 'objective' && q.options.some((o, i) => !o && !q.option_images[i]);
  const needsImage = (q.has_diagram && q.images.length === 0) || missingOptionPic;
  return (
    <article style={{ background: P.card, border: `1px solid ${q.needs_review ? 'rgba(200,151,58,0.55)' : P.border}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 13, color: P.muted }}>
        <strong style={{ color: P.ink }}>{q.question_type === 'theory' ? 'Theory' : 'Objective'} {q.question_no ?? ''}</strong>
        {q.topic && <span>· {q.topic}</span>}
        <span>· {q.difficulty}</span>
        {q.needs_review && q.answer_source === 'ai' && <span style={chip(P.warn, P.warnBg)}>{q.question_type === 'theory' ? 'AI marking scheme, check' : 'AI answer, check'}</span>}
        {needsImage && <span style={chip(P.warn, P.warnBg)}>{missingOptionPic ? 'An option needs its picture' : 'Has a diagram, add image'}</span>}
        {q.needs_review && q.answer_source !== 'ai' && !needsImage && <span style={chip(P.warn, P.warnBg)}>Check</span>}
      </div>
      <RichQuestion text={q.question_text} images={q.images} placedElsewhere={q.marking_scheme} textStyle={{ fontSize: 15, color: P.ink }} imageStyle={{ maxHeight: 260 }} />
      {q.question_type === 'objective' ? (
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {q.options.map((o, i) => {
            const right = q.correct === LETTERS[i].toLowerCase();
            return (
              <li key={i} style={{ fontSize: 14, color: right ? P.good : P.ink2, fontWeight: right ? 700 : 400, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{LETTERS[i]}.</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {q.option_images[i] && <img src={q.option_images[i]!} alt={`Option ${LETTERS[i]}`} style={{ ...thumb, width: 160, height: 100 }} />}
                <span>{o || (!q.option_images[i] ? <em style={{ color: P.warn }}>picture missing</em> : '')}{right && ' (answer)'}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div style={{ fontSize: 14, color: P.ink2, background: P.sunken, borderRadius: 10, padding: 10 }}>
          <strong style={{ color: P.ink, display: 'block', marginBottom: 4 }}>Marking scheme</strong>
          {q.marking_scheme ? <RichQuestion text={q.marking_scheme} images={q.images} showUnplaced={false} /> : 'None yet.'}
        </div>
      )}
      {q.explanation && <p style={{ margin: 0, fontSize: 13, color: P.muted }}>{q.explanation}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {q.needs_review && <button style={btn('primary', busy)} disabled={busy} onClick={markChecked}>Mark checked</button>}
        <button style={btn('quiet', busy)} disabled={busy} onClick={onEdit}>Edit</button>
        <button style={btn('quiet', busy)} disabled={busy} onClick={picker.open} title="Added at the end. Use Edit to place it in the text.">Add image</button>
        {picker.input}
        {confirmDel ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: P.ink2 }}>
            Delete this question?
            <button style={btn('danger')} onClick={remove}>Delete</button>
            <button style={btn()} onClick={() => setConfirmDel(false)}>Cancel</button>
          </span>
        ) : <button style={btn('danger', busy)} disabled={busy} onClick={() => setConfirmDel(true)}>Delete</button>}
        {err && <span role="alert" style={{ fontSize: 13, color: P.bad }}>{err}</span>}
      </div>
    </article>
  );
}

function QuestionForm({ paperId, question, onDone, onCancel }: { paperId: string; question?: Question; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    question_type: question?.question_type ?? 'objective',
    question_no: question?.question_no != null ? String(question.question_no) : '',
    question_text: question?.question_text ?? '',
    options: question?.options?.length ? [...question.options] : ['', '', '', ''],
    option_images: question?.option_images?.length ? [...question.option_images] : [null, null, null, null] as (string | null)[],
    correct: question?.correct ?? '',
    explanation: question?.explanation ?? '',
    marking_scheme: question?.marking_scheme ?? '',
    topic: question?.topic ?? '',
    difficulty: question?.difficulty ?? 'medium',
  });
  const [images, setImages] = useState<string[]>(question?.images ?? []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const schemeRef = useRef<HTMLTextAreaElement>(null);
  const target = useRef<'question_text' | 'marking_scheme'>('question_text');
  const optTarget = useRef(0);
  const savedOptions = question?.options.length ?? 0;

  // Uploads a question image and drops its [image N] marker at the cursor.
  const insertPicker = usePicker(async (file) => {
    if (!question) return;
    setImgBusy(true); setErr('');
    try {
      const { data } = await saApi.post<Question>(`/api/pasco-bank/questions/${question.id}/images`, { image: await readAsDataUrl(file) });
      setImages(data.images);
      const field = target.current;
      const el = field === 'question_text' ? textRef.current : schemeRef.current;
      setF(cur => {
        const pos = el?.selectionStart ?? cur[field].length;
        const { text, cursor } = insertMarker(cur[field], pos, data.images.length);
        setTimeout(() => { el?.focus(); el?.setSelectionRange(cursor, cursor); }, 0);
        return { ...cur, [field]: text };
      });
    } catch (e) { setErr(errMsg(e, 'Could not add the image.')); }
    finally { setImgBusy(false); }
  });
  const replaceIdx = useRef(0);
  const replacePicker = usePicker(async (file) => {
    if (!question) return;
    setImgBusy(true); setErr('');
    try {
      const { data } = await saApi.post<Question>(`/api/pasco-bank/questions/${question.id}/images`, { image: await readAsDataUrl(file), replace: replaceIdx.current });
      setImages(data.images);
    } catch (e) { setErr(errMsg(e, 'Could not replace the image.')); }
    finally { setImgBusy(false); }
  });
  async function removeImage(n: number) {
    if (!question) return;
    setImgBusy(true); setErr('');
    try {
      const { data } = await saApi.delete<Question>(`/api/pasco-bank/questions/${question.id}/images/${n}`);
      setImages(data.images);
      setF(cur => ({ ...cur, question_text: renumberMarkers(cur.question_text, n), marking_scheme: renumberMarkers(cur.marking_scheme, n) }));
    } catch (e) { setErr(errMsg(e, 'Could not remove the image.')); }
    finally { setImgBusy(false); }
  }
  const optionPicker = usePicker(async (file) => {
    if (!question) return;
    const k = optTarget.current;
    setImgBusy(true); setErr('');
    try {
      const { data } = await saApi.post<Question>(`/api/pasco-bank/questions/${question.id}/options/${k + 1}/image`, { image: await readAsDataUrl(file) });
      setF(cur => { const oi = [...cur.option_images]; oi[k] = data.option_images[k]; return { ...cur, option_images: oi }; });
    } catch (e) { setErr(errMsg(e, 'Could not add the picture.')); }
    finally { setImgBusy(false); }
  });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (question) await saApi.put(`/api/pasco-bank/questions/${question.id}`, { ...f, checked: true });
      else await saApi.post(`/api/pasco-bank/papers/${paperId}/questions`, f);
      onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the question.')); }
    finally { setBusy(false); }
  }

  const objective = f.question_type === 'objective';
  const insertBtn = (field: 'question_text' | 'marking_scheme') => (
    <button type="button" style={btn('quiet', !question || imgBusy)} disabled={!question || imgBusy}
      onClick={() => { target.current = field; insertPicker.open(); }}>
      {imgBusy ? 'Uploading…' : 'Insert image at cursor'}
    </button>
  );
  return (
    <form onSubmit={save} style={{ background: P.card, border: `1px solid ${P.primary}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {insertPicker.input}{replacePicker.input}{optionPicker.input}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div><label style={label} htmlFor="qf-type">Type</label>
          <select id="qf-type" style={input} value={f.question_type} onChange={e => setF({ ...f, question_type: e.target.value as 'objective' | 'theory' })}>
            <option value="objective">Objective</option><option value="theory">Theory</option>
          </select></div>
        <div><label style={label} htmlFor="qf-no">Number</label><input id="qf-no" style={input} inputMode="numeric" value={f.question_no} onChange={e => setF({ ...f, question_no: e.target.value })} /></div>
        <div><label style={label} htmlFor="qf-topic">Topic</label><input id="qf-topic" style={input} value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} /></div>
        <div><label style={label} htmlFor="qf-diff">Difficulty</label>
          <select id="qf-diff" style={input} value={f.difficulty} onChange={e => setF({ ...f, difficulty: e.target.value as Question['difficulty'] })}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select></div>
      </div>

      <div>
        <label style={label} htmlFor="qf-text">Question</label>
        <textarea id="qf-text" ref={textRef} style={{ ...input, minHeight: 110, fontFamily: 'inherit' }} value={f.question_text} onChange={e => setF({ ...f, question_text: e.target.value })} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
          {insertBtn('question_text')}
          <span style={{ fontSize: 12, color: P.muted }}>
            {question ? 'Click in the text where the picture goes first. [image 1] marks the spot; move that line to move the picture.' : 'Add the question first, then edit it to add pictures.'}
          </span>
        </div>
      </div>

      {images.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={label}>Pictures in this question</span>
          {images.map((url, i) => {
            const placed = new RegExp(`\\[image${i === 0 ? '(\\s+1)?' : `\\s+${i + 1}`}\\]`, 'i').test(`${f.question_text}\n${f.marking_scheme}`);
            return (
              <div key={url + i} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Image ${i + 1}`} style={thumb} />
                <span style={{ fontSize: 13, color: P.ink2, minWidth: 140 }}>
                  [image {i + 1}]{!placed && <span style={{ color: P.muted }}> not placed, shows at the end</span>}
                </span>
                <button type="button" style={btn('quiet', imgBusy)} disabled={imgBusy} onClick={() => { replaceIdx.current = i + 1; replacePicker.open(); }}>Replace</button>
                <button type="button" style={btn('danger', imgBusy)} disabled={imgBusy} onClick={() => removeImage(i + 1)}>Remove</button>
              </div>
            );
          })}
        </div>
      )}

      {objective ? (
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={label}>Options (choose the answer). An option can be text, a picture, or both.</legend>
          {f.options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="radio" name="qf-correct" aria-label={`Option ${LETTERS[i]} is the answer`} checked={f.correct === LETTERS[i].toLowerCase()}
                onChange={() => setF({ ...f, correct: LETTERS[i].toLowerCase() })} style={{ width: 20, height: 20 }} />
              <span style={{ width: 16, color: P.ink2, fontWeight: 700 }}>{LETTERS[i]}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.option_images[i] && <img src={f.option_images[i]!} alt={`Option ${LETTERS[i]} picture`} style={thumb} />}
              <input style={{ ...input, flex: 1, minWidth: 160, width: 'auto' }} aria-label={`Option ${LETTERS[i]}`} value={o}
                placeholder={f.option_images[i] ? 'Optional text under the picture' : ''}
                onChange={e => { const next = [...f.options]; next[i] = e.target.value; setF({ ...f, options: next }); }} />
              {f.option_images[i] ? (
                <button type="button" style={btn('quiet', imgBusy)} disabled={imgBusy}
                  onClick={() => { const oi = [...f.option_images]; oi[i] = null; setF({ ...f, option_images: oi }); }}>Remove picture</button>
              ) : (
                <button type="button" style={btn('quiet', !question || imgBusy || i >= savedOptions)} disabled={!question || imgBusy || i >= savedOptions}
                  title={!question || i >= savedOptions ? 'Save the question first' : undefined}
                  onClick={() => { optTarget.current = i; optionPicker.open(); }}>Picture</button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            {f.options.length < 5 && <button type="button" style={btn()} onClick={() => setF({ ...f, options: [...f.options, ''], option_images: [...f.option_images, null] })}>Add option E</button>}
            {f.options.length > 2 && <button type="button" style={btn()} onClick={() => {
              const removed = LETTERS[f.options.length - 1].toLowerCase();
              setF({ ...f, options: f.options.slice(0, -1), option_images: f.option_images.slice(0, f.options.length - 1), correct: f.correct === removed ? '' : f.correct });
            }}>Remove last option</button>}
          </div>
          <div><label style={label} htmlFor="qf-exp">Explanation (optional)</label>
            <textarea id="qf-exp" style={{ ...input, minHeight: 60, fontFamily: 'inherit' }} value={f.explanation} onChange={e => setF({ ...f, explanation: e.target.value })} /></div>
        </fieldset>
      ) : (
        <div>
          <label style={label} htmlFor="qf-scheme">Marking scheme</label>
          <textarea id="qf-scheme" ref={schemeRef} style={{ ...input, minHeight: 120, fontFamily: 'inherit' }} value={f.marking_scheme} onChange={e => setF({ ...f, marking_scheme: e.target.value })} />
          <div style={{ marginTop: 8 }}>{insertBtn('marking_scheme')}</div>
        </div>
      )}

      {(f.question_text || images.length > 0) && (
        <div style={{ background: P.sunken, borderRadius: 10, padding: 12 }}>
          <span style={{ ...label, marginBottom: 8 }}>Preview</span>
          <RichQuestion text={f.question_text} images={images} placedElsewhere={f.marking_scheme} textStyle={{ fontSize: 15, color: P.ink }} imageStyle={{ maxHeight: 220 }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" style={btn('primary', busy)} disabled={busy}>{question ? 'Save and mark checked' : 'Add question'}</button>
        <button type="button" style={btn()} onClick={onCancel}>Cancel</button>
        {err && <span role="alert" style={{ fontSize: 13, color: P.bad }}>{err}</span>}
      </div>
    </form>
  );
}
