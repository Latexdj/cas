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
  const [tab, setTab]             = useState<'pending' | 'flagged'>('pending');
  const [letters, setLetters]     = useState<PendingLetter[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<PendingLetter | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const [approveOk, setApproveOk]   = useState(false);

  useEffect(() => {
    principalApi.get<PendingLetter[]>('/api/principal/discipline/letters')
      .then(r => setLetters(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: 0 }}>Discipline</h2>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Approve pending letters and review student behaviour patterns.
        </p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        {(['pending', 'flagged'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(null); }}
            style={{ padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: tab === t ? C.mid : 'transparent',
              color: tab === t ? '#fff' : C.muted }}>
            {t === 'pending' ? 'Pending Approval' : 'Flagged Students'}
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
                  onClick={() => { setSelected(l); setApproveErr(''); setApproveOk(false); }}
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

                  {/* Body */}
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Letter Body</p>
                    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
                      <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{selected.body}</p>
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

                  {/* Approve action */}
                  {approveOk ? (
                    <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 10, padding: '14px 18px', textAlign: 'center' }}>
                      <p style={{ fontWeight: 700, color: '#14532D', margin: 0 }}>Letter approved and issued. Final PDF generated.</p>
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
                        disabled={approving}
                        style={{
                          width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                          background: C.purple, color: '#fff', fontWeight: 800, fontSize: 14,
                          cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1,
                        }}
                      >
                        {approving ? 'Approving…' : 'Approve & Issue Letter'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Flagged Tab ── */}
      {tab === 'flagged' && <FlaggedPanel />}
    </div>
  );
}
