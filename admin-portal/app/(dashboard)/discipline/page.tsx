'use client';
import { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { PrintLetterModal } from '@/components/PrintLetterModal';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Teacher { id: string; name: string; department?: string; status: string; }
interface Student { id: string; name: string; student_code: string; class_name: string; }
interface AcademicYear { id: string; name: string; is_current: boolean; }

interface TeacherQuery {
  id: string; category: string; category_other?: string; subject: string; body: string;
  issued_date: string; response_deadline?: string; status: string;
  teacher_response_text?: string; teacher_response_file_url?: string; teacher_response_file_name?: string;
  response_submitted_at?: string; resolution_notes?: string;
  resolved_by_name?: string; resolved_at?: string; created_at: string; issued_by_name: string;
  teacher_id: string; teacher_name: string; department?: string; academic_year_name?: string;
  ref_number?: string; issued_by_signature_url?: string; pdf_url?: string;
}

interface QueryStats { total: string; open: string; issued: string; responded: string; resolved: string; escalated: string; overdue: string; }

interface DisciplinaryLetter {
  id: string; letter_type: string; offense_category: string; offense_other?: string;
  subject: string; body: string; issued_date: string; status: string;
  acknowledged_at?: string; acknowledged_by?: string; resolution_notes?: string;
  resolved_at?: string; resolved_by_name?: string; issued_by_name: string; created_at: string; semester?: number;
  student_id: string; student_name: string; student_code: string; class_name: string; academic_year_name?: string;
  ref_number?: string; issued_by_signature_url?: string;
  requires_approval?: boolean; approved_by?: string; approved_by_name?: string; approved_at?: string;
  school_name?: string; pdf_url?: string;
}

interface LetterStats { total: string; active: string; pending_approval: string; resolved: string; warning: string; final_warning: string; suspension: string; dismissal: string; }

// ─── Palette helpers ──────────────────────────────────────────────────────────

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  warning: '#C8780A', warningBg: '#FFFBEB',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

function queryStatusBadge(status: string, deadline?: string): { label: string; color: string; bg: string } {
  const isOverdue = deadline && new Date(deadline) < new Date() && !['responded','resolved','escalated'].includes(status);
  if (isOverdue) return { label: 'Overdue', color: C.danger, bg: C.dangerBg };
  const map: Record<string, { label: string; color: string; bg: string }> = {
    issued:       { label: 'Issued',       color: C.warning,  bg: C.warningBg },
    acknowledged: { label: 'Acknowledged', color: C.mid,      bg: '#E8F4EE' },
    responded:    { label: 'Responded',    color: C.forest,   bg: '#D1EAD9' },
    resolved:     { label: 'Resolved',     color: C.success,  bg: '#DCFCE7' },
    escalated:    { label: 'Escalated',    color: C.danger,   bg: C.dangerBg },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function letterTypeBadge(type: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    warning:       { label: 'Warning',       color: C.warning,  bg: C.warningBg },
    final_warning: { label: 'Final Warning', color: C.danger,   bg: C.dangerBg },
    suspension:    { label: 'Suspension',    color: '#7F1D1D',  bg: '#FECACA' },
    dismissal:     { label: 'Dismissal',     color: '#450A0A',  bg: '#FCA5A5' },
    other:         { label: 'Other',         color: C.mid2,     bg: C.bg },
  };
  return map[type] ?? { label: type, color: C.muted, bg: C.bg };
}

function letterStatusBadge(status: string): { label: string; color: string; bg: string } {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending_approval: { label: 'Pending Approval', color: '#6D28D9', bg: '#EDE9FE' },
    issued:           { label: 'Issued',            color: C.warning,  bg: C.warningBg },
    acknowledged:     { label: 'Acknowledged',      color: C.mid,      bg: '#E8F4EE' },
    resolved:         { label: 'Resolved',           color: C.success,  bg: '#DCFCE7' },
  };
  return map[status] ?? { label: status, color: C.muted, bg: C.bg };
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', minWidth: 110 }}>
      <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: color ?? C.dark, margin: 0 }}>{value}</p>
    </div>
  );
}

const QUERY_CATS = [
  { value: 'absenteeism',     label: 'Absenteeism' },
  { value: 'misconduct',      label: 'Misconduct' },
  { value: 'insubordination', label: 'Insubordination' },
  { value: 'negligence',      label: 'Negligence of Duty' },
  { value: 'poor_performance',label: 'Poor Performance' },
  { value: 'other',           label: 'Other' },
];

const OFFENSE_CATS = [
  { value: 'lateness_absenteeism', label: 'Lateness / Absenteeism' },
  { value: 'fighting_assault',     label: 'Fighting / Assault' },
  { value: 'exam_malpractice',     label: 'Exam Malpractice' },
  { value: 'substance_use',        label: 'Substance Use' },
  { value: 'insubordination',      label: 'Insubordination' },
  { value: 'theft_damage',         label: 'Theft / Property Damage' },
  { value: 'bullying_harassment',  label: 'Bullying / Harassment' },
  { value: 'indecent_behavior',    label: 'Indecent Behavior' },
  { value: 'vandalism',            label: 'Vandalism' },
  { value: 'other',                label: 'Other' },
];

const LETTER_TYPES = [
  { value: 'warning',       label: 'Warning' },
  { value: 'final_warning', label: 'Final Warning' },
  { value: 'suspension',    label: 'Suspension' },
  { value: 'dismissal',     label: 'Dismissal' },
  { value: 'other',         label: 'Other' },
];

function catLabel(val: string, opts: { value: string; label: string }[]) {
  return opts.find(o => o.value === val)?.label ?? val;
}

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

type GroundingClause = { section_ref: string; document_title: string };

function ChatPanel({ messages, input, onInputChange, onSend, loading, error, onUseDraft, onClose, groundingClauses }: {
  messages: ChatMsg[]; input: string; onInputChange: (v: string) => void;
  onSend: () => void; loading: boolean; error: string;
  onUseDraft: (text: string) => void; onClose: () => void;
  groundingClauses?: GroundingClause[];
}) {
  const endRef = { current: null as HTMLDivElement | null };
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 340 }}>
      {/* Header */}
      <div style={{ background: C.mid, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>AI Draft Assistant</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕ close</button>
      </div>
      {/* Grounding disclosure — shown only when policy clauses are active */}
      {groundingClauses && groundingClauses.length > 0 && (
        <div style={{ background: '#E8F4EE', borderBottom: `1px solid #B7DFC9`, padding: '5px 12px' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.forest, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Policy grounding active
          </p>
          {groundingClauses.map((c, i) => (
            <p key={i} style={{ fontSize: 10, color: C.mid2, margin: '1px 0' }}>
              {c.section_ref} — <span style={{ fontStyle: 'italic' }}>{c.document_title}</span>
            </p>
          ))}
        </div>
      )}
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: C.bg }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
            <div style={{
              maxWidth: '85%', padding: '8px 11px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
              background: m.role === 'user' ? C.mid : '#fff',
              color: m.role === 'user' ? '#fff' : C.dark,
              border: m.role === 'assistant' ? `1px solid ${C.border}` : 'none',
              whiteSpace: 'pre-wrap',
            }}>{m.content}</div>
            {m.role === 'assistant' && i === messages.length - 1 && (
              <button onClick={() => onUseDraft(m.content)}
                style={{ fontSize: 11, fontWeight: 700, color: C.forest, background: '#D1EAD9', border: `1px solid #B7DFC9`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
                Use this draft
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: C.muted }}>
            Drafting…
          </div>
        )}
        <div ref={r => { endRef.current = r; }} />
      </div>
      {/* Error */}
      {error && <div style={{ padding: '4px 12px', background: C.dangerBg, fontSize: 11, color: C.danger }}>{error}</div>}
      {/* Input */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${C.border}`, background: '#fff' }}>
        <input
          value={input} onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Add context or ask for changes…"
          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', color: C.dark, background: C.bg }}
        />
        <button onClick={onSend} disabled={loading || !input.trim()}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (loading || !input.trim()) ? 0.5 : 1 }}>
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Issue Query Modal ────────────────────────────────────────────────────────

function IssueQueryModal({ teachers, academicYears, onClose, onCreated }: {
  teachers: Teacher[]; academicYears: AcademicYear[];
  onClose: () => void; onCreated: (q: TeacherQuery) => void;
}) {
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [category, setCategory] = useState('');
  const [categoryOther, setCategoryOther] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState('');
  const [ayId, setAyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatSessionId, setChatSessionId] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [groundingClauses, setGroundingClauses] = useState<GroundingClause[]>([]);

  const filteredTeachers = useMemo(() =>
    teachers.filter(t => t.name.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      (t.department ?? '').toLowerCase().includes(teacherSearch.toLowerCase())),
    [teachers, teacherSearch]
  );

  async function startQueryChat() {
    if (!selectedTeacher || !category || !subject.trim()) {
      setError('Select a teacher, category, and subject before drafting with AI');
      return;
    }
    setStartingChat(true); setChatError(''); setError('');
    try {
      const { data } = await api.post<{ session_id: string; opening_message: string; grounding_clauses?: GroundingClause[] }>('/api/letter-chat/start', {
        document_type: 'teacher_query',
        metadata: { teacher_name: selectedTeacher.name, department: selectedTeacher.department, category, subject },
      });
      setChatSessionId(data.session_id);
      setChatMessages([{ role: 'assistant', content: data.opening_message }]);
      setGroundingClauses(data.grounding_clauses ?? []);
      setShowChat(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setChatError(err.response?.data?.error ?? 'Failed to start AI session');
    } finally { setStartingChat(false); }
  }

  async function sendQueryChatMessage() {
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

  async function submit() {
    if (!selectedTeacher) { setError('Select a teacher'); return; }
    if (!category) { setError('Select a category'); return; }
    if (!subject.trim()) { setError('Subject is required'); return; }
    if (!body.trim()) { setError('Body text is required'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post<TeacherQuery>('/api/discipline/queries', {
        teacher_id: selectedTeacher.id, category, category_other: categoryOther || undefined,
        subject, body, issued_date: issuedDate, response_deadline: deadline || undefined,
        academic_year_id: ayId || undefined,
      });
      onCreated(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to issue query');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(11,61,46,0.45)' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '92vh', overflow: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 17, color: C.dark }}>Issue Query to Teacher</p>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Teacher picker */}
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Teacher *</label>
            {selectedTeacher ? (
              <div style={{ border: `1px solid ${C.mid}`, borderRadius: 10, padding: '9px 12px', background: '#E8F4EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.forest }}>{selectedTeacher.name}{selectedTeacher.department ? ` · ${selectedTeacher.department}` : ''}</span>
                <button onClick={() => { setSelectedTeacher(null); setTeacherSearch(''); }} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <>
                <input
                  value={teacherSearch}
                  onChange={e => { setTeacherSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search teacher name or department…"
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', background: '#fff', color: C.dark, boxSizing: 'border-box' }}
                />
                {showDropdown && filteredTeachers.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 200, overflow: 'auto', marginTop: 2 }}>
                    {filteredTeachers.slice(0, 40).map(t => (
                      <button key={t.id} onClick={() => { setSelectedTeacher(t); setTeacherSearch(''); setShowDropdown(false); }}
                        style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${C.bg}`, fontSize: 13, color: C.dark }}>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                        {t.department && <span style={{ color: C.muted, marginLeft: 6 }}>{t.department}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Category */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Category *</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
              <option value="">Select category…</option>
              {QUERY_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {category === 'other' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Specify Reason *</label>
              <input value={categoryOther} onChange={e => setCategoryOther(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
            </div>
          )}

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Unexplained absence on Monday 12 Aug"
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
          </div>

          {/* Body */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2 }}>Query Details *</label>
              {!showChat && (
                <button onClick={startQueryChat} disabled={startingChat}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.mid}`, background: '#E8F4EE', color: C.mid, fontWeight: 700, fontSize: 11, cursor: 'pointer', opacity: startingChat ? 0.6 : 1 }}>
                  <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 1C4.13 1 1 3.7 1 7c0 1.4.54 2.68 1.44 3.7L1 15l4.5-1.36A7.1 7.1 0 008 14c3.87 0 7-2.7 7-6s-3.13-6-7-6z"/></svg>
                  {startingChat ? 'Starting…' : 'Draft with AI'}
                </button>
              )}
            </div>
            {showChat ? (
              <ChatPanel
                messages={chatMessages} input={chatInput}
                onInputChange={setChatInput} onSend={sendQueryChatMessage}
                loading={chatLoading} error={chatError}
                onUseDraft={text => { setBody(text); setShowChat(false); }}
                onClose={() => setShowChat(false)}
                groundingClauses={groundingClauses}
              />
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
                placeholder="Describe the issue in detail…"
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            )}
          </div>

          {/* Dates row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Issued Date</label>
              <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Response Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
            </div>
          </div>

          {/* Academic Year */}
          {academicYears.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Academic Year</label>
              <select value={ayId} onChange={e => setAyId(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
                <option value="">None</option>
                {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}{ay.is_current ? ' (Current)' : ''}</option>)}
              </select>
            </div>
          )}

          {error && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, padding: '8px 12px', borderRadius: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={submit} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontSize: 13 }}>
              {saving ? 'Issuing…' : 'Issue Query'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Issue Letter Modal ───────────────────────────────────────────────────────

const APPROVAL_REQUIRED_TYPES = new Set(['suspension', 'dismissal', 'final_warning']);

function IssueLetterModal({ students, academicYears, schoolInfo, onClose, onCreated }: {
  students: Student[]; academicYears: AcademicYear[];
  schoolInfo?: Record<string, string> | null;
  onClose: () => void; onCreated: (l: DisciplinaryLetter) => void;
}) {
  const currentYear = academicYears.find(ay => ay.is_current);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [letterType, setLetterType] = useState('');
  const [offenseCat, setOffenseCat] = useState('');
  const [offenseOther, setOffenseOther] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [ayId, setAyId] = useState(currentYear?.id ?? '');
  const [semester, setSemester] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatSessionId, setChatSessionId] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [groundingClauses, setGroundingClauses] = useState<GroundingClause[]>([]);
  const needsApproval = APPROVAL_REQUIRED_TYPES.has(letterType);

  const filteredStudents = useMemo(() =>
    students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.student_code.toLowerCase().includes(search.toLowerCase()) ||
      s.class_name.toLowerCase().includes(search.toLowerCase())),
    [students, search]
  );

  const SENSITIVE_OFFENSE_CATS = new Set(['exam_malpractice','substance_use','fighting_assault','bullying_harassment','indecent_behavior','other']);
  const SENSITIVE_LETTER_TYPES = new Set(['suspension','dismissal']);

  async function startLetterChat() {
    if (!selectedStudent || !letterType || !offenseCat || !subject.trim()) {
      setError('Select a student, letter type, offense category, and subject before drafting with AI');
      return;
    }
    if (SENSITIVE_OFFENSE_CATS.has(offenseCat) || SENSITIVE_LETTER_TYPES.has(letterType)) {
      setError('AI drafting is not available for this offense category or letter type. Please write the letter manually.');
      return;
    }
    setStartingChat(true); setChatError(''); setError('');
    try {
      const { data } = await api.post<{ session_id: string; opening_message: string; blocked?: boolean; grounding_clauses?: GroundingClause[] }>('/api/letter-chat/start', {
        document_type: 'student_letter',
        metadata: {
          student_name: selectedStudent.name, class_name: selectedStudent.class_name,
          letter_type: letterType, offense_category: offenseCat, subject,
        },
      });
      if (data.blocked) {
        setError('AI drafting is not available for this offense category or letter type.');
        return;
      }
      setChatSessionId(data.session_id);
      setChatMessages([{ role: 'assistant', content: data.opening_message }]);
      setGroundingClauses(data.grounding_clauses ?? []);
      setShowChat(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; blocked?: boolean } } };
      if (err.response?.data?.blocked) {
        setError('AI drafting is not available for this offense category or letter type.');
      } else {
        setChatError(err.response?.data?.error ?? 'Failed to start AI session');
      }
    } finally { setStartingChat(false); }
  }

  async function sendLetterChatMessage() {
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

  async function submit() {
    if (!selectedStudent) { setError('Select a student'); return; }
    if (!letterType) { setError('Select a letter type'); return; }
    if (!offenseCat) { setError('Select an offense category'); return; }
    if (!subject.trim()) { setError('Subject is required'); return; }
    if (!body.trim()) { setError('Body text is required'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post<DisciplinaryLetter>('/api/discipline/letters', {
        student_id: selectedStudent.id, letter_type: letterType,
        offense_category: offenseCat, offense_other: offenseOther || undefined,
        subject, body, issued_date: issuedDate,
        academic_year_id: ayId || undefined,
        semester: semester ? Number(semester) : undefined,
      });
      onCreated(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Failed to issue letter');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(11,61,46,0.45)' }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '92vh', overflow: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontWeight: 800, fontSize: 17, color: C.dark }}>Issue Disciplinary Letter</p>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Structural fields — pre-filled, read-only */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>School</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.dark, margin: 0 }}>{schoolInfo?.name ?? schoolInfo?.school_name ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>Ref Number</p>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, fontStyle: 'italic' }}>Auto-assigned on save</p>
            </div>
          </div>

          {needsApproval && (
            <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: '9px 14px', fontSize: 12, color: '#6D28D9', fontWeight: 600 }}>
              This letter type requires headmaster approval before it is issued to the student.
            </div>
          )}

          {/* Student picker */}
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Student *</label>
            {selectedStudent ? (
              <div style={{ border: `1px solid ${C.mid}`, borderRadius: 10, padding: '9px 12px', background: '#E8F4EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.forest }}>{selectedStudent.name} · {selectedStudent.class_name} ({selectedStudent.student_code})</span>
                <button onClick={() => { setSelectedStudent(null); setSearch(''); }} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            ) : (
              <>
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search student name, code or class…"
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', background: '#fff', color: C.dark, boxSizing: 'border-box' }}
                />
                {showDropdown && filteredStudents.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 200, overflow: 'auto', marginTop: 2 }}>
                    {filteredStudents.slice(0, 40).map(s => (
                      <button key={s.id} onClick={() => { setSelectedStudent(s); setSearch(''); setShowDropdown(false); }}
                        style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${C.bg}`, fontSize: 13, color: C.dark }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span style={{ color: C.muted, marginLeft: 6 }}>{s.class_name} · {s.student_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Letter Type */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Letter Type *</label>
            <select value={letterType} onChange={e => setLetterType(e.target.value)}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
              <option value="">Select type…</option>
              {LETTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Offense Category */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Offense Category *</label>
            <select value={offenseCat} onChange={e => setOffenseCat(e.target.value)}
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
              <option value="">Select offense…</option>
              {OFFENSE_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {offenseCat === 'other' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Specify Offense *</label>
              <input value={offenseOther} onChange={e => setOffenseOther(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
            </div>
          )}

          {/* Subject */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Warning Letter – Fighting Incident"
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
          </div>

          {/* Body */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2 }}>Letter Body *</label>
              {!showChat && (
                <button onClick={startLetterChat} disabled={startingChat}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.mid}`, background: '#E8F4EE', color: C.mid, fontWeight: 700, fontSize: 11, cursor: 'pointer', opacity: startingChat ? 0.6 : 1 }}>
                  <svg viewBox="0 0 16 16" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 1C4.13 1 1 3.7 1 7c0 1.4.54 2.68 1.44 3.7L1 15l4.5-1.36A7.1 7.1 0 008 14c3.87 0 7-2.7 7-6s-3.13-6-7-6z"/></svg>
                  {startingChat ? 'Starting…' : 'Draft with AI'}
                </button>
              )}
            </div>
            {showChat ? (
              <ChatPanel
                messages={chatMessages} input={chatInput}
                onInputChange={setChatInput} onSend={sendLetterChatMessage}
                loading={chatLoading} error={chatError}
                onUseDraft={text => { setBody(text); setShowChat(false); }}
                onClose={() => setShowChat(false)}
                groundingClauses={groundingClauses}
              />
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
                placeholder="Write the full letter content here…"
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Issued Date</label>
              <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }} />
            </div>
            {academicYears.length > 0 && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Academic Year</label>
                <select value={ayId} onChange={e => setAyId(e.target.value)}
                  style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
                  <option value="">None</option>
                  {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}{ay.is_current ? ' (Current)' : ''}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.mid2, display: 'block', marginBottom: 5 }}>Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff', color: C.dark, outline: 'none' }}>
                <option value="">None</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, padding: '8px 12px', borderRadius: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={submit} disabled={saving} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, fontSize: 13 }}>
              {saving ? 'Issuing…' : 'Issue Letter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Query Detail Panel ───────────────────────────────────────────────────────

function QueryDetailPanel({ query, onClose, onUpdate, onPrint }: {
  query: TeacherQuery; onClose: () => void; onUpdate: (q: TeacherQuery) => void; onPrint: () => void;
}) {
  const [resolveNotes, setResolveNotes] = useState('');
  const [escalateNotes, setEscalateNotes] = useState('');
  const [actioning, setActioning] = useState<'resolve' | 'escalate' | null>(null);
  const [error, setError] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(query.pdf_url ?? '');
  const isClosed = ['resolved', 'escalated'].includes(query.status);

  async function generatePdf() {
    setGeneratingPdf(true);
    try {
      const { data } = await api.post<{ pdf_url: string }>(`/api/discipline/queries/${query.id}/pdf`);
      setPdfUrl(data.pdf_url);
      onUpdate({ ...query, pdf_url: data.pdf_url });
    } catch {
      // non-fatal; user can retry
    } finally { setGeneratingPdf(false); }
  }
  const { label: sLabel, color: sColor, bg: sBg } = queryStatusBadge(query.status, query.response_deadline);

  const STEPS = [
    { key: 'issued', label: 'Issued' },
    { key: 'acknowledged', label: 'Acknowledged' },
    { key: 'responded', label: 'Responded' },
    { key: 'resolved', label: 'Resolved' },
  ];
  const currentIdx = STEPS.findIndex(s => s.key === query.status);

  async function doAction(action: 'resolve' | 'escalate') {
    setActioning(action); setError('');
    const notes = action === 'resolve' ? resolveNotes : escalateNotes;
    try {
      const { data } = await api.patch<TeacherQuery>(`/api/discipline/queries/${query.id}/${action}`, { resolution_notes: notes });
      onUpdate(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Action failed');
    } finally { setActioning(null); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 15, color: C.dark, margin: 0 }}>{query.subject}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            Issued to <strong style={{ color: C.dark }}>{query.teacher_name}</strong>
            {query.department ? ` (${query.department})` : ''} by {query.issued_by_name} on {fmt(query.issued_date)}
            {query.response_deadline ? ` · Deadline: ${fmt(query.response_deadline)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Badge label={sLabel} color={sColor} bg={sBg} />
          <button onClick={onPrint} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: `1.5px solid ${C.mid}`, background: 'white', color: C.mid, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 18, overflowX: 'auto' }}>
        {STEPS.map((step, idx) => {
          const done = idx <= currentIdx || (query.status === 'escalated' && idx < 3);
          const active = idx === currentIdx;
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? C.mid : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', border: active ? `2px solid ${C.forest}` : 'none' }}>
                  {done && <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke="#fff" strokeWidth={2}><path d="M2 6l3 3 5-5"/></svg>}
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: done ? C.mid : C.muted, marginTop: 4, whiteSpace: 'nowrap' }}>{step.label}</span>
              </div>
              {idx < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: idx < currentIdx ? C.mid : C.border, minWidth: 30, marginBottom: 16 }} />}
            </div>
          );
        })}
        {query.status === 'escalated' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke="#fff" strokeWidth={2}><path d="M6 2v5M6 9.5v.5"/></svg>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.danger, marginTop: 4 }}>Escalated</span>
          </div>
        )}
      </div>

      {/* Query body */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Query</p>
        <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{query.body}</p>
      </div>

      {/* PDF section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.mid}`, background: '#E8F4EE', color: C.mid, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 4a1 1 0 011-1h5l4 4v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/><path d="M9 3v4h4"/></svg>
            Download PDF
          </a>
        ) : null}
        <button onClick={generatePdf} disabled={generatingPdf}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: generatingPdf ? 0.6 : 1 }}>
          <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 1v8M5 6l3 3 3-3M2 12v2h12v-2"/></svg>
          {generatingPdf ? 'Generating…' : pdfUrl ? 'Regenerate PDF' : 'Generate PDF'}
        </button>
      </div>

      {/* Teacher response */}
      {query.teacher_response_text && (
        <div style={{ background: '#E8F4EE', border: `1px solid #B7DFC9`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Teacher Response</p>
          <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0 }}>{query.teacher_response_text}</p>
          {query.teacher_response_file_url && (
            <a href={query.teacher_response_file_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, color: C.mid, fontWeight: 600, textDecoration: 'none' }}>
              <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M3 4a1 1 0 011-1h5l4 4v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/><path d="M9 3v4h4"/>
              </svg>
              {query.teacher_response_file_name ?? 'Attachment'}
            </a>
          )}
          {query.response_submitted_at && (
            <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Submitted: {fmt(query.response_submitted_at)}</p>
          )}
        </div>
      )}

      {/* Resolution notes */}
      {query.resolution_notes && (
        <div style={{ background: isClosed && query.status === 'escalated' ? C.dangerBg : '#E8F4EE', border: `1px solid ${isClosed && query.status === 'escalated' ? '#FECACA' : '#B7DFC9'}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: query.status === 'escalated' ? C.danger : C.mid, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {query.status === 'escalated' ? 'Escalation Notes' : 'Resolution Notes'}
          </p>
          <p style={{ fontSize: 13, color: C.dark, margin: 0 }}>{query.resolution_notes}</p>
          {query.resolved_by_name && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>By {query.resolved_by_name} · {fmt(query.resolved_at)}</p>}
        </div>
      )}

      {/* Actions */}
      {!isClosed && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.success, marginBottom: 8 }}>Mark Resolved</p>
            <textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} rows={3}
              placeholder="Resolution notes (optional)…"
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: C.dark, background: C.bg, boxSizing: 'border-box' }} />
            <button onClick={() => doAction('resolve')} disabled={actioning !== null}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: C.success, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
              {actioning === 'resolve' ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.danger, marginBottom: 8 }}>Escalate</p>
            <textarea value={escalateNotes} onChange={e => setEscalateNotes(e.target.value)} rows={3}
              placeholder="Escalation reason (optional)…"
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: C.dark, background: C.bg, boxSizing: 'border-box' }} />
            <button onClick={() => doAction('escalate')} disabled={actioning !== null}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: C.danger, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
              {actioning === 'escalate' ? 'Escalating…' : 'Escalate'}
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ─── Letter Detail Panel ──────────────────────────────────────────────────────

function LetterDetailPanel({ letter, onClose, onUpdate, onPrint }: {
  letter: DisciplinaryLetter; onClose: () => void; onUpdate: (l: DisciplinaryLetter) => void; onPrint: () => void;
}) {
  const [ackBy, setAckBy] = useState('admin');
  const [resolveNotes, setResolveNotes] = useState('');
  const [actioning, setActioning] = useState<'ack' | 'resolve' | 'approve' | null>(null);
  const [error, setError] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(letter.pdf_url ?? '');
  const typeBadge = letterTypeBadge(letter.letter_type);
  const statusBadge = letterStatusBadge(letter.status);
  const isClosed = letter.status === 'resolved';
  const isPendingApproval = letter.status === 'pending_approval';

  async function generatePdf() {
    setGeneratingPdf(true);
    try {
      const { data } = await api.post<{ pdf_url: string }>(`/api/discipline/letters/${letter.id}/pdf`);
      setPdfUrl(data.pdf_url);
      onUpdate({ ...letter, pdf_url: data.pdf_url });
    } catch {
      // non-fatal; user can retry
    } finally { setGeneratingPdf(false); }
  }

  async function approve() {
    setActioning('approve'); setError('');
    try {
      const { data } = await api.patch<DisciplinaryLetter>(`/api/discipline/letters/${letter.id}/approve`, {});
      onUpdate(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Action failed');
    } finally { setActioning(null); }
  }

  async function acknowledge() {
    setActioning('ack'); setError('');
    try {
      const { data } = await api.patch<DisciplinaryLetter>(`/api/discipline/letters/${letter.id}/acknowledge`, { acknowledged_by: ackBy });
      onUpdate(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Action failed');
    } finally { setActioning(null); }
  }

  async function resolve() {
    setActioning('resolve'); setError('');
    try {
      const { data } = await api.patch<DisciplinaryLetter>(`/api/discipline/letters/${letter.id}/resolve`, { resolution_notes: resolveNotes });
      onUpdate(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error ?? 'Action failed');
    } finally { setActioning(null); }
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Badge label={typeBadge.label} color={typeBadge.color} bg={typeBadge.bg} />
            <Badge label={statusBadge.label} color={statusBadge.color} bg={statusBadge.bg} />
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, color: C.dark, margin: 0 }}>{letter.subject}</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            Issued to <strong style={{ color: C.dark }}>{letter.student_name}</strong> ({letter.class_name}) by {letter.issued_by_name} on {fmt(letter.issued_date)}
            {letter.academic_year_name ? ` · ${letter.academic_year_name}` : ''}
            {letter.semester ? ` · Sem ${letter.semester}` : ''}
          </p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Offense: <strong style={{ color: C.dark }}>{catLabel(letter.offense_category, OFFENSE_CATS)}</strong>
            {letter.offense_other ? ` — ${letter.offense_other}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={onPrint} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: `1.5px solid ${C.mid}`, background: 'white', color: C.mid, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      </div>

      {/* Formal letter body */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 16, fontFamily: 'Georgia, serif' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 10, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Letter Content</p>
        <p style={{ fontSize: 13, color: C.dark, lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{letter.body}</p>
      </div>

      {/* PDF section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.mid}`, background: '#E8F4EE', color: C.mid, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 4a1 1 0 011-1h5l4 4v6a1 1 0 01-1 1H4a1 1 0 01-1-1V4z"/><path d="M9 3v4h4"/></svg>
            {isPendingApproval ? 'Download Draft PDF (Watermarked)' : 'Download PDF'}
          </a>
        ) : null}
        <button onClick={generatePdf} disabled={generatingPdf}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.mid2, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: generatingPdf ? 0.6 : 1 }}>
          <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 1v8M5 6l3 3 3-3M2 12v2h12v-2"/></svg>
          {generatingPdf ? 'Generating…' : pdfUrl ? 'Regenerate PDF' : 'Generate PDF'}
        </button>
        {isPendingApproval && !pdfUrl && (
          <span style={{ fontSize: 11, color: C.muted }}>Generate the draft PDF for the principal to review before approval.</span>
        )}
      </div>

      {/* Approved info */}
      {letter.approved_at && (
        <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12, color: '#6D28D9' }}>
          Approved by <strong>{letter.approved_by_name ?? 'Management'}</strong> on {fmt(letter.approved_at)}
        </div>
      )}

      {/* Acknowledged info */}
      {letter.acknowledged_at && (
        <div style={{ background: '#E8F4EE', border: `1px solid #B7DFC9`, borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12, color: C.mid }}>
          Acknowledged by <strong>{letter.acknowledged_by}</strong> on {fmt(letter.acknowledged_at)}
        </div>
      )}

      {/* Resolution */}
      {letter.resolution_notes && (
        <div style={{ background: '#E8F4EE', border: `1px solid #B7DFC9`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 4 }}>Resolution Notes</p>
          <p style={{ fontSize: 13, color: C.dark, margin: 0 }}>{letter.resolution_notes}</p>
          {letter.resolved_by_name && <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>By {letter.resolved_by_name} · {fmt(letter.resolved_at)}</p>}
        </div>
      )}

      {/* Actions */}
      {isPendingApproval && (
        <div style={{ background: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: 12, padding: 14, marginTop: 4 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#6D28D9', marginBottom: 6 }}>Awaiting Headmaster Approval</p>
          <p style={{ fontSize: 12, color: '#7C3AED', marginBottom: 10 }}>
            This letter requires approval before it is issued to the student.
          </p>
          <button onClick={approve} disabled={actioning !== null}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#6D28D9', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
            {actioning === 'approve' ? 'Approving...' : 'Approve and Issue'}
          </button>
        </div>
      )}
      {!isClosed && !isPendingApproval && (
        <div style={{ display: 'grid', gridTemplateColumns: letter.status === 'issued' ? '1fr 1fr' : '1fr', gap: 12, marginTop: 4 }}>
          {letter.status === 'issued' && (
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: C.mid, marginBottom: 8 }}>Acknowledge Receipt</p>
              <select value={ackBy} onChange={e => setAckBy(e.target.value)}
                style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, background: C.bg, color: C.dark, outline: 'none', marginBottom: 8 }}>
                <option value="admin">Admin</option>
                <option value="student">Student</option>
                <option value="parent">Parent / Guardian</option>
                <option value="form_teacher">Form Teacher</option>
              </select>
              <button onClick={acknowledge} disabled={actioning !== null}
                style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
                {actioning === 'ack' ? 'Acknowledging...' : 'Mark Acknowledged'}
              </button>
            </div>
          )}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.success, marginBottom: 8 }}>Mark Resolved</p>
            <textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} rows={3}
              placeholder="Resolution notes (optional)..."
              style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', outline: 'none', color: C.dark, background: C.bg, boxSizing: 'border-box' }} />
            <button onClick={resolve} disabled={actioning !== null}
              style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: C.success, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}>
              {actioning === 'resolve' ? 'Resolving...' : 'Resolve'}
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: C.danger, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisciplinePage() {
  const [tab, setTab] = useState<'queries' | 'letters'>('queries');
  const [loading, setLoading] = useState(true);

  // Shared reference data
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  // Queries state
  const [queries, setQueries] = useState<TeacherQuery[]>([]);
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<TeacherQuery | null>(null);
  const [qTeacherFilter, setQTeacherFilter] = useState('');
  const [qCatFilter, setQCatFilter] = useState('');
  const [qStatusFilter, setQStatusFilter] = useState('');
  const [showIssueQuery, setShowIssueQuery] = useState(false);

  // Letters state
  const [letters, setLetters] = useState<DisciplinaryLetter[]>([]);
  const [letterStats, setLetterStats] = useState<LetterStats | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<DisciplinaryLetter | null>(null);
  const [lClassFilter, setLClassFilter] = useState('');
  const [lNameFilter, setLNameFilter] = useState('');
  const [lTypeFilter, setLTypeFilter] = useState('');
  const [lStatusFilter, setLStatusFilter] = useState('');
  const [showIssueLetter, setShowIssueLetter] = useState(false);

  // Print state
  const [schoolInfo,         setSchoolInfo]         = useState<Record<string, string> | null>(null);
  const [printTarget,        setPrintTarget]        = useState<TeacherQuery | DisciplinaryLetter | null>(null);
  const [printRecipientType, setPrintRecipientType] = useState<'student' | 'teacher'>('student');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [qRes, qsRes, lRes, lsRes, tRes, sRes, ayRes, schRes] = await Promise.allSettled([
        api.get<TeacherQuery[]>('/api/discipline/queries'),
        api.get<QueryStats>('/api/discipline/queries/stats'),
        api.get<DisciplinaryLetter[]>('/api/discipline/letters'),
        api.get<LetterStats>('/api/discipline/letters/stats'),
        api.get<Teacher[]>('/api/teachers'),
        api.get<Student[]>('/api/students?limit=1000'),
        api.get<AcademicYear[]>('/api/academic-years'),
        api.get('/api/admin/settings'),
      ]);
      if (qRes.status === 'fulfilled')   setQueries(qRes.value.data);
      if (qsRes.status === 'fulfilled')  setQueryStats(qsRes.value.data);
      if (lRes.status === 'fulfilled')   setLetters(lRes.value.data);
      if (lsRes.status === 'fulfilled')  setLetterStats(lsRes.value.data);
      if (tRes.status === 'fulfilled')   setTeachers(Array.isArray(tRes.value.data) ? tRes.value.data : []);
      if (sRes.status === 'fulfilled') {
        const d = sRes.value.data;
        setStudents(Array.isArray(d) ? d : (d as { data?: Student[] }).data ?? []);
      }
      if (ayRes.status === 'fulfilled')  setAcademicYears(ayRes.value.data);
      if (schRes.status === 'fulfilled') setSchoolInfo(schRes.value.data);
      setLoading(false);
    }
    load();
  }, []);

  // Filtered queries
  const filteredQueries = useMemo(() => {
    return queries.filter(q => {
      if (qTeacherFilter && !q.teacher_name.toLowerCase().includes(qTeacherFilter.toLowerCase())) return false;
      if (qCatFilter && q.category !== qCatFilter) return false;
      if (qStatusFilter && q.status !== qStatusFilter) return false;
      return true;
    });
  }, [queries, qTeacherFilter, qCatFilter, qStatusFilter]);

  // Filtered letters
  const filteredLetters = useMemo(() => {
    return letters.filter(l => {
      if (lClassFilter && !l.class_name.toLowerCase().includes(lClassFilter.toLowerCase())) return false;
      if (lNameFilter && !l.student_name.toLowerCase().includes(lNameFilter.toLowerCase())) return false;
      if (lTypeFilter && l.letter_type !== lTypeFilter) return false;
      if (lStatusFilter && l.status !== lStatusFilter) return false;
      return true;
    });
  }, [letters, lClassFilter, lNameFilter, lTypeFilter, lStatusFilter]);

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13,
    background: '#fff', color: C.dark, outline: 'none', height: 34,
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.dark, margin: 0 }}>Discipline &amp; Conduct</h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Manage teacher queries and student disciplinary letters.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        {(['queries', 'letters'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedQuery(null); setSelectedLetter(null); }}
            style={{ padding: '7px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: tab === t ? C.mid : 'transparent',
              color: tab === t ? '#fff' : C.muted }}>
            {t === 'queries' ? 'Teacher Queries' : 'Student Letters'}
          </button>
        ))}
      </div>

      {/* ── Teacher Queries Tab ── */}
      {tab === 'queries' && (
        <div>
          {/* Stats */}
          {queryStats && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              <StatCard label="Total" value={queryStats.total} />
              <StatCard label="Open" value={queryStats.open} color={C.warning} />
              <StatCard label="Overdue" value={queryStats.overdue} color={C.danger} />
              <StatCard label="Responded" value={queryStats.responded} color={C.mid} />
              <StatCard label="Resolved" value={queryStats.resolved} color={C.success} />
              <StatCard label="Escalated" value={queryStats.escalated} color={C.danger} />
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input value={qTeacherFilter} onChange={e => setQTeacherFilter(e.target.value)}
              placeholder="Filter by teacher…" style={{ ...inputStyle, minWidth: 180 }} />
            <select value={qCatFilter} onChange={e => setQCatFilter(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
              <option value="">All categories</option>
              {QUERY_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={qStatusFilter} onChange={e => setQStatusFilter(e.target.value)} style={{ ...selectStyle, minWidth: 140 }}>
              <option value="">All statuses</option>
              {['issued','acknowledged','responded','resolved','escalated'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowIssueQuery(true)}
              style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
              Issue Query
            </button>
          </div>

          {/* Table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {filteredQueries.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <svg viewBox="0 0 48 48" width={40} height={40} fill="none" stroke={C.border} strokeWidth={1.5} style={{ margin: '0 auto 12px' }}>
                  <path d="M8 44V4h20l12 12v28H8z"/><path d="M28 4v12h12"/><path d="M16 20h16M16 28h10"/>
                </svg>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>No queries found</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Issue a query to a teacher to get started.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                      {['Teacher', 'Category', 'Subject', 'Issued', 'Deadline', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: C.muted, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQueries.map((q, i) => {
                      const { label, color, bg } = queryStatusBadge(q.status, q.response_deadline);
                      const isSelected = selectedQuery?.id === q.id;
                      return (
                        <>
                          <tr key={q.id} onClick={() => setSelectedQuery(isSelected ? null : q)}
                            style={{ borderBottom: `1px solid ${C.bg}`, cursor: 'pointer', background: isSelected ? '#EBF5EE' : (i % 2 === 0 ? '#fff' : C.card) }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600, color: C.dark }}>{q.teacher_name}</td>
                            <td style={{ padding: '11px 14px', color: C.mid2 }}>{catLabel(q.category, QUERY_CATS)}</td>
                            <td style={{ padding: '11px 14px', color: C.dark, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.subject}</td>
                            <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{fmt(q.issued_date)}</td>
                            <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{q.response_deadline ? fmt(q.response_deadline) : '—'}</td>
                            <td style={{ padding: '11px 14px' }}><Badge label={label} color={color} bg={bg} /></td>
                          </tr>
                          {isSelected && (
                            <tr key={`${q.id}-detail`}>
                              <td colSpan={6} style={{ padding: '0 14px 14px' }}>
                                <QueryDetailPanel
                                  query={selectedQuery}
                                  onClose={() => setSelectedQuery(null)}
                                  onUpdate={updated => {
                                    setQueries(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
                                    setSelectedQuery({ ...selectedQuery, ...updated });
                                  }}
                                  onPrint={() => { setPrintTarget(selectedQuery); setPrintRecipientType('teacher'); }}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Student Letters Tab ── */}
      {tab === 'letters' && (
        <div>
          {/* Stats */}
          {letterStats && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              <StatCard label="Total" value={letterStats.total} />
              <StatCard label="Pending Approval" value={letterStats.pending_approval} color="#6D28D9" />
              <StatCard label="Active" value={letterStats.active} color={C.warning} />
              <StatCard label="Resolved" value={letterStats.resolved} color={C.success} />
              <StatCard label="Warning" value={letterStats.warning} color={C.warning} />
              <StatCard label="Final Warning" value={letterStats.final_warning} color={C.danger} />
              <StatCard label="Suspension" value={letterStats.suspension} color="#7F1D1D" />
              <StatCard label="Dismissal" value={letterStats.dismissal} color="#450A0A" />
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input value={lClassFilter} onChange={e => setLClassFilter(e.target.value)}
              placeholder="Filter by class…" style={{ ...inputStyle, minWidth: 140 }} />
            <input value={lNameFilter} onChange={e => setLNameFilter(e.target.value)}
              placeholder="Filter by student name…" style={{ ...inputStyle, minWidth: 180 }} />
            <select value={lTypeFilter} onChange={e => setLTypeFilter(e.target.value)} style={{ ...selectStyle, minWidth: 150 }}>
              <option value="">All types</option>
              {LETTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={lStatusFilter} onChange={e => setLStatusFilter(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="pending_approval">Pending Approval</option>
              {['issued','acknowledged','resolved'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowIssueLetter(true)}
              style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 16 16" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
              Issue Letter
            </button>
          </div>

          {/* Table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {filteredLetters.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <svg viewBox="0 0 48 48" width={40} height={40} fill="none" stroke={C.border} strokeWidth={1.5} style={{ margin: '0 auto 12px' }}>
                  <path d="M6 12h36M6 12v30a2 2 0 002 2h28a2 2 0 002-2V12M10 12V8a2 2 0 012-2h16a2 2 0 012 2v4"/>
                </svg>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>No disciplinary letters</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>No letters match the current filters. Issue one to get started.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                      {['Student', 'Class', 'Type', 'Subject', 'Issued', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: C.muted, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLetters.map((l, i) => {
                      const tBadge = letterTypeBadge(l.letter_type);
                      const sBadge = letterStatusBadge(l.status);
                      const isSelected = selectedLetter?.id === l.id;
                      return (
                        <>
                          <tr key={l.id} onClick={() => setSelectedLetter(isSelected ? null : l)}
                            style={{ borderBottom: `1px solid ${C.bg}`, cursor: 'pointer', background: isSelected ? '#EBF5EE' : (i % 2 === 0 ? '#fff' : C.card) }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600, color: C.dark }}>{l.student_name}</td>
                            <td style={{ padding: '11px 14px', color: C.mid2 }}>{l.class_name}</td>
                            <td style={{ padding: '11px 14px' }}><Badge label={tBadge.label} color={tBadge.color} bg={tBadge.bg} /></td>
                            <td style={{ padding: '11px 14px', color: C.dark, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subject}</td>
                            <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap' }}>{fmt(l.issued_date)}</td>
                            <td style={{ padding: '11px 14px' }}><Badge label={sBadge.label} color={sBadge.color} bg={sBadge.bg} /></td>
                          </tr>
                          {isSelected && (
                            <tr key={`${l.id}-detail`}>
                              <td colSpan={6} style={{ padding: '0 14px 14px' }}>
                                <LetterDetailPanel
                                  letter={selectedLetter}
                                  onClose={() => setSelectedLetter(null)}
                                  onUpdate={updated => {
                                    setLetters(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
                                    setSelectedLetter({ ...selectedLetter, ...updated });
                                  }}
                                  onPrint={() => { setPrintTarget(selectedLetter); setPrintRecipientType('student'); }}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showIssueQuery && (
        <IssueQueryModal
          teachers={teachers}
          academicYears={academicYears}
          onClose={() => setShowIssueQuery(false)}
          onCreated={q => { setQueries(prev => [q, ...prev]); setShowIssueQuery(false); }}
        />
      )}

      {showIssueLetter && (
        <IssueLetterModal
          students={students}
          academicYears={academicYears}
          schoolInfo={schoolInfo}
          onClose={() => setShowIssueLetter(false)}
          onCreated={l => { setLetters(prev => [l, ...prev]); setShowIssueLetter(false); }}
        />
      )}

      {printTarget && schoolInfo && (
        <PrintLetterModal
          open={true}
          onClose={() => setPrintTarget(null)}
          letter={printTarget as TeacherQuery & DisciplinaryLetter}
          school={schoolInfo}
          recipientType={printRecipientType}
        />
      )}
    </div>
  );
}
