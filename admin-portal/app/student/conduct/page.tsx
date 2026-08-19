'use client';
import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';

interface DisciplinaryLetter {
  id: string; letter_type: string; offense_category: string; offense_other?: string;
  subject: string; body: string; issued_date: string; status: string;
  acknowledged_at?: string; acknowledged_by?: string;
  resolution_notes?: string; resolved_at?: string; issued_by_name: string; created_at: string;
  academic_year_name?: string; semester?: number;
}

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  warning: '#C8780A', warningBg: '#FFFBEB',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

const OFFENSE_CAT_LABELS: Record<string, string> = {
  lateness_absenteeism: 'Lateness / Absenteeism',
  fighting_assault:     'Fighting / Assault',
  exam_malpractice:     'Exam Malpractice',
  substance_use:        'Substance Use',
  insubordination:      'Insubordination',
  theft_damage:         'Theft / Property Damage',
  bullying_harassment:  'Bullying / Harassment',
  indecent_behavior:    'Indecent Behavior',
  vandalism:            'Vandalism',
  other:                'Other',
};

function letterTypeBadge(type: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    warning:       { label: 'Warning',       color: C.warning, bg: C.warningBg },
    final_warning: { label: 'Final Warning', color: C.danger,  bg: C.dangerBg },
    suspension:    { label: 'Suspension',    color: '#7F1D1D', bg: '#FECACA' },
    dismissal:     { label: 'Dismissal',     color: '#450A0A', bg: '#FCA5A5' },
    other:         { label: 'Other',         color: C.mid2,    bg: C.bg },
  };
  return map[type] ?? { label: type, color: C.muted, bg: C.bg };
}

function letterStatusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    issued:       { label: 'Issued',       color: C.warning, bg: C.warningBg },
    acknowledged: { label: 'Acknowledged', color: C.mid,     bg: '#E8F4EE' },
    resolved:     { label: 'Resolved',     color: C.success, bg: '#DCFCE7' },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function StudentConductPage() {
  const [letters, setLetters] = useState<DisciplinaryLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    studentApi.get<DisciplinaryLetter[]>('/api/student/discipline')
      .then(r => setLetters(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = letters.length;
  const active = letters.filter(l => l.status !== 'resolved').length;

  async function acknowledge(id: string) {
    setAcknowledging(id);
    try {
      const { data } = await studentApi.post<DisciplinaryLetter>(`/api/student/discipline/${id}/acknowledge`, {});
      setLetters(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error ?? 'Failed to acknowledge');
    } finally { setAcknowledging(null); }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${C.mid}`, borderBottomColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 20px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: 0 }}>Conduct Record</h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Your disciplinary letters issued by school management.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Total Letters</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: '2px 0 0' }}>{total}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>Active</p>
          <p style={{ fontSize: 20, fontWeight: 800, color: active > 0 ? C.warning : C.success, margin: '2px 0 0' }}>{active}</p>
        </div>
      </div>

      {/* Empty state */}
      {letters.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '56px 24px', textAlign: 'center' }}>
          <svg viewBox="0 0 48 48" width={44} height={44} fill="none" stroke={C.success} strokeWidth={1.5} style={{ margin: '0 auto 14px' }}>
            <path d="M24 4l18 8v12c0 11-8 21-18 24C14 45 6 35 6 24V12l18-8z"/>
            <path d="M16 24l5 5 11-11" strokeWidth={2}/>
          </svg>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>No disciplinary records on file.</p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Keep up the good work!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {letters.map(l => {
            const tBadge = letterTypeBadge(l.letter_type);
            const sBadge = letterStatusBadge(l.status);
            const isExpanded = expandedId === l.id;

            return (
              <div key={l.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Card header */}
                <div onClick={() => setExpandedId(isExpanded ? null : l.id)}
                  style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: tBadge.color, background: tBadge.bg, padding: '2px 8px', borderRadius: 6 }}>{tBadge.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: sBadge.color, background: sBadge.bg, padding: '2px 8px', borderRadius: 6 }}>{sBadge.label}</span>
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.subject}</p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                      {OFFENSE_CAT_LABELS[l.offense_category] ?? l.offense_category}
                      {l.offense_other ? ` — ${l.offense_other}` : ''} · {fmt(l.issued_date)}
                    </p>
                  </div>
                  <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke={C.muted} strokeWidth={2} strokeLinecap="round"
                    style={{ flexShrink: 0, marginTop: 4, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    <path d="M4 6l4 4 4-4"/>
                  </svg>
                </div>

                {/* Expanded: formal letter */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px' }}>
                    {/* Formal letter box */}
                    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 14, fontFamily: 'Georgia, serif' }}>
                      <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, fontFamily: 'sans-serif' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Disciplinary Letter</p>
                        <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
                          Issued by {l.issued_by_name} · {fmt(l.issued_date)}
                          {l.academic_year_name ? ` · ${l.academic_year_name}` : ''}
                          {l.semester ? ` · Semester ${l.semester}` : ''}
                        </p>
                      </div>
                      <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{l.body}</p>
                    </div>

                    {/* Status info */}
                    {l.acknowledged_at && (
                      <div style={{ background: '#E8F4EE', border: '1px solid #B7DFC9', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: C.mid }}>
                        Acknowledged by <strong>{l.acknowledged_by}</strong> on {fmt(l.acknowledged_at)}
                      </div>
                    )}

                    {l.resolution_notes && (
                      <div style={{ background: '#E8F4EE', border: '1px solid #B7DFC9', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 4 }}>Resolution</p>
                        <p style={{ fontSize: 12, color: C.dark, margin: 0 }}>{l.resolution_notes}</p>
                        <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Resolved on {fmt(l.resolved_at)}</p>
                      </div>
                    )}

                    {/* Acknowledge button */}
                    {l.status === 'issued' && (
                      <button onClick={() => acknowledge(l.id)} disabled={acknowledging === l.id}
                        style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 13, cursor: acknowledging === l.id ? 'not-allowed' : 'pointer', opacity: acknowledging === l.id ? 0.6 : 1 }}>
                        {acknowledging === l.id ? 'Acknowledging…' : 'Acknowledge Receipt'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
