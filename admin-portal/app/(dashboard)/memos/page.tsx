'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { StructuredIntake } from '@/components/StructuredIntake';
import { INTAKE_FIELDS } from '@/lib/intake-fields';

type ChatMsg = { role: 'user' | 'assistant'; content: string; intakeCard?: boolean };

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

type Memo = {
  id: string; ref_number: string | null; distribution_type: string; audience_label: string;
  subject: string; body?: string; issued_date: string | null; status: string; pdf_url: string | null;
  issued_by_name: string; issued_by_title: string | null; created_at: string;
  recipient_count: number; read_count: number; draft_session_id?: string | null;
};
type Department = { id: string; name: string };
type Responsibility = { id: string; name: string };
type Teacher = { id: string; name: string; department: string | null };

const DISTRIBUTION_TYPES = [
  { value: 'all', label: 'All Staff' },
  { value: 'department', label: 'A Department' },
  { value: 'responsibility', label: 'A Responsibility Group' },
  { value: 'specific', label: 'Specific Staff' },
];

function statusPill(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:  { label: 'Draft',  color: C.muted,   bg: '#EDE8DF' },
    issued: { label: 'Issued', color: C.success, bg: C.successBg },
  };
  const s = map[status] ?? { label: status, color: C.muted, bg: '#EDE8DF' };
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 4, color: s.color, background: s.bg,
    }}>{s.label}</span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: `1px solid ${C.border}`,
  borderRadius: 6, fontSize: 14, background: C.card, color: C.dark,
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: C.mid2, marginBottom: 6, letterSpacing: '0.02em',
};

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: C.danger }}> *</span>}</label>
      {children}
    </div>
  );
}

// ── AI Chat panel (mirrors general-letters.tsx's ChatPanel) ─────────────────

function ChatPanel({ messages, input, onInputChange, onSend, loading, error, onUseDraft, onClose,
  intakeSubmitted, onIntakeSubmit, onSkipIntake, sessionId }: {
  messages: ChatMsg[]; input: string; onInputChange: (v: string) => void;
  onSend: () => void; loading: boolean; error: string;
  onUseDraft: (text: string) => void; onClose: () => void;
  intakeSubmitted: boolean;
  onIntakeSubmit: (assembled: string) => void;
  onSkipIntake: () => void;
  sessionId: string;
}) {
  const endRef   = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const hasUserMessage = messages.some(m => m.role === 'user');

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: intakeSubmitted ? 380 : 400 }}>
      <div style={{ background: C.mid, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>AI Draft Assistant</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕ close</button>
      </div>

      {!intakeSubmitted ? (
        <StructuredIntake
          fields={INTAKE_FIELDS.memo}
          sessionId={sessionId}
          onSubmit={onIntakeSubmit}
          onSkip={onSkipIntake}
        />
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: C.bg }}>
            {messages.map((m, i) => (
              m.intakeCard ? (
                <div key={i} style={{ background: '#FDF6E3', border: `1px solid #E8D9B0`, borderRadius: 10, padding: '10px 12px', fontSize: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Submitted details</p>
                  <div style={{ color: C.dark, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {m.content.replace('Here are the details for this letter:\n\n', '')}
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                  <div style={{
                    maxWidth: '85%', padding: '8px 11px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
                    background: m.role === 'user' ? C.mid : '#fff',
                    color: m.role === 'user' ? '#fff' : C.dark,
                    border: m.role === 'assistant' ? `1px solid ${C.border}` : 'none',
                    whiteSpace: 'pre-wrap',
                  }}>{m.content}</div>
                  {m.role === 'assistant' && i === messages.length - 1 && hasUserMessage && (
                    <button onClick={() => onUseDraft(m.content)}
                      style={{ fontSize: 11, fontWeight: 700, color: C.forest, background: '#D1EAD9', border: `1px solid #B7DFC9`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                      Use this draft
                    </button>
                  )}
                </div>
              )
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: C.muted }}>
                Drafting…
              </div>
            )}
            <div ref={endRef} />
          </div>
          {error && <div style={{ padding: '4px 12px', background: C.dangerBg, fontSize: 11, color: C.danger }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${C.border}`, background: '#fff', alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input} onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Add context or ask for changes… (Shift+Enter for new line)"
              rows={1}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', color: C.dark, background: C.bg, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}
            />
            <button onClick={onSend} disabled={loading || !input.trim()}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (loading || !input.trim()) ? 0.5 : 1, flexShrink: 0 }}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MemosPage() {
  const [memos, setMemos]     = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMemo, setViewMemo] = useState<Memo | null>(null);

  async function openView(memo: Memo) {
    setViewMemo(memo); // instant feedback with what the list already has
    try {
      const { data } = await api.get<Memo>(`/api/memos/${memo.id}`);
      setViewMemo(data); // upgrade with full detail (body)
    } catch { /* keep the list-row view */ }
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [distributionType, setDistributionType] = useState('all');
  const [departmentId, setDepartmentId]         = useState('');
  const [responsibilityId, setResponsibilityId] = useState('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherSearch, setTeacherSearch]       = useState('');
  const [subject, setSubject]                   = useState('');
  const [issuedByTitle, setIssuedByTitle]       = useState('');
  const [titleSource, setTitleSource]           = useState<'management_role' | 'last_used' | null>(null);
  const [saveErr, setSaveErr]                   = useState('');

  const [departments, setDepartments]       = useState<Department[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [teachers, setTeachers]             = useState<Teacher[]>([]);

  const [draftMemoId, setDraftMemoId]       = useState('');
  const [chatSessionId, setChatSessionId]   = useState('');
  const [chatMessages, setChatMessages]     = useState<ChatMsg[]>([]);
  const [chatOpeningMessage, setChatOpeningMessage] = useState('');
  const [chatInput, setChatInput]           = useState('');
  const [chatLoading, setChatLoading]       = useState(false);
  const [chatError, setChatError]           = useState('');
  const [intakeSubmitted, setIntakeSubmitted] = useState(false);
  const [showChat, setShowChat]             = useState(false);
  const [startingChat, setStartingChat]     = useState(false);
  const [finalBody, setFinalBody]           = useState('');
  const [finalizing, setFinalizing]         = useState(false);

  function load() {
    setLoading(true);
    api.get<Memo[]>('/api/memos').then(r => setMemos(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get<Department[]>('/api/departments').then(r => setDepartments(r.data)).catch(() => {});
    api.get<Responsibility[]>('/api/responsibilities').then(r => setResponsibilities(r.data)).catch(() => {});
    api.get<Teacher[]>('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
  }, []);

  function openCreate() {
    setDistributionType('all'); setDepartmentId(''); setResponsibilityId('');
    setSelectedTeacherIds([]); setTeacherSearch('');
    setSubject(''); setSaveErr('');
    setDraftMemoId(''); setChatSessionId(''); setChatMessages([]);
    setChatOpeningMessage(''); setChatInput(''); setChatError('');
    setIntakeSubmitted(false); setShowChat(false); setFinalBody('');
    api.get<{ title: string | null; source: 'management_role' | 'last_used' | null }>('/api/memos/issued-by-title-default')
      .then(r => { setIssuedByTitle(r.data.title ?? ''); setTitleSource(r.data.source); })
      .catch(() => { setIssuedByTitle(''); setTitleSource(null); });
    setCreateOpen(true);
  }

  function toggleTeacher(id: string) {
    setSelectedTeacherIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function distributionRef(): Record<string, unknown> | undefined {
    if (distributionType === 'department')     return { department_id: departmentId };
    if (distributionType === 'responsibility') return { responsibility_id: responsibilityId };
    if (distributionType === 'specific')       return { teacher_ids: selectedTeacherIds };
    return undefined;
  }

  function validDistribution() {
    if (distributionType === 'department')     return !!departmentId;
    if (distributionType === 'responsibility') return !!responsibilityId;
    if (distributionType === 'specific')       return selectedTeacherIds.length > 0;
    return true;
  }

  async function startDrafting() {
    setSaveErr('');
    if (!subject.trim())      { setSaveErr('Subject is required.'); return; }
    if (!validDistribution()) { setSaveErr('Select who this memo goes to.'); return; }

    setStartingChat(true);
    try {
      const draftRes = await api.post<Memo>('/api/memos', {
        distribution_type: distributionType,
        distribution_ref: distributionRef(),
        subject: subject.trim(),
        issued_by_title: issuedByTitle.trim() || undefined,
        status: 'draft',
      });
      const memo = draftRes.data;
      setDraftMemoId(memo.id);

      const chatRes = await api.post<{ session_id: string; opening_message: string }>('/api/letter-chat/start', {
        document_type: 'memo',
        metadata: { memo_id: memo.id, subject: subject.trim(), audience_label: memo.audience_label },
      });
      setChatSessionId(chatRes.data.session_id);
      setChatMessages([]);
      setChatOpeningMessage(chatRes.data.opening_message);
      setIntakeSubmitted(false);
      setShowChat(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setSaveErr(err.response?.data?.error ?? 'Failed to start drafting.');
    } finally { setStartingChat(false); }
  }

  async function sendChatMessage() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: 'user', content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true); setChatError('');
    try {
      const { data } = await api.post<{ role: string; content: string }>(`/api/letter-chat/${chatSessionId}/message`, { content: userMsg.content });
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setChatError(err.response?.data?.error ?? 'Failed to send message');
    } finally { setChatLoading(false); }
  }

  async function handleIntakeSubmit(assembled: string) {
    const userMsg: ChatMsg = { role: 'user', content: assembled, intakeCard: true };
    setChatMessages(prev => [...prev, userMsg]);
    setIntakeSubmitted(true);
    setChatLoading(true); setChatError('');
    try {
      const { data } = await api.post<{ role: string; content: string }>(`/api/letter-chat/${chatSessionId}/message`, { content: assembled });
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setChatError(err.response?.data?.error ?? 'Failed to get draft');
    } finally { setChatLoading(false); }
  }

  function handleIntakeSkip() {
    setChatMessages([{ role: 'assistant', content: chatOpeningMessage }]);
    setIntakeSubmitted(true);
  }

  function useDraft(text: string) {
    setFinalBody(text);
    setShowChat(false);
  }

  async function finalizeMemo() {
    setSaveErr('');
    let body = finalBody;
    if (showChat) {
      const lastAI = [...chatMessages].reverse().find(m => m.role === 'assistant');
      if (lastAI?.content?.trim()) body = lastAI.content;
    }
    if (!body.trim()) { setSaveErr('Draft a memo body before finalizing (use the AI assistant or click "Use this draft").'); return; }

    setFinalizing(true);
    try {
      await api.patch(`/api/memos/${draftMemoId}/finalize`, { body });
      setCreateOpen(false);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      const msg = err.response?.data?.error;
      // PDF generation can outlast the client's request timeout even though
      // the server finished issuing the memo — a retry then correctly (but
      // confusingly) hits this exact message. Since the desired end state
      // (issued) has already been reached, treat it as success, not an error.
      if (msg === 'Memo is not a draft') {
        setCreateOpen(false);
        load();
        return;
      }
      setSaveErr(msg ?? 'Failed to finalize memo.');
    } finally { setFinalizing(false); }
  }

  const filteredTeachers = teachers.filter(t =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase())
  );

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.forest, margin: 0 }}>Memos</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            Internal staff circulars — notices, reminders, and instructions to your team.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.forest, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >+ New Memo</button>
      </div>

      {loading ? (
        <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>
      ) : memos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 24px', color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          <p style={{ fontSize: 15, margin: 0 }}>No memos yet.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Click <strong>+ New Memo</strong> to issue the first one.</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Ref', 'Subject', 'Audience', 'Date', 'Status', 'Read', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted, background: C.bg }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memos.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < memos.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '10px 14px', color: C.mid, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.ref_number ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.dark, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</td>
                  <td style={{ padding: '10px 14px', color: C.mid2 }}>{m.audience_label}</td>
                  <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{m.issued_date ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{statusPill(m.status)}</td>
                  <td style={{ padding: '10px 14px', color: C.mid2, whiteSpace: 'nowrap' }}>{m.read_count}/{m.recipient_count} staff</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => openView(m)} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 5, border: `1px solid ${C.border}`, background: C.card, color: C.mid2, cursor: 'pointer' }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
          <div style={{ background: C.bg, borderRadius: 12, width: '100%', maxWidth: 720, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: C.forest, margin: 0 }}>New Memo</h2>
              <button onClick={() => setCreateOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: showChat || finalBody ? '1fr 1fr' : '1fr', gap: 20 }}>
              <div>
                <Field label="Distribution" required>
                  <select value={distributionType} onChange={e => { setDistributionType(e.target.value); setDepartmentId(''); setResponsibilityId(''); setSelectedTeacherIds([]); }} style={inputStyle} disabled={!!draftMemoId}>
                    {DISTRIBUTION_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </Field>

                {distributionType === 'department' && (
                  <Field label="Department" required>
                    <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inputStyle} disabled={!!draftMemoId}>
                      <option value="">Select a department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                )}

                {distributionType === 'responsibility' && (
                  <Field label="Responsibility Group" required>
                    <select value={responsibilityId} onChange={e => setResponsibilityId(e.target.value)} style={inputStyle} disabled={!!draftMemoId}>
                      <option value="">Select a responsibility</option>
                      {responsibilities.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </Field>
                )}

                {distributionType === 'specific' && (
                  <Field label={`Staff (${selectedTeacherIds.length} selected)`} required>
                    <input
                      value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)}
                      placeholder="Search staff…" style={{ ...inputStyle, marginBottom: 6 }}
                      disabled={!!draftMemoId}
                    />
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 6, background: C.card }}>
                      {filteredTeachers.map(t => (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, color: C.dark, cursor: draftMemoId ? 'default' : 'pointer', borderBottom: `1px solid ${C.border}` }}>
                          <input type="checkbox" checked={selectedTeacherIds.includes(t.id)} onChange={() => toggleTeacher(t.id)} disabled={!!draftMemoId} />
                          {t.name}{t.department ? <span style={{ color: C.muted, fontSize: 11 }}> · {t.department}</span> : null}
                        </label>
                      ))}
                      {filteredTeachers.length === 0 && <p style={{ padding: 10, fontSize: 12, color: C.muted, margin: 0 }}>No staff found.</p>}
                    </div>
                  </Field>
                )}

                <Field label="Subject" required>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Rescheduled Staff Meeting" style={inputStyle} disabled={!!draftMemoId} />
                </Field>

                <Field label="Issuing Title / Office">
                  <input
                    value={issuedByTitle} onChange={e => setIssuedByTitle(e.target.value)}
                    placeholder="e.g. Accountant, Domestic Bursar"
                    style={{ ...inputStyle, ...(titleSource === 'management_role' ? { background: '#EDE8DF', color: C.muted } : {}) }}
                    readOnly={titleSource === 'management_role'}
                  />
                  {titleSource === 'management_role' && (
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Auto-filled from your management role.</p>
                  )}
                </Field>

                {!draftMemoId && (
                  <button onClick={startDrafting} disabled={startingChat}
                    style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: C.forest, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: startingChat ? 0.6 : 1 }}>
                    {startingChat ? 'Starting…' : 'Start Drafting →'}
                  </button>
                )}

                {finalBody && !showChat && (
                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>Drafted body</label>
                    <textarea value={finalBody} onChange={e => setFinalBody(e.target.value)} rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => setShowChat(true)} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.mid2, fontSize: 13, cursor: 'pointer' }}>Back to Chat</button>
                      <button onClick={finalizeMemo} disabled={finalizing}
                        style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: C.forest, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: finalizing ? 0.6 : 1 }}>
                        {finalizing ? 'Issuing…' : 'Issue Memo'}
                      </button>
                    </div>
                  </div>
                )}

                {saveErr && <p style={{ color: C.danger, fontSize: 12, marginTop: 10 }}>{saveErr}</p>}
              </div>

              {showChat && (
                <ChatPanel
                  messages={chatMessages} input={chatInput} onInputChange={setChatInput}
                  onSend={sendChatMessage} loading={chatLoading} error={chatError}
                  onUseDraft={useDraft} onClose={() => setShowChat(false)}
                  intakeSubmitted={intakeSubmitted} onIntakeSubmit={handleIntakeSubmit} onSkipIntake={handleIntakeSkip}
                  sessionId={chatSessionId}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ── */}
      {viewMemo && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', overflowY: 'auto' }}>
          <div style={{ background: C.bg, borderRadius: 12, width: '100%', maxWidth: 560, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: C.forest, margin: 0 }}>{viewMemo.subject}</h2>
              <button onClick={() => setViewMemo(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: C.mid2, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <div><strong>Ref:</strong> {viewMemo.ref_number ?? '—'}</div>
              <div><strong>To:</strong> {viewMemo.audience_label}</div>
              <div><strong>From:</strong> {viewMemo.issued_by_name}{viewMemo.issued_by_title ? `, ${viewMemo.issued_by_title}` : ''}</div>
              <div><strong>Date:</strong> {viewMemo.issued_date ?? '—'}</div>
              <div>{statusPill(viewMemo.status)}</div>
              <div><strong>Read receipts:</strong> {viewMemo.read_count}/{viewMemo.recipient_count} staff have opened this memo</div>
            </div>
            {viewMemo.body && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, fontSize: 13, color: C.dark, whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 16 }}>
                {viewMemo.body}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {viewMemo.pdf_url && (
                <a href={viewMemo.pdf_url} target="_blank" rel="noreferrer"
                  style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.mid2, fontSize: 13, textDecoration: 'none' }}>
                  View PDF
                </a>
              )}
              <button onClick={() => setViewMemo(null)} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: C.forest, color: '#fff', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
