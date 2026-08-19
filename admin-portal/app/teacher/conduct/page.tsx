'use client';
import { useEffect, useState, useRef } from 'react';
import { teacherApi } from '@/lib/teacher-api';

interface TeacherQuery {
  id: string; category: string; category_other?: string; subject: string; body: string;
  issued_date: string; response_deadline?: string; status: string; issued_by_name: string;
  teacher_response_text?: string; teacher_response_file_url?: string; teacher_response_file_name?: string;
  response_submitted_at?: string; resolution_notes?: string;
  resolved_by_name?: string; resolved_at?: string; created_at: string; academic_year_name?: string;
}

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  warning: '#C8780A', warningBg: '#FFFBEB',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

const QUERY_CAT_LABELS: Record<string, string> = {
  absenteeism: 'Absenteeism', misconduct: 'Misconduct', insubordination: 'Insubordination',
  negligence: 'Negligence of Duty', poor_performance: 'Poor Performance', other: 'Other',
};

function statusBadge(status: string, deadline?: string) {
  const isOverdue = deadline && new Date(deadline) < new Date() && !['responded','resolved','escalated'].includes(status);
  if (isOverdue) return { label: 'Overdue', color: C.danger, bg: C.dangerBg };
  const map: Record<string, { label: string; color: string; bg: string }> = {
    issued:       { label: 'Issued',       color: C.warning, bg: C.warningBg },
    acknowledged: { label: 'Acknowledged', color: C.mid,     bg: '#E8F4EE' },
    responded:    { label: 'Responded',    color: C.forest,  bg: '#D1EAD9' },
    resolved:     { label: 'Resolved',     color: C.success, bg: '#DCFCE7' },
    escalated:    { label: 'Escalated',    color: C.danger,  bg: C.dangerBg },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 90 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: color ?? C.dark, marginTop: 2 }}>{value}</span>
    </div>
  );
}

export default function TeacherConductPage() {
  const [queries, setQueries] = useState<TeacherQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responseFile, setResponseFile] = useState<{ data: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    teacherApi.get<TeacherQuery[]>('/api/discipline/queries')
      .then(r => setQueries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = queries.length;
  const awaitingResponse = queries.filter(q => ['issued','acknowledged'].includes(q.status)).length;
  const resolved = queries.filter(q => q.status === 'resolved').length;

  async function acknowledge(id: string) {
    try {
      const { data } = await teacherApi.post<TeacherQuery>(`/api/discipline/queries/${id}/acknowledge`, {});
      setQueries(prev => prev.map(q => q.id === id ? { ...q, ...data } : q));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error ?? 'Failed to acknowledge');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setResponseFile({ data: ev.target?.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  async function submitResponse(query: TeacherQuery) {
    if (!responseText.trim() && !responseFile) {
      setActionError('Provide a written response or upload a document');
      return;
    }
    setSubmitting(true); setActionError('');
    try {
      const payload: Record<string, unknown> = {};
      if (responseText.trim()) payload.response_text = responseText.trim();
      if (responseFile) { payload.file_data = responseFile.data; payload.file_name = responseFile.name; }
      const { data } = await teacherApi.post<TeacherQuery>(`/api/discipline/queries/${query.id}/respond`, payload);
      setQueries(prev => prev.map(q => q.id === query.id ? { ...q, ...data } : q));
      setRespondingId(null);
      setResponseText('');
      setResponseFile(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setActionError(err.response?.data?.error ?? 'Failed to submit response');
    } finally { setSubmitting(false); }
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
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: 0 }}>My Queries</h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>View and respond to queries issued to you by management.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatChip label="Total" value={total} />
        <StatChip label="Awaiting Response" value={awaitingResponse} color={C.warning} />
        <StatChip label="Resolved" value={resolved} color={C.success} />
      </div>

      {/* Query list */}
      {queries.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '56px 24px', textAlign: 'center' }}>
          <svg viewBox="0 0 48 48" width={40} height={40} fill="none" stroke={C.border} strokeWidth={1.5} style={{ margin: '0 auto 12px' }}>
            <path d="M8 44V4h20l12 12v28H8z"/><path d="M28 4v12h12"/><path d="M16 20h16M16 28h10"/>
          </svg>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>No queries on record</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>You have no queries from management. Keep up the good work!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {queries.map(q => {
            const { label, color, bg } = statusBadge(q.status, q.response_deadline);
            const isExpanded = expandedId === q.id;
            const isResponding = respondingId === q.id;
            const isClosed = ['resolved','escalated'].includes(q.status);

            return (
              <div key={q.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Card header */}
                <div onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.mid, background: '#E8F4EE', padding: '2px 8px', borderRadius: 6 }}>
                        {QUERY_CAT_LABELS[q.category] ?? q.category}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 6 }}>{label}</span>
                    </div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.subject}</p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                      Issued by {q.issued_by_name} · {fmt(q.issued_date)}
                      {q.response_deadline ? ` · Deadline: ${fmt(q.response_deadline)}` : ''}
                    </p>
                  </div>
                  <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke={C.muted} strokeWidth={2} strokeLinecap="round"
                    style={{ flexShrink: 0, marginTop: 4, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    <path d="M4 6l4 4 4-4"/>
                  </svg>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 18px' }}>
                    {/* Query body */}
                    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Query Details</p>
                      <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{q.body}</p>
                    </div>

                    {/* Response submitted */}
                    {q.teacher_response_text && (
                      <div style={{ background: '#E8F4EE', border: '1px solid #B7DFC9', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Response</p>
                        <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{q.teacher_response_text}</p>
                        {q.teacher_response_file_url && (
                          <a href={q.teacher_response_file_url} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, color: C.mid, fontWeight: 600, textDecoration: 'none' }}>
                            <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8}>
                              <path d="M3 4a1 1 0 011-1h5l4 4v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/><path d="M9 3v4h4"/>
                            </svg>
                            {q.teacher_response_file_name ?? 'Attachment'}
                          </a>
                        )}
                        {q.response_submitted_at && (
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>Submitted: {fmt(q.response_submitted_at)}</p>
                        )}
                      </div>
                    )}

                    {/* Resolution notes */}
                    {q.resolution_notes && (
                      <div style={{ background: isClosed && q.status === 'escalated' ? C.dangerBg : '#E8F4EE', border: `1px solid ${q.status === 'escalated' ? '#FECACA' : '#B7DFC9'}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: q.status === 'escalated' ? C.danger : C.mid, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {q.status === 'escalated' ? 'Escalation Notes' : 'Resolution Notes'}
                        </p>
                        <p style={{ fontSize: 13, color: C.dark, margin: 0 }}>{q.resolution_notes}</p>
                        {q.resolved_by_name && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>By {q.resolved_by_name} · {fmt(q.resolved_at)}</p>}
                      </div>
                    )}

                    {/* Action buttons */}
                    {!isClosed && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {q.status === 'issued' && (
                          <button onClick={() => acknowledge(q.id)}
                            style={{ padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.mid}`, background: '#fff', color: C.mid, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            Acknowledge Receipt
                          </button>
                        )}
                        {(q.status === 'acknowledged' || q.status === 'issued') && !isResponding && !q.teacher_response_text && (
                          <button onClick={() => { setRespondingId(q.id); setResponseText(''); setResponseFile(null); setActionError(''); }}
                            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            Submit Response
                          </button>
                        )}
                      </div>
                    )}

                    {/* Response form */}
                    {isResponding && !isClosed && (
                      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: C.mid2, marginBottom: 8 }}>Write Your Response</p>
                        <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={5}
                          placeholder="Write your written response here…"
                          style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: C.dark, background: C.bg, boxSizing: 'border-box' }} />

                        <div style={{ marginTop: 10 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Attach Document (PDF/DOC — optional)</p>
                          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} style={{ display: 'none' }} />
                          <button onClick={() => fileInputRef.current?.click()}
                            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M8 2v8M5 5l3-3 3 3"/><path d="M3 12h10"/></svg>
                            {responseFile ? responseFile.name : 'Upload File'}
                          </button>
                          {responseFile && (
                            <button onClick={() => setResponseFile(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>Remove</button>
                          )}
                        </div>

                        {actionError && <p style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{actionError}</p>}

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button onClick={() => { setRespondingId(null); setActionError(''); }}
                            style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button onClick={() => submitResponse(q)} disabled={submitting}
                            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                            {submitting ? 'Submitting…' : 'Submit Response'}
                          </button>
                        </div>
                      </div>
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
