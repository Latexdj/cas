'use client';
import { useState, useEffect, useRef } from 'react';
import { saApi } from '@/lib/super-admin-api';

interface PolicyDocument {
  id: string;
  school_id: null; // super admin only sees GES docs (school_id = NULL)
  title: string;
  document_type: 'ges_teacher_code' | 'ges_student_code';
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

interface ChunkSummary {
  id: string;
  chunk_index: number;
  section_hint: string | null;
  chunk_preview: string;
  is_active: boolean;
}

interface RagStatus { total: number; active: number; chunks: ChunkSummary[] }

const C = {
  forest: '#0B3D2E', bg: '#0E1A0C', card: '#132B1C', border: '#2A3D28',
  dark: '#FFFFFF', mid: 'rgba(255,255,255,0.7)', muted: 'rgba(255,255,255,0.4)',
  gold: '#C8973A', goldBg: 'rgba(200,151,58,0.15)',
  danger: '#F87171', dangerBg: 'rgba(248,113,113,0.12)',
  inputBg: '#0B1A0E', inputBorder: '#2A3D28',
};

const DOC_TYPE_OPTS = [
  { value: 'ges_teacher_code', label: 'GES Teacher Code' },
  { value: 'ges_student_code', label: 'GES Student Code' },
];
const DOC_TYPE_LABELS: Record<string, string> = {
  ges_teacher_code: 'GES Teacher Code',
  ges_student_code: 'GES Student Code',
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
const APPLICABLE_OPTS = [
  { value: 'teacher_query',  label: 'Teacher Query Letters' },
  { value: 'student_letter', label: 'Student Disciplinary Letters' },
];
const APP_LABELS: Record<string, string> = { teacher_query: 'Teacher Query', student_letter: 'Student Letter' };
const CAT_LABELS: Record<string, string> = {
  absenteeism: 'Absenteeism', misconduct: 'Misconduct', insubordination: 'Insubordination',
  negligence: 'Negligence', poor_performance: 'Poor Performance',
  lateness_absenteeism: 'Lateness / Absenteeism', theft_damage: 'Theft / Damage', vandalism: 'Vandalism',
};

function availableCats(applicableTo: string[]) {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  if (applicableTo.includes('teacher_query'))  TEACHER_CATS.forEach(c => { if (!seen.has(c.value)) { out.push(c); seen.add(c.value); } });
  if (applicableTo.includes('student_letter')) STUDENT_CATS.forEach(c => { if (!seen.has(c.value)) { out.push(c); seen.add(c.value); } });
  return out;
}

type DocForm = { title: string; document_type: string; source_url: string; is_active: boolean };
type ClauseForm = { section_ref: string; clause_text: string; applicable_to: string[]; categories: string[]; display_order: string };

const blankDoc   = (): DocForm    => ({ title: '', document_type: 'ges_teacher_code', source_url: '', is_active: true });
const blankClause = (): ClauseForm => ({ section_ref: '', clause_text: '', applicable_to: [], categories: [], display_order: '0' });

// ── Shared UI primitives (dark theme) ────────────────────────────────────────

function SLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{children}</p>;
}

function SInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#fff', background: C.inputBg, border: `1px solid ${C.inputBorder}`, boxSizing: 'border-box', outline: 'none' }}
    />
  );
}

function STextarea({ value, onChange, placeholder, rows = 5 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#fff', lineHeight: 1.6, background: C.inputBg, border: `1px solid ${C.inputBorder}`, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }}
    />
  );
}

function SSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: '#fff', background: C.inputBg, border: `1px solid ${C.inputBorder}`, boxSizing: 'border-box', outline: 'none', cursor: 'pointer' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SCheck({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.mid }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ accentColor: C.gold, width: 15, height: 15 }} />
      {label}
    </label>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#132B1C', borderRadius: 16, width: '100%', maxWidth: wide ? 820 : 560, maxHeight: '90vh', overflow: 'auto', border: `1px solid ${C.border}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontWeight: 800, fontSize: 15, color: '#fff', margin: 0 }}>{title}</p>
          <button onClick={onClose} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, disabled, variant = 'primary', small }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; small?: boolean;
}) {
  const bg = variant === 'primary' ? C.gold : variant === 'danger' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)';
  const color = variant === 'primary' ? '#0B3D2E' : variant === 'danger' ? C.danger : C.mid;
  const border = variant === 'danger' ? `1px solid rgba(248,113,113,0.3)` : variant === 'ghost' ? `1px solid ${C.border}` : 'none';
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: small ? '6px 14px' : '10px 20px', borderRadius: 8, border, background: bg, color, fontWeight: 700, fontSize: small ? 12 : 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SAGESPolicyDocsPage() {
  const [docs, setDocs]             = useState<PolicyDocument[]>([]);
  const [sel, setSel]               = useState<PolicyDocument | null>(null);
  const [clauses, setClauses]       = useState<PolicyClause[]>([]);
  const [loading, setLoading]       = useState(true);
  const [clausesLoading, setCL]     = useState(false);

  // Create doc
  const [showCreate, setShowCreate] = useState(false);
  const [cForm, setCForm]           = useState<DocForm>(blankDoc());
  const [cErr, setCErr]             = useState('');
  const [creating, setCreating]     = useState(false);

  // Edit doc
  const [editDoc, setEditDoc]       = useState<PolicyDocument | null>(null);
  const [eForm, setEForm]           = useState<DocForm>(blankDoc());
  const [eErr, setEErr]             = useState('');
  const [saving, setSaving]         = useState(false);

  // Delete doc
  const [delDocId, setDelDocId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);

  // Clause modal
  const [clModal, setClModal]       = useState<{ mode: 'create' | 'edit'; clause?: PolicyClause } | null>(null);
  const [clForm, setClForm]         = useState<ClauseForm>(blankClause());
  const [clErr, setClErr]           = useState('');
  const [savingCl, setSavingCl]     = useState(false);

  // Delete clause
  const [delClId, setDelClId]       = useState<string | null>(null);
  const [deletingCl, setDeletingCl] = useState(false);

  // PDF import
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfText, setPdfText]           = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfErr, setPdfErr]             = useState('');
  const pdfTextareaRef                  = useRef<HTMLTextAreaElement>(null);

  // RAG grounding
  const [ragStatus, setRagStatus]         = useState<RagStatus | null>(null);
  const [ragStatusLoading, setRagSL]      = useState(false);
  const [showRagModal, setShowRagModal]   = useState(false);
  const [ragProcessing, setRagProcessing] = useState(false);
  const [ragErr, setRagErr]               = useState('');
  const [ragChunks, setRagChunks]         = useState<{ chunk_index: number; section_hint: string | null; chunk_preview: string }[]>([]);

  useEffect(() => {
    saApi.get<PolicyDocument[]>('/api/policy-documents')
      .then(r => setDocs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sel) { setClauses([]); setRagStatus(null); return; }
    setCL(true);
    saApi.get<PolicyClause[]>(`/api/policy-documents/${sel.id}/clauses`)
      .then(r => setClauses(r.data))
      .catch(console.error)
      .finally(() => setCL(false));
    loadRagStatus(sel.id);
  }, [sel]);

  async function createDoc() {
    if (!cForm.title.trim()) { setCErr('Title is required'); return; }
    setCreating(true); setCErr('');
    try {
      const { data } = await saApi.post<PolicyDocument>('/api/policy-documents', cForm);
      setDocs(prev => [data, ...prev]);
      setShowCreate(false);
      setCForm(blankDoc());
      setSel(data);
    } catch (e: unknown) {
      setCErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create');
    } finally { setCreating(false); }
  }

  function openEdit(d: PolicyDocument) {
    setEditDoc(d);
    setEForm({ title: d.title, document_type: d.document_type, source_url: d.source_url ?? '', is_active: d.is_active });
    setEErr('');
  }

  async function updateDoc() {
    if (!editDoc || !eForm.title.trim()) { setEErr('Title is required'); return; }
    setSaving(true); setEErr('');
    try {
      const { data } = await saApi.patch<PolicyDocument>(`/api/policy-documents/${editDoc.id}`, {
        title: eForm.title, source_url: eForm.source_url, is_active: eForm.is_active,
      });
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
      await saApi.delete(`/api/policy-documents/${delDocId}`);
      setDocs(prev => prev.filter(d => d.id !== delDocId));
      if (sel?.id === delDocId) setSel(null);
      setDelDocId(null);
    } catch { /* ignore */ } finally { setDeleting(false); }
  }

  function openClCreate() {
    setClForm(blankClause()); setClErr('');
    setClModal({ mode: 'create' });
  }

  function openClEdit(c: PolicyClause) {
    setClForm({ section_ref: c.section_ref, clause_text: c.clause_text, applicable_to: [...c.applicable_to], categories: [...c.categories], display_order: String(c.display_order) });
    setClErr('');
    setClModal({ mode: 'edit', clause: c });
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
      if (clModal?.mode === 'create') {
        const { data } = await saApi.post<PolicyClause>(`/api/policy-documents/${sel.id}/clauses`, payload);
        setClauses(prev => [...prev, data].sort((a, b) => a.display_order - b.display_order));
      } else if (clModal?.clause) {
        const { data } = await saApi.patch<PolicyClause>(`/api/policy-documents/${sel.id}/clauses/${clModal.clause.id}`, payload);
        setClauses(prev => prev.map(c => c.id === data.id ? data : c));
      }
      setClModal(null);
    } catch (e: unknown) {
      setClErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to save clause');
    } finally { setSavingCl(false); }
  }

  async function deleteClause() {
    if (!sel || !delClId) return;
    setDeletingCl(true);
    try {
      await saApi.delete(`/api/policy-documents/${sel.id}/clauses/${delClId}`);
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
      const { data } = await saApi.post<{ text: string; pages: number }>(
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
    setClErr(''); setClModal({ mode: 'create' });
  }

  function loadRagStatus(docId: string) {
    setRagSL(true);
    saApi.get<RagStatus>(`/api/policy-documents/${docId}/chunks`)
      .then(r => setRagStatus(r.data))
      .catch(() => setRagStatus(null))
      .finally(() => setRagSL(false));
  }

  async function processRag(file: File) {
    if (!sel) return;
    setRagProcessing(true); setRagErr(''); setRagChunks([]);
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const { data } = await saApi.post<{ chunks_created: number; chunks: { chunk_index: number; section_hint: string | null; chunk_preview: string }[] }>(
        `/api/policy-documents/${sel.id}/process-rag`, fd
      );
      setRagChunks(data.chunks);
      loadRagStatus(sel.id);
    } catch (e: unknown) {
      setRagErr((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Processing failed');
    } finally { setRagProcessing(false); }
  }

  async function toggleRagActive(active: boolean) {
    if (!sel) return;
    try {
      await saApi.patch(`/api/policy-documents/${sel.id}/chunks`, { is_active: active });
      loadRagStatus(sel.id);
    } catch { /* ignore */ }
  }

  const cats = availableCats(clForm.applicable_to);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>GES Policy Documents</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            Manage platform-level GES policy documents and clauses. These are shared read-only with all schools.
          </p>
        </div>
        <Btn label="+ New Document" onClick={() => { setShowCreate(true); setCErr(''); setCForm(blankDoc()); }} />
      </div>

      {/* Notice */}
      <div style={{ background: C.goldBg, border: `1px solid rgba(200,151,58,0.3)`, borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: C.gold }}>
        Documents created here have <strong>school_id = NULL</strong> and are visible to all schools as read-only references. Only super admins can create, edit, or delete them.
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Doc list */}
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: 64, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, opacity: 0.4 }} />)}
            </div>
          ) : docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}>
              <p style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>No GES documents yet</p>
              <p style={{ fontSize: 12, color: C.muted }}>Create the first GES-level policy document.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => (
                <div
                  key={d.id}
                  onClick={() => setSel(d)}
                  style={{ background: sel?.id === d.id ? C.goldBg : C.card, border: `1px solid ${sel?.id === d.id ? 'rgba(200,151,58,0.4)' : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.gold, background: C.goldBg, borderRadius: 5, padding: '2px 7px' }}>GES</span>
                        {!d.is_active && <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 7px' }}>Inactive</span>}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{DOC_TYPE_LABELS[d.document_type]}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(d)} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.mid, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => setDelDocId(d.id)} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: C.danger, cursor: 'pointer' }}>Del</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clause panel */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, minHeight: 300 }}>
          {!sel ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <p style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>Select a document</p>
              <p style={{ fontSize: 12, color: C.muted }}>Choose a document to view and manage its clauses.</p>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: '#fff', margin: 0 }}>{sel.title}</p>
                    <span style={{ fontSize: 10, fontWeight: 800, color: C.gold, background: C.goldBg, borderRadius: 5, padding: '2px 7px' }}>{DOC_TYPE_LABELS[sel.document_type]}</span>
                    {!sel.is_active && <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 7px' }}>Inactive</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn label="Import from PDF" onClick={() => { setShowPdfModal(true); setPdfText(''); setPdfErr(''); }} variant="ghost" small />
                  <Btn label="+ Add Clause" onClick={openClCreate} small />
                </div>
              </div>

              {/* RAG Grounding status */}
              <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 800, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>RAG Grounding</p>
                  {ragStatusLoading ? (
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Loading…</p>
                  ) : ragStatus && ragStatus.total > 0 ? (
                    <p style={{ fontSize: 11, color: C.mid, margin: 0 }}>
                      {ragStatus.total} chunks · <strong style={{ color: ragStatus.active > 0 ? '#4ADE80' : C.muted }}>{ragStatus.active} active</strong>
                      {ragStatus.chunks.filter(c => c.section_hint).length > 0 && (
                        <span style={{ color: C.muted }}> · §{ragStatus.chunks.filter(c => c.section_hint).slice(0, 4).map(c => c.section_hint).join(', §')}{ragStatus.chunks.filter(c => c.section_hint).length > 4 ? '…' : ''}</span>
                      )}
                    </p>
                  ) : (
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>No chunks — manual clauses only</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ragStatus && ragStatus.total > 0 && (
                    <Btn
                      label={ragStatus.active > 0 ? 'Deactivate' : 'Activate'}
                      onClick={() => toggleRagActive(ragStatus.active === 0)}
                      variant="ghost" small
                    />
                  )}
                  <Btn
                    label={ragStatus && ragStatus.total > 0 ? 'Re-process' : 'Process for RAG'}
                    onClick={() => { setShowRagModal(true); setRagChunks([]); setRagErr(''); }}
                    variant="ghost" small
                  />
                </div>
              </div>
              <div style={{ padding: '12px 20px 20px' }}>
                {clausesLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2].map(i => <div key={i} style={{ height: 80, borderRadius: 8, background: 'rgba(255,255,255,0.04)', opacity: 0.5 }} />)}
                  </div>
                ) : clauses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                    <p style={{ fontSize: 13, color: C.muted }}>No clauses yet. Click "Add Clause" to begin.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {clauses.map((c, i) => (
                      <div key={c.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.gold, background: C.goldBg, borderRadius: 5, padding: '2px 7px' }}>{c.section_ref}</span>
                            <span style={{ fontSize: 11, color: C.muted }}>#{i + 1} · order {c.display_order}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => openClEdit(c)} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.05)', color: C.mid, cursor: 'pointer' }}>Edit</button>
                            <button onClick={() => setDelClId(c.id)} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 5, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: C.danger, cursor: 'pointer' }}>Del</button>
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: C.mid, lineHeight: 1.6, margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {c.clause_text}
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {c.applicable_to.map(a => (
                            <span key={a} style={{ fontSize: 10, fontWeight: 700, background: 'rgba(167,139,250,0.15)', color: '#A78BFA', borderRadius: 5, padding: '2px 7px' }}>{APP_LABELS[a] ?? a}</span>
                          ))}
                          {c.categories.map(cat => (
                            <span key={cat} style={{ fontSize: 10, fontWeight: 600, background: 'rgba(96,165,250,0.15)', color: '#60A5FA', borderRadius: 5, padding: '2px 7px' }}>{CAT_LABELS[cat] ?? cat}</span>
                          ))}
                        </div>
                      </div>
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
        <Modal title="New GES Policy Document" onClose={() => setShowCreate(false)}>
          <div><SLabel>Title</SLabel><SInput value={cForm.title} onChange={v => setCForm(p => ({ ...p, title: v }))} placeholder="e.g. GES Code of Conduct for Students 2023" /></div>
          <div><SLabel>Document Type</SLabel><SSelect value={cForm.document_type} onChange={v => setCForm(p => ({ ...p, document_type: v }))} options={DOC_TYPE_OPTS} /></div>
          <div><SLabel>Source URL (optional)</SLabel><SInput value={cForm.source_url} onChange={v => setCForm(p => ({ ...p, source_url: v }))} placeholder="https://..." /></div>
          <SCheck checked={cForm.is_active} onChange={() => setCForm(p => ({ ...p, is_active: !p.is_active }))} label="Active (clauses will be available for AI grounding)" />
          {cErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{cErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setShowCreate(false)} variant="ghost" />
            <Btn label={creating ? 'Creating…' : 'Create Document'} onClick={createDoc} disabled={creating} />
          </div>
        </Modal>
      )}

      {/* ── Edit Doc Modal ── */}
      {editDoc && (
        <Modal title="Edit Document" onClose={() => setEditDoc(null)}>
          <div><SLabel>Title</SLabel><SInput value={eForm.title} onChange={v => setEForm(p => ({ ...p, title: v }))} /></div>
          <div><SLabel>Source URL (optional)</SLabel><SInput value={eForm.source_url} onChange={v => setEForm(p => ({ ...p, source_url: v }))} placeholder="https://..." /></div>
          <SCheck checked={eForm.is_active} onChange={() => setEForm(p => ({ ...p, is_active: !p.is_active }))} label="Active" />
          {eErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{eErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setEditDoc(null)} variant="ghost" />
            <Btn label={saving ? 'Saving…' : 'Save'} onClick={updateDoc} disabled={saving} />
          </div>
        </Modal>
      )}

      {/* ── Delete Doc ── */}
      {delDocId && (
        <Modal title="Delete Document?" onClose={() => setDelDocId(null)}>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>This will permanently delete the document and all its clauses across all schools. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setDelDocId(null)} variant="ghost" />
            <Btn label={deleting ? 'Deleting…' : 'Delete'} onClick={deleteDoc} disabled={deleting} variant="danger" />
          </div>
        </Modal>
      )}

      {/* ── Clause Modal ── */}
      {clModal && (
        <Modal title={clModal.mode === 'create' ? 'Add Clause' : 'Edit Clause'} onClose={() => setClModal(null)}>
          <div><SLabel>Section Reference</SLabel><SInput value={clForm.section_ref} onChange={v => setClForm(p => ({ ...p, section_ref: v }))} placeholder='e.g. "Section 4.2.1" or "Rule 7(b)"' /></div>
          <div><SLabel>Clause Text</SLabel><STextarea value={clForm.clause_text} onChange={v => setClForm(p => ({ ...p, clause_text: v }))} placeholder="Paste the verbatim clause text here…" /></div>
          <div>
            <SLabel>Applicable To</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {APPLICABLE_OPTS.map(o => (
                <SCheck key={o.value} checked={clForm.applicable_to.includes(o.value)} onChange={() => toggleApp(o.value)} label={o.label} />
              ))}
            </div>
          </div>
          {cats.length > 0 && (
            <div>
              <SLabel>Offense / Query Categories</SLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '0 0 4px' }}>
                  Only non-sensitive categories shown. Sensitive cases (assault, malpractice, etc.) never reach the AI.
                </p>
                {cats.map(c => (
                  <SCheck key={c.value} checked={clForm.categories.includes(c.value)} onChange={() => toggleCat(c.value)} label={c.label} />
                ))}
              </div>
            </div>
          )}
          <div>
            <SLabel>Display Order</SLabel>
            <SInput type="number" value={clForm.display_order} onChange={v => setClForm(p => ({ ...p, display_order: v }))} placeholder="0" />
            <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Lower = injected first. GES clauses always precede school-specific ones.</p>
          </div>
          {clErr && <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{clErr}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setClModal(null)} variant="ghost" />
            <Btn label={savingCl ? 'Saving…' : (clModal.mode === 'create' ? 'Add Clause' : 'Save Clause')} onClick={saveClause} disabled={savingCl} />
          </div>
        </Modal>
      )}

      {/* ── Delete Clause ── */}
      {delClId && (
        <Modal title="Delete Clause?" onClose={() => setDelClId(null)}>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>This clause will be permanently removed from the document.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" onClick={() => setDelClId(null)} variant="ghost" />
            <Btn label={deletingCl ? 'Deleting…' : 'Delete'} onClick={deleteClause} disabled={deletingCl} variant="danger" />
          </div>
        </Modal>
      )}

      {/* ── RAG Process Modal ── */}
      {showRagModal && sel && (
        <Modal title="Process Document for RAG" onClose={() => { setShowRagModal(false); setRagChunks([]); setRagErr(''); }} wide>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7 }}>
            Upload a PDF to auto-chunk and embed it with Voyage AI (voyage-4). Chunks are created{' '}
            <strong style={{ color: '#fff' }}>inactive</strong> — review sections below, then click{' '}
            <strong style={{ color: '#fff' }}>Activate Chunks</strong> when ready.
            {ragStatus && ragStatus.total > 0 && ' Existing chunks will be replaced.'}
          </p>
          <div>
            <SLabel>PDF File</SLabel>
            <input
              type="file" accept=".pdf" disabled={ragProcessing}
              onChange={e => { const f = e.target.files?.[0]; if (f) processRag(f); e.target.value = ''; }}
              style={{ fontSize: 13, color: C.mid, cursor: 'pointer' }}
            />
          </div>
          {ragProcessing && (
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>
              Chunking text and generating embeddings…
            </p>
          )}
          {ragErr && (
            <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{ragErr}</p>
          )}
          {ragChunks.length > 0 && (
            <>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: '0 0 10px' }}>
                  {ragChunks.length} chunks created (inactive) — review:
                </p>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ragChunks.map((c, i) => (
                    <div key={i} style={{ borderBottom: i < ragChunks.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: i < ragChunks.length - 1 ? 10 : 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: '0 0 3px' }}>
                        {c.section_hint ? `§ ${c.section_hint}` : `Chunk ${i + 1}`}
                      </p>
                      <p style={{ fontSize: 11, color: C.mid, margin: 0, lineHeight: 1.5 }}>
                        {c.chunk_preview}{c.chunk_preview.length >= 200 ? '…' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Btn label="Keep Inactive" onClick={() => { setShowRagModal(false); setRagChunks([]); }} variant="ghost" />
                <Btn label="Activate Chunks" onClick={async () => { await toggleRagActive(true); setShowRagModal(false); setRagChunks([]); }} />
              </div>
            </>
          )}
          {ragChunks.length === 0 && !ragProcessing && !ragErr && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn label="Cancel" onClick={() => setShowRagModal(false)} variant="ghost" />
            </div>
          )}
        </Modal>
      )}

      {/* ── PDF Import Modal ── */}
      {showPdfModal && sel && (
        <Modal title="Import from PDF" onClose={() => { setShowPdfModal(false); setPdfText(''); }} wide>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.7 }}>
            Upload a PDF to extract its text. Highlight the relevant passage, then click{' '}
            <strong style={{ color: '#fff' }}>Pre-fill Clause Form</strong> to copy it into the clause editor.
            The raw text is never saved; only the clause record you confirm through the form.
          </p>
          <div>
            <SLabel>PDF File</SLabel>
            <input
              type="file"
              accept=".pdf"
              disabled={pdfUploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfFile(f); }}
              style={{ fontSize: 13, color: C.mid, cursor: 'pointer' }}
            />
          </div>
          {pdfUploading && (
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Extracting text…</p>
          )}
          {pdfErr && (
            <p style={{ fontSize: 12, color: C.danger, background: C.dangerBg, borderRadius: 8, padding: '8px 12px', margin: 0 }}>{pdfErr}</p>
          )}
          {pdfText && (
            <>
              <div>
                <SLabel>{`Extracted text — ${pdfText.length.toLocaleString()} characters. Select the relevant passage, then pre-fill.`}</SLabel>
                <textarea
                  ref={pdfTextareaRef}
                  value={pdfText}
                  onChange={e => setPdfText(e.target.value)}
                  rows={18}
                  spellCheck={false}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 12,
                    fontFamily: 'ui-monospace, monospace', lineHeight: 1.7, color: '#fff',
                    background: C.inputBg, border: `1px solid ${C.inputBorder}`,
                    boxSizing: 'border-box', resize: 'vertical', outline: 'none',
                  }}
                />
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                Tip: highlight just the clause text (excluding section headings if you prefer), then click the button.
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
        </Modal>
      )}
    </div>
  );
}
