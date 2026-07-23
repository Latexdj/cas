'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { getStaffUser, getStaffColors, getStaffToken } from './layout';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function staffApi() {
  const token = getStaffToken();
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

// ─── Clearance types ──────────────────────────────────────────────────────────
interface Office { id: string; name: string; office_type: string; sort_order: number; }
interface PendingStudent {
  student_id: string; name: string; student_code: string; class_name: string; picture_url: string | null;
  item_id: string; office_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null;
}
interface LookupResult {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  items: { item_id: string; office_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null }[];
}
interface HistoryItem {
  name: string; student_code: string; class_name: string;
  item_id: string; office_name: string; status: string; notes: string | null; actioned_at: string | null;
}

// ─── Inventory types ──────────────────────────────────────────────────────────
interface InvItem {
  id: string; name: string; item_type: string; asset_tag: string | null;
  quantity_total: number; quantity_available: number; condition: string;
  location: string | null; category_name: string | null;
}
interface InvStudent {
  id: string; name: string; student_code: string; class_name: string; picture_url: string | null;
}

// ─── Library types ────────────────────────────────────────────────────────────
interface DashStats { total_books: number; available_copies: number; active_loans: number; overdue_loans: number; returned_today: number; }
interface Book { id: string; title: string; author: string | null; subject: string | null; available_copies: number; total_copies: number; }
interface Copy { id: string; copy_number: string; condition: string; is_available: boolean; }
interface StudentInfo {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  loans: ActiveLoan[];
}
interface ActiveLoan {
  id: string; status: string; issued_at: string; due_date: string; returned_at: string | null;
  fine_amount: number; fine_paid: boolean;
  book_title: string; author: string | null; copy_number: string; is_overdue: boolean;
}
interface OverdueLoan {
  id: string; issued_at: string; due_date: string; days_overdue: number;
  book_title: string; copy_number: string;
  student_name: string; student_code: string; class_name: string;
}

const STATUS_STYLE = {
  cleared:     { badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', label: 'Cleared'     },
  not_cleared: { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',        label: 'Not Cleared' },
  pending:     { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', label: 'Pending'    },
};

type Section     = 'clearance' | 'library' | 'inventory';
type ClTab       = 'pending' | 'lookup' | 'history';
type LibTab      = 'dashboard' | 'issue' | 'return' | 'overdue';
type InvTab      = 'items' | 'issue' | 'return';

export default function StaffPortalPage() {
  const user   = typeof window !== 'undefined' ? getStaffUser() : null;
  const colors = typeof window !== 'undefined' ? getStaffColors() : { primary: '#1a5c38', logoUrl: null };
  const primary = colors.primary;
  const api    = staffApi();

  const staffRoles: string[] = user?.staffRoles ?? [];
  const hasLib  = staffRoles.includes('library');
  const hasCl   = staffRoles.includes('clearance');
  const hasInv  = staffRoles.includes('inventory');

  const defaultSection: Section = hasCl ? 'clearance' : hasLib ? 'library' : 'inventory';
  const [section, setSection] = useState<Section>(defaultSection);

  // ── Clearance state ─────────────────────────────────────────────────────────
  const [clTab,      setClTab]      = useState<ClTab>('pending');
  const [offices,    setOffices]    = useState<Office[]>([]);
  const [pending,    setPending]    = useState<PendingStudent[]>([]);
  const [history,    setHistory]    = useState<HistoryItem[]>([]);
  const [clLoading,  setClLoading]  = useState(false);
  const [officeFilter, setOfficeFilter] = useState('');

  const [lookupCode,    setLookupCode]    = useState('');
  const [lookupResult,  setLookupResult]  = useState<LookupResult | null>(null);
  const [lookupError,   setLookupError]   = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  const [action,   setAction]   = useState<{ item_id: string; office_name: string } | null>(null);
  const [acStatus, setAcStatus] = useState<'cleared' | 'not_cleared'>('cleared');
  const [acNotes,  setAcNotes]  = useState('');
  const [acSaving, setAcSaving] = useState(false);
  const [acError,  setAcError]  = useState('');

  // ── Library state ────────────────────────────────────────────────────────────
  const [libTab,      setLibTab]      = useState<LibTab>('dashboard');
  const [stats,       setStats]       = useState<DashStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [issueCode,    setIssueCode]    = useState('');
  const [issueStudent, setIssueStudent] = useState<StudentInfo | null>(null);
  const [issueError,   setIssueError]   = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [books,        setBooks]        = useState<Book[]>([]);
  const [copies,       setCopies]       = useState<Copy[]>([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedCopy, setSelectedCopy] = useState('');
  const [booksLoading, setBooksLoading] = useState(false);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [issuing,      setIssuing]      = useState(false);
  const [issueNote,    setIssueNote]    = useState('');

  const [returnCode,    setReturnCode]    = useState('');
  const [returnStudent, setReturnStudent] = useState<StudentInfo | null>(null);
  const [returnError,   setReturnError]   = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returning,     setReturning]     = useState<string | null>(null);
  const [returnResult,  setReturnResult]  = useState<{ fine_amount: number; days_overdue: number } | null>(null);

  const [overdue,       setOverdue]       = useState<OverdueLoan[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);

  // ── Inventory state ──────────────────────────────────────────────────────────
  const [invTab,          setInvTab]          = useState<InvTab>('items');
  const [invItems,        setInvItems]        = useState<InvItem[]>([]);
  const [invLoading,      setInvLoading]      = useState(false);

  // Issue
  const [invIssueCode,    setInvIssueCode]    = useState('');
  const [invIssueStudent, setInvIssueStudent] = useState<InvStudent | null>(null);
  const [invIssueStudErr, setInvIssueStudErr] = useState('');
  const [invIssueStudLoad,setInvIssueStudLoad]= useState(false);
  const [invIssueItem,    setInvIssueItem]    = useState('');
  const [invIssueQty,     setInvIssueQty]     = useState('1');
  const [invIssueNotes,   setInvIssueNotes]   = useState('');
  const [invIssuing,      setInvIssuing]      = useState(false);
  const [invIssueErr,     setInvIssueErr]     = useState('');

  // Return
  const [invReturnItem,   setInvReturnItem]   = useState('');
  const [invReturnQty,    setInvReturnQty]    = useState('1');
  const [invReturnCond,   setInvReturnCond]   = useState('Good');
  const [invReturnNotes,  setInvReturnNotes]  = useState('');
  const [invReturning,    setInvReturning]    = useState(false);
  const [invReturnErr,    setInvReturnErr]    = useState('');
  const [invReturnOk,     setInvReturnOk]     = useState(false);

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasCl) return;
    setClLoading(true);
    Promise.all([
      api.get<Office[]>('/api/clearance/my-offices'),
      api.get<PendingStudent[]>('/api/clearance/pending'),
      api.get<HistoryItem[]>('/api/clearance/history'),
    ]).then(([o, p, h]) => { setOffices(o.data); setPending(p.data); setHistory(h.data); })
      .catch(() => {}).finally(() => setClLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (section === 'library' && libTab === 'dashboard') loadDashboard();
    if (section === 'library' && libTab === 'issue') { loadBooks(); setIssueStudent(null); setIssueCode(''); }
    if (section === 'library' && libTab === 'return') { setReturnStudent(null); setReturnCode(''); }
    if (section === 'library' && libTab === 'overdue') loadOverdue();
    if (section === 'inventory') loadInvItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, libTab, invTab]);

  // ── Clearance helpers ─────────────────────────────────────────────────────────
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupCode.trim()) return;
    setLookupLoading(true); setLookupError(''); setLookupResult(null);
    try {
      const r = await api.get<LookupResult>(`/api/clearance/student/${lookupCode.trim()}`);
      setLookupResult(r.data);
    } catch { setLookupError('Student not found.'); }
    finally { setLookupLoading(false); }
  }

  function openAction(item_id: string, office_name: string) {
    setAction({ item_id, office_name });
    setAcStatus('cleared'); setAcNotes(''); setAcError('');
  }

  async function submitAction() {
    if (!action) return;
    if (acStatus === 'not_cleared' && !acNotes.trim()) { setAcError('A reason is required when marking as not cleared.'); return; }
    setAcSaving(true); setAcError('');
    try {
      await api.post('/api/clearance/action', { item_id: action.item_id, status: acStatus, notes: acNotes.trim() || null });
      setAction(null);
      const [p, h] = await Promise.all([
        api.get<PendingStudent[]>('/api/clearance/pending'),
        api.get<HistoryItem[]>('/api/clearance/history'),
      ]);
      setPending(p.data); setHistory(h.data);
      if (lookupResult) {
        setLookupResult(prev => prev ? {
          ...prev,
          items: prev.items.map(i => i.item_id === action.item_id
            ? { ...i, status: acStatus, notes: acNotes.trim() || null, actioned_at: new Date().toISOString() }
            : i),
        } : null);
      }
    } catch (err: unknown) {
      setAcError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Action failed');
    } finally { setAcSaving(false); }
  }

  // ── Library helpers ───────────────────────────────────────────────────────────
  function loadDashboard() {
    setStatsLoading(true);
    api.get<DashStats>('/api/library/dashboard')
      .then(r => setStats(r.data)).catch(() => {}).finally(() => setStatsLoading(false));
  }

  function loadBooks() {
    setBooksLoading(true);
    api.get<Book[]>('/api/library/books', { params: { available_only: 'true' } })
      .then(r => setBooks(r.data)).catch(() => {}).finally(() => setBooksLoading(false));
  }

  function loadOverdue() {
    setOverdueLoading(true);
    api.get<OverdueLoan[]>('/api/library/loans/overdue')
      .then(r => setOverdue(r.data)).catch(() => {}).finally(() => setOverdueLoading(false));
  }

  async function lookupIssue() {
    if (!issueCode.trim()) return;
    setIssueLoading(true); setIssueError(''); setIssueStudent(null);
    try {
      const r = await api.get<StudentInfo>(`/api/library/student/${issueCode.trim()}`);
      setIssueStudent(r.data);
    } catch { setIssueError('Student not found.'); }
    finally { setIssueLoading(false); }
  }

  async function loadCopies(bookId: string) {
    setSelectedBook(bookId); setSelectedCopy(''); setCopies([]);
    if (!bookId) return;
    setCopiesLoading(true);
    try {
      const r = await api.get<Copy[]>(`/api/library-admin/books/${bookId}/copies`);
      setCopies(r.data.filter((c: Copy) => c.is_available));
    } catch { } finally { setCopiesLoading(false); }
  }

  async function issueBook() {
    if (!issueStudent || !selectedCopy) return;
    setIssuing(true);
    try {
      await api.post('/api/library/loans/issue', {
        student_id: issueStudent.student.id, copy_id: selectedCopy, notes: issueNote || null,
      });
      setIssueStudent(null); setIssueCode(''); setSelectedBook(''); setSelectedCopy(''); setIssueNote('');
      loadBooks(); loadDashboard();
      alert('Book issued successfully!');
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to issue'); }
    finally { setIssuing(false); }
  }

  async function lookupReturn() {
    if (!returnCode.trim()) return;
    setReturnLoading(true); setReturnError(''); setReturnStudent(null); setReturnResult(null);
    try {
      const r = await api.get<StudentInfo>(`/api/library/student/${returnCode.trim()}`);
      setReturnStudent(r.data);
    } catch { setReturnError('Student not found.'); }
    finally { setReturnLoading(false); }
  }

  async function returnLoan(loanId: string) {
    setReturning(loanId);
    try {
      const r = await api.post<{ ok: boolean; fine_amount: number; days_overdue: number }>(`/api/library/loans/${loanId}/return`, {});
      setReturnResult(r.data);
      const updated = await api.get<StudentInfo>(`/api/library/student/${returnCode.trim()}`);
      setReturnStudent(updated.data);
      loadDashboard();
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to return'); }
    finally { setReturning(null); }
  }

  // ── Inventory helpers ─────────────────────────────────────────────────────────
  function loadInvItems() {
    setInvLoading(true);
    api.get<InvItem[]>('/api/inventory/items')
      .then(r => setInvItems(r.data)).catch(() => {}).finally(() => setInvLoading(false));
  }

  async function lookupInvStudent() {
    if (!invIssueCode.trim()) return;
    setInvIssueStudLoad(true); setInvIssueStudErr(''); setInvIssueStudent(null);
    try {
      const r = await api.get<InvStudent>(`/api/inventory/students/${invIssueCode.trim()}`);
      setInvIssueStudent(r.data);
    } catch { setInvIssueStudErr('Student not found.'); }
    finally { setInvIssueStudLoad(false); }
  }

  async function submitInvIssue() {
    if (!invIssueStudent || !invIssueItem) return;
    const item = invItems.find(i => i.id === invIssueItem);
    if (!item) return;
    setInvIssuing(true); setInvIssueErr('');
    try {
      await api.post(`/api/inventory/items/${invIssueItem}/issue`, {
        issued_to_name: invIssueStudent.name,
        issued_to_type: 'student',
        student_id: invIssueStudent.id,
        quantity: parseInt(invIssueQty) || 1,
        notes: invIssueNotes || null,
      });
      setInvIssueStudent(null); setInvIssueCode(''); setInvIssueItem(''); setInvIssueQty('1'); setInvIssueNotes('');
      loadInvItems();
    } catch (e: any) { setInvIssueErr(e.response?.data?.error ?? 'Failed to issue'); }
    finally { setInvIssuing(false); }
  }

  async function submitInvReturn() {
    if (!invReturnItem) return;
    setInvReturning(true); setInvReturnErr(''); setInvReturnOk(false);
    try {
      await api.post(`/api/inventory/items/${invReturnItem}/return`, {
        quantity: parseInt(invReturnQty) || 1,
        condition: invReturnCond,
        notes: invReturnNotes || null,
      });
      setInvReturnOk(true); setInvReturnItem(''); setInvReturnQty('1'); setInvReturnCond('Good'); setInvReturnNotes('');
      loadInvItems();
    } catch (e: any) { setInvReturnErr(e.response?.data?.error ?? 'Failed to process return'); }
    finally { setInvReturning(false); }
  }

  const filteredPending = officeFilter ? pending.filter(p => p.office_id === officeFilter) : pending;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">
          {user?.name ?? 'Staff'}&apos;s Desk
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {staffRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(' & ')} Portal
        </p>
      </div>

      {/* Section switcher (shown when user has more than one role) */}
      {([hasCl, hasLib, hasInv].filter(Boolean).length > 1) && (
        <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
          {([hasCl && 'clearance', hasLib && 'library', hasInv && 'inventory'] as (Section | false)[])
            .filter((s): s is Section => !!s)
            .map(s => (
              <button key={s} onClick={() => setSection(s)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${section === s ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                style={section === s ? { background: primary } : {}}>
                {s === 'clearance' ? 'Clearance' : s === 'library' ? 'Library' : 'Inventory'}
              </button>
            ))}
        </div>
      )}

      {/* ── Clearance Section ─────────────────────────────────────────────── */}
      {hasCl && section === 'clearance' && (
        <div className="space-y-4">
          {offices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {offices.map(o => (
                <span key={o.id} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: `${primary}20`, color: primary }}>{o.name}</span>
              ))}
            </div>
          )}

          <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
            {([['pending', `Pending${pending.length > 0 ? ` (${pending.length})` : ''}`], ['lookup', 'Student Lookup'], ['history', 'History']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setClTab(key)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${clTab === key ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                style={clTab === key ? { background: primary } : {}}>
                {label}
              </button>
            ))}
          </div>

          {clLoading && <div className="flex justify-center py-10"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} /></div>}

          {!clLoading && clTab === 'pending' && (
            <div className="space-y-3">
              {offices.length > 1 && (
                <select value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}
                  className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none w-full">
                  <option value="">All my offices</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              {filteredPending.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 text-sm">No pending students — all caught up!</div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredPending.map(s => (
                    <div key={s.item_id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 text-sm font-bold text-slate-500 overflow-hidden">
                        {s.picture_url ? <img src={s.picture_url} alt="" className="w-full h-full object-cover" /> : s.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.student_code} · {s.class_name}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[s.status as keyof typeof STATUS_STYLE]?.badge ?? 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_STYLE[s.status as keyof typeof STATUS_STYLE]?.label ?? s.status}
                      </span>
                      <button onClick={() => openAction(s.item_id, s.office_name)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white shrink-0" style={{ background: primary }}>
                        Action
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!clLoading && clTab === 'lookup' && (
            <div className="space-y-4">
              <form onSubmit={handleLookup} className="flex gap-2">
                <input value={lookupCode}
                  onChange={e => { setLookupCode(e.target.value.toUpperCase()); setLookupError(''); setLookupResult(null); }}
                  placeholder="Enter Student ID…" maxLength={20}
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono uppercase tracking-widest bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button type="submit" disabled={lookupLoading || !lookupCode.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                  {lookupLoading ? '…' : 'Search'}
                </button>
              </form>
              {lookupError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">{lookupError}</p>}
              {lookupResult && (
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-500 overflow-hidden shrink-0">
                      {lookupResult.student.picture_url
                        ? <img src={lookupResult.student.picture_url} alt="" className="w-full h-full object-cover" />
                        : lookupResult.student.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{lookupResult.student.name}</p>
                      <p className="text-xs text-slate-400">{lookupResult.student.student_code} · {lookupResult.student.class_name}</p>
                    </div>
                  </div>
                  {lookupResult.items.length === 0
                    ? <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 text-sm">No clearance items for your office.</div>
                    : lookupResult.items.map(item => {
                      const st = STATUS_STYLE[item.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.pending;
                      return (
                        <div key={item.item_id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-white text-sm">{item.office_name}</p>
                            {item.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                            <button onClick={() => openAction(item.item_id, item.office_name)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: primary }}>
                              Action
                            </button>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
          )}

          {!clLoading && clTab === 'history' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {history.length === 0
                ? <div className="p-10 text-center text-slate-400 text-sm">No actions yet.</div>
                : <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {history.map((h, i) => {
                      const st = STATUS_STYLE[h.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.pending;
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{h.name}</p>
                            <p className="text-xs text-slate-400">{h.student_code} · {h.class_name}</p>
                            {h.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{h.notes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                            {h.actioned_at && <p className="text-[10px] text-slate-400 mt-1">{new Date(h.actioned_at).toLocaleDateString()}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          )}
        </div>
      )}

      {/* ── Library Section ───────────────────────────────────────────────── */}
      {hasLib && section === 'library' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
            {([
              ['dashboard', 'Dashboard'],
              ['issue',     'Issue Book'],
              ['return',    'Return Book'],
              ['overdue',   `Overdue${overdue.length > 0 ? ` (${overdue.length})` : ''}`],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setLibTab(key)}
                className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${libTab === key ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                style={libTab === key ? { background: primary } : {}}>
                {label}
              </button>
            ))}
          </div>

          {libTab === 'dashboard' && (
            <div className="space-y-4">
              {statsLoading ? <p className="text-sm text-slate-500">Loading…</p> : stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Books',    value: stats.total_books,      color: primary },
                    { label: 'Available',      value: stats.available_copies, color: '#16A34A' },
                    { label: 'Active Loans',   value: stats.active_loans,     color: primary },
                    { label: 'Overdue',        value: stats.overdue_loans,    color: '#DC2626' },
                    { label: 'Returned Today', value: stats.returned_today,   color: '#0891B2' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: color }} />
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {libTab === 'issue' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input value={issueCode}
                  onChange={e => { setIssueCode(e.target.value.toUpperCase()); setIssueError(''); setIssueStudent(null); }}
                  onKeyDown={e => e.key === 'Enter' && lookupIssue()}
                  placeholder="Enter Student ID…"
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={lookupIssue} disabled={issueLoading || !issueCode.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                  {issueLoading ? '…' : 'Find'}
                </button>
              </div>
              {issueError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">{issueError}</p>}
              {issueStudent && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-500 overflow-hidden shrink-0">
                      {issueStudent.student.picture_url
                        ? <img src={issueStudent.student.picture_url} alt="" className="w-full h-full object-cover" />
                        : issueStudent.student.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{issueStudent.student.name}</p>
                      <p className="text-xs text-slate-400">{issueStudent.student.student_code} · {issueStudent.student.class_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{issueStudent.loans.filter(l => l.status === 'active').length} active loan(s)</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Book</label>
                      {booksLoading ? <p className="text-sm text-slate-500">Loading books…</p> : (
                        <select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          value={selectedBook} onChange={e => loadCopies(e.target.value)}>
                          <option value="">— Select a book —</option>
                          {books.map(b => <option key={b.id} value={b.id}>{b.title}{b.author ? ` — ${b.author}` : ''} ({b.available_copies} avail.)</option>)}
                        </select>
                      )}
                    </div>
                    {selectedBook && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Copy</label>
                        {copiesLoading ? <p className="text-sm text-slate-500">Loading copies…</p> : copies.length === 0
                          ? <p className="text-sm text-red-500">No available copies.</p>
                          : (
                            <select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                              value={selectedCopy} onChange={e => setSelectedCopy(e.target.value)}>
                              <option value="">— Select copy —</option>
                              {copies.map(c => <option key={c.id} value={c.id}>Copy #{c.copy_number} ({c.condition})</option>)}
                            </select>
                          )
                        }
                      </div>
                    )}
                    {selectedCopy && (
                      <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Notes (optional)</label>
                        <input value={issueNote} onChange={e => setIssueNote(e.target.value)} placeholder="Any notes…"
                          className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                    )}
                    <button onClick={issueBook} disabled={!selectedCopy || issuing}
                      className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                      {issuing ? 'Issuing…' : 'Issue Book'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {libTab === 'return' && (
            <div className="space-y-4">
              {returnResult && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-xl p-4">
                  <p className="font-semibold text-green-800 dark:text-green-300">Book returned successfully!</p>
                  {returnResult.fine_amount > 0 && (
                    <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                      Fine charged: <strong>GHS {returnResult.fine_amount.toFixed(2)}</strong> ({returnResult.days_overdue} days overdue)
                    </p>
                  )}
                  <button className="text-xs text-green-700 dark:text-green-400 underline mt-1" onClick={() => setReturnResult(null)}>Dismiss</button>
                </div>
              )}
              <div className="flex gap-2">
                <input value={returnCode}
                  onChange={e => { setReturnCode(e.target.value.toUpperCase()); setReturnError(''); setReturnStudent(null); setReturnResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && lookupReturn()}
                  placeholder="Enter Student ID…"
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={lookupReturn} disabled={returnLoading || !returnCode.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                  {returnLoading ? '…' : 'Find'}
                </button>
              </div>
              {returnError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">{returnError}</p>}
              {returnStudent && (
                <div className="space-y-3">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-500 overflow-hidden shrink-0">
                      {returnStudent.student.picture_url
                        ? <img src={returnStudent.student.picture_url} alt="" className="w-full h-full object-cover" />
                        : returnStudent.student.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{returnStudent.student.name}</p>
                      <p className="text-xs text-slate-400">{returnStudent.student.student_code} · {returnStudent.student.class_name}</p>
                    </div>
                  </div>
                  {returnStudent.loans.filter(l => l.status === 'active').length === 0
                    ? <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 text-center">No active loans.</p>
                    : (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                        {returnStudent.loans.filter(l => l.status === 'active').map(loan => (
                          <div key={loan.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{loan.book_title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Copy #{loan.copy_number} · Due: <span className={loan.is_overdue ? 'text-red-500 font-semibold' : ''}>{loan.due_date}</span>
                              </p>
                              {loan.is_overdue && <p className="text-xs text-red-500 font-semibold">OVERDUE</p>}
                            </div>
                            <button onClick={() => returnLoan(loan.id)} disabled={returning === loan.id}
                              className="text-xs font-semibold px-4 py-2 rounded-lg text-white shrink-0 disabled:opacity-50" style={{ background: primary }}>
                              {returning === loan.id ? 'Returning…' : 'Return'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              )}
            </div>
          )}

          {libTab === 'overdue' && (
            <div className="space-y-3">
              {overdueLoading ? <p className="text-sm text-slate-500">Loading…</p> : overdue.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 text-sm">No overdue books.</div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                  {overdue.map(l => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{l.book_title} · #{l.copy_number}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{l.student_name} · {l.student_code} · {l.class_name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Due: {l.due_date}</p>
                      </div>
                      <span className="inline-block px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-bold">
                        {l.days_overdue}d
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Inventory Section ─────────────────────────────────────────────── */}
      {hasInv && section === 'inventory' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
            {([['items', 'Items'], ['issue', 'Issue'], ['return', 'Return']] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setInvTab(key); setInvReturnOk(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${invTab === key ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                style={invTab === key ? { background: primary } : {}}>
                {label}
              </button>
            ))}
          </div>

          {invLoading && <div className="flex justify-center py-10"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: primary, borderTopColor: 'transparent' }} /></div>}

          {/* Items list */}
          {invTab === 'items' && !invLoading && (
            <div>
              {invItems.length === 0
                ? <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400 text-sm">No inventory items found.</div>
                : <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                    {invItems.map(item => {
                      const issued = item.quantity_total - item.quantity_available;
                      return (
                        <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{item.name}</p>
                            <p className="text-xs text-slate-400">{item.category_name ?? item.item_type}{item.asset_tag ? ` · ${item.asset_tag}` : ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.quantity_available} <span className="font-normal text-slate-400">/ {item.quantity_total}</span></p>
                            {issued > 0 && <p className="text-xs text-amber-600">{issued} out</p>}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${item.condition === 'Good' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : item.condition === 'Damaged' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {item.condition}
                          </span>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          )}

          {/* Issue */}
          {invTab === 'issue' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input value={invIssueCode}
                  onChange={e => { setInvIssueCode(e.target.value.toUpperCase()); setInvIssueStudent(null); setInvIssueStudErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && lookupInvStudent()}
                  placeholder="Enter Student ID…"
                  className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={lookupInvStudent} disabled={invIssueStudLoad || !invIssueCode.trim()}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                  {invIssueStudLoad ? '…' : 'Find'}
                </button>
              </div>
              {invIssueStudErr && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">{invIssueStudErr}</p>}
              {invIssueStudent && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-500 overflow-hidden shrink-0">
                      {invIssueStudent.picture_url ? <img src={invIssueStudent.picture_url} alt="" className="w-full h-full object-cover" /> : invIssueStudent.name[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">{invIssueStudent.name}</p>
                      <p className="text-xs text-slate-400">{invIssueStudent.student_code} · {invIssueStudent.class_name}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Item</label>
                      <select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                        value={invIssueItem} onChange={e => { setInvIssueItem(e.target.value); setInvIssueQty('1'); }}>
                        <option value="">— Select item —</option>
                        {invItems.filter(i => i.quantity_available > 0 && i.condition !== 'Written Off').map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.quantity_available} avail.)</option>
                        ))}
                      </select>
                    </div>
                    {invIssueItem && (
                      <>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Quantity</label>
                          <input type="number" min="1"
                            max={invItems.find(i => i.id === invIssueItem)?.quantity_available ?? 1}
                            value={invIssueQty} onChange={e => setInvIssueQty(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Notes (optional)</label>
                          <input value={invIssueNotes} onChange={e => setInvIssueNotes(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none" />
                        </div>
                      </>
                    )}
                    {invIssueErr && <p className="text-sm text-red-500">{invIssueErr}</p>}
                    <button onClick={submitInvIssue} disabled={!invIssueItem || invIssuing}
                      className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
                      {invIssuing ? 'Issuing…' : 'Issue Item'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Return */}
          {invTab === 'return' && (
            <div className="space-y-4">
              {invReturnOk && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-xl p-4">
                  <p className="font-semibold text-green-800 dark:text-green-300">Item returned successfully!</p>
                  <button className="text-xs text-green-700 dark:text-green-400 underline mt-1" onClick={() => setInvReturnOk(false)}>Dismiss</button>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Item to Return</label>
                  <select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    value={invReturnItem} onChange={e => { setInvReturnItem(e.target.value); setInvReturnQty('1'); setInvReturnErr(''); }}>
                    <option value="">— Select item —</option>
                    {invItems.filter(i => i.quantity_available < i.quantity_total).map(i => {
                      const out = i.quantity_total - i.quantity_available;
                      return <option key={i.id} value={i.id}>{i.name} ({out} out)</option>;
                    })}
                  </select>
                </div>
                {invReturnItem && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Quantity Returned</label>
                      <input type="number" min="1"
                        max={(() => { const it = invItems.find(i => i.id === invReturnItem); return it ? it.quantity_total - it.quantity_available : 1; })()}
                        value={invReturnQty} onChange={e => setInvReturnQty(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Returned Condition</label>
                      <select value={invReturnCond} onChange={e => setInvReturnCond(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none">
                        <option value="Good">Good</option>
                        <option value="Damaged">Damaged</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Notes (optional)</label>
                      <input value={invReturnNotes} onChange={e => setInvReturnNotes(e.target.value)}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none" />
                    </div>
                  </>
                )}
                {invReturnErr && <p className="text-sm text-red-500">{invReturnErr}</p>}
                <button onClick={submitInvReturn} disabled={!invReturnItem || invReturning}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 bg-green-600">
                  {invReturning ? 'Processing…' : 'Confirm Return'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Clearance Action Modal ─────────────────────────────────────────── */}
      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <p className="font-bold text-slate-800 dark:text-white">Clearance Action</p>
              <button onClick={() => setAction(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">Office: <span className="font-semibold text-slate-700 dark:text-slate-200">{action.office_name}</span></p>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAcStatus('cleared')}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${acStatus === 'cleared' ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}>
                    Cleared
                  </button>
                  <button onClick={() => setAcStatus('not_cleared')}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${acStatus === 'not_cleared' ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}>
                    Not Cleared
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Reason / Notes {acStatus === 'not_cleared' && <span className="text-red-500">*</span>}
                </label>
                <textarea value={acNotes} onChange={e => { setAcNotes(e.target.value); setAcError(''); }} rows={3}
                  placeholder={acStatus === 'not_cleared' ? 'Required — state the reason clearly…' : 'Optional notes…'}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              {acError && <p className="text-sm text-red-600">{acError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">Cancel</button>
                <button onClick={submitAction} disabled={acSaving || (acStatus === 'not_cleared' && !acNotes.trim())}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 ${acStatus === 'not_cleared' ? 'bg-red-600' : 'bg-green-600'}`}>
                  {acSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
