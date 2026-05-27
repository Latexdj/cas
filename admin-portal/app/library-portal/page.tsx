'use client';

import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { getLibraryColors } from './layout';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function libApi() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cas_lib_token') : '';
  return axios.create({ baseURL: BASE, headers: { Authorization: `Bearer ${token}` } });
}

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

type Tab = 'dashboard' | 'issue' | 'return' | 'overdue';

export default function LibraryPortalPage() {
  const [tab,     setTab]     = useState<Tab>('dashboard');
  const [primary, setPrimary] = useState('#1a5c38');

  // Dashboard
  const [stats,    setStats]    = useState<DashStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Issue
  const [issueCode,   setIssueCode]   = useState('');
  const [issueStudent, setIssueStudent] = useState<StudentInfo | null>(null);
  const [issueError,  setIssueError]  = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [books,     setBooks]     = useState<Book[]>([]);
  const [copies,    setCopies]    = useState<Copy[]>([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedCopy, setSelectedCopy] = useState('');
  const [booksLoading, setBooksLoading] = useState(false);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [issuing,   setIssuing]   = useState(false);
  const [issueNote, setIssueNote] = useState('');

  // Return
  const [returnCode,    setReturnCode]    = useState('');
  const [returnStudent, setReturnStudent] = useState<StudentInfo | null>(null);
  const [returnError,   setReturnError]   = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returning,     setReturning]     = useState<string | null>(null);
  const [returnResult,  setReturnResult]  = useState<{ fine_amount: number; days_overdue: number } | null>(null);

  // Overdue
  const [overdue,    setOverdue]    = useState<OverdueLoan[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);

  useEffect(() => {
    const c = getLibraryColors();
    setPrimary(c.primary);
  }, []);

  const api = libApi();

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

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'issue') { loadBooks(); setIssueStudent(null); setIssueCode(''); }
    if (tab === 'return') { setReturnStudent(null); setReturnCode(''); }
    if (tab === 'overdue') loadOverdue();
  }, [tab]);

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
      // Admin endpoint — filter to available only in UI
      setCopies(r.data.filter((c: Copy) => c.is_available));
    } catch { } finally { setCopiesLoading(false); }
  }

  async function issueBook() {
    if (!issueStudent || !selectedCopy) return;
    setIssuing(true);
    try {
      await api.post('/api/library/loans/issue', {
        student_id: issueStudent.student.id,
        copy_id:    selectedCopy,
        notes:      issueNote || null,
      });
      setIssueStudent(null); setIssueCode(''); setSelectedBook(''); setSelectedCopy(''); setIssueNote('');
      loadBooks();
      loadDashboard();
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
      // Refresh student info
      const updated = await api.get<StudentInfo>(`/api/library/student/${returnCode.trim()}`);
      setReturnStudent(updated.data);
      loadDashboard();
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to return'); }
    finally { setReturning(null); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'issue',     label: 'Issue Book' },
    { key: 'return',    label: 'Return Book' },
    { key: 'overdue',   label: `Overdue${overdue.length > 0 ? ` (${overdue.length})` : ''}` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Library Desk</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Issue and return books, manage loans</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${tab === key ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            style={tab === key ? { background: primary } : {}}>
            {label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
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

      {/* Issue Book */}
      {tab === 'issue' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={issueCode}
              onChange={e => { setIssueCode(e.target.value.toUpperCase()); setIssueError(''); setIssueStudent(null); }}
              onKeyDown={e => e.key === 'Enter' && lookupIssue()}
              placeholder="Enter Student ID…"
              className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button onClick={lookupIssue} disabled={issueLoading || !issueCode.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: primary }}>
              {issueLoading ? '…' : 'Find'}
            </button>
          </div>
          {issueError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">{issueError}</p>}

          {issueStudent && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-500 overflow-hidden shrink-0">
                  {issueStudent.student.picture_url
                    ? <img src={issueStudent.student.picture_url} alt="" className="w-full h-full object-cover" />
                    : issueStudent.student.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">{issueStudent.student.name}</p>
                  <p className="text-xs text-slate-400">{issueStudent.student.student_code} · {issueStudent.student.class_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {issueStudent.loans.filter(l => l.status === 'active').length} active loan(s)
                  </p>
                </div>
              </div>

              {/* Book selection */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Book</label>
                  {booksLoading ? <p className="text-sm text-slate-500">Loading books…</p> : (
                    <select
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      value={selectedBook}
                      onChange={e => loadCopies(e.target.value)}
                    >
                      <option value="">— Select a book —</option>
                      {books.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title}{b.author ? ` — ${b.author}` : ''} ({b.available_copies} avail.)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedBook && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Select Copy</label>
                    {copiesLoading ? <p className="text-sm text-slate-500">Loading copies…</p> : copies.length === 0 ? (
                      <p className="text-sm text-red-500">No available copies.</p>
                    ) : (
                      <select
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        value={selectedCopy}
                        onChange={e => setSelectedCopy(e.target.value)}
                      >
                        <option value="">— Select copy —</option>
                        {copies.map(c => (
                          <option key={c.id} value={c.id}>Copy #{c.copy_number} ({c.condition})</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {selectedCopy && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1.5">Notes (optional)</label>
                    <input
                      value={issueNote}
                      onChange={e => setIssueNote(e.target.value)}
                      placeholder="Any notes…"
                      className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}

                <button
                  onClick={issueBook}
                  disabled={!selectedCopy || issuing}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                  style={{ background: primary }}
                >
                  {issuing ? 'Issuing…' : 'Issue Book'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Return Book */}
      {tab === 'return' && (
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
            <input
              value={returnCode}
              onChange={e => { setReturnCode(e.target.value.toUpperCase()); setReturnError(''); setReturnStudent(null); setReturnResult(null); }}
              onKeyDown={e => e.key === 'Enter' && lookupReturn()}
              placeholder="Enter Student ID…"
              className="flex-1 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm font-mono uppercase tracking-widest bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button onClick={lookupReturn} disabled={returnLoading || !returnCode.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: primary }}>
              {returnLoading ? '…' : 'Find'}
            </button>
          </div>
          {returnError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">{returnError}</p>}

          {returnStudent && (
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500 overflow-hidden shrink-0">
                  {returnStudent.student.picture_url
                    ? <img src={returnStudent.student.picture_url} alt="" className="w-full h-full object-cover" />
                    : returnStudent.student.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">{returnStudent.student.name}</p>
                  <p className="text-xs text-slate-400">{returnStudent.student.student_code} · {returnStudent.student.class_name}</p>
                </div>
              </div>

              {returnStudent.loans.filter(l => l.status === 'active').length === 0 ? (
                <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 text-center">No active loans.</p>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
                  {returnStudent.loans.filter(l => l.status === 'active').map(loan => (
                    <div key={loan.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{loan.book_title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Copy #{loan.copy_number} · Due: <span className={loan.is_overdue ? 'text-red-500 font-semibold' : ''}>{loan.due_date}</span></p>
                        {loan.is_overdue && <p className="text-xs text-red-500 font-semibold">OVERDUE</p>}
                      </div>
                      <button
                        onClick={() => returnLoan(loan.id)}
                        disabled={returning === loan.id}
                        className="text-xs font-semibold px-4 py-2 rounded-lg text-white shrink-0 disabled:opacity-50"
                        style={{ background: primary }}
                      >
                        {returning === loan.id ? 'Returning…' : 'Return'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Overdue */}
      {tab === 'overdue' && (
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
                  <div className="text-right shrink-0">
                    <span className="inline-block px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-bold">
                      {l.days_overdue}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
