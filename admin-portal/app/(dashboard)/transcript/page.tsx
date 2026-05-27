'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import type { Student, StudentTranscript, TranscriptSemester } from '@/types/api';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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

const GREEN = '#1a5c38';
const LGREEN = '#f0faf5';

function gradeColor(g: string) {
  return ['A1','B2','B3','A','B+','B-'].includes(g) ? '#15803D'
       : ['F9','F','E8'].includes(g) ? '#DC2626' : '#D97706';
}
function scoreColor(t: number | null) {
  return t == null ? '#6b7280' : t >= 70 ? '#15803D' : t >= 50 ? '#D97706' : '#DC2626';
}

// ── Printed A4 Transcript Document ───────────────────────────────────────────
interface DocProps {
  transcript: StudentTranscript;
  school: { name: string; address: string | null; logo_url: string | null };
  issueDate: string;
  cumulativeAvg: number | null;
  totalSubjects: number;
  passRate: number | null;
}

function TranscriptDocument({ transcript, school, issueDate, cumulativeAvg, totalSubjects, passRate }: DocProps) {
  const page: React.CSSProperties = {
    width: '210mm', fontFamily: "'Arial','Helvetica',sans-serif",
    fontSize: '8.5pt', color: '#1a1a1a', background: '#fff',
    padding: '10mm 12mm',
  };

  return (
    <div style={page}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `3px double ${GREEN}`, paddingBottom: '8px', marginBottom: '8px' }}>
        <div style={{ width: '58px', height: '58px', flexShrink: 0, border: `1px solid #e5e7eb`, borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
          {school.logo_url
            ? <img src={school.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '34px', height: '34px' }}>
                <rect width="48" height="48" rx="8" fill={GREEN} />
                <path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" fill="white" fillOpacity=".9" />
                <circle cx="24" cy="24" r="4" fill="white" />
              </svg>
          }
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '14pt', fontWeight: 900, color: GREEN, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {school.name || 'SCHOOL NAME'}
          </div>
          {school.address && <div style={{ fontSize: '7.5pt', color: '#666', marginTop: '2px' }}>{school.address}</div>}
          <div style={{ marginTop: '5px', fontSize: '10pt', fontWeight: 700, letterSpacing: '2px', color: '#333', textTransform: 'uppercase', borderTop: `1px solid #c6e8d8`, borderBottom: `1px solid #c6e8d8`, padding: '3px 0' }}>
            Official Academic Transcript
          </div>
        </div>
        <div style={{ width: '58px', height: '70px', flexShrink: 0, border: `2px solid ${GREEN}`, borderRadius: '5px', overflow: 'hidden' }}>
          {transcript.picture_url
            ? <img src={transcript.picture_url} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : transcript.gender?.toLowerCase() === 'female' ? <FemaleAvatar /> : <MaleAvatar />
          }
        </div>
      </div>

      {/* ── Student Info ── */}
      <div style={{ background: LGREEN, border: `1px solid #c6e8d8`, borderRadius: '4px', padding: '5px 10px', marginBottom: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '14%', fontWeight: 700, color: '#555', paddingBottom: '3px' }}>Full Name</td>
              <td style={{ width: '36%', fontWeight: 700, borderBottom: `1px solid #b0d4c4`, paddingBottom: '3px' }}>{transcript.name}</td>
              <td style={{ width: '14%', fontWeight: 700, color: '#555', paddingLeft: '10px', paddingBottom: '3px' }}>Student ID</td>
              <td style={{ width: '36%', borderBottom: `1px solid #b0d4c4`, paddingBottom: '3px' }}>{transcript.student_code}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '3px' }}>Programme</td>
              <td style={{ paddingTop: '3px' }}>{transcript.program_name ?? '—'}</td>
              <td style={{ fontWeight: 700, color: '#555', paddingLeft: '10px', paddingTop: '3px' }}>Class</td>
              <td style={{ paddingTop: '3px' }}>{transcript.class_name}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, color: '#555', paddingTop: '3px' }}>Gender</td>
              <td style={{ paddingTop: '3px' }}>{transcript.gender ?? '—'}</td>
              <td style={{ fontWeight: 700, color: '#555', paddingLeft: '10px', paddingTop: '3px' }}>Issue Date</td>
              <td style={{ paddingTop: '3px', fontWeight: 600 }}>{issueDate}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Cumulative Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px', marginBottom: '10px' }}>
        {[
          { label: 'Cumulative Average',  value: cumulativeAvg != null ? String(cumulativeAvg) : '—' },
          { label: 'Total Semesters',     value: String(transcript.semesters.length) },
          { label: 'Total Subjects Sat',  value: String(totalSubjects) },
          { label: 'Overall Pass Rate',   value: passRate != null ? `${passRate}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ border: `1.5px solid ${GREEN}`, borderRadius: '4px', padding: '4px', textAlign: 'center', background: '#fff' }}>
            <div style={{ fontSize: '6.5pt', color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
            <div style={{ fontSize: '12pt', fontWeight: 900, color: GREEN, marginTop: '1px', lineHeight: 1.1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Section title ── */}
      <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: GREEN, marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ height: '2px', width: '14px', background: GREEN }} />
        Academic Record
        <div style={{ flex: 1, height: '1px', background: '#c6e8d8' }} />
      </div>

      {/* ── Per-semester blocks ── */}
      {transcript.semesters.map((sem) => (
        <div key={`${sem.year_id}:${sem.semester}`} style={{ marginBottom: '8px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div style={{ background: GREEN, color: '#fff', padding: '3px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '3px 3px 0 0', fontSize: '8pt' }}>
            <span style={{ fontWeight: 700 }}>{sem.academic_year} — Semester {sem.semester}
              <span style={{ fontWeight: 400, fontSize: '7pt', marginLeft: '8px', opacity: 0.85 }}>({sem.class_name})</span>
            </span>
            <span style={{ fontSize: '7.5pt' }}>
              Avg: <b>{sem.average ?? '—'}</b>
              {sem.class_position ? ` · Pos: ${ordinal(sem.class_position)}/${sem.class_total}` : ''}
              {` · Grade: `}<b>{sem.overall_grade}</b>
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
            <thead>
              <tr style={{ background: '#e8f5ee', borderBottom: `1px solid #c6e8d8` }}>
                {['Subject', 'CA Score', 'Exam Score', 'Total', 'Grade', 'Remark'].map((h, i) => (
                  <th key={h} style={{ padding: '3px 5px', textAlign: i === 0 ? 'left' : 'center', fontWeight: 700, fontSize: '7pt', color: '#444', letterSpacing: '0.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sem.subjects.map((s, i) => (
                <tr key={s.subject} style={{ background: i % 2 === 0 ? '#fff' : LGREEN, borderBottom: `1px solid #e8f0ec` }}>
                  <td style={{ padding: '2.5px 5px', fontWeight: 500 }}>{s.subject}</td>
                  <td style={{ padding: '2.5px 5px', textAlign: 'center' }}>{s.ca_score ?? '—'}</td>
                  <td style={{ padding: '2.5px 5px', textAlign: 'center' }}>{s.exam_score ?? '—'}</td>
                  <td style={{ padding: '2.5px 5px', textAlign: 'center', fontWeight: 700 }}>{s.total ?? '—'}</td>
                  <td style={{ padding: '2.5px 5px', textAlign: 'center', fontWeight: 700, color: gradeColor(s.grade) }}>{s.grade}</td>
                  <td style={{ padding: '2.5px 5px', textAlign: 'center', color: '#555' }}>{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* ── Grade Legend ── */}
      <div style={{ marginTop: '8px', padding: '5px 8px', border: `1px solid #c6e8d8`, borderRadius: '4px', background: LGREEN, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div style={{ fontSize: '7pt', fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Grade Reference</div>
        <div style={{ fontSize: '6.5pt', color: '#444', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[
            'A1 (75–100): Excellent', 'B2 (70–74): Very Good', 'B3 (65–69): Good',
            'C4 (60–64): Credit', 'C5 (55–59): Credit', 'C6 (50–54): Credit',
            'D7 (45–49): Pass', 'E8 (40–44): Pass', 'F9 (<40): Fail',
          ].map(s => <span key={s} style={{ whiteSpace: 'nowrap' }}>{s}</span>)}
        </div>
      </div>

      {/* ── Signatures ── */}
      <div style={{ marginTop: '14px', paddingTop: '8px', borderTop: `1px dashed #c6e8d8`, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <div style={{ textAlign: 'center', fontSize: '7pt', color: '#888', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Certified True Copy
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
          <tbody>
            <tr>
              <td style={{ width: '33%', paddingTop: '22px', paddingRight: '20px' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>Head of Academics &amp; Date</div>
              </td>
              <td style={{ width: '34%', paddingTop: '22px', textAlign: 'center' }}>
                <div style={{ borderTop: `1.5px solid #888`, paddingTop: '4px', color: '#555' }}>School Stamp</div>
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

// ── Score + Grade badges (screen) ─────────────────────────────────────────────
function ScorePill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'text-green-700 bg-green-50' : value >= 50 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{value}</span>;
}
function GradePill({ grade }: { grade: string }) {
  const color = ['A1','B2','B3','A','B+','B-'].includes(grade) ? 'text-green-700 bg-green-50'
              : ['F9','F','E8'].includes(grade)                  ? 'text-red-700 bg-red-50'
              :                                                    'text-amber-700 bg-amber-50';
  return <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{grade || '—'}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TranscriptPage() {
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [query,        setQuery]       = useState('');
  const [showDrop,     setShowDrop]    = useState(false);
  const [selected,     setSelected]    = useState<Student | null>(null);
  const [transcript,   setTranscript]  = useState<StudentTranscript | null>(null);
  const [loading,      setLoading]     = useState(false);
  const [school,       setSchool]      = useState<{ name: string; address: string | null; logo_url: string | null }>({ name: '', address: null, logo_url: null });
  const [printReady,   setPrintReady]  = useState(false);
  const [expanded,     setExpanded]    = useState<Record<string, boolean>>({});
  const dropRef = useRef<HTMLDivElement>(null);

  // Load students + school on mount
  useEffect(() => {
    api.get('/api/students').then(r => setAllStudents(r.data)).catch(() => {});
    api.get('/api/admin/school-profile').then(r => setSchool(r.data)).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filtered students for search dropdown
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allStudents
      .filter(s => s.name.toLowerCase().includes(q) || s.student_code.toLowerCase().includes(q))
      .slice(0, 10);
  }, [allStudents, query]);

  // Cumulative statistics derived from loaded transcript
  const stats = useMemo(() => {
    if (!transcript?.semesters.length) return null;
    const sems = transcript.semesters.filter(s => s.average != null);
    const cumulativeAvg = sems.length
      ? Math.round((sems.reduce((a, s) => a + s.average!, 0) / sems.length) * 10) / 10
      : null;
    const best = sems.reduce<TranscriptSemester | null>((b, s) => !b || s.average! > b.average! ? s : b, null);
    let totalSubjects = 0, passSubjects = 0;
    for (const sem of transcript.semesters) {
      for (const subj of sem.subjects) {
        if (subj.total != null) {
          totalSubjects++;
          if (subj.total >= 50) passSubjects++;
        }
      }
    }
    const passRate = totalSubjects > 0 ? Math.round((passSubjects / totalSubjects) * 1000) / 10 : null;
    return { cumulativeAvg, best, totalSubjects, passSubjects, passRate };
  }, [transcript]);

  async function selectStudent(s: Student) {
    setSelected(s);
    setQuery(s.name);
    setShowDrop(false);
    setTranscript(null);
    setLoading(true);
    try {
      const { data } = await api.get<StudentTranscript>(`/api/results/transcript/${s.id}`);
      setTranscript(data);
      const exp: Record<string, boolean> = {};
      for (const sem of data.semesters) exp[`${sem.year_id}:${sem.semester}`] = true;
      setExpanded(exp);
    } catch { /* error handled by loading state */ }
    setLoading(false);
  }

  function toggleSem(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    if (!transcript) return;
    const allOpen = transcript.semesters.every(s => expanded[`${s.year_id}:${s.semester}`]);
    const exp: Record<string, boolean> = {};
    for (const sem of transcript.semesters) exp[`${sem.year_id}:${sem.semester}`] = !allOpen;
    setExpanded(exp);
  }

  function triggerPrint() {
    flushSync(() => setPrintReady(true));
    window.print();
    setPrintReady(false);
  }

  const issueDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── caLabel / exLabel from school's CA %
  const caLabel = 'CA Score';
  const exLabel = 'Exam Score';

  return (
    <>
      {/* Print styles */}
      <style>{`
        #transcript-print { display: none; }
        @media print {
          body * { visibility: hidden; }
          #transcript-print {
            display: block !important;
            visibility: visible !important;
            position: absolute;
            top: 0; left: 0; width: 100%;
            background: white;
          }
          #transcript-print * { visibility: visible !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      {/* Print area */}
      <div id="transcript-print">
        {printReady && transcript && (
          <TranscriptDocument
            transcript={transcript}
            school={school}
            issueDate={issueDate}
            cumulativeAvg={stats?.cumulativeAvg ?? null}
            totalSubjects={stats?.totalSubjects ?? 0}
            passRate={stats?.passRate ?? null}
          />
        )}
      </div>

      {/* Screen UI */}
      <div className="space-y-5 max-w-5xl mx-auto">

        {/* ── Search ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Search Student</label>
          <div className="relative" ref={dropRef}>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setShowDrop(true); if (!e.target.value) { setSelected(null); setTranscript(null); } }}
                onFocus={() => setShowDrop(true)}
                placeholder="Type student name or ID…"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {query && (
                <button onClick={() => { setQuery(''); setSelected(null); setTranscript(null); setShowDrop(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            {showDrop && filtered.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                {filtered.map(s => (
                  <button key={s.id} onMouseDown={() => selectStudent(s)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 text-left transition-colors border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-slate-200">
                      {s.picture_url
                        ? <img src={s.picture_url} alt={s.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">{s.name[0]}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.student_code} · {s.class_name}</p>
                    </div>
                    {s.program_name && <span className="text-xs text-slate-400 flex-shrink-0 truncate max-w-[120px]">{s.program_name}</span>}
                  </button>
                ))}
              </div>
            )}
            {showDrop && query.trim() && filtered.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl p-4 text-sm text-slate-400 text-center">
                No students found for &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* ── No data state ── */}
        {!loading && selected && transcript && transcript.semesters.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 text-slate-300 mx-auto mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-slate-500 font-medium">No academic records found for {selected.name}</p>
            <p className="text-slate-400 text-sm mt-1">Results will appear here once assessments or imports are available.</p>
          </div>
        )}

        {!loading && transcript && transcript.semesters.length > 0 && (
          <>
            {/* ── Student card ── */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-14 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 border-green-600">
                {transcript.picture_url
                  ? <img src={transcript.picture_url} alt={transcript.name} className="w-full h-full object-cover" />
                  : transcript.gender?.toLowerCase() === 'female' ? <FemaleAvatar /> : <MaleAvatar />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-slate-800">{transcript.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {transcript.student_code}
                  {transcript.program_name && <> · {transcript.program_name}</>}
                  {transcript.class_name    && <> · {transcript.class_name}</>}
                  {transcript.gender        && <> · {transcript.gender}</>}
                </p>
              </div>
              <button onClick={triggerPrint}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Transcript
              </button>
            </div>

            {/* ── Cumulative stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Cumulative Average', value: stats?.cumulativeAvg != null ? String(stats.cumulativeAvg) : '—', color: 'text-green-700' },
                { label: 'Total Semesters',    value: String(transcript.semesters.length), color: 'text-slate-700' },
                { label: 'Subjects Sat',       value: String(stats?.totalSubjects ?? 0), color: 'text-slate-700' },
                { label: 'Pass Rate',          value: stats?.passRate != null ? `${stats.passRate}%` : '—', color: stats?.passRate != null && stats.passRate >= 70 ? 'text-green-700' : 'text-amber-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-2xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* ── Performance trend chart ── */}
            {transcript.semesters.some(s => s.average != null) && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Performance Trend</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />≥70</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />50–69</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />&lt;50</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {transcript.semesters.map(sem => {
                    const avg = sem.average ?? 0;
                    const barCls = avg >= 70 ? 'bg-green-500' : avg >= 50 ? 'bg-amber-400' : 'bg-red-400';
                    const label = `${sem.academic_year} Sem ${sem.semester}`;
                    return (
                      <div key={`${sem.year_id}:${sem.semester}`} className="flex items-center gap-3 text-sm">
                        <div className="w-32 text-right text-xs text-slate-500 flex-shrink-0 truncate">{label}</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                          <div
                            className={`h-full ${barCls} rounded-full flex items-center justify-end pr-2 transition-all`}
                            style={{ width: `${Math.min(avg, 100)}%` }}
                          >
                            {avg >= 20 && <span className="text-white text-xs font-bold">{sem.average}</span>}
                          </div>
                        </div>
                        {avg < 20 && <span className="text-xs font-bold text-slate-500 w-8">{sem.average ?? '—'}</span>}
                        <div className="w-16 flex-shrink-0">
                          {sem.class_position ? (
                            <span className="text-xs text-slate-400">{ordinal(sem.class_position)}/{sem.class_total}</span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Semester cards ── */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Record — {transcript.semesters.length} Semester{transcript.semesters.length !== 1 ? 's' : ''}</p>
              <button onClick={toggleAll} className="text-xs font-semibold text-green-700 hover:text-green-900">
                {transcript.semesters.every(s => expanded[`${s.year_id}:${s.semester}`]) ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            <div className="space-y-3">
              {transcript.semesters.map(sem => {
                const key = `${sem.year_id}:${sem.semester}`;
                const open = !!expanded[key];
                const passCount = sem.subjects.filter(s => s.total != null && s.total >= 50).length;
                const totalWithScore = sem.subjects.filter(s => s.total != null).length;
                return (
                  <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Semester header — always visible */}
                    <button onClick={() => toggleSem(key)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: sem.average != null ? (sem.average >= 70 ? '#15803D' : sem.average >= 50 ? '#D97706' : '#DC2626') : '#e5e7eb' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">
                          {sem.academic_year} — Semester {sem.semester}
                          <span className="ml-2 text-xs font-normal text-slate-400">{sem.class_name}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {sem.subjects.length} subject{sem.subjects.length !== 1 ? 's' : ''}
                          {totalWithScore > 0 && <> · {passCount}/{totalWithScore} passed</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {sem.average != null && (
                          <div className="text-right">
                            <p className="text-xs text-slate-400 leading-none mb-0.5">Average</p>
                            <p className="text-lg font-black" style={{ color: sem.average >= 70 ? '#15803D' : sem.average >= 50 ? '#D97706' : '#DC2626' }}>{sem.average}</p>
                          </div>
                        )}
                        {sem.class_position && (
                          <div className="text-right">
                            <p className="text-xs text-slate-400 leading-none mb-0.5">Position</p>
                            <p className="text-base font-bold text-slate-700">{ordinal(sem.class_position)}<span className="text-xs font-normal text-slate-400">/{sem.class_total}</span></p>
                          </div>
                        )}
                        <GradePill grade={sem.overall_grade} />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {/* Semester subject table */}
                    {open && (
                      <div className="border-t border-slate-100">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                                <th className="px-4 py-2.5 text-left">Subject</th>
                                <th className="px-4 py-2.5 text-center">{caLabel}</th>
                                <th className="px-4 py-2.5 text-center">{exLabel}</th>
                                <th className="px-4 py-2.5 text-center">Total</th>
                                <th className="px-4 py-2.5 text-center">Grade</th>
                                <th className="px-4 py-2.5 text-left">Remark</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {sem.subjects.map(s => (
                                <tr key={s.subject} className="hover:bg-slate-50">
                                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.subject}</td>
                                  <td className="px-4 py-2.5 text-center"><ScorePill value={s.ca_score} /></td>
                                  <td className="px-4 py-2.5 text-center"><ScorePill value={s.exam_score} /></td>
                                  <td className="px-4 py-2.5 text-center"><ScorePill value={s.total} /></td>
                                  <td className="px-4 py-2.5 text-center"><GradePill grade={s.grade} /></td>
                                  <td className="px-4 py-2.5 text-xs text-slate-500">{s.remark && s.remark !== '-' ? s.remark : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                            {/* Semester summary row */}
                            <tfoot>
                              <tr className="bg-green-50 border-t-2 border-green-100">
                                <td className="px-4 py-2 text-xs font-bold text-green-800 uppercase tracking-wide">Semester Summary</td>
                                <td colSpan={2} className="px-4 py-2" />
                                <td className="px-4 py-2 text-center">
                                  <span className="text-sm font-black" style={{ color: sem.average != null ? (sem.average >= 70 ? '#15803D' : sem.average >= 50 ? '#D97706' : '#DC2626') : '#6b7280' }}>
                                    {sem.average ?? '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-center"><GradePill grade={sem.overall_grade} /></td>
                                <td className="px-4 py-2 text-xs text-slate-500">
                                  {sem.class_position ? `${ordinal(sem.class_position)} of ${sem.class_total} students` : '—'}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Best semester callout ── */}
            {stats?.best && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Best Academic Performance</p>
                  <p className="text-sm font-bold text-green-900 mt-0.5">
                    {stats.best.academic_year} — Semester {stats.best.semester}
                    <span className="ml-2 font-normal text-green-700">Average: {stats.best.average} · Grade: {stats.best.overall_grade}</span>
                  </p>
                </div>
              </div>
            )}

          </>
        )}

        {/* ── Empty state (no student selected) ── */}
        {!selected && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-14 h-14 text-slate-200 mx-auto mb-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-slate-400 font-medium">Search for a student to view their transcript</p>
            <p className="text-slate-300 text-sm mt-1">Full academic history across all years and semesters</p>
          </div>
        )}

      </div>
    </>
  );
}
