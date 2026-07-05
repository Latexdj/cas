'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeeItem {
  id: string; name: string; description: string | null; is_active: boolean; created_at: string;
}
interface FeeSchedule {
  id: string; fee_item_id: string; fee_item_name: string;
  academic_year_id: string | null; academic_year_name: string | null;
  semester: number | null; class_name: string | null;
  amount: string; due_date: string | null; created_at: string;
}
interface StudentBill {
  id: string; student_id: string; student_name: string; student_code: string; class_name: string;
  fee_item_id: string | null; fee_item_name: string | null; fee_schedule_id: string | null;
  description: string; amount: string; amount_paid: string; due_date: string | null; created_at: string;
}
interface FeePayment {
  id: string; student_id: string; student_name: string; student_code: string; class_name: string;
  bill_id: string | null; fee_item_id: string | null; fee_item_name: string | null;
  amount: string; payment_date: string; payment_method: string;
  reference: string | null; notes: string | null; recorded_by: string | null; receipt_no: string | null;
}
interface StudentSummary {
  student: { id: string; name: string; student_code: string; class_name: string };
  bills: StudentBill[];
  payments: FeePayment[];
  total_billed: number; total_paid: number; outstanding: number;
}
interface ArrearRow {
  student_id: string; student_name: string; student_code: string; class_name: string;
  total_billed: string; total_paid: string; outstanding: string;
}
interface AcademicYear { id: string; name: string; is_current: boolean; }
interface Stats {
  total_billed: number; total_collected: number; outstanding: number;
  total_expenses: number; net_position: number; students_with_bills: number;
}
interface Expense {
  id: string; category: string; description: string; amount: string;
  expense_date: string; payment_method: string; paid_to: string | null;
  reference: string | null; recorded_by: string | null; notes: string | null;
}

const EXPENSE_CATEGORIES = [
  'Salaries & Wages','Utilities','Stationery & Supplies',
  'Maintenance & Repairs','Transport & Fuel','Food & Catering',
  'Medical & Health','Printing & Copying','Sports & Activities',
  'Petty Cash','Other',
];

type Tab = 'items' | 'schedules' | 'collections' | 'expenditure' | 'arrears';

const fmt = (n: number | string) =>
  'GH₵ ' + Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHODS = ['Cash','Mobile Money','Bank Transfer','Cheque','POS'];

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#15803d' : '#dc2626' }}>{label}</span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#64748b' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 };
const btnPrimary: React.CSSProperties = { padding: '8px 20px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' };

// ── Fee Items ─────────────────────────────────────────────────────────────────

function ItemsTab({ items, loading, onRefresh }: { items: FeeItem[]; loading: boolean; onRefresh: () => void }) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeItem | null>(null);
  const [form, setForm] = useState({ name: '', description: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function openNew() { setEditing(null); setForm({ name: '', description: '', is_active: true }); setErr(''); setShowModal(true); }
  function openEdit(item: FeeItem) { setEditing(item); setForm({ name: item.name, description: item.description ?? '', is_active: item.is_active }); setErr(''); setShowModal(true); }

  async function save() {
    setSaving(true); setErr('');
    try {
      if (editing) await api.put(`/api/fees/items/${editing.id}`, form);
      else await api.post('/api/fees/items', form);
      setShowModal(false); onRefresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setErr(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this fee item?')) return;
    try { await api.delete(`/api/fees/items/${id}`); onRefresh(); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error ?? 'Failed to delete.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Define categories of fees charged to students.</p>
        <button style={btnPrimary} onClick={openNew}>+ Add Fee Item</button>
      </div>
      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Loading…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name','Description','Status',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No fee items yet.</td></tr>}
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.name}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.description ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}><Pill ok={item.is_active} label={item.is_active ? 'Active' : 'Inactive'} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btnSecondary} onClick={() => openEdit(item)}>Edit</button>
                      <button style={btnDanger} onClick={() => del(item.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <Modal title={editing ? 'Edit Fee Item' : 'New Fee Item'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. School Fees" />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              <label htmlFor="is_active" style={{ fontSize: 14, cursor: 'pointer' }}>Active</label>
            </div>
            {err && <p style={{ color: '#dc2626', fontSize: 13 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Schedules ─────────────────────────────────────────────────────────────────

function SchedulesTab({ schedules, items, years, classes, loading, onRefresh, onBillsGenerated }: {
  schedules: FeeSchedule[]; items: FeeItem[]; years: AcademicYear[];
  classes: string[]; loading: boolean; onRefresh: () => void; onBillsGenerated: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FeeSchedule | null>(null);
  const [form, setForm] = useState({ fee_item_id: '', academic_year_id: '', semester: '', class_name: '', amount: '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [err, setErr] = useState('');

  function openNew() { setEditing(null); setForm({ fee_item_id: '', academic_year_id: '', semester: '', class_name: '', amount: '', due_date: '' }); setErr(''); setShowModal(true); }
  function openEdit(s: FeeSchedule) {
    setEditing(s);
    setForm({ fee_item_id: s.fee_item_id, academic_year_id: s.academic_year_id ?? '', semester: s.semester?.toString() ?? '', class_name: s.class_name ?? '', amount: s.amount, due_date: s.due_date ?? '' });
    setErr(''); setShowModal(true);
  }

  async function save() {
    setSaving(true); setErr('');
    try {
      const body = { ...form, semester: form.semester ? Number(form.semester) : null };
      if (editing) await api.put(`/api/fees/schedules/${editing.id}`, body);
      else await api.post('/api/fees/schedules', body);
      setShowModal(false); onRefresh();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setErr(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this schedule?')) return;
    try { await api.delete(`/api/fees/schedules/${id}`); onRefresh(); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error ?? 'Failed.');
    }
  }

  async function generate(id: string) {
    if (!confirm('Generate bills for all matching active students? Existing bills for this schedule will be skipped.')) return;
    setGenerating(id); setGenMsg(null);
    try {
      const r = await api.post(`/api/fees/schedules/${id}/generate`);
      setGenMsg(r.data.message); onRefresh(); onBillsGenerated();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setGenMsg(err?.response?.data?.error ?? 'Failed to generate.');
    } finally { setGenerating(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Set fee amounts per class and term, then generate bills.</p>
        <button style={btnPrimary} onClick={openNew}>+ Add Schedule</button>
      </div>
      {genMsg && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 14, color: '#166534' }}>
          {genMsg} <button style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setGenMsg(null)}>×</button>
        </div>
      )}
      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Loading…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Fee Item','Class','Year / Term','Amount','Due Date',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No schedules yet.</td></tr>}
              {schedules.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.fee_item_name}</td>
                  <td style={{ padding: '10px 12px' }}>{s.class_name ?? <span style={{ color: '#94a3b8' }}>All Classes</span>}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>
                    {[s.academic_year_name, s.semester ? `Term ${s.semester}` : null].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#15803d' }}>{fmt(s.amount)}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{s.due_date ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }} onClick={() => generate(s.id)} disabled={generating === s.id}>
                        {generating === s.id ? 'Generating…' : '⚡ Generate Bills'}
                      </button>
                      <button style={btnSecondary} onClick={() => openEdit(s)}>Edit</button>
                      <button style={btnDanger} onClick={() => del(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <Modal title={editing ? 'Edit Schedule' : 'New Fee Schedule'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Fee Item *</label>
              <select style={inputStyle} value={form.fee_item_id} onChange={e => setForm(f => ({ ...f, fee_item_id: e.target.value }))}>
                <option value="">Select fee item…</option>
                {items.filter(i => i.is_active).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Academic Year</label>
              <select style={inputStyle} value={form.academic_year_id} onChange={e => setForm(f => ({ ...f, academic_year_id: e.target.value }))}>
                <option value="">Any Year</option>
                {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Term</label>
              <select style={inputStyle} value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}>
                <option value="">Any Term</option>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Class (leave blank for all)</label>
              <select style={inputStyle} value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Amount (GH₵) *</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input style={inputStyle} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            {err && <p style={{ color: '#dc2626', fontSize: 13 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Collections ───────────────────────────────────────────────────────────────

function CollectionsTab({ items }: { items: FeeItem[] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; student_code: string; class_name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ bill_id: '', fee_item_id: '', amount: '', payment_date: new Date().toISOString().slice(0,10), payment_method: 'Cash', reference: '', notes: '' });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');

  const searchStudents = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try { const r = await api.get('/api/fees/students/search', { params: { q } }); setResults(r.data); }
    catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchStudents(query), 300);
    return () => clearTimeout(t);
  }, [query, searchStudents]);

  async function selectStudent(id: string) {
    setResults([]); setQuery(''); setLoadingSummary(true); setSelected(null);
    try { const r = await api.get(`/api/fees/student/${id}/summary`); setSelected(r.data); }
    catch { alert('Failed to load student data.'); }
    finally { setLoadingSummary(false); }
  }

  async function pay() {
    setPaying(true); setPayErr('');
    try {
      await api.post('/api/fees/payments', { student_id: selected!.student.id, ...payForm });
      setShowPayModal(false);
      const r = await api.get(`/api/fees/student/${selected!.student.id}/summary`);
      setSelected(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setPayErr(err?.response?.data?.error ?? 'Failed to record payment.');
    } finally { setPaying(false); }
  }

  async function voidPayment(id: string) {
    if (!confirm('Void this payment? This cannot be undone.')) return;
    try { await api.delete(`/api/fees/payments/${id}`); const r = await api.get(`/api/fees/student/${selected!.student.id}/summary`); setSelected(r.data); }
    catch { alert('Failed to void payment.'); }
  }

  async function deleteBill(id: string) {
    if (!confirm('Delete this bill?')) return;
    try { await api.delete(`/api/fees/bills/${id}`); const r = await api.get(`/api/fees/student/${selected!.student.id}/summary`); setSelected(r.data); }
    catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error ?? 'Failed.');
    }
  }

  return (
    <div>
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: 20 }}>
        <input style={{ ...inputStyle, paddingLeft: 36 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student by name or ID…" />
        <svg style={{ position: 'absolute', left: 10, top: 10, width: 16, height: 16, color: '#94a3b8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {searching && <p style={{ position: 'absolute', top: 40, left: 0, fontSize: 12, color: '#94a3b8' }}>Searching…</p>}
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: 38, left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 20 }}>
            {results.map(s => (
              <div key={s.id} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} onMouseDown={() => selectStudent(s.id)}>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{s.student_code} · {s.class_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loadingSummary && <p style={{ color: '#94a3b8', padding: 24 }}>Loading…</p>}

      {selected && (
        <div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 200, background: '#f8fafc', borderRadius: 12, padding: '14px 18px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontWeight: 700, fontSize: 16 }}>{selected.student.name}</p>
              <p style={{ color: '#64748b', fontSize: 13 }}>{selected.student.student_code} · {selected.student.class_name}</p>
            </div>
            {[
              { label: 'Total Billed', value: fmt(selected.total_billed), color: '#1e40af' },
              { label: 'Total Paid', value: fmt(selected.total_paid), color: '#15803d' },
              { label: 'Outstanding', value: fmt(selected.outstanding), color: selected.outstanding > 0 ? '#dc2626' : '#15803d' },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 18px', minWidth: 130 }}>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</p>
                <p style={{ fontWeight: 700, fontSize: 18, color: card.color }}>{card.value}</p>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button style={btnPrimary} onClick={() => { setPayForm({ bill_id: '', fee_item_id: '', amount: '', payment_date: new Date().toISOString().slice(0,10), payment_method: 'Cash', reference: '', notes: '' }); setPayErr(''); setShowPayModal(true); }}>
                + Record Payment
              </button>
            </div>
          </div>

          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Bills</h3>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Description','Amount','Paid','Outstanding','Due',''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.bills.length === 0 && <tr><td colSpan={6} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>No bills.</td></tr>}
                {selected.bills.map(b => {
                  const paid = Number(b.amount_paid); const owed = Number(b.amount) - paid;
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px' }}>{b.description}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(b.amount)}</td>
                      <td style={{ padding: '8px 10px', color: '#15803d' }}>{fmt(paid)}</td>
                      <td style={{ padding: '8px 10px', color: owed > 0 ? '#dc2626' : '#15803d', fontWeight: 600 }}>{fmt(owed)}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{b.due_date ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}><button style={btnDanger} onClick={() => deleteBill(b.id)}>Delete</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Payment History</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date','Amount','Method','Receipt No.','Reference','Recorded By',''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.payments.length === 0 && <tr><td colSpan={7} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>No payments.</td></tr>}
                {selected.payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px' }}>{p.payment_date}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#15803d' }}>{fmt(p.amount)}</td>
                    <td style={{ padding: '8px 10px' }}>{p.payment_method}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>{p.receipt_no ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{p.reference ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{p.recorded_by ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}><button style={btnDanger} onClick={() => voidPayment(p.id)}>Void</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!selected && !loadingSummary && (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 14 }}>Search for a student above to view their fee account.</p>
      )}

      {showPayModal && selected && (
        <Modal title="Record Payment" onClose={() => setShowPayModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Apply to Bill (optional)</label>
              <select style={inputStyle} value={payForm.bill_id} onChange={e => {
                const bill = selected.bills.find(b => b.id === e.target.value);
                const owed = bill ? (Number(bill.amount) - Number(bill.amount_paid)).toFixed(2) : '';
                setPayForm(f => ({ ...f, bill_id: e.target.value, amount: owed || f.amount, fee_item_id: bill?.fee_item_id ?? '' }));
              }}>
                <option value="">General Payment</option>
                {selected.bills.filter(b => Number(b.amount) - Number(b.amount_paid) > 0).map(b => (
                  <option key={b.id} value={b.id}>{b.description} (owing {fmt(Number(b.amount) - Number(b.amount_paid))})</option>
                ))}
              </select>
            </div>
            {!payForm.bill_id && (
              <div>
                <label style={labelStyle}>Fee Type (optional)</label>
                <select style={inputStyle} value={payForm.fee_item_id} onChange={e => setPayForm(f => ({ ...f, fee_item_id: e.target.value }))}>
                  <option value="">Unspecified</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Amount (GH₵) *</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Payment Date *</label>
              <input style={inputStyle} type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Payment Method *</label>
              <select style={inputStyle} value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reference / Transaction ID</label>
              <input style={inputStyle} value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
            {payErr && <p style={{ color: '#dc2626', fontSize: 13 }}>{payErr}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={() => setShowPayModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={pay} disabled={paying}>{paying ? 'Saving…' : 'Record Payment'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Arrears ───────────────────────────────────────────────────────────────────

function ArrearTab({ years, classes }: { years: AcademicYear[]; classes: string[] }) {
  const [filters, setFilters] = useState({ year_id: '', semester: '', class_name: '' });
  const [rows, setRows] = useState<ArrearRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function load() {
    setLoading(true); setSearched(true);
    try {
      const r = await api.get('/api/fees/reports/arrears', { params: { ...filters, semester: filters.semester || undefined } });
      setRows(r.data);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.outstanding), 0);
  const byClass = rows.reduce<Record<string, ArrearRow[]>>((acc, r) => { (acc[r.class_name] ??= []).push(r); return acc; }, {});

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Academic Year</label>
          <select style={{ ...inputStyle, width: 'auto' }} value={filters.year_id} onChange={e => setFilters(f => ({ ...f, year_id: e.target.value }))}>
            <option value="">All Years</option>
            {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Term</label>
          <select style={{ ...inputStyle, width: 'auto' }} value={filters.semester} onChange={e => setFilters(f => ({ ...f, semester: e.target.value }))}>
            <option value="">All Terms</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Class</label>
          <select style={{ ...inputStyle, width: 'auto' }} value={filters.class_name} onChange={e => setFilters(f => ({ ...f, class_name: e.target.value }))}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button style={btnPrimary} onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Generate Report'}</button>
      </div>

      {searched && !loading && (
        rows.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>No outstanding balances found.</p>
        ) : (
          <>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#dc2626' }}>Total Outstanding: {fmt(totalOutstanding)}</span>
              <span style={{ color: '#64748b', fontSize: 13 }}>{rows.length} student(s) with arrears</span>
            </div>
            {Object.entries(byClass).map(([cls, students]) => (
              <div key={cls} style={{ marginBottom: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6, padding: '6px 10px', background: '#f1f5f9', borderRadius: 6 }}>
                  {cls} — {students.length} student(s) — {fmt(students.reduce((s, r) => s + Number(r.outstanding), 0))}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Student','ID','Total Billed','Total Paid','Outstanding'].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map(s => (
                        <tr key={s.student_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.student_name}</td>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.student_code}</td>
                          <td style={{ padding: '8px 10px' }}>{fmt(s.total_billed)}</td>
                          <td style={{ padding: '8px 10px', color: '#15803d' }}>{fmt(s.total_paid)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#dc2626' }}>{fmt(s.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )
      )}
      {!searched && <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40, fontSize: 14 }}>Select filters above and click Generate Report.</p>}
    </div>
  );
}

// ── Expenditure ───────────────────────────────────────────────────────────────

function ExpenditureTab({ onExpenseChange }: { onExpenseChange: () => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', category: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState<{ income: number; expenditure: number; net: number; by_category: { category: string; total: string }[] } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const emptyForm = { category: '', description: '', amount: '', expense_date: new Date().toISOString().slice(0,10), payment_method: 'Cash', paid_to: '', reference: '', notes: '' };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/api/fees/expenses', { params: { ...filters, category: filters.category || undefined } }); setExpenses(r.data); }
    catch { setExpenses([]); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setForm(emptyForm); setErr(''); setShowModal(true); }
  function openEdit(e: Expense) {
    setEditing(e);
    setForm({ category: e.category, description: e.description, amount: e.amount, expense_date: e.expense_date, payment_method: e.payment_method, paid_to: e.paid_to ?? '', reference: e.reference ?? '', notes: e.notes ?? '' });
    setErr(''); setShowModal(true);
  }

  async function save() {
    setSaving(true); setErr('');
    try {
      if (editing) await api.put(`/api/fees/expenses/${editing.id}`, form);
      else await api.post('/api/fees/expenses', form);
      setShowModal(false); load(); onExpenseChange();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setErr(err?.response?.data?.error ?? 'Failed to save.');
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this expense record?')) return;
    try { await api.delete(`/api/fees/expenses/${id}`); load(); onExpenseChange(); }
    catch { alert('Failed to delete.'); }
  }

  async function loadSummaryData() {
    setLoadingSummary(true);
    try {
      const r = await api.get('/api/fees/reports/income-vs-expenditure', { params: { from: filters.from || undefined, to: filters.to || undefined } });
      setSummary(r.data); setShowSummary(true);
    } catch { alert('Failed to load summary.'); }
    finally { setLoadingSummary(false); }
  }

  const totalShown = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>From</label>
          <input style={{ ...inputStyle, width: 140 }} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>To</label>
          <input style={{ ...inputStyle, width: 140 }} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={{ ...inputStyle, width: 'auto' }} value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnPrimary} onClick={() => { setShowSummary(false); load(); }}>Filter</button>
          <button style={{ ...btnSecondary, background: '#f0fdf4', color: '#15803d' }} onClick={loadSummaryData} disabled={loadingSummary}>
            {loadingSummary ? 'Loading…' : '📊 Income vs. Expenditure'}
          </button>
          <button style={btnPrimary} onClick={openNew}>+ Add Expense</button>
        </div>
      </div>

      {showSummary && summary && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15 }}>Income vs. Expenditure Summary</h3>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }} onClick={() => setShowSummary(false)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Income', value: fmt(summary.income), color: '#15803d', bg: '#f0fdf4' },
              { label: 'Total Expenditure', value: fmt(summary.expenditure), color: '#dc2626', bg: '#fef2f2' },
              { label: summary.net >= 0 ? 'Surplus' : 'Deficit', value: fmt(Math.abs(summary.net)), color: summary.net >= 0 ? '#15803d' : '#dc2626', bg: summary.net >= 0 ? '#f0fdf4' : '#fef2f2' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '12px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</p>
                <p style={{ fontWeight: 700, fontSize: 18, color: c.color }}>{c.value}</p>
              </div>
            ))}
          </div>
          {summary.by_category.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>EXPENDITURE BY CATEGORY</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {summary.by_category.map(c => (
                  <div key={c.category} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ color: '#374151' }}>{c.category}: </span>
                    <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>Loading…</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Date','Category','Description','Paid To','Method','Amount',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No expenses recorded.</td></tr>}
              {expenses.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', color: '#374151' }}>{e.expense_date}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#374151' }}>{e.category}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{e.description}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{e.paid_to ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{e.payment_method}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#dc2626' }}>{fmt(e.amount)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btnSecondary} onClick={() => openEdit(e)}>Edit</button>
                      <button style={btnDanger} onClick={() => del(e.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13 }}>Total</td>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: '#dc2626', fontSize: 15 }}>{fmt(totalShown)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Expense' : 'Record Expense'} onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select category…</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Description *</label>
              <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Electricity bill for January" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Amount (GH₵) *</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input style={inputStyle} type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Payment Method</label>
                <select style={inputStyle} value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Paid To</label>
                <input style={inputStyle} value={form.paid_to} onChange={e => setForm(f => ({ ...f, paid_to: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Reference / Voucher No.</label>
              <input style={inputStyle} value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
            {err && <p style={{ color: '#dc2626', fontSize: 13 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrimaryFeesPage() {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<FeeItem[]>([]);
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(true);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try { const r = await api.get('/api/fees/items'); setItems(r.data); }
    catch { setItems([]); } finally { setLoadingItems(false); }
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try { const r = await api.get('/api/fees/schedules'); setSchedules(r.data); }
    catch { setSchedules([]); } finally { setLoadingSchedules(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try { const r = await api.get('/api/fees/stats'); setStats(r.data); } catch {}
  }, []);

  useEffect(() => {
    loadItems(); loadSchedules(); loadStats();
    api.get('/api/academic-years').then(r => setYears(r.data)).catch(() => {});
    api.get<{ id: string; class_name: string }[]>('/api/primary/classes')
      .then(r => setClasses(r.data.map(c => c.class_name)))
      .catch(() => {});
  }, [loadItems, loadSchedules, loadStats]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'items',       label: 'Fee Items' },
    { id: 'schedules',   label: 'Schedules' },
    { id: 'collections', label: 'Collections' },
    { id: 'expenditure', label: 'Expenditure' },
    { id: 'arrears',     label: 'Arrears Report' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 22, color: '#0f172a' }}>Accounts & Fees</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>Manage fee schedules, record payments, and track outstanding balances.</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Fees Collected', value: fmt(stats.total_collected), color: '#15803d', bg: '#f0fdf4' },
            { label: 'Total Expenses', value: fmt(stats.total_expenses), color: '#dc2626', bg: '#fef2f2' },
            { label: stats.net_position >= 0 ? 'Surplus' : 'Deficit', value: fmt(Math.abs(stats.net_position)),
              color: stats.net_position >= 0 ? '#15803d' : '#dc2626', bg: stats.net_position >= 0 ? '#f0fdf4' : '#fef2f2' },
            { label: 'Fees Outstanding', value: fmt(stats.outstanding), color: stats.outstanding > 0 ? '#f59e0b' : '#15803d', bg: stats.outstanding > 0 ? '#fffbeb' : '#f0fdf4' },
            { label: 'Students Billed', value: stats.students_with_bills.toLocaleString(), color: '#7c3aed', bg: '#f5f3ff' },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: '14px 18px', border: `1px solid ${c.color}22` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>{c.label}</p>
              <p style={{ fontWeight: 700, fontSize: 18, color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: 24, display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            background: 'none', borderBottom: tab === t.id ? '2px solid #15803d' : '2px solid transparent',
            color: tab === t.id ? '#15803d' : '#64748b', marginBottom: -2, whiteSpace: 'nowrap',
            transition: 'color .15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'items'       && <ItemsTab items={items} loading={loadingItems} onRefresh={loadItems} />}
      {tab === 'schedules'   && <SchedulesTab schedules={schedules} items={items} years={years} classes={classes} loading={loadingSchedules} onRefresh={loadSchedules} onBillsGenerated={loadStats} />}
      {tab === 'collections' && <CollectionsTab items={items} />}
      {tab === 'expenditure' && <ExpenditureTab onExpenseChange={loadStats} />}
      {tab === 'arrears'     && <ArrearTab years={years} classes={classes} />}
    </div>
  );
}
