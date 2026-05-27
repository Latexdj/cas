'use client';
import { useEffect, useState, useCallback } from 'react';
import { teacherApi } from '@/lib/teacher-api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashStats {
  total_books: number; available_copies: number;
  active_loans: number; overdue_loans: number; returned_today: number;
}
interface BookCopy { id: string; copy_number: string; is_available: boolean; condition: string; }
interface Book { id: string; title: string; author: string | null; isbn: string | null; subject: string | null; available_copies: number; total_copies: number; }
interface ActiveLoan {
  id: string; book_title: string; copy_number: string;
  student_name: string; student_code: string; class_name: string;
  issued_at: string; due_date: string; is_overdue: boolean;
}
interface StudentLookup {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  loans: {
    id: string; book_title: string; author: string | null; copy_number: string;
    status: string; issued_at: string; due_date: string; returned_at: string | null;
    fine_amount: number; fine_paid: boolean; is_overdue: boolean;
  }[];
}

type Tab = 'dashboard' | 'issue' | 'return' | 'overdue';

function apiErr(err: unknown) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'An error occurred';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  useEffect(() => {
    teacherApi.get<DashStats>('/api/library/dashboard').then(r => setStats(r.data)).catch(() => {});
  }, []);
  if (!stats) return <div className="flex justify-center py-16"><div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" /></div>;
  const cards = [
    { label: 'Total Books',     value: stats.total_books,     color: '#3B82F6' },
    { label: 'Available',       value: stats.available_copies, color: '#10B981' },
    { label: 'Active Loans',    value: stats.active_loans,    color: '#F59E0B' },
    { label: 'Overdue',         value: stats.overdue_loans,   color: '#EF4444' },
    { label: 'Returned Today',  value: stats.returned_today,  color: '#8B5CF6' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">{c.label}</p>
          <p className="text-3xl font-bold mt-1" style={{ color: c.color }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Issue Book ────────────────────────────────────────────────────────────────
function IssueBook() {
  const [studentCode, setStudentCode]   = useState('');
  const [student,     setStudent]       = useState<StudentLookup | null>(null);
  const [lookingUp,   setLookingUp]     = useState(false);
  const [lookupErr,   setLookupErr]     = useState('');

  const [bookSearch, setBookSearch]     = useState('');
  const [books,      setBooks]          = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  const [selectedBook, setSelectedBook]   = useState<Book | null>(null);
  const [copies,       setCopies]         = useState<BookCopy[]>([]);
  const [selectedCopy, setSelectedCopy]   = useState<string>('');
  const [notes,        setNotes]          = useState('');
  const [issuing,      setIssuing]        = useState(false);
  const [issueMsg,     setIssueMsg]       = useState('');
  const [issueErr,     setIssueErr]       = useState('');

  async function lookupStudent() {
    if (!studentCode.trim()) return;
    setLookingUp(true); setLookupErr(''); setStudent(null);
    try {
      const { data } = await teacherApi.get<StudentLookup>(`/api/library/student/${studentCode.trim()}`);
      setStudent(data);
    } catch (err) { setLookupErr(apiErr(err)); }
    finally { setLookingUp(false); }
  }

  const searchBooks = useCallback(async (q: string) => {
    if (!q.trim()) { setBooks([]); return; }
    setLoadingBooks(true);
    try {
      const { data } = await teacherApi.get<Book[]>(`/api/library/books?search=${encodeURIComponent(q)}&available_only=true`);
      setBooks(data);
    } finally { setLoadingBooks(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchBooks(bookSearch), 400);
    return () => clearTimeout(t);
  }, [bookSearch, searchBooks]);

  async function selectBook(b: Book) {
    setSelectedBook(b); setCopies([]); setSelectedCopy('');
    try {
      const { data } = await teacherApi.get<BookCopy[]>(`/api/library-admin/books/${b.id}/copies`);
      setCopies(data.filter(c => c.is_available));
    } catch { /* ignore */ }
  }

  async function issue() {
    if (!student || !selectedCopy) return;
    setIssuing(true); setIssueErr(''); setIssueMsg('');
    try {
      await teacherApi.post('/api/library/loans/issue', {
        student_id: student.student.id, copy_id: selectedCopy, notes: notes || null,
      });
      setIssueMsg(`Book issued to ${student.student.name}`);
      setStudent(null); setStudentCode(''); setSelectedBook(null); setSelectedCopy(''); setNotes(''); setBooks([]);
    } catch (err) { setIssueErr(apiErr(err)); }
    finally { setIssuing(false); }
  }

  return (
    <div className="space-y-5">
      {issueMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-semibold flex justify-between">
          {issueMsg}
          <button onClick={() => setIssueMsg('')} className="opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {/* Step 1 — Student */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">1. Student</p>
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Student ID / code" value={studentCode}
            onChange={e => setStudentCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && lookupStudent()} />
          <button onClick={lookupStudent} disabled={lookingUp}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#15803D' }}>
            {lookingUp ? '…' : 'Find'}
          </button>
        </div>
        {lookupErr && <p className="text-sm text-red-600">{lookupErr}</p>}
        {student && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
            <span className="font-semibold text-green-800">{student.student.name}</span>
            <span className="text-green-600 ml-2">{student.student.class_name}</span>
            <span className="ml-2 text-xs text-green-500">
              {student.loans.filter(l => l.status === 'active').length} active loan(s)
            </span>
          </div>
        )}
      </div>

      {/* Step 2 — Book */}
      {student && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">2. Book</p>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Search book title or author…"
            value={bookSearch} onChange={e => { setBookSearch(e.target.value); setSelectedBook(null); }} />
          {loadingBooks && <p className="text-xs text-gray-400">Searching…</p>}
          {books.length > 0 && !selectedBook && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {books.map(b => (
                <button key={b.id} onClick={() => selectBook(b)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="font-medium text-gray-900">{b.title}</span>
                  {b.author && <span className="text-gray-500 ml-2 text-xs">{b.author}</span>}
                  <span className="ml-2 text-xs text-green-600 font-semibold">{b.available_copies} available</span>
                </button>
              ))}
            </div>
          )}
          {selectedBook && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800">
              {selectedBook.title}
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Copy */}
      {selectedBook && copies.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">3. Copy</p>
          <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            value={selectedCopy} onChange={e => setSelectedCopy(e.target.value)}>
            <option value="">Select a copy…</option>
            {copies.map(c => <option key={c.id} value={c.id}>Copy #{c.copy_number} — {c.condition}</option>)}
          </select>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          {issueErr && <p className="text-sm text-red-600">{issueErr}</p>}
          <button onClick={issue} disabled={issuing || !selectedCopy}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#15803D' }}>
            {issuing ? 'Issuing…' : 'Issue Book'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Return Book ───────────────────────────────────────────────────────────────
function ReturnBook() {
  const [search,   setSearch]   = useState('');
  const [loans,    setLoans]    = useState<ActiveLoan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [returning, setReturning] = useState<string | null>(null);
  const [msg,      setMsg]      = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const url = q ? `/api/library/loans/active?search=${encodeURIComponent(q)}` : '/api/library/loans/active';
      const { data } = await teacherApi.get<ActiveLoan[]>(url);
      setLoans(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 400);
    return () => clearTimeout(t);
  }, [search, load]);

  async function returnLoan(id: string) {
    setReturning(id); setMsg('');
    try {
      const { data } = await teacherApi.post<{ fine_amount: number; days_overdue: number }>(`/api/library/loans/${id}/return`, {});
      setMsg(data.fine_amount > 0
        ? `Returned. Fine: GH₵ ${data.fine_amount.toFixed(2)} (${data.days_overdue} day${data.days_overdue !== 1 ? 's' : ''} overdue)`
        : 'Book returned successfully');
      await load(search);
    } catch (err) { setMsg(apiErr(err)); }
    finally { setReturning(null); }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 font-semibold flex justify-between">
          {msg}
          <button onClick={() => setMsg('')} className="opacity-50 hover:opacity-100">×</button>
        </div>
      )}
      <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        placeholder="Search by student name or ID…" value={search} onChange={e => setSearch(e.target.value)} />
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" /></div>
      ) : loans.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">No active loans found.</p>
      ) : (
        <div className="space-y-2">
          {loans.map(l => (
            <div key={l.id} className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 ${l.is_overdue ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{l.book_title}</p>
                <p className="text-xs text-gray-500">Copy #{l.copy_number} · {l.student_name} ({l.student_code}) · {l.class_name}</p>
                <p className={`text-xs mt-0.5 font-medium ${l.is_overdue ? 'text-red-600' : 'text-gray-400'}`}>
                  Due: {new Date(l.due_date).toLocaleDateString('en-GB')}
                  {l.is_overdue && ' — OVERDUE'}
                </p>
              </div>
              <button onClick={() => returnLoan(l.id)} disabled={returning === l.id}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#15803D' }}>
                {returning === l.id ? '…' : 'Return'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overdue ───────────────────────────────────────────────────────────────────
function Overdue() {
  const [loans, setLoans] = useState<(ActiveLoan & { days_overdue: number })[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    teacherApi.get<(ActiveLoan & { days_overdue: number })[]>('/api/library/loans/overdue')
      .then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-4 border-red-500 border-t-transparent animate-spin" /></div>;
  if (!loans.length) return <p className="text-center text-sm text-gray-400 py-10">No overdue loans.</p>;
  return (
    <div className="space-y-2">
      {loans.map(l => (
        <div key={l.id} className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-900">{l.book_title} <span className="font-normal text-gray-500">#{l.copy_number}</span></p>
          <p className="text-xs text-gray-500 mt-0.5">{l.student_name} ({l.student_code}) · {l.class_name}</p>
          <p className="text-xs text-red-600 font-semibold mt-1">{l.days_overdue} day{l.days_overdue !== 1 ? 's' : ''} overdue · Due {new Date(l.due_date).toLocaleDateString('en-GB')}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeacherLibraryPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'issue',     label: 'Issue Book' },
    { id: 'return',    label: 'Return Book' },
    { id: 'overdue',   label: 'Overdue' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Library</h1>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'bg-green-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'issue'     && <IssueBook />}
      {tab === 'return'    && <ReturnBook />}
      {tab === 'overdue'   && <Overdue />}
    </div>
  );
}
