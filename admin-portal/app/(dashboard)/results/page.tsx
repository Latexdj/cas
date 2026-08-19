'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination } from '@/components/ui/Pagination';
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
  result:             StudentResult;
  className:          string;
  yearName:           string;
  semester:           string;
  caLabel:            string;
  exLabel:            string;
  schoolName:         string;
  schoolAddress:      string;
  schoolLogo:         string | null;
  schoolSignature:    string | null;
  remark:             ReportRemark | null;
  isLast:             boolean;
}

function ReportCard({ result, className, yearName, semester, caLabel, exLabel, schoolName, schoolAddress, schoolLogo, schoolSignature, remark, isLast }: ReportCardProps) {
  const subjects = result.subjects.filter(s => s.total != null);
  const maxScore = 100;

  const gradeColor = (g: string) =>
    ['A1','B2','B3','A','B+','B-'].includes(g) ? '#145C44' :
    ['F9','F','E8'].includes(g) ? '#DC2626' : '#D97706';

  const barColor = (t: number | null) =>
    t == null ? '#e5e7eb' : t >= 70 ? '#145C44' : t >= 50 ? '#D97706' : '#DC2626';

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
        <div style={{ width: '60px', height: '60px', flexShrink: 0, border: `1px solid #e5e7eb`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F0E8' }}>
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

      {/* ── Attendance ── */}
      {result.attendance && (
        <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '5px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: GREEN, marginRight: '4px' }}>Attendance</span>
          {[
            { label: 'Periods Present', value: result.attendance.present, color: '#145C44' },
            { label: 'Late',            value: result.attendance.late,    color: '#D97706' },
            { label: 'Absent',          value: result.attendance.absent,  color: '#DC2626' },
            { label: 'Total Periods',   value: result.attendance.total,   color: '#333'    },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', border: `1px solid #c6e8d8`, borderRadius: '4px', padding: '3px 8px', background: '#fff', minWidth: '60px' }}>
              <span style={{ fontSize: '11pt', fontWeight: 900, color, lineHeight: 1.1 }}>{value}</span>
              <span style={{ fontSize: '6.5pt', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '1px' }}>{label}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: '8.5pt', fontWeight: 700, color: GREEN }}>
            {result.attendance.present} / {result.attendance.total} periods
          </div>
        </div>
      )}

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
              <span style={{ color: '#145C44' }}>■</span> ≥70 &nbsp;
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
              <td style={{ width: '33%', paddingLeft: '20px', textAlign: 'right' }}>
                {schoolSignature && (
                  <img src={schoolSignature} alt="Headmaster signature"
                    style={{ height: '36px', maxWidth: '120px', objectFit: 'contain', display: 'inline-block', marginBottom: '2px' }} />
                )}
                {!schoolSignature && <div style={{ paddingTop: '22px' }} />}
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

  const sel = 'border border-[#E2D9CC] rounded-lg px-2 py-1.5 text-xs bg-[#F4EFE6] text-[#2C2218] focus:outline-none focus:ring-1 focus:ring-[#145C44] w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
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
              <tr className="text-xs font-semibold text-slate-500 font-medium border-b border-slate-100">
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
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-[#145C44]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#145C44] text-white hover:bg-[#145C44] disabled:opacity-50 flex items-center gap-2">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-white border-b-transparent animate-spin" />}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/55 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
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
              <label className="text-xs font-semibold text-slate-500 font-medium block mb-1.5">Upload CSV file</label>
              <div className="flex gap-3 items-center">
                <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Choose file…</button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                <span className="text-xs text-slate-400">or paste below</span>
              </div>
            </div>
            <textarea value={csvText} onChange={e => handleText(e.target.value)} rows={5} placeholder="Timestamp,Student ID,Student Name,Academic Year,Semester,Subject,…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#145C44] resize-none" />
          </>}
          {!result && preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 font-medium mb-2">Preview — {allRows.length} rows</p>
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
                {[{l:'Total',v:result.total,c:'text-slate-800'},{l:'Inserted',v:result.inserted,c:'text-[#145C44]'},{l:'Updated',v:result.updated,c:'text-blue-700'},{l:'Skipped',v:result.skipped,c:'text-amber-700'}].map(({l,v,c})=>(
                  <div key={l} className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[10px] font-semibold text-slate-500 uppercase">{l}</p><p className={`text-2xl font-bold mt-0.5 ${c}`}>{v}</p></div>
                ))}
              </div>
              {result.errors.length > 0 && <div className="border border-red-200 rounded-xl overflow-hidden"><table className="w-full text-xs"><thead className="bg-red-50"><tr><th className="px-3 py-2 text-left text-red-700">Row</th><th className="px-3 py-2 text-left text-red-700">ID</th><th className="px-3 py-2 text-left text-red-700">Error</th></tr></thead><tbody className="divide-y divide-red-100">{result.errors.map((e,i)=>(<tr key={i}><td className="px-3 py-1.5">{e.row}</td><td className="px-3 py-1.5 font-mono">{e.student_code}</td><td className="px-3 py-1.5 text-red-700">{e.error}</td></tr>))}</tbody></table></div>}
              {result.skipped === 0 && result.errors.length === 0 && <p className="text-sm text-[#145C44] bg-[#E8F4EE] border border-[#B8D9C8] rounded-xl px-4 py-3 text-center font-semibold">All rows imported successfully!</p>}
            </div>
          )}
        </div>
        {loading && progress.total > 1 && (
          <div className="px-6 pb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Uploading…</span><span>{progress.done}/{progress.total}</span></div>
            <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-[#145C44] h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
          </div>
        )}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          {result ? <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#145C44] text-white hover:bg-[#145C44]">Done</button>
            : <><button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleImport} disabled={loading || allRows.length === 0} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#145C44] text-white hover:bg-[#145C44] disabled:opacity-50 flex items-center gap-2">
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
  const color = value >= 70 ? '#145C44' : value >= 50 ? '#D97706' : '#DC2626';
  return <span style={{ color }} className="font-bold">{value}</span>;
}
function GradeBadge({ grade }: { grade: string }) {
  const isGood = ['A1','B2','B3','A','B+','B','B-'].includes(grade);
  const isFail = ['F9','F','E8','E'].includes(grade);
  const bg = isGood ? '#DCFCE7' : isFail ? '#FEE2E2' : '#FEF3C7';
  const color = isGood ? '#145C44' : isFail ? '#DC2626' : '#D97706';
  return <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: bg, color }}>{grade}</span>;
}

// ── Approval queue types ──────────────────────────────────────────────────────
interface FinalQueueItem {
  id: string;
  subject: string;
  class_name: string;
  status: 'submitted' | 'hod_approved' | 'final_approved' | 'published';
  submitted_at: string;
  hod_reviewed_at: string | null;
  hod_comment: string | null;
  final_reviewed_at: string | null;
  final_comment: string | null;
  rejected_reason: string | null;
  published_at: string | null;
  academic_year_id: string;
  teacher_name: string;
  hod_name: string | null;
  academic_year: string;
  semester: number;
  student_count: number;
}

const SUB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  submitted:      { label: 'Awaiting HOD',   color: '#B83232', bg: '#FEF2F2' },
  hod_approved:   { label: 'HOD Approved',   color: '#C8780A', bg: '#FEF3C7' },
  final_approved: { label: 'Final Approved', color: '#145C44', bg: '#E8F4EE' },
  published:      { label: 'Published',      color: '#0B3D2E', bg: '#D1EAD9' },
};

// ── Main Page ─────────────────────────────────────────────────────────────────
interface SchoolProfile { name: string; address: string | null; logo_url: string | null; headmaster_signature_url: string | null; }

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
  const [school,        setSchool]        = useState<SchoolProfile>({ name: '', address: null, logo_url: null, headmaster_signature_url: null });
  const [remarksMap,    setRemarksMap]    = useState<Record<string, ReportRemark>>({});
  const [printTarget,   setPrintTarget]   = useState<'all' | StudentResult | null>(null);

  // ── Non-submitters state ──
  interface NonSubmitter { teacher_id: string; teacher_name: string; department: string | null; subject: string; class_name: string; submission_status: 'not_started' | 'draft' | 'rejected'; submission_id: string | null; }
  interface NsDebug {
    params: Record<string,unknown>;
    source_counts: Record<string, unknown> & {
      timetable_raw_rows: number | null;
      timetable_distinct_teacher_subject_class: number | null;
      timetable_after_teacher_join: number | null;
      assessments: {total:number|null;with_teacher_id:number|null} | null;
      assessments_after_teacher_join: number | null;
      exam_scores: {total:number|null} | null;
      result_submissions_by_status: {status:string;count:number}[];
    };
    pipeline: Record<string,unknown> & { total_union_candidates: number | null; final_non_submitter_count: number | null; };
    samples: { timetable_rows: Record<string,unknown>[]; submission_rows: Record<string,unknown>[]; };
  }
  const [nonSubmitters,        setNonSubmitters]        = useState<NonSubmitter[]>([]);
  const [nonSubmittersLoading, setNonSubmittersLoading] = useState(false);
  const [showNonSubmitters,    setShowNonSubmitters]    = useState(false);
  const [nsClassFilter,        setNsClassFilter]        = useState('');
  const [nsSubjectFilter,      setNsSubjectFilter]      = useState('');
  const [nsDeptFilter,         setNsDeptFilter]         = useState('');
  const [nsDebug,              setNsDebug]              = useState<NsDebug | null>(null);
  const [nsDebugLoading,       setNsDebugLoading]       = useState(false);
  const [nsLoadError,          setNsLoadError]          = useState<string | null>(null);

  // ── Approval queue state ──
  const [approvalQueue,   setApprovalQueue]   = useState<FinalQueueItem[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalTarget,  setApprovalTarget]  = useState<FinalQueueItem | null>(null);
  const [approvalAction,  setApprovalAction]  = useState<'hod_approve' | 'hod_reject' | 'approve' | 'reject' | 'publish' | 'unlock'>('approve');
  const [approvalComment, setApprovalComment] = useState('');
  const [approving,       setApproving]       = useState(false);
  const [approvalError,   setApprovalError]   = useState('');
  const [showApprovals,      setShowApprovals]      = useState(false);
  const [queueStatusFilter,  setQueueStatusFilter]  = useState<'all' | 'submitted' | 'hod_approved' | 'final_approved' | 'published'>('all');
  const [queueClassFilter,   setQueueClassFilter]   = useState('');
  const [queueSubjectFilter, setQueueSubjectFilter] = useState('');
  const [previewResults,  setPreviewResults]  = useState<StudentResult[]>([]);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewError,    setPreviewError]    = useState('');

  interface AssessmentCheck { label: string; modeName: string; actedOn: number; total: number; complete: boolean; }
  interface ReadinessData {
    totalStudents:  number;
    examScoredCount: number;
    examComplete:   boolean;
    missingModes:   string[];
    assessments:    AssessmentCheck[];
    canApprove:     boolean;
  }
  const [readiness,        setReadiness]        = useState<ReadinessData | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError,   setReadinessError]   = useState('');

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
    }).catch(() => setError('Could not load filters.')).finally(() => setLoadingMeta(false));
  }, []);

  const loadApprovalQueue = useCallback(async () => {
    setApprovalLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearId) params.set('academic_year_id', yearId);
      if (semester) params.set('semester', semester);
      const { data } = await api.get<FinalQueueItem[]>(`/api/result-submissions/final-queue?${params}`);
      setApprovalQueue(data);
    } catch { /* non-fatal */ }
    finally { setApprovalLoading(false); }
  }, [yearId, semester]);

  const loadNonSubmitters = useCallback(async () => {
    if (!yearId || !semester) return;
    setNonSubmittersLoading(true);
    setNsLoadError(null);
    try {
      const params = new URLSearchParams({ academic_year_id: yearId, semester });
      const { data } = await api.get<NonSubmitter[]>(`/api/result-submissions/non-submitters?${params}`);
      setNonSubmitters(data);
    } catch (e: unknown) {
      const msg = (e as {response?:{data?:{error?:string}}})?.response?.data?.error ?? (e as {message?:string})?.message ?? 'Unknown error';
      console.error('[non-submitters]', msg);
      setNsLoadError(msg);
    }
    finally { setNonSubmittersLoading(false); }
  }, [yearId, semester]);

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
    } catch { setError('Could not load results.'); }
    finally { setLoading(false); }
  }, [yearId, semester, className]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (yearId || semester) { loadApprovalQueue(); loadNonSubmitters(); }
  }, [yearId, semester, loadApprovalQueue, loadNonSubmitters]);

  async function openApprovalModal(item: FinalQueueItem, action: 'hod_approve' | 'hod_reject' | 'approve' | 'reject' | 'publish' | 'unlock') {
    setApprovalTarget(item);
    setApprovalAction(action);
    setApprovalComment('');
    setApprovalError('');
    setPreviewResults([]);
    setPreviewError('');
    setReadiness(null);
    setReadinessError('');

    if (action === 'approve' || action === 'hod_approve' || action === 'publish') {
      const fetches: Promise<void>[] = [
        (async () => {
          setPreviewLoading(true);
          try {
            const { data } = await api.get<StudentResult[]>('/api/results', {
              params: { academic_year_id: item.academic_year_id, semester: item.semester, class_name: item.class_name },
            });
            setPreviewResults(data);
          } catch { setPreviewError('Could not load results preview.'); }
          finally { setPreviewLoading(false); }
        })(),
      ];

      if (action === 'approve' || action === 'hod_approve') {
        fetches.push(
          (async () => {
            setReadinessLoading(true);
            try {
              const { data } = await api.get<ReadinessData>(`/api/result-submissions/submission-readiness?submission_id=${item.id}`);
              setReadiness(data);
            } catch { setReadinessError('Could not load completeness check.'); }
            finally { setReadinessLoading(false); }
          })()
        );
      }

      await Promise.all(fetches);
    }
  }

  async function doApprovalAction() {
    if (!approvalTarget) return;
    if ((approvalAction === 'reject' || approvalAction === 'hod_reject' || approvalAction === 'unlock') && !approvalComment.trim()) {
      setApprovalError('A reason is required.'); return;
    }
    setApproving(true); setApprovalError('');
    try {
      if (approvalAction === 'hod_approve') {
        await api.post('/api/result-submissions/hod-review', { submission_id: approvalTarget.id, action: 'approve', comment: approvalComment.trim() || undefined });
      } else if (approvalAction === 'hod_reject') {
        await api.post('/api/result-submissions/hod-review', { submission_id: approvalTarget.id, action: 'reject', comment: approvalComment.trim() });
      } else if (approvalAction === 'approve') {
        await api.post('/api/result-submissions/final-review', { submission_id: approvalTarget.id, action: 'approve', comment: approvalComment.trim() || undefined });
      } else if (approvalAction === 'reject') {
        await api.post('/api/result-submissions/final-review', { submission_id: approvalTarget.id, action: 'reject', comment: approvalComment.trim() });
      } else if (approvalAction === 'publish') {
        await api.post('/api/result-submissions/publish', { submission_id: approvalTarget.id });
      } else if (approvalAction === 'unlock') {
        await api.post('/api/result-submissions/unlock', { submission_id: approvalTarget.id, reason: approvalComment.trim() });
      }
      setApprovalTarget(null); setApprovalComment('');
      loadApprovalQueue();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setApprovalError(msg ?? 'Action failed.');
    } finally { setApproving(false); }
  }

  async function publishAll() {
    if (!yearId || !semester) return;
    try {
      await api.post('/api/result-submissions/publish', { academic_year_id: yearId, semester: Number(semester) });
      loadApprovalQueue();
    } catch { /* show error */ }
  }

  const yearName = years.find(y => y.id === yearId)?.name ?? '';
  const caLabel  = results[0] ? `CA (${results[0].ca_percentage}%)` : 'CA';
  const exLabel  = results[0] ? `Exam (${results[0].exam_percentage}%)` : 'Exam';
  const sorted   = results.slice().sort((a, b) => (a.class_position ?? 999) - (b.class_position ?? 999));

  const { displayRows: resultRows, total: resultTotal, page: resultPage, setPage: setResultPage, pageSize: resultPageSize, setPageSize: setResultPageSize } = useTableControls(sorted);
  const queueClasses  = [...new Set(approvalQueue.map(q => q.class_name))].sort();
  const queueSubjects = [...new Set(approvalQueue.map(q => q.subject))].sort();
  const filteredQueue = approvalQueue
    .filter(q => queueStatusFilter  === 'all' || q.status  === queueStatusFilter)
    .filter(q => !queueClassFilter  || q.class_name === queueClassFilter)
    .filter(q => !queueSubjectFilter || q.subject   === queueSubjectFilter);
  const { displayRows: queueRows, total: queueTotal, page: queuePage, setPage: setQueuePage, pageSize: queuePageSize, setPageSize: setQueuePageSize } = useTableControls(filteredQueue);

  const nsClasses  = [...new Set(nonSubmitters.map(n => n.class_name))].sort();
  const nsSubjects = [...new Set(nonSubmitters.map(n => n.subject))].sort();
  const nsDepts    = [...new Set(nonSubmitters.map(n => n.department).filter(Boolean))].sort() as string[];
  const filteredNs = nonSubmitters
    .filter(n => !nsClassFilter   || n.class_name === nsClassFilter)
    .filter(n => !nsSubjectFilter || n.subject    === nsSubjectFilter)
    .filter(n => !nsDeptFilter    || n.department === nsDeptFilter);
  const { displayRows: nsRows, total: nsTotal, page: nsPage, setPage: setNsPage, pageSize: nsPageSize, setPageSize: setNsPageSize } = useTableControls(filteredNs);

  const selectStyle = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#145C44] focus:border-transparent';

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
            schoolSignature={school.headmaster_signature_url ?? null}
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
            <label className="text-xs font-semibold text-slate-500 font-medium">Academic Year</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)} className={selectStyle} disabled={loadingMeta}>
              {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' ✦' : ''}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 font-medium">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)} className={selectStyle}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 font-medium">Class</label>
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
                <button onClick={() => triggerPrint('all')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#145C44] text-white hover:bg-[#145C44]">
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

        {/* Approvals Panel */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
          <button
            onClick={() => { setShowApprovals(v => !v); if (!showApprovals) loadApprovalQueue(); }}
            style={{ width: '100%', padding: '14px 20px', background: '#F5F0E8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showApprovals ? '1px solid #E2E8F0' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1208' }}>Result Approvals</span>
              {approvalQueue.filter(q => q.status === 'submitted' || q.status === 'hod_approved').length > 0 && (
                <span style={{ background: '#B83232', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20 }}>
                  {approvalQueue.filter(q => q.status === 'submitted' || q.status === 'hod_approved').length} pending
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#64748B' }}>{showApprovals ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showApprovals && (
            <div style={{ padding: 16 }}>
              {approvalLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>Loading…</div>
              ) : approvalQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>No submissions in queue for the selected year and semester.</div>
              ) : (
                <>
                  {/* Row 1: status tabs + bulk action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {([
                        { key: 'all',            label: 'All',           count: approvalQueue.length },
                        { key: 'submitted',      label: 'Awaiting HOD',  count: approvalQueue.filter(q => q.status === 'submitted').length },
                        { key: 'hod_approved',   label: 'HOD Approved',  count: approvalQueue.filter(q => q.status === 'hod_approved').length },
                        { key: 'final_approved', label: 'Final Approved',count: approvalQueue.filter(q => q.status === 'final_approved').length },
                        { key: 'published',      label: 'Published',     count: approvalQueue.filter(q => q.status === 'published').length },
                      ] as const).map(({ key, label, count }) => {
                        const active = queueStatusFilter === key;
                        return (
                          <button key={key} onClick={() => { setQueueStatusFilter(key); setQueuePage(1); }}
                            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: active ? 'none' : '1px solid #E2E8F0',
                              background: active ? '#0B3D2E' : '#F5F0E8', color: active ? '#fff' : '#64748B' }}>
                            {label}
                            <span style={{ marginLeft: 5, background: active ? 'rgba(255,255,255,0.25)' : '#E2E8F0', color: active ? '#fff' : '#374151', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={publishAll}
                      style={{ background: '#145C44', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Publish All Final-Approved
                    </button>
                  </div>
                  {/* Row 2: class + subject filters */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
                    <select value={queueClassFilter} onChange={e => { setQueueClassFilter(e.target.value); setQueuePage(1); }}
                      style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: queueClassFilter ? '#0B3D2E' : '#64748B', background: queueClassFilter ? '#E8F4EE' : '#fff', cursor: 'pointer', fontWeight: queueClassFilter ? 600 : 400 }}>
                      <option value="">All Classes</option>
                      {queueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={queueSubjectFilter} onChange={e => { setQueueSubjectFilter(e.target.value); setQueuePage(1); }}
                      style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: queueSubjectFilter ? '#0B3D2E' : '#64748B', background: queueSubjectFilter ? '#E8F4EE' : '#fff', cursor: 'pointer', fontWeight: queueSubjectFilter ? 600 : 400 }}>
                      <option value="">All Subjects</option>
                      {queueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {(queueClassFilter || queueSubjectFilter) && (
                      <button onClick={() => { setQueueClassFilter(''); setQueueSubjectFilter(''); setQueuePage(1); }}
                        style={{ fontSize: 11, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                        Clear filters
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                      {filteredQueue.length === approvalQueue.length ? `${approvalQueue.length} submissions` : `${filteredQueue.length} of ${approvalQueue.length} submissions`}
                    </span>
                  </div>
                  {filteredQueue.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>
                      No submissions match the active filters.{' '}
                      <button onClick={() => { setQueueStatusFilter('all'); setQueueClassFilter(''); setQueueSubjectFilter(''); setQueuePage(1); }}
                        style={{ color: '#145C44', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Clear all filters</button>
                    </div>
                  ) : null}
                  <div style={{ overflowX: 'auto', display: filteredQueue.length === 0 ? 'none' : undefined }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#F5F0E8', borderBottom: '1px solid #E2E8F0' }}>
                          {['Subject', 'Class', 'Teacher', 'HOD', 'Status', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(queueRows as typeof approvalQueue).map(item => {
                          const sc = SUB_STATUS[item.status] ?? { label: item.status, color: '#64748B', bg: '#F1F5F9' };
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 500, color: '#1C1208' }}>{item.subject}</td>
                              <td style={{ padding: '10px 12px', color: '#374151' }}>{item.class_name}</td>
                              <td style={{ padding: '10px 12px', color: '#374151' }}>{item.teacher_name}</td>
                              <td style={{ padding: '10px 12px', color: '#374151' }}>{item.hod_name ?? '—'}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{sc.label}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {item.status === 'submitted' && (
                                    <>
                                      <button onClick={() => openApprovalModal(item, 'hod_approve')}
                                        style={{ background: '#0B3D2E', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                        title="Approve on behalf of the HOD">
                                        Approve as HOD
                                      </button>
                                      <button onClick={() => openApprovalModal(item, 'hod_reject')}
                                        style={{ background: '#FEF2F2', color: '#B83232', border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {item.status === 'hod_approved' && (
                                    <>
                                      <button onClick={() => openApprovalModal(item, 'approve')}
                                        style={{ background: '#145C44', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        Final Approve
                                      </button>
                                      <button onClick={() => openApprovalModal(item, 'reject')}
                                        style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {item.status === 'final_approved' && (
                                    <button onClick={() => openApprovalModal(item, 'publish')}
                                      style={{ background: '#145C44', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                      Publish
                                    </button>
                                  )}
                                  {item.status === 'published' && (
                                    <button onClick={() => openApprovalModal(item, 'unlock')}
                                      style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                      Unlock
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <Pagination page={queuePage} pageSize={queuePageSize} total={queueTotal} onPage={setQueuePage} onPageSize={(s) => { setQueuePageSize(s); setQueuePage(1); }} />
                  </div>
                </>
              )}

              {/* Action confirmation modal */}
              {approvalTarget && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                  onClick={() => setApprovalTarget(null)}>
                  <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 48px)' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1208', marginBottom: 4 }}>
                        {approvalAction === 'hod_approve' ? 'Approve as HOD' : approvalAction === 'hod_reject' ? 'Reject & Return (HOD)' : approvalAction === 'approve' ? 'Final Approval' : approvalAction === 'publish' ? 'Publish Results' : approvalAction === 'unlock' ? 'Unlock Submission' : 'Reject & Return'}
                      </h3>
                      <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                        {approvalTarget.subject} · {approvalTarget.class_name} · {approvalTarget.teacher_name}
                      </p>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>

                    {/* HOD override notice */}
                    {(approvalAction === 'hod_approve' || approvalAction === 'hod_reject') && (
                      <div style={{ background: '#FFF7ED', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#92400E' }}>
                        You are acting on behalf of the HOD. This submission has not yet been reviewed by the assigned HOD.
                      </div>
                    )}

                    {/* Completeness check — shown for HOD and final Approve actions */}
                    {(approvalAction === 'approve' || approvalAction === 'hod_approve') && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Scores Completeness
                        </p>
                        {readinessLoading ? (
                          <div style={{ textAlign: 'center', padding: '10px 0', color: '#94A3B8', fontSize: 12 }}>Checking…</div>
                        ) : readinessError ? (
                          <p style={{ fontSize: 12, color: '#DC2626' }}>{readinessError}</p>
                        ) : readiness ? (() => {
                          const tick   = (ok: boolean) => ok
                            ? <span style={{ color: '#145C44', fontWeight: 700, marginRight: 6 }}>✓</span>
                            : <span style={{ color: '#DC2626', fontWeight: 700, marginRight: 6 }}>✗</span>;
                          const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #F1F5F9' };
                          return (
                            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden', background: readiness.canApprove ? '#F0FDF4' : '#FFF7ED' }}>
                              {/* Exam row */}
                              <div style={rowStyle}>
                                <span style={{ display: 'flex', alignItems: 'center' }}>
                                  {tick(readiness.examComplete)}
                                  <span style={{ color: '#374151' }}>Exam scores</span>
                                </span>
                                <span style={{ fontWeight: 600, color: readiness.examComplete ? '#145C44' : '#DC2626' }}>
                                  {readiness.examScoredCount} / {readiness.totalStudents} students
                                </span>
                              </div>
                              {/* Missing CA modes */}
                              {readiness.missingModes.map(m => (
                                <div key={m} style={rowStyle}>
                                  <span style={{ display: 'flex', alignItems: 'center' }}>
                                    {tick(false)}
                                    <span style={{ color: '#374151' }}>{m} <span style={{ color: '#94A3B8', fontSize: 11 }}>(no assessment created)</span></span>
                                  </span>
                                  <span style={{ fontWeight: 600, color: '#DC2626' }}>Missing</span>
                                </div>
                              ))}
                              {/* Per-assessment CA rows */}
                              {readiness.assessments.map(a => (
                                <div key={a.label} style={rowStyle}>
                                  <span style={{ display: 'flex', alignItems: 'center' }}>
                                    {tick(a.complete)}
                                    <span style={{ color: '#374151' }}>{a.label} <span style={{ color: '#94A3B8', fontSize: 11 }}>({a.modeName})</span></span>
                                  </span>
                                  <span style={{ fontWeight: 600, color: a.complete ? '#145C44' : '#DC2626' }}>
                                    {a.actedOn} / {a.total} students
                                  </span>
                                </div>
                              ))}
                              {/* Overall banner */}
                              <div style={{ padding: '7px 10px', background: readiness.canApprove ? '#DCFCE7' : '#FEE2E2', fontSize: 12, fontWeight: 700, color: readiness.canApprove ? '#145C44' : '#DC2626' }}>
                                {readiness.canApprove
                                  ? '✓ All scores complete — safe to approve'
                                  : '✗ Scores incomplete — reject back to teacher to fix'}
                              </div>
                            </div>
                          );
                        })() : null}
                      </div>
                    )}

                    {/* Results preview for approve / hod_approve / publish actions */}
                    {(approvalAction === 'approve' || approvalAction === 'hod_approve' || approvalAction === 'publish') && (
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Results Preview
                        </p>
                        {previewLoading ? (
                          <div style={{ textAlign: 'center', padding: '14px 0', color: '#94A3B8', fontSize: 12 }}>Loading results…</div>
                        ) : previewError ? (
                          <p style={{ fontSize: 12, color: '#DC2626' }}>{previewError}</p>
                        ) : previewResults.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No result data found for this class.</p>
                        ) : (() => {
                          const subject = approvalTarget.subject;
                          const sorted  = [...previewResults].sort((a, b) => {
                            const aS = a.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                            const bS = b.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                            return (bS?.total ?? -1) - (aS?.total ?? -1);
                          });
                          const withSubject = sorted.filter(r => r.subjects.some(s => s.subject.toLowerCase() === subject.toLowerCase()));
                          const missing = previewResults.length - withSubject.length;
                          return (
                            <>
                              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead style={{ position: 'sticky', top: 0, background: '#F5F0E8', zIndex: 1 }}>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                                      {['Student', 'CA', 'Exam', 'Total', 'Grade'].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Student' ? 'left' : 'center', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sorted.map((student, idx) => {
                                      const sub = student.subjects.find(s => s.subject.toLowerCase() === subject.toLowerCase());
                                      return (
                                        <tr key={student.student_id} style={{ borderTop: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                          <td style={{ padding: '6px 10px', fontWeight: 500, color: '#1C1208' }}>{student.name}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.ca_score != null ? sub.ca_score.toFixed(1) : '—'}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{sub?.exam_score != null ? sub.exam_score.toFixed(1) : '—'}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#1C1208' }}>{sub?.total != null ? sub.total : '—'}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: sub?.grade?.startsWith('F') || sub?.grade === 'E8' ? '#DC2626' : '#145C44' }}>{sub?.grade ?? '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {missing > 0 && (
                                <p style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>
                                  ⚠ {missing} student{missing !== 1 ? 's' : ''} have no score for {subject}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {approvalAction === 'publish' && (
                      <p style={{ fontSize: 13, color: '#374151', background: '#FEF3C7', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                        This will make results visible to students immediately. This action can be undone with Unlock.
                      </p>
                    )}

                    {(approvalAction === 'reject' || approvalAction === 'hod_reject' || approvalAction === 'unlock' || approvalAction === 'approve' || approvalAction === 'hod_approve') && (
                      <>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                          {approvalAction === 'reject' || approvalAction === 'hod_reject' || approvalAction === 'unlock' ? 'Reason (required)' : 'Comment (optional)'}
                        </label>
                        <textarea value={approvalComment} onChange={e => { setApprovalComment(e.target.value); setApprovalError(''); }} rows={3}
                          placeholder={approvalAction === 'unlock' ? 'Why is this being unlocked?' : (approvalAction === 'reject' || approvalAction === 'hod_reject') ? 'Why is this being returned?' : 'Optional note…'}
                          style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      </>
                    )}

                    </div>
                    <div style={{ padding: '12px 24px 20px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
                    {approvalError && <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{approvalError}</p>}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setApprovalTarget(null)}
                        style={{ flex: 1, padding: '9px 0', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button
                        onClick={doApprovalAction}
                        disabled={approving || ((approvalAction === 'approve' || approvalAction === 'hod_approve') && readiness !== null && !readiness.canApprove)}
                        title={(approvalAction === 'approve' || approvalAction === 'hod_approve') && readiness && !readiness.canApprove ? 'Scores are incomplete — reject back to the teacher to fix first' : undefined}
                        style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                          cursor: (approving || ((approvalAction === 'approve' || approvalAction === 'hod_approve') && readiness !== null && !readiness.canApprove)) ? 'not-allowed' : 'pointer',
                          opacity: (approving || ((approvalAction === 'approve' || approvalAction === 'hod_approve') && readiness !== null && !readiness.canApprove)) ? 0.45 : 1,
                          background: (approvalAction === 'reject' || approvalAction === 'hod_reject') ? '#B83232' : approvalAction === 'unlock' ? '#64748B' : '#145C44',
                          color: '#fff' }}>
                        {approving ? '…' : approvalAction === 'hod_approve' ? 'Approve as HOD' : approvalAction === 'hod_reject' ? 'Reject & Return' : approvalAction === 'approve' ? 'Final Approve' : approvalAction === 'publish' ? 'Publish' : approvalAction === 'unlock' ? 'Unlock' : 'Reject & Return'}
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Outstanding Submissions Panel */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
          <button
            onClick={() => { setShowNonSubmitters(v => !v); if (!showNonSubmitters) loadNonSubmitters(); }}
            style={{ width: '100%', padding: '14px 20px', background: '#F5F0E8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showNonSubmitters ? '1px solid #E2E8F0' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1208' }}>Outstanding Submissions</span>
              {nonSubmitters.length > 0 && (
                <span style={{ background: '#C8780A', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20 }}>
                  {nonSubmitters.length} not submitted
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#64748B' }}>{showNonSubmitters ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showNonSubmitters && (
            <div style={{ padding: 16 }}>
              {nonSubmittersLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '3px solid #145C44', borderBottomColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : nonSubmitters.length === 0 ? (
                <div style={{ padding: 20 }}>
                  {nsLoadError && (
                    <p style={{ textAlign: 'center', color: '#B83232', fontSize: 13, marginBottom: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px' }}>
                      Query error: {nsLoadError}
                    </p>
                  )}
                  <p style={{ textAlign: 'center', color: '#145C44', fontSize: 13, marginBottom: 16 }}>
                    No outstanding submissions detected for the selected year and semester.
                  </p>
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={async () => {
                        setNsDebugLoading(true); setNsDebug(null);
                        try {
                          const params = new URLSearchParams({ academic_year_id: yearId, semester });
                          const { data } = await api.get<NsDebug>(`/api/result-submissions/non-submitters/debug?${params}`);
                          setNsDebug(data);
                        } catch (e: unknown) {
                          const msg = (e as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Diagnostic failed';
                          alert(msg);
                        } finally { setNsDebugLoading(false); }
                      }}
                      disabled={nsDebugLoading}
                      style={{ background: '#F5F0E8', border: '1px solid #E2D9CC', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#4A3F32', cursor: 'pointer' }}>
                      {nsDebugLoading ? 'Running…' : 'Run Diagnostic'}
                    </button>
                  </div>
                  {nsDebug && (
                    <div style={{ marginTop: 16, border: '1px solid #E2D9CC', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
                      <div style={{ background: '#F5F0E8', padding: '8px 14px', fontWeight: 700, color: '#2C2218', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Diagnostic — Semester {String(nsDebug.params.semester)}
                      </div>
                      {/* Source counts */}
                      {[
                        { label: 'Timetable raw rows', value: nsDebug.source_counts.timetable_raw_rows, note: nsDebug.source_counts.timetable_raw_error as string | undefined },
                        { label: 'Timetable after LATERAL unnest', value: nsDebug.source_counts.timetable_distinct_teacher_subject_class, note: nsDebug.source_counts.timetable_distinct_error as string | undefined },
                        { label: 'Timetable after JOIN teachers', value: nsDebug.source_counts.timetable_after_teacher_join, note: nsDebug.source_counts.timetable_join_error as string | undefined },
                        { label: 'Assessments raw', value: nsDebug.source_counts.assessments?.total ?? null, note: nsDebug.source_counts.assessments_error as string | undefined },
                        { label: 'Assessments after JOIN teachers', value: nsDebug.source_counts.assessments_after_teacher_join, note: nsDebug.source_counts.assessments_join_error as string | undefined },
                        { label: 'Exam scores raw', value: nsDebug.source_counts.exam_scores?.total ?? null, note: nsDebug.source_counts.exam_error as string | undefined },
                        { label: 'Union candidates (all 4 sources)', value: nsDebug.pipeline.total_union_candidates, note: nsDebug.pipeline.union_error as string | undefined },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid #F1F5F9' }}>
                          <span style={{ color: '#4A3F32' }}>{row.label}</span>
                          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: row.value === null ? '#B83232' : row.value === 0 ? '#B83232' : '#145C44' }}>{row.value ?? 'ERR'}</span>
                            {row.note && <span style={{ color: (row.value === null || String(row.note).length > 30) ? '#B83232' : '#8C7E6E', fontSize: 11, maxWidth: 260, wordBreak: 'break-word' }}>{row.note}</span>}
                          </span>
                        </div>
                      ))}
                      {/* Submission status breakdown */}
                      <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
                        <span style={{ color: '#4A3F32' }}>Result submissions by status</span>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {nsDebug.source_counts.result_submissions_by_status.length === 0
                            ? <span style={{ color: '#B83232', fontWeight: 700 }}>None</span>
                            : nsDebug.source_counts.result_submissions_by_status.map(s => (
                                <span key={s.status} style={{ background: '#F5F0E8', border: '1px solid #E2D9CC', borderRadius: 6, padding: '2px 10px', fontSize: 11, color: '#2C2218' }}>
                                  {s.status}: <strong>{s.count}</strong>
                                </span>
                              ))}
                        </div>
                      </div>
                      {/* Sample rows */}
                      {nsDebug.samples.timetable_rows.length > 0 && (
                        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
                          <div style={{ color: '#4A3F32', marginBottom: 4 }}>Sample timetable rows</div>
                          {nsDebug.samples.timetable_rows.map((r, i) => (
                            <div key={i} style={{ color: '#64748B', fontSize: 11 }}>{String(r.teacher_name)} · {String(r.subject)} · {String(r.class_names ?? r.class_name)}</div>
                          ))}
                        </div>
                      )}
                      {nsDebug.samples.submission_rows.length > 0 && (
                        <div style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9' }}>
                          <div style={{ color: '#4A3F32', marginBottom: 4 }}>Sample submission rows</div>
                          {nsDebug.samples.submission_rows.map((r, i) => (
                            <div key={i} style={{ color: '#64748B', fontSize: 11 }}>{String(r.teacher_name)} · {String(r.subject)} · {String(r.class_name)} → <strong>{String(r.status)}</strong></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Filters */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
                    <select value={nsClassFilter} onChange={e => { setNsClassFilter(e.target.value); setNsPage(1); }}
                      style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: nsClassFilter ? '#0B3D2E' : '#64748B', background: nsClassFilter ? '#E8F4EE' : '#fff', cursor: 'pointer', fontWeight: nsClassFilter ? 600 : 400 }}>
                      <option value="">All Classes</option>
                      {nsClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={nsSubjectFilter} onChange={e => { setNsSubjectFilter(e.target.value); setNsPage(1); }}
                      style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: nsSubjectFilter ? '#0B3D2E' : '#64748B', background: nsSubjectFilter ? '#E8F4EE' : '#fff', cursor: 'pointer', fontWeight: nsSubjectFilter ? 600 : 400 }}>
                      <option value="">All Subjects</option>
                      {nsSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {nsDepts.length > 0 && (
                      <select value={nsDeptFilter} onChange={e => { setNsDeptFilter(e.target.value); setNsPage(1); }}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: nsDeptFilter ? '#0B3D2E' : '#64748B', background: nsDeptFilter ? '#E8F4EE' : '#fff', cursor: 'pointer', fontWeight: nsDeptFilter ? 600 : 400 }}>
                        <option value="">All Departments</option>
                        {nsDepts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                    {(nsClassFilter || nsSubjectFilter || nsDeptFilter) && (
                      <button onClick={() => { setNsClassFilter(''); setNsSubjectFilter(''); setNsDeptFilter(''); setNsPage(1); }}
                        style={{ fontSize: 11, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                        Clear filters
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                      {filteredNs.length === nonSubmitters.length ? `${nonSubmitters.length} outstanding` : `${filteredNs.length} of ${nonSubmitters.length} outstanding`}
                    </span>
                  </div>

                  {filteredNs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>
                      No results match the active filters.{' '}
                      <button onClick={() => { setNsClassFilter(''); setNsSubjectFilter(''); setNsDeptFilter(''); setNsPage(1); }}
                        style={{ color: '#145C44', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Clear all</button>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#F5F0E8', borderBottom: '1px solid #E2E8F0' }}>
                            {['Teacher', 'Department', 'Subject', 'Class', 'Status'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748B', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(nsRows as NonSubmitter[]).map((item, idx) => (
                            <tr key={`${item.teacher_id}-${item.subject}-${item.class_name}`} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1C1208' }}>{item.teacher_name}</td>
                              <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.department ?? '—'}</td>
                              <td style={{ padding: '10px 12px', color: '#374151' }}>{item.subject}</td>
                              <td style={{ padding: '10px 12px', color: '#374151' }}>{item.class_name}</td>
                              <td style={{ padding: '10px 12px' }}>
                                {item.submission_status === 'draft' ? (
                                  <span style={{ background: '#FEF3C7', color: '#C8780A', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Draft</span>
                                ) : item.submission_status === 'rejected' ? (
                                  <span style={{ background: '#FEF2F2', color: '#B83232', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Rejected — Needs Resubmission</span>
                                ) : (
                                  <span style={{ background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>Not Submitted to HOD</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Pagination page={nsPage} pageSize={nsPageSize} total={nsTotal} onPage={setNsPage} onPageSize={(s) => { setNsPageSize(s); setNsPage(1); }} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {!className ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10 text-slate-300 mx-auto mb-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <p className="text-slate-500 text-sm">Select a class to view results</p>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin" />
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
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 font-medium">
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
                  {(resultRows as typeof sorted).map(r => (
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
                          ? <span className="text-xs text-[#145C44] font-semibold">{remarksMap[r.student_id].attitude}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setSelected(r)} className="text-xs font-semibold text-[#145C44] hover:text-green-900">View →</button>
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
            <Pagination page={resultPage} pageSize={resultPageSize} total={resultTotal} onPage={setResultPage} onPageSize={(s) => { setResultPageSize(s); setResultPage(1); }} />
          </div>
        )}

        {/* Report card slide-in panel */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-start justify-end bg-[#0B3D2E]/45" onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
            <div className="h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{selected.name}</p>
                  <p className="text-xs text-slate-500">{selected.student_code} · {className} · {yearName} · Semester {semester}</p>
                </div>
                <button onClick={() => triggerPrint(selected)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#145C44] text-white hover:bg-[#145C44]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  Print Card
                </button>
              </div>
              <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-slate-100">
                <div className="text-center"><p className="text-xs text-slate-500 font-medium font-semibold mb-1">Average</p><p className="text-2xl font-bold text-[#145C44]">{selected.average ?? '—'}</p></div>
                <div className="text-center border-x border-slate-100"><p className="text-xs text-slate-500 font-medium font-semibold mb-1">Class Position</p><p className="text-2xl font-bold text-slate-800">{selected.class_position ? ordinal(selected.class_position) : '—'}{selected.class_total ? <span className="text-sm font-normal text-slate-400"> / {selected.class_total}</span> : null}</p></div>
                <div className="text-center"><p className="text-xs text-slate-500 font-medium font-semibold mb-1">Overall Grade</p><div className="flex justify-center mt-1"><GradeBadge grade={selected.overall_grade} /></div></div>
              </div>
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-slate-500 font-medium mb-3">Subject Breakdown</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead><tr className="bg-slate-50 text-xs font-semibold text-slate-500 font-medium"><th className="px-3 py-2.5 text-left">Subject</th><th className="px-3 py-2.5 text-center">{caLabel}</th><th className="px-3 py-2.5 text-center">{exLabel}</th><th className="px-3 py-2.5 text-center">Total</th><th className="px-3 py-2.5 text-center">Grade</th><th className="px-3 py-2.5 text-center">Position</th><th className="px-3 py-2.5 text-left">Remarks</th></tr></thead>
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
                  <p className="text-xs font-semibold text-slate-500 font-medium mb-3">Form Teacher&apos;s Remarks</p>
                  <div className="bg-[#E8F4EE] rounded-xl border border-[#D1EAD9] p-4 grid grid-cols-2 gap-3 text-sm">
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
