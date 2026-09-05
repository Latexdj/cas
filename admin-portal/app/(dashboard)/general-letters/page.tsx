'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
  warning: '#C8780A', warningBg: '#FFFBEB',
  success: '#2D7A4F', successBg: '#E8F4EE',
};

type Letter = {
  id: string; ref_number: string; classification: string;
  recipient_type: string; ext_recipient_name: string | null;
  ext_recipient_org: string | null; internal_recipient_id: string | null;
  internal_recipient_table: string | null; subject: string;
  is_sensitive: boolean; issued_date: string; status: string;
  requires_approval: boolean; approved_by_name: string | null;
  approved_at: string | null; issued_by_name: string; body?: string; created_at: string;
};

type Contact = { id: string; name: string; organization: string | null; address: string | null; };
type Teacher = { id: string; name: string; department: string | null; };
type Student = { id: string; student_code: string; name: string; class_name: string | null; };

type FormState = {
  classification: string; recipient_type: string;
  internal_recipient_id: string; internal_recipient_table: string;
  ext_recipient_name: string; ext_recipient_org: string; ext_recipient_address: string;
  subject: string; body: string; is_sensitive: boolean; issued_date: string;
};

const EMPTY_FORM: FormState = {
  classification: '', recipient_type: '',
  internal_recipient_id: '', internal_recipient_table: '',
  ext_recipient_name: '', ext_recipient_org: '', ext_recipient_address: '',
  subject: '', body: '', is_sensitive: false,
  issued_date: new Date().toISOString().slice(0, 10),
};

const CLASSIFICATIONS = [
  { value: 'parent_communication',    label: 'Parent Communication' },
  { value: 'external_official',       label: 'External / Official' },
  { value: 'internal_administrative', label: 'Internal Administrative' },
  { value: 'other',                   label: 'Other' },
];

const RECIPIENT_TYPES = [
  { value: 'student',  label: 'Student',              internal_table: 'students' },
  { value: 'teacher',  label: 'Teacher',              internal_table: 'teachers' },
  { value: 'parent',   label: 'Parent (free text)',   internal_table: '' },
  { value: 'external', label: 'External Organisation', internal_table: '' },
];

function classificationLabel(v: string) {
  return CLASSIFICATIONS.find(c => c.value === v)?.label ?? v;
}

function recipientLabel(v: string) {
  return RECIPIENT_TYPES.find(r => r.value === v)?.label ?? v;
}

function statusPill(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:            { label: 'Draft',            color: C.muted,   bg: '#EDE8DF' },
    pending_approval: { label: 'Pending Approval', color: C.warning, bg: C.warningBg },
    issued:           { label: 'Issued',           color: C.success, bg: C.successBg },
    archived:         { label: 'Archived',         color: C.muted,   bg: '#EDE8DF' },
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

function sensitivityBadge(is_sensitive: boolean) {
  if (!is_sensitive) return null;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '2px 8px', borderRadius: 4,
      color: C.danger, background: C.dangerBg,
      border: `1px solid ${C.danger}33`,
    }}>Sensitive</span>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export default function GeneralLettersPage() {
  const [letters, setLetters]           = useState<Letter[]>([]);
  const [contacts, setContacts]         = useState<Contact[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClass, setFilterClass]   = useState('');

  const [createOpen, setCreateOpen]   = useState(false);
  const [viewLetter, setViewLetter]   = useState<Letter | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);

  const [form, setForm]         = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState('');

  // Recipient search
  const [teachers, setTeachers]           = useState<Teacher[]>([]);
  const [students, setStudents]           = useState<Student[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [selectedRecipientName, setSelectedRecipientName] = useState('');
  const [showContactPicker, setShowContactPicker] = useState(false);

  // New contact form (inside create modal)
  const [newContactName, setNewContactName] = useState('');
  const [newContactOrg, setNewContactOrg]   = useState('');
  const [newContactAddr, setNewContactAddr] = useState('');
  const [savingContact, setSavingContact]   = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow body textarea
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [form.body]);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (filterClass)  params.classification = filterClass;
      const r = await api.get('/api/general-letters', { params });
      setLetters(r.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadContacts = async () => {
    try {
      const r = await api.get('/api/general-letters/contacts');
      setContacts(r.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, [filterStatus, filterClass]);
  useEffect(() => { loadContacts(); }, []);

  // Load teachers/students when relevant recipient type chosen
  useEffect(() => {
    if (form.recipient_type === 'teacher' && teachers.length === 0) {
      api.get('/api/teachers').then(r => setTeachers(r.data)).catch(() => {});
    }
    if (form.recipient_type === 'student' && students.length === 0) {
      api.get('/api/students').then(r => setStudents(r.data)).catch(() => {});
    }
  }, [form.recipient_type]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setRecipientSearch('');
    setSelectedRecipientName('');
    setShowContactPicker(false);
    setNewContactName(''); setNewContactOrg(''); setNewContactAddr('');
    setSaveErr('');
    setCreateOpen(true);
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function onClassificationChange(v: string) {
    setField('classification', v);
  }

  function onRecipientTypeChange(v: string) {
    setField('recipient_type', v);
    setField('internal_recipient_id', '');
    setField('internal_recipient_table', RECIPIENT_TYPES.find(r => r.value === v)?.internal_table ?? '');
    setField('ext_recipient_name', '');
    setField('ext_recipient_org', '');
    setField('ext_recipient_address', '');
    setRecipientSearch('');
    setSelectedRecipientName('');
    setShowContactPicker(false);
  }

  function selectInternalRecipient(id: string, name: string, table: string) {
    setField('internal_recipient_id', id);
    setField('internal_recipient_table', table);
    setSelectedRecipientName(name);
    setRecipientSearch('');
  }

  function pickContact(c: Contact) {
    setField('ext_recipient_name', c.name);
    setField('ext_recipient_org', c.organization ?? '');
    setField('ext_recipient_address', c.address ?? '');
    setShowContactPicker(false);
  }

  async function saveContact() {
    if (!newContactName.trim()) return;
    setSavingContact(true);
    try {
      const r = await api.post('/api/general-letters/contacts', {
        name: newContactName.trim(),
        organization: newContactOrg.trim() || undefined,
        address: newContactAddr.trim() || undefined,
      });
      setContacts(cs => [...cs, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      pickContact(r.data);
      setNewContactName(''); setNewContactOrg(''); setNewContactAddr('');
    } catch { /* ignore */ }
    setSavingContact(false);
  }

  async function submit() {
    setSaveErr('');
    if (!form.classification) { setSaveErr('Select a classification.'); return; }
    if (!form.recipient_type) { setSaveErr('Select a recipient type.'); return; }
    if (!form.subject.trim()) { setSaveErr('Subject is required.'); return; }
    if (!form.body.trim())    { setSaveErr('Body is required.'); return; }

    const isExternal = form.recipient_type === 'external' || form.recipient_type === 'parent';
    if (isExternal && !form.ext_recipient_name.trim()) {
      setSaveErr('Recipient name is required.'); return;
    }
    if (!isExternal && !form.internal_recipient_id) {
      setSaveErr('Select a recipient.'); return;
    }

    setSaving(true);
    try {
      await api.post('/api/general-letters', {
        classification:          form.classification,
        recipient_type:          form.recipient_type,
        internal_recipient_id:   form.internal_recipient_id || undefined,
        internal_recipient_table: form.internal_recipient_table || undefined,
        ext_recipient_name:      form.ext_recipient_name || undefined,
        ext_recipient_org:       form.ext_recipient_org || undefined,
        ext_recipient_address:   form.ext_recipient_address || undefined,
        subject:                 form.subject,
        body:                    form.body,
        is_sensitive:            form.is_sensitive,
        issued_date:             form.issued_date,
      });
      setCreateOpen(false);
      load();
    } catch (e: any) {
      setSaveErr(e.response?.data?.error ?? 'Failed to save letter.');
    }
    setSaving(false);
  }

  async function openView(letter: Letter) {
    try {
      const r = await api.get(`/api/general-letters/${letter.id}`);
      setViewLetter(r.data);
    } catch {
      setViewLetter(letter);
    }
  }

  async function approve(id: string) {
    try {
      const r = await api.patch(`/api/general-letters/${id}/approve`);
      setViewLetter(r.data);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error ?? 'Approval failed');
    }
  }

  // ── Filtered recipient lists ────────────────────────────────────────────────
  const filteredTeachers = teachers.filter(t =>
    !recipientSearch || t.name.toLowerCase().includes(recipientSearch.toLowerCase())
  ).slice(0, 8);

  const filteredStudents = students.filter(s =>
    !recipientSearch ||
    s.name.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    s.student_code?.toLowerCase().includes(recipientSearch.toLowerCase())
  ).slice(0, 8);

  const filteredContacts = contacts.filter(c =>
    !recipientSearch ||
    c.name.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    (c.organization ?? '').toLowerCase().includes(recipientSearch.toLowerCase())
  );

  // ── Compute approval trigger explanation for UI ─────────────────────────────
  const willRequireApproval =
    form.classification === 'external_official' || form.is_sensitive;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, fontFamily: 'inherit' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.forest, margin: 0 }}>Correspondence</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            General letters — parent communications, external bodies, internal memos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setContactsOpen(true)}
            style={{
              padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.card, color: C.mid2, fontSize: 13, cursor: 'pointer', fontWeight: 500,
            }}
          >Saved Contacts</button>
          <button
            onClick={openCreate}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: C.forest, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >+ New Letter</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="issued">Issued</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={filterClass}
          onChange={e => setFilterClass(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        >
          <option value="">All Classifications</option>
          {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>
      ) : letters.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '56px 24px', color: C.muted,
          border: `1px dashed ${C.border}`, borderRadius: 10,
        }}>
          <p style={{ fontSize: 15, margin: 0 }}>No letters yet.</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>Click <strong>+ New Letter</strong> to issue the first one.</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Ref', 'Classification', 'Recipient', 'Subject', 'Date', 'Status', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: C.muted,
                    background: C.bg,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {letters.map((l, i) => (
                <tr
                  key={l.id}
                  style={{ borderBottom: i < letters.length - 1 ? `1px solid ${C.border}` : 'none' }}
                >
                  <td style={{ padding: '10px 14px', color: C.mid, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {l.ref_number ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.mid2 }}>
                    {classificationLabel(l.classification)}
                  </td>
                  <td style={{ padding: '10px 14px', color: C.mid2, maxWidth: 160 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{l.ext_recipient_name ?? recipientLabel(l.recipient_type)}</span>
                      {l.ext_recipient_org && (
                        <span style={{ fontSize: 11, color: C.muted }}>{l.ext_recipient_org}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: C.dark, maxWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.subject}
                      </span>
                      {l.is_sensitive && sensitivityBadge(true)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap' }}>
                    {l.issued_date}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {statusPill(l.status)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => openView(l)}
                      style={{
                        padding: '4px 12px', fontSize: 12, borderRadius: 5,
                        border: `1px solid ${C.border}`, background: C.card,
                        color: C.mid2, cursor: 'pointer',
                      }}
                    >View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREATE MODAL ──────────────────────────────────────────────────────── */}
      {createOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '32px 16px', overflowY: 'auto',
        }}>
          <div style={{
            background: C.card, borderRadius: 12, width: '100%', maxWidth: 620,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.forest }}>New General Letter</h2>
              <button onClick={() => setCreateOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted }}>✕</button>
            </div>

            {/* Classification */}
            <Field label="Classification" required>
              <select
                value={form.classification}
                onChange={e => onClassificationChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select…</option>
                {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>

            {/* Sensitivity declaration */}
            <div style={{
              borderRadius: 8, padding: '14px 16px', marginBottom: 20,
              border: `1.5px solid ${form.is_sensitive ? C.danger : C.border}`,
              background: form.is_sensitive ? C.dangerBg : C.bg,
            }}>
              <label style={{ display: 'flex', gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={form.is_sensitive}
                  onChange={e => setField('is_sensitive', e.target.checked)}
                  style={{ marginTop: 2, accentColor: C.danger, width: 16, height: 16, flexShrink: 0 }}
                />
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: form.is_sensitive ? C.danger : C.dark }}>
                    This letter concerns a sensitive personal matter
                  </span>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                    Health, bereavement, family legal proceedings, safeguarding, or any matter
                    the subject would not expect to be shared widely. Sensitive letters must be
                    composed manually — AI drafting is not available for them.
                  </p>
                </div>
              </label>
            </div>

            {/* Approval notice */}
            {willRequireApproval && (
              <div style={{
                background: C.warningBg, border: `1px solid ${C.warning}44`,
                borderRadius: 7, padding: '10px 14px', marginBottom: 16,
                fontSize: 12, color: C.warning,
              }}>
                <strong>Approval required</strong> —{' '}
                {form.classification === 'external_official' && form.is_sensitive
                  ? 'external official letter and marked sensitive'
                  : form.classification === 'external_official'
                  ? 'external official letters require principal approval before issuing'
                  : 'sensitive letters require principal approval before issuing'}
                . Status will be set to <em>Pending Approval</em>.
              </div>
            )}

            {/* Recipient type */}
            <Field label="Recipient Type" required>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {RECIPIENT_TYPES.map(rt => (
                  <label
                    key={rt.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                      border: `1.5px solid ${form.recipient_type === rt.value ? C.mid : C.border}`,
                      background: form.recipient_type === rt.value ? '#E8F4EE' : C.card,
                    }}
                  >
                    <input
                      type="radio"
                      name="recipient_type"
                      value={rt.value}
                      checked={form.recipient_type === rt.value}
                      onChange={() => onRecipientTypeChange(rt.value)}
                      style={{ accentColor: C.forest }}
                    />
                    <span style={{ fontSize: 13, color: C.dark }}>{rt.label}</span>
                  </label>
                ))}
              </div>
            </Field>

            {/* Recipient picker — internal (student/teacher) */}
            {(form.recipient_type === 'student' || form.recipient_type === 'teacher') && (
              <Field label={form.recipient_type === 'student' ? 'Student' : 'Teacher'} required>
                {selectedRecipientName ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, background: '#E8F4EE',
                    border: `1px solid ${C.mid}44`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.mid }}>{selectedRecipientName}</span>
                    <button
                      onClick={() => { setSelectedRecipientName(''); setField('internal_recipient_id', ''); }}
                      style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}
                    >Change</button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder={`Search ${form.recipient_type === 'student' ? 'students' : 'teachers'}…`}
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                      style={inputStyle}
                    />
                    {(form.recipient_type === 'teacher' ? filteredTeachers : filteredStudents).length > 0 && (
                      <div style={{
                        border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 6px 6px',
                        background: C.card, maxHeight: 180, overflowY: 'auto',
                      }}>
                        {form.recipient_type === 'teacher'
                          ? filteredTeachers.map(t => (
                              <button key={t.id}
                                onClick={() => selectInternalRecipient(t.id, t.name, 'teachers')}
                                style={{
                                  width: '100%', textAlign: 'left', padding: '8px 12px',
                                  border: 'none', borderBottom: `1px solid ${C.border}`,
                                  background: 'none', cursor: 'pointer', fontSize: 13, color: C.dark,
                                }}>
                                <strong>{t.name}</strong>
                                {t.department && <span style={{ color: C.muted, marginLeft: 6 }}>{t.department}</span>}
                              </button>
                            ))
                          : filteredStudents.map(s => (
                              <button key={s.id}
                                onClick={() => selectInternalRecipient(s.id, `${s.name} (${s.student_code})`, 'students')}
                                style={{
                                  width: '100%', textAlign: 'left', padding: '8px 12px',
                                  border: 'none', borderBottom: `1px solid ${C.border}`,
                                  background: 'none', cursor: 'pointer', fontSize: 13, color: C.dark,
                                }}>
                                <strong>{s.name}</strong>
                                <span style={{ color: C.muted, marginLeft: 6 }}>
                                  {s.student_code}{s.class_name ? ` · ${s.class_name}` : ''}
                                </span>
                              </button>
                            ))
                        }
                      </div>
                    )}
                  </div>
                )}
              </Field>
            )}

            {/* Recipient picker — external/parent */}
            {(form.recipient_type === 'external' || form.recipient_type === 'parent') && (
              <>
                <Field label="Recipient Name" required>
                  <input
                    type="text"
                    value={form.ext_recipient_name}
                    onChange={e => setField('ext_recipient_name', e.target.value)}
                    placeholder="Full name"
                    style={inputStyle}
                  />
                </Field>

                {form.recipient_type === 'external' && (
                  <>
                    <Field label="Organisation / Body">
                      <input
                        type="text"
                        value={form.ext_recipient_org}
                        onChange={e => setField('ext_recipient_org', e.target.value)}
                        placeholder="e.g. Ghana Education Service, District Education Office"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Address">
                      <textarea
                        value={form.ext_recipient_address}
                        onChange={e => setField('ext_recipient_address', e.target.value)}
                        placeholder="Postal address (optional)"
                        rows={2}
                        style={{ ...inputStyle, resize: 'none' }}
                      />
                    </Field>

                    {/* Saved contacts picker */}
                    <div style={{ marginBottom: 16 }}>
                      <button
                        type="button"
                        onClick={() => setShowContactPicker(v => !v)}
                        style={{
                          fontSize: 12, color: C.mid, background: 'none', border: 'none',
                          cursor: 'pointer', padding: 0, fontWeight: 600, textDecoration: 'underline',
                        }}
                      >{showContactPicker ? 'Hide saved contacts' : 'Pick from saved contacts'}</button>

                      {showContactPicker && (
                        <div style={{
                          marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 8,
                          overflow: 'hidden', background: C.card,
                        }}>
                          {contacts.length === 0 ? (
                            <p style={{ padding: '12px 14px', fontSize: 13, color: C.muted, margin: 0 }}>
                              No saved contacts yet.
                            </p>
                          ) : (
                            contacts.map(c => (
                              <button
                                key={c.id}
                                onClick={() => pickContact(c)}
                                style={{
                                  width: '100%', textAlign: 'left', padding: '9px 14px',
                                  border: 'none', borderBottom: `1px solid ${C.border}`,
                                  background: 'none', cursor: 'pointer', fontSize: 13, color: C.dark,
                                }}
                              >
                                <strong>{c.name}</strong>
                                {c.organization && <span style={{ color: C.muted, marginLeft: 6 }}>{c.organization}</span>}
                              </button>
                            ))
                          )}
                          {/* Add new contact inline */}
                          <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add new saved contact</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <input type="text" placeholder="Name *" value={newContactName} onChange={e => setNewContactName(e.target.value)} style={{ ...inputStyle }} />
                              <input type="text" placeholder="Organisation" value={newContactOrg} onChange={e => setNewContactOrg(e.target.value)} style={{ ...inputStyle }} />
                              <textarea placeholder="Address" value={newContactAddr} onChange={e => setNewContactAddr(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'none' }} />
                              <button
                                onClick={saveContact}
                                disabled={savingContact || !newContactName.trim()}
                                style={{
                                  padding: '7px 14px', borderRadius: 6, border: 'none',
                                  background: C.mid, color: '#fff', fontSize: 12, fontWeight: 600,
                                  cursor: savingContact || !newContactName.trim() ? 'not-allowed' : 'pointer',
                                  opacity: savingContact || !newContactName.trim() ? 0.6 : 1, alignSelf: 'flex-start',
                                }}
                              >{savingContact ? 'Saving…' : 'Save & pick'}</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Subject */}
            <Field label="Subject" required>
              <input
                type="text"
                value={form.subject}
                onChange={e => setField('subject', e.target.value)}
                placeholder="Letter subject line"
                style={inputStyle}
              />
            </Field>

            {/* Body */}
            <Field label="Letter Body" required>
              {form.is_sensitive && (
                <div style={{
                  padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                  background: C.dangerBg, border: `1px solid ${C.danger}44`,
                  fontSize: 12, color: C.danger,
                }}>
                  Sensitive letter — compose manually. AI drafting is not available.
                </div>
              )}
              <textarea
                ref={bodyRef}
                value={form.body}
                onChange={e => setField('body', e.target.value)}
                placeholder="Write the letter body here (between salutation and sign-off)…"
                rows={6}
                style={{ ...inputStyle, resize: 'none', overflowY: 'auto', minHeight: 120 }}
              />
              <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>
                Write the body only — salutation, signature, and letterhead are added when printing.
              </p>
            </Field>

            {/* Issued date */}
            <Field label="Issued Date">
              <input
                type="date"
                value={form.issued_date}
                onChange={e => setField('issued_date', e.target.value)}
                style={{ ...inputStyle, width: 180 }}
              />
            </Field>

            {saveErr && (
              <div style={{
                padding: '10px 14px', borderRadius: 7, marginBottom: 16,
                background: C.dangerBg, color: C.danger, fontSize: 13,
                border: `1px solid ${C.danger}44`,
              }}>{saveErr}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setCreateOpen(false)}
                style={{
                  padding: '9px 18px', borderRadius: 7, border: `1px solid ${C.border}`,
                  background: C.card, color: C.mid2, fontSize: 13, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={submit}
                disabled={saving}
                style={{
                  padding: '9px 20px', borderRadius: 7, border: 'none',
                  background: C.forest, color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >{saving ? 'Saving…' : willRequireApproval ? 'Submit for Approval' : 'Issue Letter'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW MODAL ───────────────────────────────────────────────────────── */}
      {viewLetter && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '32px 16px', overflowY: 'auto',
        }}>
          <div style={{
            background: C.card, borderRadius: 12, width: '100%', maxWidth: 600,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                  {viewLetter.ref_number ?? 'No ref'}
                </p>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.forest }}>{viewLetter.subject}</h2>
              </div>
              <button onClick={() => setViewLetter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted }}>✕</button>
            </div>

            {/* Meta grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
              padding: '14px 16px', background: C.bg, borderRadius: 8, marginBottom: 18, fontSize: 13,
            }}>
              {[
                ['Classification', classificationLabel(viewLetter.classification)],
                ['Status', null],
                ['Recipient type', recipientLabel(viewLetter.recipient_type)],
                ['Issued date', viewLetter.issued_date],
                ['Issued by', viewLetter.issued_by_name],
                ['Issued', viewLetter.created_at ? new Date(viewLetter.created_at).toLocaleDateString() : '—'],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</p>
                  <p style={{ margin: '2px 0 0', color: C.dark }}>
                    {k === 'Status' ? statusPill(viewLetter.status) : v ?? '—'}
                  </p>
                </div>
              ))}
            </div>

            {/* Recipient */}
            {(viewLetter.ext_recipient_name || viewLetter.ext_recipient_org) && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: C.bg, borderRadius: 8 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recipient</p>
                {viewLetter.ext_recipient_name && <p style={{ margin: 0, fontWeight: 600, color: C.dark }}>{viewLetter.ext_recipient_name}</p>}
                {viewLetter.ext_recipient_org && <p style={{ margin: '2px 0 0', color: C.muted, fontSize: 13 }}>{viewLetter.ext_recipient_org}</p>}
              </div>
            )}

            {viewLetter.is_sensitive && (
              <div style={{
                padding: '8px 14px', marginBottom: 16, borderRadius: 7,
                background: C.dangerBg, border: `1px solid ${C.danger}44`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {sensitivityBadge(true)}
                <span style={{ fontSize: 12, color: C.danger }}>
                  This letter is marked as sensitive. Handle with discretion.
                </span>
              </div>
            )}

            {/* Approval notice */}
            {viewLetter.status === 'pending_approval' && (
              <div style={{
                padding: '10px 14px', marginBottom: 16, borderRadius: 7,
                background: C.warningBg, border: `1px solid ${C.warning}44`, fontSize: 13, color: C.warning,
              }}>
                Awaiting principal approval before this letter is issued.
              </div>
            )}
            {viewLetter.approved_by_name && (
              <div style={{
                padding: '10px 14px', marginBottom: 16, borderRadius: 7,
                background: C.successBg, border: `1px solid ${C.success}44`, fontSize: 13, color: C.success,
              }}>
                Approved by <strong>{viewLetter.approved_by_name}</strong>
                {viewLetter.approved_at ? ` on ${new Date(viewLetter.approved_at).toLocaleDateString()}` : ''}
              </div>
            )}

            {/* Body */}
            {viewLetter.body && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Letter Body</p>
                <div style={{
                  padding: '14px 16px', background: C.bg, borderRadius: 8,
                  fontSize: 14, lineHeight: 1.7, color: C.dark,
                  whiteSpace: 'pre-wrap', border: `1px solid ${C.border}`,
                }}>
                  {viewLetter.body}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setViewLetter(null)}
                style={{
                  padding: '8px 18px', borderRadius: 7, border: `1px solid ${C.border}`,
                  background: C.card, color: C.mid2, fontSize: 13, cursor: 'pointer',
                }}
              >Close</button>
              {viewLetter.status === 'pending_approval' && (
                <button
                  onClick={() => approve(viewLetter.id)}
                  style={{
                    padding: '8px 18px', borderRadius: 7, border: 'none',
                    background: C.forest, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >Approve & Issue</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTACTS MODAL ────────────────────────────────────────────────────── */}
      {contactsOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '32px 16px', overflowY: 'auto',
        }}>
          <div style={{
            background: C.card, borderRadius: 12, width: '100%', maxWidth: 480,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)', padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.forest }}>Saved External Contacts</h2>
              <button onClick={() => setContactsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted }}>✕</button>
            </div>

            {contacts.length === 0 ? (
              <p style={{ color: C.muted, fontSize: 14 }}>
                No saved contacts yet. Add contacts while creating an external letter.
              </p>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                {contacts.map((c, i) => (
                  <div
                    key={c.id}
                    style={{
                      padding: '12px 14px', fontSize: 13, color: C.dark,
                      borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 600 }}>{c.name}</p>
                    {c.organization && <p style={{ margin: '2px 0 0', color: C.muted }}>{c.organization}</p>}
                    {c.address && <p style={{ margin: '2px 0 0', color: C.muted, fontSize: 12 }}>{c.address}</p>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setContactsOpen(false)}
                style={{
                  padding: '8px 18px', borderRadius: 7, border: `1px solid ${C.border}`,
                  background: C.card, color: C.mid2, fontSize: 13, cursor: 'pointer',
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
