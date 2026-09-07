'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface HelpEntry {
  id: string;
  school_id: string | null;
  feature_area: string;
  applicable_roles: string[];
  title: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

const C = {
  forest: '#0B3D2E', bg: '#F5F0E8', card: '#FDFAF5',
  border: '#E2D9CC', dark: '#2C2218', muted: '#8C7E6E',
  gold: '#C8973A', goldBg: '#FDF8EE',
  blue: '#1a56db', blueBg: '#EFF6FF',
  danger: '#B83232', dangerBg: '#FEF2F2',
  green: '#15803D', greenBg: '#DCFCE7',
};

const ROLE_OPTS = [
  { value: 'admin',      label: 'Admin' },
  { value: 'teacher',    label: 'Teacher' },
  { value: 'student',    label: 'Student' },
  { value: 'management', label: 'Management / Principal' },
];

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  admin:      { color: C.blue,    bg: C.blueBg },
  teacher:    { color: C.green,   bg: C.greenBg },
  student:    { color: '#7C3AED', bg: '#F5F3FF' },
  management: { color: C.gold,    bg: C.goldBg },
};

type EntryForm = {
  feature_area: string;
  title: string;
  body: string;
  applicable_roles: string[];
  is_active: boolean;
};

const blank = (): EntryForm => ({
  feature_area: '', title: '', body: '', applicable_roles: ['admin'], is_active: true,
});

// ── Shared sub-components (same style as policy-documents page) ─────────────

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: bg, color, borderRadius: 5, padding: '2px 7px', display: 'inline-block' }}>
      {label}
    </span>
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

function FInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: C.dark, border: `1px solid ${C.border}`, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
  );
}

function FTextarea({ value, onChange, placeholder, rows = 6 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, color: C.dark, lineHeight: 1.6, border: `1px solid ${C.border}`, background: '#fff', boxSizing: 'border-box', resize: 'vertical', outline: 'none' }} />
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(11,61,46,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontWeight: 800, fontSize: 15, color: C.dark, margin: 0 }}>{title}</p>
          <button onClick={onClose} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function Btn({ label, onClick, disabled, variant = 'primary', small }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; small?: boolean;
}) {
  const bg    = variant === 'primary' ? C.forest : variant === 'danger' ? C.danger : 'transparent';
  const color = variant === 'ghost' ? C.muted : '#fff';
  const bdr   = variant === 'ghost' ? `1px solid ${C.border}` : 'none';
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: small ? '6px 14px' : '10px 20px', borderRadius: 8, border: bdr, background: bg, color, fontWeight: 700, fontSize: small ? 12 : 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      {label}
    </button>
  );
}

// ── Role checkbox group ──────────────────────────────────────────────────────

function RoleCheckboxes({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(r: string) {
    onChange(value.includes(r) ? value.filter(x => x !== r) : [...value, r]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {ROLE_OPTS.map(opt => (
        <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: C.dark }}>
          <input type="checkbox" checked={value.includes(opt.value)} onChange={() => toggle(opt.value)}
            style={{ accentColor: C.forest, width: 15, height: 15 }} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ── Entry form (shared for create + edit) ────────────────────────────────────

function EntryForm({ form, setForm, err, isSaving, onSave, onCancel, saveLabel }: {
  form: EntryForm;
  setForm: (f: EntryForm) => void;
  err: string;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  function set(k: keyof EntryForm, v: unknown) { setForm({ ...form, [k]: v }); }
  return (
    <>
      <Field label="Feature Area">
        <FInput value={form.feature_area} onChange={v => set('feature_area', v)} placeholder="e.g. attendance, fees, results" />
      </Field>
      <Field label="Title">
        <FInput value={form.title} onChange={v => set('title', v)} placeholder="Short descriptive title" />
      </Field>
      <Field label="Body">
        <FTextarea value={form.body} onChange={v => set('body', v)} placeholder="Full help text shown to the AI. Write in plain prose — no markdown." rows={10} />
      </Field>
      <Field label="Applicable Roles">
        <RoleCheckboxes value={form.applicable_roles} onChange={v => set('applicable_roles', v)} />
      </Field>
      <Field label="Active">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.dark }}>
          <input type="checkbox" checked={form.is_active} onChange={() => set('is_active', !form.is_active)}
            style={{ accentColor: C.forest, width: 15, height: 15 }} />
          Entry is active (inactive entries are not shown to users)
        </label>
      </Field>
      {err && <p style={{ fontSize: 12, color: C.danger }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn label="Cancel" variant="ghost" onClick={onCancel} />
        <Btn label={isSaving ? 'Saving…' : saveLabel} onClick={onSave} disabled={isSaving} />
      </div>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function HelpEntriesPage() {
  const [entries, setEntries] = useState<HelpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const [cForm, setCForm]           = useState<EntryForm>(blank());
  const [cErr, setCErr]             = useState('');
  const [creating, setCreating]     = useState(false);

  const [editEntry, setEditEntry]   = useState<HelpEntry | null>(null);
  const [eForm, setEForm]           = useState<EntryForm>(blank());
  const [eErr, setEErr]             = useState('');
  const [saving, setSaving]         = useState(false);

  const [delId, setDelId]           = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const user = getUser();
  const isSuperAdmin = user?.role === 'super_admin';

  function canEdit(e: HelpEntry) {
    if (isSuperAdmin) return true;
    return e.school_id !== null;
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/api/help-entries');
      setEntries(data as HelpEntry[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!cForm.title.trim())        return setCErr('Title is required.');
    if (!cForm.feature_area.trim()) return setCErr('Feature area is required.');
    if (!cForm.body.trim())         return setCErr('Body is required.');
    if (!cForm.applicable_roles.length) return setCErr('Select at least one role.');
    setCreating(true); setCErr('');
    try {
      await api.post('/api/help-entries', cForm);
      setShowCreate(false); setCForm(blank()); await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setCErr(err.response?.data?.error ?? 'Failed to create entry.');
    } finally { setCreating(false); }
  }

  async function handleEdit() {
    if (!eForm.title.trim())        return setEErr('Title is required.');
    if (!eForm.feature_area.trim()) return setEErr('Feature area is required.');
    if (!eForm.body.trim())         return setEErr('Body is required.');
    if (!eForm.applicable_roles.length) return setEErr('Select at least one role.');
    setSaving(true); setEErr('');
    try {
      await api.patch(`/api/help-entries/${editEntry!.id}`, eForm);
      setEditEntry(null); await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setEErr(err.response?.data?.error ?? 'Failed to save changes.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!delId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/help-entries/${delId}`);
      setDelId(null); await load();
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  const globalEntries = entries.filter(e => e.school_id === null);
  const schoolEntries = entries.filter(e => e.school_id !== null);

  function matchesFilter(e: HelpEntry) {
    if (roleFilter === 'all') return true;
    return e.applicable_roles.includes(roleFilter);
  }

  const filteredGlobal = globalEntries.filter(matchesFilter);
  const filteredSchool = schoolEntries.filter(matchesFilter);

  function EntryRow({ e }: { e: HelpEntry }) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {e.applicable_roles.map(r => {
              const colors = ROLE_COLORS[r] ?? { color: C.muted, bg: C.bg };
              return <Pill key={r} label={r} color={colors.color} bg={colors.bg} />;
            })}
            {!e.is_active && <Pill label="Inactive" color={C.danger} bg={C.dangerBg} />}
          </div>
          <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: '2px 0 2px' }}>{e.title}</p>
          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{e.feature_area}</p>
        </div>
        {canEdit(e) && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Btn small label="Edit" variant="ghost" onClick={() => {
              setEditEntry(e);
              setEForm({ feature_area: e.feature_area, title: e.title, body: e.body, applicable_roles: [...e.applicable_roles], is_active: e.is_active });
              setEErr('');
            }} />
            <Btn small label="Del" variant="danger" onClick={() => setDelId(e.id)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.dark, margin: 0 }}>Help Entries</h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            Manage the knowledge base shown to users by the Help chatbot.
            {!isSuperAdmin && ' Global entries (platform-wide) are read-only — contact support to change them.'}
          </p>
        </div>
        <Btn label="+ Add Entry" onClick={() => { setShowCreate(true); setCForm(blank()); setCErr(''); }} />
      </div>

      {/* Role filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ value: 'all', label: 'All Roles' }, ...ROLE_OPTS].map(opt => (
          <button key={opt.value} onClick={() => setRoleFilter(opt.value)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: roleFilter === opt.value ? C.forest : C.card,
              color:      roleFilter === opt.value ? '#fff'    : C.muted,
              border: roleFilter === opt.value ? 'none' : `1px solid ${C.border}`,
            } as React.CSSProperties}>
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading…</p>
      ) : (
        <>
          {/* Global entries */}
          {filteredGlobal.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  Global Entries ({filteredGlobal.length})
                </p>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              {!isSuperAdmin && (
                <div style={{ background: C.goldBg, border: `1px solid ${C.gold}33`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#7A5C1E' }}>
                  These platform-wide entries are managed by the CAS team. They appear in all school accounts and cannot be edited here.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredGlobal.map(e => <EntryRow key={e.id} e={e} />)}
              </div>
            </div>
          )}

          {/* School-scoped entries */}
          {filteredSchool.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                  School Entries ({filteredSchool.length})
                </p>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredSchool.map(e => <EntryRow key={e.id} e={e} />)}
              </div>
            </div>
          )}

          {filteredGlobal.length === 0 && filteredSchool.length === 0 && (
            <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No entries match this filter.</p>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <ModalShell title="Add Help Entry" onClose={() => setShowCreate(false)}>
          <EntryForm
            form={cForm} setForm={setCForm} err={cErr} isSaving={creating}
            onSave={handleCreate} onCancel={() => setShowCreate(false)} saveLabel="Create Entry"
          />
        </ModalShell>
      )}

      {/* Edit modal */}
      {editEntry && (
        <ModalShell title="Edit Help Entry" onClose={() => setEditEntry(null)}>
          <EntryForm
            form={eForm} setForm={setEForm} err={eErr} isSaving={saving}
            onSave={handleEdit} onCancel={() => setEditEntry(null)} saveLabel="Save Changes"
          />
        </ModalShell>
      )}

      {/* Delete confirmation */}
      {delId && (
        <ModalShell title="Delete Entry" onClose={() => setDelId(null)}>
          <p style={{ fontSize: 14, color: C.dark }}>
            Are you sure you want to permanently delete this help entry? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" variant="ghost" onClick={() => setDelId(null)} />
            <Btn label={deleting ? 'Deleting…' : 'Delete Entry'} variant="danger" onClick={handleDelete} disabled={deleting} />
          </div>
        </ModalShell>
      )}
    </div>
  );
}
