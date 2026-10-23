'use client';
import { useEffect, useState } from 'react';
import { principalApi } from '@/lib/principal-api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingLetter {
  id: string;
  ref_number?: string;
  letter_type: string;
  offense_category: string;
  offense_other?: string;
  subject: string;
  body: string;
  issued_date: string;
  status: string;
  pdf_url?: string;
  issued_by_name: string;
  issued_by_signature_url?: string;
  student_id: string;
  student_name: string;
  student_code: string;
  class_name: string;
  academic_year_name?: string;
  school_name?: string;
  created_at: string;
}

interface DisciplineFlag {
  type: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}
interface FlaggedStudent {
  student_id: string;
  student_name: string;
  class_name: string;
  form_master_name: string | null;
  flags: DisciplineFlag[];
  severity_score: number;
  days_since_last_action: number;
}
interface TeacherFlag { type: string; severity: 'high' | 'medium'; detail: string; }
interface FlaggedTeacher {
  teacher_id: string; teacher_name: string; department: string | null;
  flags: TeacherFlag[]; severity_score: number;
}
interface FlagThresholds {
  repeat_offense_count: number; category_concentration_count: number;
  time_density_count: number; time_density_days: number; stale_case_days: number;
}
interface FlaggedData { students: FlaggedStudent[]; teachers: FlaggedTeacher[]; thresholds: FlagThresholds; }

interface TeacherQuery {
  id: string; ref_number?: string | null; category: string; category_other?: string;
  subject: string; body: string; issued_date: string; response_deadline?: string;
  status: string; teacher_response_text?: string; teacher_response_file_url?: string;
  teacher_response_file_name?: string; response_submitted_at?: string; resolution_notes?: string;
  resolved_by_name?: string; resolved_at?: string; created_at: string; issued_by_name: string;
  issued_by_signature_url?: string | null; pdf_url?: string | null;
  voided_at?: string | null; voided_by_name?: string | null; void_reason?: string | null;
  teacher_id: string; teacher_name: string; department?: string | null; academic_year_name?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LETTER_TYPE_LABELS: Record<string, string> = {
  warning: 'Warning', final_warning: 'Final Warning',
  suspension: 'Suspension', dismissal: 'Dismissal', other: 'Other',
};

const OFFENSE_LABELS: Record<string, string> = {
  lateness_absenteeism: 'Lateness / Absenteeism', fighting_assault: 'Fighting / Assault',
  exam_malpractice: 'Exam Malpractice', substance_use: 'Substance Use',
  insubordination: 'Insubordination', theft_damage: 'Theft / Property Damage',
  bullying_harassment: 'Bullying / Harassment', indecent_behavior: 'Indecent Behavior',
  vandalism: 'Vandalism', other: 'Other',
};

const QUERY_CAT_LABELS: Record<string, string> = {
  absenteeism: 'Absenteeism', misconduct: 'Misconduct', insubordination: 'Insubordination',
  negligence: 'Negligence of Duty', poor_performance: 'Poor Performance', other: 'Other',
};

function queryStatusBadge(status: string, deadline?: string) {
  const isOverdue = deadline && new Date(deadline) < new Date() && !['draft','responded','resolved','escalated','voided'].includes(status);
  if (isOverdue) return { label: 'Overdue', color: C.danger, bg: C.dangerBg };
  const map: Record<string, { label: string; color: string; bg: string }> = {
    issued:       { label: 'Issued',       color: C.warning, bg: C.warningBg },
    acknowledged: { label: 'Acknowledged', color: C.mid,     bg: '#E8F4EE' },
    responded:    { label: 'Responded',    color: C.forest,  bg: '#D1EAD9' },
    resolved:     { label: 'Resolved',     color: C.success, bg: C.successBg },
    escalated:    { label: 'Escalated',    color: C.danger,  bg: C.dangerBg },
    voided:       { label: 'Voided',       color: C.muted,   bg: C.bg },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function firstWord(name?: string) {
  return name ? name.split(' ')[0] : 'Sir/Madam';
}

const FLAG_TYPE_LABELS: Record<string, string> = {
  stale_serious_case: 'Stale serious case', escalation_trajectory: 'Escalating severity',
  category_concentration: 'Category concentration', time_density: 'Time density',
  repeat_offense: 'Repeat offense', escalated_query: 'Query escalated', repeat_queries: 'Repeat queries',
};

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const C = {
  forest: '#0B3D2E', mid: '#145C44', bg: '#F5F0E8', card: '#FDFAF5',
  border: '#E2D9CC', dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  warning: '#C8780A', warningBg: '#FFFBEB',
  success: '#2D7A4F', successBg: '#E8F4EE',
  purple: '#6D28D9', purpleBg: '#EDE9FE',
};

// ─── Flag chip ────────────────────────────────────────────────────────────────

function FlagChip({ flag }: { flag: { severity: 'high' | 'medium' | 'low'; type: string; detail: string } }) {
  const { color, bg } =
    flag.severity === 'high'   ? { color: C.danger,  bg: C.dangerBg } :
    flag.severity === 'medium' ? { color: C.warning, bg: C.warningBg } :
                                 { color: C.success, bg: C.successBg };
  return (
    <span title={flag.detail} style={{
      fontSize: 11, fontWeight: 700, color, background: bg,
      borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', cursor: 'help',
    }}>
      {FLAG_TYPE_LABELS[flag.type] ?? flag.type}
    </span>
  );
}

// ─── Flagged Panel (principal/headmaster view) ────────────────────────────────

function FlaggedPanel() {
  const [data, setData]   = useState<FlaggedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    principalApi.get<FlaggedData>('/api/principal/discipline/flagged-students')
      .then(r => setData(r.data))
      .catch(() => setError('Could not load flagged students.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', border: `3px solid ${C.mid}`, borderBottomColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }
  if (error) {
    return <p style={{ color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</p>;
  }

  const students = data?.students ?? [];
  const teachers = data?.teachers ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Flagged students */}
      <div>
        <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: '0 0 12px' }}>
          Flagged students
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>({students.length})</span>
        </p>
        {students.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
            <p style={{ fontWeight: 700, color: C.dark, marginBottom: 4 }}>No flagged students</p>
            <p style={{ fontSize: 13, color: C.muted }}>No students match the configured detection rules.</p>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {['Student', 'Class', 'Form master', 'Active flags', 'Days since action'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontWeight: 700, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.student_id} style={{ borderBottom: `1px solid ${C.bg}`, background: i % 2 === 0 ? '#fff' : C.card }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: C.dark }}>{s.student_name}</td>
                      <td style={{ padding: '11px 14px', color: C.mid2 }}>{s.class_name}</td>
                      <td style={{ padding: '11px 14px', color: C.muted, fontSize: 12 }}>{s.form_master_name ?? '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {s.flags.map((f, fi) => <FlagChip key={fi} flag={f} />)}
                        </div>
                        {s.flags.length > 0 && (
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 4, marginBottom: 0 }}>{s.flags[0].detail}</p>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.days_since_last_action}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Teacher flags — only visible when backend sends them (headmaster sees none) */}
      {teachers.length > 0 && (
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: '0 0 12px' }}>
            Flagged teachers
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: C.muted }}>({teachers.length})</span>
          </p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {['Teacher', 'Department', 'Active flags'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 14px', fontWeight: 700, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.teacher_id} style={{ borderBottom: `1px solid ${C.bg}`, background: i % 2 === 0 ? '#fff' : C.card }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: C.dark }}>{t.teacher_name}</td>
                      <td style={{ padding: '11px 14px', color: C.muted }}>{t.department ?? '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {t.flags.map((f, fi) => <FlagChip key={fi} flag={{ ...f, severity: f.severity as 'high' | 'medium' | 'low' }} />)}
                        </div>
                        {t.flags.length > 0 && (
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 4, marginBottom: 0 }}>{t.flags[0].detail}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: C.muted }}>
        Flags are computed from current letter records and clear automatically when letters are resolved. No flag records are stored.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PrincipalDisciplinePage() {
  const [tab, setTab]             = useState<'pending' | 'flagged' | 'queries'>('pending');
  const [letters, setLetters]     = useState<PendingLetter[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<PendingLetter | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const [approveOk, setApproveOk]   = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason]     = useState('');
  const [returning, setReturning]           = useState(false);
  const [returnErr, setReturnErr]           = useState('');
  const [returnOk, setReturnOk]             = useState(false);

  const [queries, setQueries]             = useState<TeacherQuery[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [selectedQuery, setSelectedQuery] = useState<TeacherQuery | null>(null);
  const [queryStatusFilter, setQueryStatusFilter] = useState('');

  useEffect(() => {
    principalApi.get<PendingLetter[]>('/api/principal/discipline/letters')
      .then(r => setLetters(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    principalApi.get<TeacherQuery[]>('/api/principal/discipline/queries')
      .then(r => setQueries(r.data))
      .catch(console.error)
      .finally(() => setQueriesLoading(false));
  }, []);

  const queryTotal   = queries.length;
  const queryOpen    = queries.filter(q => ['issued','acknowledged','responded'].includes(q.status)).length;
  const queryOverdue = queries.filter(q => q.response_deadline && new Date(q.response_deadline) < new Date() && !['responded','resolved','escalated','voided'].includes(q.status)).length;
  const queryResolved = queries.filter(q => q.status === 'resolved').length;
  const filteredQueries = queryStatusFilter ? queries.filter(q => q.status === queryStatusFilter) : queries;

  async function approve(id: string) {
    setApproving(true); setApproveErr(''); setApproveOk(false);
    try {
      await principalApi.patch(`/api/discipline/letters/${id}/approve`);
      setLetters(prev => prev.filter(l => l.id !== id));
      setApproveOk(true);
      setTimeout(() => { setSelected(null); setApproveOk(false); }, 1800);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setApproveErr(err.response?.data?.error ?? 'Approval failed');
    } finally { setApproving(false); }
  }

  async function returnForCorrection(id: string) {
    if (!returnReason.trim()) { setReturnErr('A reason is required to return this letter'); return; }
    setReturning(true); setReturnErr(''); setReturnOk(false);
    try {
      await principalApi.patch(`/api/discipline/letters/${id}/return`, { reason: returnReason.trim() });
      setLetters(prev => prev.filter(l => l.id !== id));
      setReturnOk(true);
      setTimeout(() => { setSelected(null); setReturnOk(false); setShowReturnForm(false); setReturnReason(''); }, 1800);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setReturnErr(err.response?.data?.error ?? 'Return failed');
    } finally { setReturning(false); }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: 0 }}>Discipline</h2>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Approve pending letters, review teacher queries, and watch for behaviour patterns.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        {(['pending', 'queries', 'flagged'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); setSelectedQuery(null); }}
            style={{ padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: tab === t ? C.mid : 'transparent',
              color: tab === t ? '#fff' : C.muted }}>
            {t === 'pending' ? 'Pending Approval' : t === 'queries' ? 'Teacher Queries' : 'Flagged Students'}
          </button>
        ))}
      </div>

      {/* ── Pending Approval Tab ── */}
      {tab === 'pending' && (
        <>
          {loading ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 72, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : letters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <p style={{ fontWeight: 700, color: C.dark, marginBottom: 4 }}>No letters pending approval</p>
              <p style={{ fontSize: 13, color: C.muted }}>All disciplinary letters have been reviewed.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {letters.map(l => (
                <button
                  key={l.id}
                  onClick={() => { setSelected(l); setApproveErr(''); setApproveOk(false); setShowReturnForm(false); setReturnReason(''); setReturnErr(''); setReturnOk(false); }}
                  style={{
                    textAlign: 'left', width: '100%', background: selected?.id === l.id ? '#EDE9FE' : C.card,
                    border: `1px solid ${selected?.id === l.id ? C.purple : C.border}`,
                    borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#FECACA', color: '#7F1D1D', borderRadius: 6, padding: '2px 8px' }}>
                        {LETTER_TYPE_LABELS[l.letter_type] ?? l.letter_type}
                      </span>
                      {l.ref_number && (
                        <span style={{ fontSize: 11, color: C.muted }}>Ref: {l.ref_number}</span>
                      )}
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.student_name} · {l.class_name}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
                      {l.subject} · {fmt(l.issued_date)}
                    </p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
              style={{ background: 'rgba(11,61,46,0.5)' }}
              onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
            >
              <div style={{
                background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680,
                maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
              }}>
                {/* Header */}
                <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#FECACA', color: '#7F1D1D', borderRadius: 6, padding: '2px 8px' }}>
                        {LETTER_TYPE_LABELS[selected.letter_type] ?? selected.letter_type}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, background: C.purpleBg, color: C.purple, borderRadius: 6, padding: '2px 8px' }}>
                        PENDING APPROVAL
                      </span>
                    </div>
                    <p style={{ fontWeight: 800, fontSize: 16, color: C.dark, margin: '0 0 2px' }}>{selected.student_name}</p>
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{selected.class_name} · {selected.student_code}</p>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Meta row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
                    {[
                      { label: 'Ref Number', value: selected.ref_number ?? '—' },
                      { label: 'Issued Date', value: fmt(selected.issued_date) },
                      { label: 'Offense Category', value: OFFENSE_LABELS[selected.offense_category] ?? selected.offense_category },
                      { label: 'Issued By', value: selected.issued_by_name },
                    ].map(f => (
                      <div key={f.label} style={{ background: C.bg, borderRadius: 10, padding: '10px 14px' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{f.label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.dark, margin: 0 }}>{f.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Subject */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Subject</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.dark, textDecoration: 'underline', textTransform: 'uppercase', margin: 0 }}>{selected.subject}</p>
                  </div>

                  {/* Body — sanitized rich-text HTML, same editor used to write it */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Letter Body</p>
                    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
                      <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.8, margin: 0 }} dangerouslySetInnerHTML={{ __html: selected.body ?? '' }} />
                    </div>
                  </div>

                  {/* PDF preview */}
                  {selected.pdf_url ? (
                    <div style={{ background: C.purpleBg, border: `1px solid #C4B5FD`, borderRadius: 10, padding: '12px 16px' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.purple, margin: '0 0 8px' }}>Draft PDF (Watermarked)</p>
                      <a
                        href={selected.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: C.purple, fontWeight: 600, textDecoration: 'underline' }}
                      >
                        Open watermarked PDF →
                      </a>
                    </div>
                  ) : (
                    <div style={{ background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>No PDF generated yet — the issuer must generate the draft PDF before approval.</p>
                    </div>
                  )}

                  {/* Approve / Return action */}
                  {approveOk ? (
                    <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
                      <p style={{ fontWeight: 700, color: '#14532D', margin: 0 }}>Letter approved and issued. Final PDF generated.</p>
                    </div>
                  ) : returnOk ? (
                    <div style={{ background: C.dangerBg, border: `1px solid #FECACA`, borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
                      <p style={{ fontWeight: 700, color: C.danger, margin: 0 }}>Letter returned for correction.</p>
                    </div>
                  ) : (
                    <div style={{ background: C.purpleBg, border: `1px solid #C4B5FD`, borderRadius: 12, padding: '16px 18px' }}>
                      <p style={{ fontSize: 13, color: C.purple, fontWeight: 700, marginBottom: 6 }}>Headmaster Approval Required</p>
                      <p style={{ fontSize: 12, color: '#7C3AED', marginBottom: 14 }}>
                        Approving this letter will set its status to <strong>Issued</strong> and generate the final signed PDF. This action cannot be undone.
                      </p>
                      {approveErr && (
                        <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{approveErr}</p>
                      )}
                      <button
                        onClick={() => approve(selected.id)}
                        disabled={approving || returning}
                        style={{
                          width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                          background: C.purple, color: '#fff', fontWeight: 800, fontSize: 14,
                          cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1,
                        }}
                      >
                        {approving ? 'Approving…' : 'Approve & Issue Letter'}
                      </button>

                      {!showReturnForm ? (
                        <button
                          onClick={() => { setShowReturnForm(true); setReturnErr(''); }}
                          disabled={approving || returning}
                          style={{
                            width: '100%', padding: '10px', borderRadius: 10, marginTop: 10,
                            border: `1.5px solid ${C.danger}`, background: 'transparent', color: C.danger,
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          Return for Correction
                        </button>
                      ) : (
                        <div style={{ marginTop: 12, borderTop: `1px solid #C4B5FD`, paddingTop: 12 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: C.danger, marginBottom: 6 }}>Reason for return (required)</p>
                          <textarea
                            value={returnReason}
                            onChange={e => setReturnReason(e.target.value)}
                            rows={3}
                            placeholder="Explain what needs to be fixed before this letter can be approved…"
                            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: C.dark, background: '#fff', boxSizing: 'border-box', marginBottom: 8 }}
                          />
                          {returnErr && (
                            <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>{returnErr}</p>
                          )}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => { setShowReturnForm(false); setReturnReason(''); setReturnErr(''); }}
                              disabled={returning}
                              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => returnForCorrection(selected.id)}
                              disabled={returning}
                              style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontWeight: 800, fontSize: 12, cursor: returning ? 'not-allowed' : 'pointer', opacity: returning ? 0.6 : 1 }}
                            >
                              {returning ? 'Returning…' : 'Confirm Return for Correction'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Teacher Queries Tab ── */}
      {tab === 'queries' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {[
              { label: 'Total', value: queryTotal },
              { label: 'Open', value: queryOpen, color: C.warning },
              { label: 'Overdue', value: queryOverdue, color: C.danger },
              { label: 'Resolved', value: queryResolved, color: C.success },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', minWidth: 90 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{s.label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: s.color ?? C.dark, margin: 0 }}>{s.value}</p>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <select value={queryStatusFilter} onChange={e => setQueryStatusFilter(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', fontSize: 12, background: '#fff', color: C.dark, outline: 'none' }}>
              <option value="">All statuses</option>
              {['issued','acknowledged','responded','resolved','escalated','voided'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          {queriesLoading ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 72, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : filteredQueries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
              <p style={{ fontWeight: 700, color: C.dark, marginBottom: 4 }}>No teacher queries</p>
              <p style={{ fontSize: 13, color: C.muted }}>Queries issued to teachers by the admin will appear here.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {filteredQueries.map(q => {
                const { label, color, bg } = queryStatusBadge(q.status, q.response_deadline);
                return (
                  <button key={q.id} onClick={() => setSelectedQuery(q)}
                    style={{
                      textAlign: 'left', width: '100%', background: selectedQuery?.id === q.id ? '#EDE9FE' : C.card,
                      border: `1px solid ${selectedQuery?.id === q.id ? C.purple : C.border}`,
                      borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.mid, background: '#E8F4EE', padding: '2px 8px', borderRadius: 6 }}>
                          {QUERY_CAT_LABELS[q.category] ?? q.category}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 6 }}>{label}</span>
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.teacher_name}{q.department ? ` · ${q.department}` : ''}
                      </p>
                      <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
                        {q.subject} · {fmt(q.issued_date)}
                      </p>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* Detail modal — read-only, letter-styled same as the teacher's own view */}
          {selectedQuery && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
              style={{ background: 'rgba(11,61,46,0.5)' }}
              onClick={e => { if (e.target === e.currentTarget) setSelectedQuery(null); }}
            >
              <div style={{
                background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680,
                maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
              }}>
                <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    {(() => { const { label, color, bg } = queryStatusBadge(selectedQuery.status, selectedQuery.response_deadline);
                      return <span style={{ fontSize: 11, fontWeight: 800, background: bg, color, borderRadius: 6, padding: '2px 8px' }}>{label}</span>; })()}
                    <p style={{ fontWeight: 800, fontSize: 16, color: C.dark, margin: '6px 0 2px' }}>{selectedQuery.teacher_name}</p>
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{selectedQuery.department ?? ''}</p>
                  </div>
                  <button onClick={() => setSelectedQuery(null)} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>✕</button>
                </div>

                <div style={{ padding: '20px 24px' }}>
                  {/* Letter card — matches the format the teacher sees and the admin's print/PDF view */}
                  <div style={{
                    background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '26px 28px', marginBottom: 14, boxShadow: '0 1px 3px rgba(44,34,24,0.06)',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.mid2, marginBottom: 20 }}>
                      <span><strong>Ref:</strong> {selectedQuery.ref_number ?? '—'}</span>
                      <span><strong>Date:</strong> {fmt(selectedQuery.issued_date)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.6, marginBottom: 20 }}>
                      <div>To:</div>
                      <div style={{ fontWeight: 700 }}>{selectedQuery.teacher_name}</div>
                      {selectedQuery.department && <div style={{ color: C.muted }}>{selectedQuery.department}</div>}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, textDecoration: 'underline', textTransform: 'uppercase', textAlign: 'center', color: C.dark, margin: '0 0 20px' }}>
                      {selectedQuery.subject}
                    </p>
                    <p style={{ fontSize: 13, color: C.dark, margin: '0 0 14px' }}>Dear {firstWord(selectedQuery.teacher_name)},</p>
                    <div style={{ fontSize: 13, color: C.dark, lineHeight: 1.8, textAlign: 'justify' }}
                      dangerouslySetInnerHTML={{ __html: selectedQuery.body ?? '' }} />
                    <div style={{ marginTop: 28 }}>
                      <p style={{ fontSize: 13, color: C.dark, margin: 0 }}>Yours faithfully,</p>
                      {selectedQuery.issued_by_signature_url ? (
                        <img src={selectedQuery.issued_by_signature_url} alt="Signature" style={{ display: 'block', maxHeight: 60, maxWidth: 160, marginTop: 8 }} />
                      ) : <div style={{ height: 36 }} />}
                      <div style={{ borderTop: `1px solid ${C.dark}`, width: 200, marginTop: 4, paddingTop: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.dark }}>{selectedQuery.issued_by_name}</div>
                      </div>
                    </div>
                  </div>

                  {selectedQuery.pdf_url && (
                    <a href={selectedQuery.pdf_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: `1px solid ${C.mid}`, background: '#E8F4EE', color: C.mid, fontWeight: 700, fontSize: 12, textDecoration: 'none', marginBottom: 14 }}>
                      Download / Print PDF
                    </a>
                  )}

                  {selectedQuery.teacher_response_text && (
                    <div style={{ background: '#E8F4EE', border: '1px solid #B7DFC9', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teacher&apos;s Response</p>
                      <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{selectedQuery.teacher_response_text}</p>
                      {selectedQuery.teacher_response_file_url && (
                        <a href={selectedQuery.teacher_response_file_url} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: C.mid, fontWeight: 600 }}>
                          {selectedQuery.teacher_response_file_name ?? 'Attachment'}
                        </a>
                      )}
                      {selectedQuery.response_submitted_at && (
                        <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Submitted: {fmt(selectedQuery.response_submitted_at)}</p>
                      )}
                    </div>
                  )}

                  {selectedQuery.resolution_notes && (
                    <div style={{ background: selectedQuery.status === 'escalated' ? C.dangerBg : '#E8F4EE', border: `1px solid ${selectedQuery.status === 'escalated' ? '#FECACA' : '#B7DFC9'}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: selectedQuery.status === 'escalated' ? C.danger : C.mid, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {selectedQuery.status === 'escalated' ? 'Escalation Notes' : 'Resolution Notes'}
                      </p>
                      <p style={{ fontSize: 13, color: C.dark, margin: 0 }}>{selectedQuery.resolution_notes}</p>
                      {selectedQuery.resolved_by_name && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>By {selectedQuery.resolved_by_name} · {fmt(selectedQuery.resolved_at)}</p>}
                    </div>
                  )}

                  {selectedQuery.status === 'voided' && (
                    <div style={{ background: '#EDE8DF', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.mid2, margin: 0 }}>
                        Voided by {selectedQuery.voided_by_name ?? 'an admin'}{selectedQuery.voided_at ? ` on ${fmt(selectedQuery.voided_at)}` : ''}
                        {selectedQuery.void_reason ? <> — &quot;{selectedQuery.void_reason}&quot;</> : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Flagged Tab ── */}
      {tab === 'flagged' && <FlaggedPanel />}
    </div>
  );
}
