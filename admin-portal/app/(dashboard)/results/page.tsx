'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import type { AcademicYear, ReportRemark, StudentResult } from '@/types/api';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Inline SVG dummy avatars ──────────────────────────────────────────────────
function MaleAvatar() {
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <rect width="80" height="80" fill="#dbeafe" rx="4" />
      <circle cx="40" cy="28" r="15" fill="#93c5fd" />
      <ellipse cx="40" cy="70" rx="24" ry="16" fill="#93c5fd" />
    </svg>
  );
}
function FemaleAvatar() {
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <rect width="80" height="80" fill="#fce7f3" rx="4" />
      <circle cx="40" cy="28" r="15" fill="#f9a8d4" />
      <path d="M16 80 Q40 52 64 80 Z" fill="#f9a8d4" />
    </svg>
  );
}

// ── A4 Report Card ────────────────────────────────────────────────────────────
interface ReportCardProps {
  result:        StudentResult;
  className:     string;
  yearName:      string;
  semester:      string;
  caLabel:       string;
  exLabel:       string;
  schoolName:    string;
  schoolAddress: string;
  schoolLogo:    string | null;
  remark:        ReportRemark | null;
  isLast:        boolean;
}

function ReportCard({ result, className, yearName, semester, caLabel, exLabel, schoolName, schoolAddress, schoolLogo, remark, isLast }: ReportCardProps) {
  const subjects = result.subjects.filter(s => s.total != null);
  const maxScore = 100;

  const gradeColor = (g: string) =>
    ['A1','B2','B3','A','B+','B-'].includes(g) ? '#15803D' :
    ['F9','F','E8'].includes(g) ? '#DC2626' : '#D97706';

  const barColor = (t: number | null) =>
    t == null ? '#e5e7eb' : t >= 70 ? '#15803D' : t >= 50 ? '#D97706' : '#DC2626';

  const page: React.CSSProperties = {
    width: '210mm', minHeight: '297mm', padding: '12mm 13mm 10mm',
    boxSizing: 'border-box',
    pageBreakAfter: isLast ? 'auto' : 'always',
    breakAfter: isLast ? 'auto' : 'page',
    fontFamily: "'Arial', 'Helvetica', sans-serif",
    fontSize: '9pt', color: '#1a1a1a',
    background: '#fff',
    display: 'flex', flexDirection: 'column', gap: '7px',
  };

  const GREEN  = '#1a5c38';
  const LGREEN = '#f0faf5';

  return (
    <div style={page}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `3px solid ${GREEN}`, paddingBottom: '8px' }}>
        {/* Logo */}
        <div style={{ width: '60px', height: '60px', flexShrink: 0, border: `1px solid #e5e7eb`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
          {schoolLogo
            ? <img src={schoolLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '36px', height: '36px' }}>
                <rect width="48" height="48" rx="8" fill={GREEN} />
                <path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" fill="white" fillOpacity=".9" />
                <path d="M24 14L32 20V28L24 34L16 28V20L24 14Z" fill={GREEN} />
                <circle cx="24" cy="24" r="4" fill="white" />
              </svg>
          }
        </div>
        {/* School name */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '15pt', fontWeight: 900, color: GREEN, letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: 1.2 }}>
            {schoolName || 'SCHOOL NAME'}
          </div>
          {schoolAddress && <div style={{ fontSize: '8pt', color: '#555', marginTop: '2px' }}>{schoolAddress}</div>}
          <div style={{ marginTop: '4px', fontSize: '10pt', fontWeight: 700, letterSpacing: '1.5px', color: '#333', textTransform: 'uppercase' }}>
            Student Academic Report Card
          </div>
          <div style={{ fontSize: '8.5pt', color: '#555', marginTop: '2px' }}>
            {yearName} &nbsp;·&nbsp; Semester {semester}
          </div>
        </div>
        {/* Student photo */}
        <div style={{ width: '60px', height: '72px', flexShrink: 0, border: `2px solid ${GREEN}`, borderRadius: '6px', overflow: 'hidden' }}>
          {result.picture_url
            ? <img src={result.picture_url} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : result.gender?.toLowerCase() === 'female'
              ? <FemaleAvatar />
              : <MaleAvatar />
          }
        </div>
      </div>

      {/* ── Student Info ── */}
      <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '5px', padding: '6px 10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '15%', fontWeight: 700, color: '#555', paddingBottom: '3px' }}>Full Name</td>
              <td style={{ width: '35%', fontWeight: 700, paddingBottom: '3px', borderBottom: `1px solid #b0d4c4` }}>{result.name}</td>
              <td style={{ width: '15%', fontWeight: 700, color: '#555', paddingLeft: '12px', paddingBottom: '3px' }}>Class</td>
              <td style={{ width: '35%', fontWeight: 700, paddingBottom: '3px', borderBottom: `1px solid #b0d4c4` }}>{className}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '3px' }}>Student ID</td>
              <td style={{ paddingTop: '3px' }}>{result.student_code}</td>
              <td style={{ fontWeight: 700, color: '#555', paddingLeft: '12px', paddingTop: '3px' }}>Programme</td>
              <td style={{ paddingTop: '3px' }}>{result.program_name ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Summary Boxes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px' }}>
        {[
          { label: 'Class Average',  value: result.average != null ? String(result.average) : '—',   big: true },
          { label: 'Class Position', value: result.class_position ? `${ordinal(result.class_position)} / ${result.class_total ?? '?'}` : '—' },
          { label: 'Overall Grade',  value: result.overall_grade },
          { label: 'Subjects Sat',   value: String(subjects.length) },
        ].map(({ label, value, big }) => (
          <div key={label} style={{ border: `1.5px solid ${GREEN}`, borderRadius: '5px', padding: '5px 4px', textAlign: 'center', background: '#fff' }}>
            <div style={{ fontSize: '7pt', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: big ? '14pt' : '12pt', fontWeight: 900, color: GREEN, marginTop: '2px', lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Subject Table ── */}
      <div>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ height: '2px', width: '14px', background: GREEN }} />
          Subject Breakdown
          <div style={{ flex: 1, height: '1px', background: '#c6e8d8' }} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <thead>
            <tr style={{ background: GREEN, color: '#fff' }}>
              {['Subject', caLabel, exLabel, 'Total', 'Grade', 'Position', 'Remarks'].map((h, i) => (
                <th key={h} style={{ padding: '4px 5px', textAlign: i === 0 ? 'left' : 'center', fontWeight: 700, fontSize: '7.5pt', letterSpacing: '0.3px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((s, i) => (
              <tr key={s.subject} style={{ background: i % 2 === 0 ? '#fff' : LGREEN, borderBottom: `1px solid #dde8e3` }}>
                <td style={{ padding: '3.5px 5px', fontWeight: 500 }}>{s.subject}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center' }}>{s.ca_score ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center' }}>{s.exam_score ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center', fontWeight: 700, color: barColor(s.total) }}>{s.total ?? '—'}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center', fontWeight: 700, color: gradeColor(s.grade) }}>{s.grade}</td>
                <td style={{ padding: '3.5px 5px', textAlign: 'center', fontSize: '8pt', color: '#555' }}>
                  {s.subject_position ? `${ordinal(s.subject_position)}/${s.class_size}` : '—'}
                </td>
                <td style={{ padding: '3.5px 5px', fontSize: '8pt', color: '#444' }}>
                  {s.remark && s.remark !== '-' ? s.remark : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Performance Chart ── */}
      {subjects.length > 0 && (
        <div>
          <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ height: '2px', width: '14px', background: GREEN }} />
            Performance Overview
            <div style={{ flex: 1, height: '1px', background: '#c6e8d8' }} />
            <span style={{ fontSize: '7pt', fontWeight: 400, color: '#888', textTransform: 'none' }}>
              <span style={{ color: '#15803D' }}>■</span> ≥70 &nbsp;
              <span style={{ color: '#D97706' }}>■</span> 50–69 &nbsp;
              <span style={{ color: '#DC2626' }}>■</span> &lt;50
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5px' }}>
            {subjects.map(s => (
              <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '7.5pt' }}>
                <div style={{ width: '110px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#444', flexShrink: 0 }}>{s.subject}</div>
                <div style={{ flex: 1, background: '#f0f0f0', height: '10px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min((s.total ?? 0), maxScore)}%`, background: barColor(s.total), borderRadius: '2px' }} />
                </div>
                <div style={{ width: '28px', textAlign: 'right', fontWeight: 700, color: barColor(s.total), flexShrink: 0 }}>{s.total}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Remarks ── */}
      <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '5px', padding: '6px 10px' }}>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginBottom: '5px' }}>
          Form Teacher&apos;s Remarks
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '12%', fontWeight: 700, color: '#555', paddingBottom: '5px' }}>Attitude</td>
              <td style={{ width: '38%', paddingBottom: '5px', borderBottom: '1px solid #b0d4c4', fontWeight: 600 }}>
                {remark?.attitude || <span style={{ color: '#bbb' }}>—</span>}
              </td>
              <td style={{ width: '12%', fontWeight: 700, color: '#555', paddingLeft: '12px', paddingBottom: '5px' }}>Conduct</td>
              <td style={{ width: '38%', paddingBottom: '5px', borderBottom: '1px solid #b0d4c4', fontWeight: 600 }}>
                {remark?.conduct || <span style={{ color: '#bbb' }}>—</span>}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '5px', verticalAlign: 'top' }}>Remarks</td>
              <td colSpan={3} style={{ paddingTop: '5px', borderBottom: '1px solid #b0d4c4', paddingBottom: '5px', minHeight: '20px' }}>
                {remark?.general_remarks || <span style={{ color: '#bbb' }}>—</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Signatures ── */}
      <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: `1px dashed #c6e8d8` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '33%', paddingTop: '22px', paddingRight: '20px' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Class Teacher&apos;s Signature &amp; Date</div>
              </td>
              <td style={{ width: '34%', paddingTop: '22px', textAlign: 'center' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Next Term Begins</div>
              </td>
              <td style={{ width: '33%', paddingTop: '22px', paddingLeft: '20px', textAlign: 'right' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Headmaster&apos;s Signature &amp; Date</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── Remarks Modal ─────────────────────────────────────────────────────────────
const RATING_OPTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];

function RemarksModal({
  results, yearId, semester, remarksMap, onSave, onClose,
}: {
  results:    StudentResult[];
  yearId:     string;
  semester:   string;
  remarksMap: Record<string, ReportRemark>;
  onSave:     (map: Record<string, ReportRemark>) => void;
  onClose:    () => void;
}) {
  const [draft, setDraft] = useState<Record<string, ReportRemark>>(() => {
    const init: Record<string, ReportRemark> = {};
    for (const r of results) {
      init[r.student_id] = remarksMap[r.student_id] ?? { student_id: r.student_id, attitude: null, conduct: null, general_remarks: null };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function update(studentId: string, field: keyof ReportRemark, value: string) {
    setDraft(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value || null } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.post('/api/results/remarks', {
        academic_year_id: yearId,
        semester,
        remarks: Object.values(draft),
      });
      onSave(draft);
      setSaved(true);
      setTimeout(onClose, 800);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  const sel = 'border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-[#F4EFE6] text-[#2C2218] focus:outline-none focus:ring-1 focus:ring-green-500 w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1">
            <p className="font-bold text-slate-800">Form Teacher Remarks</p>
            <p className="text-xs text-slate-500 mt-0.5">Enter attitude, conduct, and general remarks for each student</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-center w-36">Attitude</th>
                <th className="px-4 py-3 text-center w-36">Conduct</th>
                <th className="px-4 py-3 text-left">General Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map(r => (
                <tr key={r.student_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800 text-sm">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.student_code}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={draft[r.student_id]?.attitude ?? ''} onChange={e => update(r.student_id, 'attitude', e.target.value)} className={sel}>
                      <option value="">—</option>
                      {RATING_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={draft[r.student_id]?.conduct ?? ''} onChange={e => update(r.student_id, 'conduct', e.target.value)} className={sel}>
                      <option value="">—</option>
                      {RATING_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={draft[r.student_id]?.general_remarks ?? ''}
                      onChange={e => update(r.student_id, 'general_remarks', e.target.value)}
                      placeholder="Type remarks…"
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Remarks'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────
const COL_MAP: Record<string, string> = {
  'student id': 'student_code', 'student_id': 'student_code', 'student_code': 'student_code',
  'academic year': 'academic_year_name', 'academic_year': 'academic_year_name', 'academic year name': 'academic_year_name',
  'semester': 'semester', 'subject': 'subject',
  'class score': 'class_score', 'class_score': 'class_score',
  'exam score': 'exam_score',  'exam_score':  'exam_score',
  'total score': 'total_score', 'total_score': 'total_score',
  'grade': 'grade', 'remarks': 'remarks', 'remark': 'remarks',
  'category': '_ignore', 'student name': '_ignore', 'student_name': '_ignore', 'timestamp': '_ignore',
};

interface ImportRow { student_code: string; academic_year_name: string; semester: string; subject: string; class_score: string; exam_score: string; total_score: string; grade: string; remarks: string; [k: string]: string; }
interface ImportResult { total: number; inserted: number; updated: number; skipped: number; errors: { row: number; student_code: string; error: string }[]; }

function parseCsv(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const colKeys = headers.map(h => COL_MAP[h.toLowerCase()] ?? null);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const row: ImportRow = { student_code: '', academic_year_name: '', semester: '', subject: '', class_score: '', exam_score: '', total_score: '', grade: '', remarks: '' };
    headers.forEach((_, i) => { const key = colKeys[i]; if (key && key !== '_ignore') row[key] = cells[i] ?? ''; });
    return row;
  });
}

const CHUNK_SIZE = 2000;

function ImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  function handleText(text: string) { setCsvText(text); setPreview(parseCsv(text).slice(0, 10)); setResult(null); setError(''); }
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = ev => handleText(String(ev.target?.result ?? '')); reader.readAsText(file);
  }
  async function handleImport() {
    const allParsed = parseCsv(csvText);
    if (allParsed.length === 0) { setError('No valid rows parsed.'); return; }
    setLoading(true); setError(''); setResult(null);
    const accumulated: ImportResult = { total: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
    const chunks: ImportRow[][] = [];
    for (let i = 0; i < allParsed.length; i += CHUNK_SIZE) chunks.push(allParsed.slice(i, i + CHUNK_SIZE));
    setProgress({ done: 0, total: chunks.length });
    try {
      for (let c = 0; c < chunks.length; c++) {
        const { data } = await api.post<ImportResult>('/api/results/import', { rows: chunks[c] });
        accumulated.total += data.total; accumulated.inserted += data.inserted; accumulated.updated += data.updated;
        accumulated.skipped += data.skipped; accumulated.errors.push(...data.errors);
        setProgress({ done: c + 1, total: chunks.length });
      }
      setResult(accumulated);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Import failed.');
    } finally { setLoading(false); }
  }
  const allRows = parseCsv(csvText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1"><p className="font-bold text-slate-800">Import Historical Results</p><p className="text-xs text-slate-500 mt-0.5">CSV from Google Sheets</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            <p className="font-semibold mb-0.5">Expected columns</p>
            <p className="opacity-80">Timestamp · Student ID · Student Name · Academic Year · Semester · Subject · Category · Class Score · Exam Score · Total Score · Grade · Remarks</p>
          </div>
          {!result && <>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Upload CSV file</label>
              <div className="flex gap-3 items-center">
                <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Choose file…</button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                <span className="text-xs text-slate-400">or paste below</span>
              </div>
            </div>
            <textarea value={csvText} onChange={e => handleText(e.target.value)} rows={5} placeholder="Timestamp,Student ID,Student Name,Academic Year,Semester,Subject,…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
          </>}
          {!result && preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preview — {allRows.length} rows</p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs"><thead className="bg-slate-50"><tr className="text-[10px] font-semibold text-slate-500 uppercase"><th className="px-3 py-2 text-left">Student ID</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Sem</th><th className="px-3 py-2 text-left">Subject</th><th className="px-3 py-2">CA</th><th className="px-3 py-2">Exam</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Grade</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{preview.map((r, i) => (<tr key={i}><td className="px-3 py-1.5 font-mono">{r.student_code}</td><td className="px-3 py-1.5 text-center">{r.academic_year_name}</td><td className="px-3 py-1.5 text-center">{r.semester}</td><td className="px-3 py-1.5 max-w-[160px] truncate">{r.subject}</td><td className="px-3 py-1.5 text-center">{r.class_score}</td><td className="px-3 py-1.5 text-center">{r.exam_score}</td><td className="px-3 py-1.5 text-center font-bold">{r.total_score}</td><td className="px-3 py-1.5 text-center">{r.grade}</td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[{l:'Total',v:result.total,c:'text-slate-800'},{l:'Inserted',v:result.inserted,c:'text-green-700'},{l:'Updated',v:result.updated,c:'text-blue-700'},{l:'Skipped',v:result.skipped,c:'text-amber-700'}].map(({l,v,c})=>(
                  <div key={l} className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-slate-500 uppercase">{l}</p><p className={`text-2xl font-bold mt-0.5 ${c}`}>{v}</p></div>
                ))}
              </div>
              {result.errors.length > 0 && <div className="border border-red-200 rounded-xl overflow-hidden"><table className="w-full text-xs"><thead className="bg-red-50"><tr><th className="px-3 py-2 text-left text-red-700">Row</th><th className="px-3 py-2 text-left text-red-700">ID</th><th className="px-3 py-2 text-left text-red-700">Error</th></tr></thead><tbody className="divide-y divide-red-100">{result.errors.map((e,i)=>(<tr key={i}><td className="px-3 py-1.5">{e.row}</td><td className="px-3 py-1.5 font-mono">{e.student_code}</td><td className="px-3 py-1.5 text-red-700">{e.error}</td></tr>))}</tbody></table></div>}
              {result.skipped === 0 && result.errors.length === 0 && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center font-semibold">All rows imported successfully!</p>}
            </div>
          )}
        </div>
        {loading && progress.total > 1 && (
          <div className="px-6 pb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Uploading…</span><span>{progress.done}/{progress.total}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
          </div>
        )}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          {result ? <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700">Done</button>
            : <><button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleImport} disabled={loading || allRows.length === 0} className="px-5 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {loading && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                {loading ? `Chunk ${progress.done}/${progress.total}…` : `Import ${allRows.length} rows`}
              </button></>}
        </div>
      </div>
    </div>
  );
}

// ── Badges (screen only) ──────────────────────────────────────────────────────
function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const color = value >= 70 ? '#15803D' : value >= 50 ? '#D97706' : '#DC2626';
  return <span style={{ color }} className="font-bold">{value}</span>;
}
function GradeBadge({ grade }: { grade: string }) {
  const isGood = ['A1','B2','B3','A','B+','B','B-'].includes(grade);
  const isFail = ['F9','F','E8','E'].includes(grade);
  const bg = isGood ? '#DCFCE7' : isFail ? '#FEE2E2' : '#FEF3C7';
  const color = isGood ? '#15803D' : isFail ? '#DC2626' : '#D97706';
  return <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: bg, color }}>{grade}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
interface SchoolProfile { name: string; address: string | null; logo_url: string | null; }

export default function ResultsPage() {
  const [years,         setYears]         = useState<AcademicYear[]>([]);
  const [classes,       setClasses]       = useState<string[]>([]);
  const [yearId,        setYearId]        = useState('');
  const [semester,      setSemester]      = useState('1');
  const [className,     setClassName]     = useState('');
  const [results,       setResults]       = useState<StudentResult[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [loadingMeta,   setLoadingMeta]   = useState(true);
  const [error,         setError]         = useState('');
  const [selected,      setSelected]      = useState<StudentResult | null>(null);
  const [showImport,    setShowImport]    = useState(false);
  const [showRemarks,   setShowRemarks]   = useState(false);
  const [school,        setSchool]        = useState<SchoolProfile>({ name: '', address: null, logo_url: null });
  const [remarksMap,    setRemarksMap]    = useState<Record<string, ReportRemark>>({});
  const [printTarget,   setPrintTarget]   = useState<'all' | StudentResult | null>(null);

  useEffect(() => {
    api.get<SchoolProfile>('/api/admin/school-profile').then(r => setSchool(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      api.get<AcademicYear[]>('/api/academic-years'),
      api.get<string[]>('/api/students/classes'),
    ]).then(([yRes, cRes]) => {
      setYears(yRes.data);
      const current = yRes.data.find(y => y.is_current);
      if (current) { setYearId(current.id); setSemester(String(current.current_semester ?? 1)); }
      else if (yRes.data[0]) setYearId(yRes.data[0].id);
      setClasses(cRes.data);
    }).catch(() => setError('Failed to load filters.')).finally(() => setLoadingMeta(false));
  }, []);

  const load = useCallback(async () => {
    if (!yearId || !semester || !className) return;
    setLoading(true); setError(''); setSelected(null);
    try {
      const [rRes, mkRes] = await Promise.all([
        api.get<StudentResult[]>('/api/results', { params: { academic_year_id: yearId, semester, class_name: className } }),
        api.get<ReportRemark[]>('/api/results/remarks', { params: { academic_year_id: yearId, semester, class_name: className } }),
      ]);
      setResults(rRes.data);
      const map: Record<string, ReportRemark> = {};
      for (const r of mkRes.data) map[r.student_id] = r;
      setRemarksMap(map);
    } catch { setError('Failed to load results.'); }
    finally { setLoading(false); }
  }, [yearId, semester, className]);

  useEffect(() => { load(); }, [load]);

  const yearName = years.find(y => y.id === yearId)?.name ?? '';
  const caLabel  = results[0] ? `CA (${results[0].ca_percentage}%)` : 'CA';
  const exLabel  = results[0] ? `Exam (${results[0].exam_percentage}%)` : 'Exam';
  const sorted   = results.slice().sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999));

  const selectStyle = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent';

  function triggerPrint(target: 'all' | StudentResult) {
    flushSync(() => setPrintTarget(target));
    window.print();
  }

  const printStudents = printTarget === 'all' ? sorted : printTarget ? [printTarget] : [];

  return (
    <>
      <style>{`
        #print-area { display: none; }
        @media print {
          body * { visibility: hidden; }
          #print-area {
            display: block !important;
            visibility: visible !important;
            position: fixed;
            top: 0; left: 0;
            width: 100%;
            background: white;
            z-index: 9999;
          }
          #print-area * { visibility: visible !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      {/* Print area */}
      <div id="print-area">
        {printStudents.map((r, i) => (
          <ReportCard
            key={r.student_id}
            result={r}
            className={className}
            yearName={yearName}
            semester={semester}
            caLabel={caLabel}
            exLabel={exLabel}
            schoolName={school.name}
            schoolAddress={school.address ?? ''}
            schoolLogo={school.logo_url}
            remark={remarksMap[r.student_id] ?? null}
            isLast={i === printStudents.length - 1}
          />
        ))}
      </div>

      {/* Screen UI */}
      <div className="space-y-5">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)} className={selectStyle} disabled={loadingMeta}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)} className={selectStyle}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</label>
            <select value={className} onChange={e => setClassName(e.target.value)} className={selectStyle} disabled={loadingMeta}>
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {results.length > 0 && (
              <>
                <button onClick={() => setShowRemarks(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Edit Remarks
                </button>
                <button onClick={() => triggerPrint('all')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Print All ({results.length})
                </button>
              </>
            )}
            <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4-4 4M12 4v12" /></svg>
              Import Historical
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

        {!className ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-slate-300 mx-auto mb-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p className="text-slate-500 text-sm">Select a class to view results</p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500 text-sm">No results found for {className} — {yearName} Semester {semester}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800">{className}</p>
              <p className="text-xs text-slate-500">{yearName} · Semester {semester} · {results.length} students</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Pos</th>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-center">Subjects</th>
                    <th className="px-4 py-3 text-center">Average</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                    <th className="px-4 py-3 text-center">Remarks</th>
                    <th className="px-4 py-3 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map(r => (
                    <tr key={r.student_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-700">{r.class_position ? ordinal(r.class_position) : '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{r.name}</p>
                        <p className="text-xs text-slate-400">{r.student_code}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{r.subjects.length}</td>
                      <td className="px-4 py-3 text-center"><ScoreBadge value={r.average} /></td>
                      <td className="px-4 py-3 text-center"><GradeBadge grade={r.overall_grade} /></td>
                      <td className="px-4 py-3 text-center">
                        {remarksMap[r.student_id]?.attitude
                          ? <span className="text-xs text-green-700 font-semibold">{remarksMap[r.student_id].attitude}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setSelected(r)} className="text-xs font-semibold text-green-700 hover:text-green-900">View →</button>
                          <button onClick={() => triggerPrint(r)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Report card slide-in panel */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
            <div className="h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{selected.name}</p>
                  <p className="text-xs text-slate-500">{selected.student_code} · {className} · {yearName} · Semester {semester}</p>
                </div>
                <button onClick={() => triggerPrint(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Print Card
                </button>
              </div>
              <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-slate-100">
                <div className="text-center"><p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Average</p><p className="text-2xl font-bold text-green-700">{selected.average ?? '—'}</p></div>
                <div className="text-center border-x border-slate-100"><p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Class Position</p><p className="text-2xl font-bold text-slate-800">{selected.class_position ? ordinal(selected.class_position) : '—'}{selected.class_total ? <span className="text-sm font-normal text-slate-400"> / {selected.class_total}</span> : null}</p></div>
                <div className="text-center"><p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Overall Grade</p><div className="flex justify-center mt-1"><GradeBadge grade={selected.overall_grade} /></div></div>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Subject Breakdown</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead><tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide"><th className="px-3 py-2.5 text-left">Subject</th><th className="px-3 py-2.5 text-center">{caLabel}</th><th className="px-3 py-2.5 text-center">{exLabel}</th><th className="px-3 py-2.5 text-center">Total</th><th className="px-3 py-2.5 text-center">Grade</th><th className="px-3 py-2.5 text-center">Position</th><th className="px-3 py-2.5 text-left">Remarks</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {selected.subjects.map(s => (
                        <tr key={s.subject} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-medium text-slate-800">{s.subject}</td>
                          <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.ca_score} /></td>
                          <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.exam_score} /></td>
                          <td className="px-3 py-2.5 text-center"><ScoreBadge value={s.total} /></td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-700">{s.grade}</td>
                          <td className="px-3 py-2.5 text-center text-slate-500 text-xs">{s.subject_position ? `${ordinal(s.subject_position)} / ${s.class_size}` : '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 text-xs">{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {remarksMap[selected.student_id] && (
                <div className="px-6 pb-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Form Teacher&apos;s Remarks</p>
                  <div className="bg-green-50 rounded-xl border border-green-100 p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs font-semibold text-slate-500 uppercase">Attitude</span><p className="font-semibold text-slate-800 mt-0.5">{remarksMap[selected.student_id].attitude ?? '—'}</p></div>
                    <div><span className="text-xs font-semibold text-slate-500 uppercase">Conduct</span><p className="font-semibold text-slate-800 mt-0.5">{remarksMap[selected.student_id].conduct ?? '—'}</p></div>
                    {remarksMap[selected.student_id].general_remarks && (
                      <div className="col-span-2"><span className="text-xs font-semibold text-slate-500 uppercase">General Remarks</span><p className="text-slate-700 mt-0.5">{remarksMap[selected.student_id].general_remarks}</p></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showRemarks && (
          <RemarksModal
            results={sorted}
            yearId={yearId}
            semester={semester}
            remarksMap={remarksMap}
            onSave={setRemarksMap}
            onClose={() => setShowRemarks(false)}
          />
        )}
        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      </div>
    </>
  );
}
