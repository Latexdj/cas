'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface PolicyDocument {
  id: string;
  school_id: string | null;
  title: string;
  document_type: 'ges_teacher_code' | 'ges_student_code' | 'school_rules';
  source_url: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

interface PolicyClause {
  id: string;
  document_id: string;
  section_ref: string;
  clause_text: string;
  applicable_to: string[];
  categories: string[];
  display_order: number;
}

const C = {
  forest: '#0B3D2E', bg: '#F5F0E8', card: '#FDFAF5',
  border: '#E2D9CC', dark: '#2C2218', mid: '#4A3F32', muted: '#8C7E6E',
  gold: '#C8973A', goldBg: '#FDF8EE',
  blue: '#1a56db', blueBg: '#EFF6FF',
  danger: '#B83232', dangerBg: '#FEF2F2',
  ok: '#0B3D2E', okBg: '#DCFCE7',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  ges_teacher_code: 'GES Teacher Code',
  ges_student_code: 'GES Student Code',
  school_rules: 'School Rules',
};

const TEACHER_CATS = [
  { value: 'absenteeism',     label: 'Absenteeism' },
  { value: 'misconduct',      label: 'Misconduct' },
  { value: 'insubordination', label: 'Insubordination' },
  { value: 'negligence',      label: 'Negligence' },
  { value: 'poor_performance',label: 'Poor Performance' },
];
const STUDENT_CATS = [
  { value: 'lateness_absenteeism', label: 'Lateness / Absenteeism' },
  { value: 'insubordination',      label: 'Insubordination' },
  { value: 'theft_damage',         label: 'Theft / Property Damage' },
  { value: 'vandalism',            label: 'Vandalism' },
];
const CAT_LABELS: Record<string, string> = Object.fromEntries(
  [...TEACHER_CATS, ...STUDENT_CATS].map(c => [c.value, c.label])
);
const APPLICABLE_OPTS = [
  { value: 'teacher_query',  label: 'Teacher Query Letters' },
  { value: 'student_letter', label: 'Student Disciplinary Letters' },
];

function availableCats(applicableTo: string[]) {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  if (applicableTo.includes('teacher_query'))  TEACHER_CATS.forEach(c => { if (!seen.has(c.value)) { out.push(c); seen.add(c.value); } });
  if (applicableTo.includes('student_letter')) STUDENT_CATS.forEach(c => { if (!seen.has(c.value)) { out.push(c); seen.add(c.value); } });
  return out;
}

type DocForm = { title: string; source_url: string; is_active: boolean };
type ClauseForm = { section_ref: string; clause_text: string; applicable_to: string[]; categories: string[]; display_order: string };

const blankClause = (): ClauseForm => ({ section_ref: '', clause_text: '', applicable_to: [], categories: [], display_order: '0' });

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: bg, color, borderRadius: 5, padding: '2px 7px', display: 'inline-block' }}>
      {label}
    </span>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.dark }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: C.forest, width: 15, height: 15 }} />
      {label}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</p>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: C.dark,
        border: `1px solid ${C.border}`, background: '#fff', boxSizing: 'border-box', outline: 'none',
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: C.dark, lineHeight: 1.6,
        border: `1px solid ${C.border}`, background: '#fff', boxSizing: 'border-box', resize: 'vertical', outline: 'none',
      }}
    />
  );
}

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(11,61,46,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: wide ? 820 : 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontWeight: 800, fontSize: 15, color: C.dark, margin: 0 }}>{title}</p>
          <button onClick={onClose} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, disabled, variant = 'primary', small }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; small?: boolean;
}) {
  const bg = variant === 'primary' ? C.forest : variant === 'danger' ? C.danger : 'transparent';
  const color = variant === 'ghost' ? C.muted : '#fff';
  const border = variant === 'ghost' ? `1px solid ${C.border}` : 'none';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '6px 14px' : '10px 20px', borderRadius: 8, border, background: bg, color,
        fontWeight: 700, fontSize: small ? 12 : 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function PolicyDocumentsPage() {
  const [docs, setDocs]             = useState<PolicyDocument[]>([]);
  const [sel, setSel]               = useState<PolicyDocument | null>(null);
  const [clauses, setClauses]       = useState<PolicyClause[]>([]);
  const [loading, setLoading]       = useState(true);
  const [clausesLoading, setClausesLoading] = useState(false);

  // Create doc
  const [showCreate, setShowCreate] = useState(false);
  const [cForm, setCForm]           = useState<DocForm>({ title: '', source_url: '', is_active: true });
  const [cErr, setCErr]             = useState('');
  const [creating, setCreating]     = useState(false);

  // Edit doc
  const [editDoc, setEditDoc]       = useState<PolicyDocument | null>(null);
  const [eForm, setEForm]           = useState<DocForm>({ title: '', source_url: '', is_active: true });
  const [eErr, setEErr]             = useState('');
  const [saving, setSaving]         = useState(false);

  // Delete doc
  const [delDocId, setDelDocId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);

  // Clause modal
  const [clauseModal, setClauseModal] = useState<{ mode: 'create' | 'edit'; clause?: PolicyClause } | null>(null);
  const [clForm, setClForm]           = useState<ClauseForm>(blankClause());
  const [clErr, setClErr]             = useState('');
  const [savingCl, setSavingCl]       = useState(false);

  // Delete clause
  const [delClId, setDelClId]       = useState<string | null>(null);
  const [deletingCl, setDeletingCl] = useState(false);

  // PDF import
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfText, setPdfText]           = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfErr, setPdfErr]             = useState('');
  const pdfTextareaRef                  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<PolicyDocument[]>('/api/policy-documents')
      .then(r => setDocs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sel) { setClauses([]); return; }
    setClausesLoading(true);
    api.get<PolicyClause[]>(`/api/policy-documents/${sel.id}/clauses`)
      .then(r => setClauses(r.data))
      .catch(console.error)
      .finally(() => setClausesLoading(false));
  }, [sel]);

  const isGES = (d: PolicyDocument) => d.school_id === null;
  const canEdit = (d: PolicyDocument) => !isGES(d);

  async function createDoc() {
    if (!cForm.title.trim()) { setCErr('Title is required'); return; }
    setCreating(true); setCErr('');
    try {
      const { data } = await api.post<PolicyDocument>('/api/policy-documents', { ...cForm, document_type: 'school_rules' });
      setDocs(prev => [...prev, data]);
      setShowCreate(false);
      setCForm({ title: '', source_url: '', is_active: true });
      setSel(data);
    } catch (e: unknown) {
      setCErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create');
    } finally { setCreating(false); }
  }

  function openEdit(d: PolicyDocument) {
    setEditDoc(d);
    setEForm({ title: d.title, source_url: d.source_url ?? '', is_active: d.is_active });
    setEErr('');
  }

  async function updateDoc() {
    if (!editDoc || !eForm.title.trim()) { setEErr('Title is required'); return; }
    setSaving(true); setEErr('');
    try {
      const { data } = await api.patch<PolicyDocument>(`/api/policy-documents/${editDoc.id}`, eForm);
      setDocs(prev => prev.map(d => d.id === data.id ? data : d));
      if (sel?.id === data.id) setSel(data);
      setEditDoc(null);
    } catch (e: unknown) {
      setEErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function deleteDoc() {
    if (!delDocId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/policy-documents/${delDocId}`);
      setDocs(prev => prev.filter(d => d.id !== delDocId));
      if (sel?.id === delDocId) setSel(null);
      setDelDocId(null);
    } catch { /* ignore */ } finally { setDeleting(false); }
  }

  function openClauseCreate() {
    setClForm(blankClause()); setClErr('');
    setClauseModal({ mode: 'create' });
  }

  function openClauseEdit(c: PolicyClause) {
    setClForm({ section_ref: c.section_ref, clause_text: c.clause_text, applicable_to: [...c.applicable_to], categories: [...c.categories], display_order: String(c.display_order) });
    setClErr('');
    setClauseModal({ mode: 'edit', clause: c });
  }

  function toggleApp(val: string) {
    setClForm(prev => {
      const next = prev.applicable_to.includes(val) ? prev.applicable_to.filter(a => a !== val) : [...prev.applicable_to, val];
      const allowed = new Set(availableCats(next).map(c => c.value));
      return { ...prev, applicable_to: next, categories: prev.categories.filter(c => allowed.has(c)) };
    });
  }

  function toggleCat(val: string) {
    setClForm(prev => ({ ...prev, categories: prev.categories.includes(val) ? prev.categories.filter(c => c !== val) : [...prev.categories, val] }));
  }

  async function saveClause() {
    if (!sel) return;
    if (!clForm.section_ref.trim()) { setClErr('Section reference is required'); return; }
    if (!clForm.clause_text.trim()) { setClErr('Clause text is required'); return; }
    if (!clForm.applicable_to.length) { setClErr('Select at least one applicable context'); return; }
    setSavingCl(true); setClErr('');
    try {
      const payload = { ...clForm, display_order: parseInt(clForm.display_order) || 0 };
      if (clauseModal?.mode === 'create') {
        const { data } = await api.post<PolicyClause>(`/api/policy-documents/${sel.id}/clauses`, payload);
        setClauses(prev => [...prev, data].sort((a, b) => a.display_order - b.display_order));
      } else if (clauseModal?.clause) {
        const { data } = await api.patch<PolicyClause>(`/api/policy-documents/${sel.id}/clauses/${clauseModal.clause.id}`, payload);
        setClauses(prev => prev.map(c => c.id === data.id ? data : c));
      }
      setClauseModal(null);
    } catch (e: unknown) {
      setClErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to save clause');
    } finally { setSavingCl(false); }
  }

  async function deleteClause() {
    if (!sel || !delClId) return;
    setDeletingCl(true);
    try {
      await api.delete(`/api/policy-documents/${sel.id}/clauses/${delClId}`);
      setClauses(prev => prev.filter(c => c.id !== delClId));
      setDelClId(null);
    } catch { /* ignore */ } finally { setDeletingCl(false); }
  }

  async function handlePdfFile(file: File) {
    if (!sel) return;
    setPdfUploading(true); setPdfErr(''); setPdfText('');
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const { data } = await api.post<{ text: string; pages: number }>(
        `/api/policy-documents/${sel.id}/extract-pdf`, fd
      );
      setPdfText(data.text);
    } catch (e: unknown) {
      setPdfErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'PDF extraction failed');
    } finally { setPdfUploading(false); }
  }

  function prefillClauseFromPdf() {
    const ta = pdfTextareaRef.current;
    const selected = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd).trim() : '';
    const text = selected || (ta?.value.trim() ?? '');
    setShowPdfModal(false); setPdfText('');
    setClForm({ ...blankClause(), clause_text: text });
    setClErr(''); setClauseModal({ mode: 'create' });
  }

  const gesDocs    = docs.filter(isGES);
  const schoolDocs = docs.filter(d => !isGES(d));
  const cats       = availableCats(clForm.applicable_to);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.dark, margin: '0 0 4px' }}>Policy Documents</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            Add your school rules and the clauses used to ground AI-assisted letter drafting.
          </p>
        </div>
        <Btn label="+ New Document" onClick={() => { setShowCreate(true); setCErr(''); setCForm({ title: '', source_url: '', is_active: true }); }} />
      </div>

      {/* GES notice */}
      {gesDocs.length > 0 && (
        <div style={{ background: C.goldBg, border: `1px solid #E8D5A3`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: C.mid }}>
          <strong style={{ color: C.gold }}>GES-level documents</strong> (shown below) are managed by the CAS platform. You can view their clauses but cannot edit them.
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* ── Left: Document list ── */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 68, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, opacity: 0.5 }} />)}
            </div>
          ) : docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
              <p style={{ fontWeight: 700, color: C.dark, marginBottom: 4 }}>No documents yet</p>
              <p style={{ fontSize: 12, color: C.muted }}>Create your first school rules document.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {gesDocs.length > 0 && (
                <p style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px' }}>GES Level</p>
              )}
              {gesDocs.map(d => (
                <DocRow key={d.id} doc={d} selected={sel?.id === d.id} onSelect={() => setSel(d)} onEdit={openEdit} onDelete={setDelDocId} canEdit={canEdit(d)} />
              ))}
              {schoolDocs.length > 0 && (
                <p style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px', marginTop: 6 }}>School Documents</p>
              )}
              {schoolDocs.map(d => (
                <DocRow key={d.id} doc={d} selected={sel?.id === d.id} onSelect={() => setSel(d)} onEdit={openEdit} onDelete={setDelDocId} canEdit={canEdit(d)} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Clause list ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, minHeight: 300 }}>
          {!sel ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <p style={{ fontWeight: 700, color: C.dark, marginBottom: 4 }}>Select a document</p>
              <p style={{ fontSize: 12, color: C.muted }}>Choose a document on the left to view and manage its clauses.</p>
            </div>
          ) : (
            <>
              {/* Clause panel header */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: C.dark, margin: 0 }}>{sel.title}</p>
                    <Pill label={DOC_TYPE_LABELS[sel.document_type] ?? sel.document_type} color={isGES(sel) ? C.gold : C.blue} bg={isGES(sel) ? C.goldBg : C.blueBg} />
                    {!sel.is_active && <Pill label="Inactive" color={C.muted} bg={C.bg} />}
                  </div>
                  {isGES(sel) && (
                    <p style={{ fontSize: 11, color: C.gold, margin: 0 }}>GES-level — read only</p>
                  )}
                </div>
                {canEdit(sel) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn label="Import from PDF" onClick={() => { setShowPdfModal(true); setPdfText(''); setPdfErr(''); }} variant="ghost" small />
                    <Btn label="+ Add Clause" onClick={openClauseCreate} small />
                  </div>
                )}
              </div>

              {/* Clauses */}
              <div style={{ padding: '12px 20px 20px' }}>
                {clausesLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2].map(i => <div key={i} style={{ height: 80, borderRadius: 8, background: C.bg, opacity: 0.5 }} />)}
                  </div>
                ) : clauses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                    <p style={{ fontSize: 13, color: C.muted }}>
                      {isGES(sel) ? 'No clauses have been entered for this document yet.' : 'No clauses yet. Click "Add Clause" to begin.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {clauses.map((c, i) => (
                      <ClauseRow
                        key={c.id}
                        clause={c}
                        index={i + 1}
                        canEdit={canEdit(sel)}
                        onEdit={() => openClauseEdit(c)}
                        onDelete={() => setDelClId(c.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Create Doc Modal ── */}
      {showCreate && (
        <ModalShell title="New School Rules Document" onClose={() => setShowCreate(false)}>
          <Field label="Title">
            <Input value={cForm.title} onChange={v => setCForm(p => ({ ...p, title: v }))} placeholder="e.g. Riverside Academy Student Rules 2024" />
          </Field>
          <Field label="Source URL (optional)">
            <Input value={cForm.source_url} onChange={v => setCForm(p => ({ ...p, source_url: v }))} placeholder="https://..." />
          </Field>
          <Checkbox checked={cForm.is_active} onChange={() => setCForm(p => ({ ...p, is_active: !p.is_active }))} label="Active (clauses will be available for AI grounding)" />
          {cErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{cErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setShowCreate(false)} variant="ghost" />
            <Btn label={creating ? 'Creating…' : 'Create Document'} onClick={createDoc} disabled={creating} />
          </div>
        </ModalShell>
      )}

      {/* ── Edit Doc Modal ── */}
      {editDoc && (
        <ModalShell title="Edit Document" onClose={() => setEditDoc(null)}>
          <Field label="Title">
            <Input value={eForm.title} onChange={v => setEForm(p => ({ ...p, title: v }))} />
          </Field>
          <Field label="Source URL (optional)">
            <Input value={eForm.source_url} onChange={v => setEForm(p => ({ ...p, source_url: v }))} placeholder="https://..." />
          </Field>
          <Checkbox checked={eForm.is_active} onChange={() => setEForm(p => ({ ...p, is_active: !p.is_active }))} label="Active" />
          {eErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{eErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setEditDoc(null)} variant="ghost" />
            <Btn label={saving ? 'Saving…' : 'Save'} onClick={updateDoc} disabled={saving} />
          </div>
        </ModalShell>
      )}

      {/* ── Delete Doc Confirm ── */}
      {delDocId && (
        <ModalShell title="Delete Document?" onClose={() => setDelDocId(null)}>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>This will permanently delete the document and all its clauses. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setDelDocId(null)} variant="ghost" />
            <Btn label={deleting ? 'Deleting…' : 'Delete'} onClick={deleteDoc} disabled={deleting} variant="danger" />
          </div>
        </ModalShell>
      )}

      {/* ── Clause Modal ── */}
      {clauseModal && (
        <ModalShell
          title={clauseModal.mode === 'create' ? 'Add Clause' : 'Edit Clause'}
          onClose={() => setClauseModal(null)}
        >
          <Field label="Section Reference">
            <Input value={clForm.section_ref} onChange={v => setClForm(p => ({ ...p, section_ref: v }))} placeholder='e.g. "School Rules § 12" or "Rule 7(b)"' />
          </Field>
          <Field label="Clause Text">
            <Textarea value={clForm.clause_text} onChange={v => setClForm(p => ({ ...p, clause_text: v }))} placeholder="Paste the verbatim clause text here…" rows={5} />
          </Field>
          <Field label="Applicable To">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {APPLICABLE_OPTS.map(o => (
                <Checkbox key={o.value} checked={clForm.applicable_to.includes(o.value)} onChange={() => toggleApp(o.value)} label={o.label} />
              ))}
            </div>
          </Field>
          {cats.length > 0 && (
            <Field label="Offense / Query Categories">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: C.bg, borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '0 0 4px' }}>
                  Only non-sensitive categories are shown. Sensitive categories (suspension, dismissal, assault, etc.) are never AI-drafted.
                </p>
                {cats.map(c => (
                  <Checkbox key={c.value} checked={clForm.categories.includes(c.value)} onChange={() => toggleCat(c.value)} label={c.label} />
                ))}
              </div>
            </Field>
          )}
          <Field label="Display Order">
            <Input type="number" value={clForm.display_order} onChange={v => setClForm(p => ({ ...p, display_order: v }))} placeholder="0" />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Lower number = injected first. 0 is the default.</p>
          </Field>
          {clErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{clErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setClauseModal(null)} variant="ghost" />
            <Btn label={savingCl ? 'Saving…' : (clauseModal.mode === 'create' ? 'Add Clause' : 'Save Clause')} onClick={saveClause} disabled={savingCl} />
          </div>
        </ModalShell>
      )}

      {/* ── Delete Clause Confirm ── */}
      {delClId && (
        <ModalShell title="Delete Clause?" onClose={() => setDelClId(null)}>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>This clause will be permanently removed from the document.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setDelClId(null)} variant="ghost" />
            <Btn label={deletingCl ? 'Deleting…' : 'Delete'} onClick={deleteClause} disabled={deletingCl} variant="danger" />
          </div>
        </ModalShell>
      )}

      {/* ── PDF Import Modal ── */}
      {showPdfModal && sel && (
        <ModalShell title="Import from PDF" onClose={() => { setShowPdfModal(false); setPdfText(''); }} wide>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7 }}>
            Upload a PDF to extract its text. Highlight the relevant passage in the text area, then click{' '}
            <strong style={{ color: C.dark }}>Pre-fill Clause Form</strong> — it copies your selection into the clause editor.
            The raw text is never saved; only the clause record you confirm through the form.
          </p>
          <Field label="PDF File">
            <input
              type="file"
              accept=".pdf"
              disabled={pdfUploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}
              style={{ fontSize: 13, color: C.dark, cursor: 'pointer' }}
            />
          </Field>
          {pdfUploading && (
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Extracting text…</p>
          )}
          {pdfErr && (
            <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{pdfErr}</p>
          )}
          {pdfText && (
            <>
              <Field label={`Extracted text — ${pdfText.length.toLocaleString()} characters across ${pdfText.split('\n').length.toLocaleString()} lines. Select the relevant passage, then pre-fill.`}>
                <textarea
                  ref={pdfTextareaRef}
                  value={pdfText}
                  onChange={e => setPdfText(e.target.value)}
                  rows={18}
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 12,
                    fontFamily: 'ui-monospace, monospace', lineHeight: 1.7, color: C.dark,
                    border: `1px solid ${C.border}`, background: C.bg,
                    boxSizing: 'border-box', resize: 'vertical', outline: 'none',
                  }}
                />
              </Field>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                Tip: highlight just the clause text you want (excluding section headings if you prefer), then click the button below.
                If nothing is selected, the entire extracted text is pre-filled.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Btn label="Cancel" onClick={() => { setShowPdfModal(false); setPdfText(''); }} variant="ghost" />
                <Btn label="Pre-fill Clause Form" onClick={prefillClauseFromPdf} />
              </div>
            </>
          )}
          {!pdfText && !pdfUploading && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn label="Cancel" onClick={() => setShowPdfModal(false)} variant="ghost" />
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}

function DocRow({ doc, selected, onSelect, onEdit, onDelete, canEdit }: {
  doc: PolicyDocument; selected: boolean; onSelect: () => void;
  onEdit: (d: PolicyDocument) => void; onDelete: (id: string) => void; canEdit: boolean;
}) {
  const isGES = doc.school_id === null;
  return (
    <div
      style={{
        background: selected ? (isGES ? '#FDF5E0' : '#EFF6FF') : C.card,
        border: `1px solid ${selected ? (isGES ? '#E8D5A3' : '#BFDBFE') : C.border}`,
        borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: isGES ? C.gold : C.blue, background: isGES ? C.goldBg : C.blueBg, borderRadius: 5, padding: '2px 7px' }}>
              {isGES ? 'GES' : 'School'}
            </span>
            {!doc.is_active && <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: C.bg, borderRadius: 5, padding: '2px 7px' }}>Inactive</span>}
          </div>
          <p style={{ fontWeight: 700, fontSize: 13, color: C.dark, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.title}
          </p>
          <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{DOC_TYPE_LABELS[doc.document_type]}</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(doc)} style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.mid, cursor: 'pointer' }}>Edit</button>
            <button onClick={() => onDelete(doc.id)} style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: `1px solid #FECACA`, background: '#FEF2F2', color: C.danger, cursor: 'pointer' }}>Del</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ClauseRow({ clause, index, canEdit, onEdit, onDelete }: {
  clause: PolicyClause; index: number; canEdit: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const CAT_LABELS: Record<string, string> = {
    absenteeism: 'Absenteeism', misconduct: 'Misconduct', insubordination: 'Insubordination',
    negligence: 'Negligence', poor_performance: 'Poor Performance',
    lateness_absenteeism: 'Lateness / Absenteeism', theft_damage: 'Theft / Damage', vandalism: 'Vandalism',
  };
  const APP_LABELS: Record<string, string> = { teacher_query: 'Teacher Query', student_letter: 'Student Letter' };
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.forest, background: '#D1FAE5', borderRadius: 5, padding: '2px 7px' }}>
            {clause.section_ref}
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>#{index} · order {clause.display_order}</span>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={onEdit} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: `1px solid ${C.border}`, background: '#fff', color: C.mid, cursor: 'pointer' }}>Edit</button>
            <button onClick={onDelete} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: '1px solid #FECACA', background: '#FEF2F2', color: C.danger, cursor: 'pointer' }}>Del</button>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, color: C.dark, lineHeight: 1.6, margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {clause.clause_text}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {clause.applicable_to.map(a => (
          <span key={a} style={{ fontSize: 10, fontWeight: 700, background: '#EDE9FE', color: '#6D28D9', borderRadius: 5, padding: '2px 7px' }}>
            {APP_LABELS[a] ?? a}
          </span>
        ))}
        {clause.categories.map(c => (
          <span key={c} style={{ fontSize: 10, fontWeight: 600, background: '#DBEAFE', color: '#1e40af', borderRadius: 5, padding: '2px 7px' }}>
            {CAT_LABELS[c] ?? c}
          </span>
        ))}
      </div>
    </div>
  );
}
