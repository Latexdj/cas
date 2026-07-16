'use client';
import { useEffect, useState, useCallback } from 'react';
import { teacherApi } from '@/lib/teacher-api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashStats {
  total_books: number; available_copies: number;
  active_loans: number; overdue_loans: number; returned_today: number;
}
interface BookCopy {
  id: string; copy_number: string; is_available: boolean; condition: string;
  shelf_location: string | null; status: string;
}
interface Book {
  id: string; title: string; author: string | null; isbn: string | null;
  subject: string | null; publisher: string | null; year_published: number | null;
  language: string | null; available_copies: number; total_copies: number;
}
interface ActiveLoan {
  id: string; book_title: string; copy_number: string;
  student_name: string; student_id: string; student_code: string; class_name: string;
  issued_at: string; due_date: string; is_overdue: boolean;
  fine_amount: number; fine_paid: boolean; fine_waived: boolean; renewed_count: number;
}
interface StudentLookup {
  student: { id: string; name: string; student_code: string; class_name: string; picture_url: string | null };
  loans: {
    id: string; book_title: string; author: string | null; copy_number: string;
    status: string; issued_at: string; due_date: string; returned_at: string | null;
    fine_amount: number; fine_paid: boolean; is_overdue: boolean;
  }[];
}

type Tab = 'dashboard' | 'issue' | 'return' | 'overdue' | 'catalogue';

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
    { label: 'Total Books',    value: stats.total_books,     color: '#3B82F6' },
    { label: 'Available',      value: stats.available_copies, color: '#10B981' },
    { label: 'Active Loans',   value: stats.active_loans,    color: '#F59E0B' },
    { label: 'Overdue',        value: stats.overdue_loans,   color: '#EF4444' },
    { label: 'Returned Today', value: stats.returned_today,  color: '#8B5CF6' },
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

  const [bookSearch,   setBookSearch]   = useState('');
  const [books,        setBooks]        = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [copies,       setCopies]       = useState<BookCopy[]>([]);
  const [selectedCopy, setSelectedCopy] = useState<string>('');
  const [notes,        setNotes]        = useState('');
  const [issuing,      setIssuing]      = useState(false);
  const [issueMsg,     setIssueMsg]     = useState('');
  const [issueErr,     setIssueErr]     = useState('');

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
      // Use libraryStaffOnly route — not admin-only
      const { data } = await teacherApi.get<BookCopy[]>(`/api/library/books/${b.id}/copies`);
      setCopies(data.filter(c => c.is_available && c.status === 'available'));
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
            placeholder="Search by title, author, or ISBN…"
            value={bookSearch} onChange={e => { setBookSearch(e.target.value); setSelectedBook(null); }} />
          {loadingBooks && <p className="text-xs text-gray-400">Searching…</p>}
          {books.length > 0 && !selectedBook && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {books.map(b => (
                <button key={b.id} onClick={() => selectBook(b)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="font-medium text-gray-900">{b.title}</span>
                  {b.author && <span className="text-gray-500 ml-2 text-xs">{b.author}</span>}
                  {b.isbn && <span className="text-gray-400 ml-2 text-xs">ISBN: {b.isbn}</span>}
                  <span className="ml-2 text-xs text-green-600 font-semibold">{b.available_copies} available</span>
                </button>
              ))}
            </div>
          )}
          {selectedBook && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800">
              {selectedBook.title}
              {selectedBook.author && <span className="font-normal text-blue-600 ml-2">— {selectedBook.author}</span>}
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
            {copies.map(c => (
              <option key={c.id} value={c.id}>
                Copy #{c.copy_number} — {c.condition}{c.shelf_location ? ` · ${c.shelf_location}` : ''}
              </option>
            ))}
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
      {selectedBook && copies.length === 0 && (
        <p className="text-sm text-center text-red-600 py-2">No available copies for this book.</p>
      )}
    </div>
  );
}

// ── Return Book ───────────────────────────────────────────────────────────────
function ReturnBook() {
  const [search,    setSearch]    = useState('');
  const [loans,     setLoans]     = useState<ActiveLoan[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [returning, setReturning] = useState<string | null>(null);
  const [renewing,  setRenewing]  = useState<string | null>(null);
  const [finePaying, setFinePaying] = useState<string | null>(null);
  const [waivedId,  setWaivedId]  = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [msg,       setMsg]       = useState('');
  const [msgType,   setMsgType]   = useState<'ok'|'err'>('ok');

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

  function showMsg(text: string, type: 'ok'|'err' = 'ok') {
    setMsg(text); setMsgType(type);
  }

  async function returnLoan(id: string) {
    setReturning(id); setMsg('');
    try {
      const { data } = await teacherApi.post<{ fine_amount: number; days_overdue: number }>(`/api/library/loans/${id}/return`, {});
      showMsg(data.fine_amount > 0
        ? `Returned. Fine: GH₵ ${data.fine_amount.toFixed(2)} (${data.days_overdue} day${data.days_overdue !== 1 ? 's' : ''} overdue)`
        : 'Book returned successfully');
      await load(search);
    } catch (err) { showMsg(apiErr(err), 'err'); }
    finally { setReturning(null); }
  }

  async function renewLoan(id: string) {
    setRenewing(id); setMsg('');
    try {
      const { data } = await teacherApi.post<{ new_due_date: string; renewed_count: number }>(`/api/library/loans/${id}/renew`, {});
      showMsg(`Renewed. New due date: ${new Date(data.new_due_date).toLocaleDateString('en-GB')}`);
      setLoans(prev => prev.map(l => l.id === id ? { ...l, due_date: data.new_due_date, renewed_count: data.renewed_count } : l));
    } catch (err) { showMsg(apiErr(err), 'err'); }
    finally { setRenewing(null); }
  }

  async function markFinePaid(id: string) {
    setFinePaying(id); setMsg('');
    try {
      await teacherApi.post(`/api/library/loans/${id}/fine-paid`, {});
      showMsg('Fine marked as paid.');
      setLoans(prev => prev.map(l => l.id === id ? { ...l, fine_paid: true } : l));
    } catch (err) { showMsg(apiErr(err), 'err'); }
    finally { setFinePaying(null); }
  }

  async function waiveFine(id: string) {
    setMsg('');
    try {
      await teacherApi.post(`/api/library/loans/${id}/fine-waive`, { reason: waiveReason });
      showMsg('Fine waived.');
      setLoans(prev => prev.map(l => l.id === id ? { ...l, fine_waived: true, fine_paid: true } : l));
      setWaivedId(null); setWaiveReason('');
    } catch (err) { showMsg(apiErr(err), 'err'); }
  }

  const msgBg = msgType === 'ok'
    ? 'rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800'
    : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700';

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`${msgBg} font-semibold flex justify-between`}>
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
            <div key={l.id} className={`bg-white rounded-xl border shadow-sm p-4 space-y-2 ${l.is_overdue ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{l.book_title}</p>
                  <p className="text-xs text-gray-500">Copy #{l.copy_number} · {l.student_name} ({l.student_code}) · {l.class_name}</p>
                  <p className={`text-xs mt-0.5 font-medium ${l.is_overdue ? 'text-red-600' : 'text-gray-400'}`}>
                    Due: {new Date(l.due_date).toLocaleDateString('en-GB')}
                    {l.is_overdue && ' — OVERDUE'}
                    {l.renewed_count > 0 && <span className="text-blue-500 ml-1">· Renewed ×{l.renewed_count}</span>}
                  </p>
                  {l.fine_amount > 0 && (
                    <p className={`text-xs mt-0.5 font-semibold ${l.fine_paid ? 'text-green-600' : 'text-red-600'}`}>
                      Fine: GH₵ {l.fine_amount.toFixed(2)} {l.fine_waived ? '(waived)' : l.fine_paid ? '(paid)' : '(unpaid)'}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => returnLoan(l.id)} disabled={returning === l.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: '#15803D' }}>
                    {returning === l.id ? '…' : 'Return'}
                  </button>
                  <button onClick={() => renewLoan(l.id)} disabled={renewing === l.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 disabled:opacity-50">
                    {renewing === l.id ? '…' : 'Renew'}
                  </button>
                </div>
              </div>
              {l.fine_amount > 0 && !l.fine_paid && (
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <button onClick={() => markFinePaid(l.id)} disabled={finePaying === l.id}
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50 bg-amber-500">
                    {finePaying === l.id ? '…' : 'Mark Fine Paid'}
                  </button>
                  {waivedId === l.id ? (
                    <div className="flex gap-1 flex-1">
                      <input value={waiveReason} onChange={e => setWaiveReason(e.target.value)}
                        placeholder="Reason for waiver…"
                        className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none" />
                      <button onClick={() => waiveFine(l.id)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-orange-500">Waive</button>
                      <button onClick={() => { setWaivedId(null); setWaiveReason(''); }}
                        className="px-2 py-1 rounded-lg text-xs text-gray-500">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setWaivedId(l.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 border border-orange-200 bg-orange-50">
                      Waive Fine
                    </button>
                  )}
                </div>
              )}
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
          <p className="text-xs text-red-600 font-semibold mt-1">
            {l.days_overdue} day{l.days_overdue !== 1 ? 's' : ''} overdue · Due {new Date(l.due_date).toLocaleDateString('en-GB')}
          </p>
          {l.fine_amount > 0 && (
            <p className={`text-xs mt-0.5 font-medium ${l.fine_paid ? 'text-green-600' : 'text-red-500'}`}>
              Fine: GH₵ {l.fine_amount.toFixed(2)} {l.fine_waived ? '(waived)' : l.fine_paid ? '(paid)' : '(unpaid)'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
const CATEGORIES = ['general', 'textbook', 'reference', 'fiction', 'non-fiction', 'past_question', 'local_author'];
const LANGUAGES  = ['English', 'Twi', 'Ga', 'Ewe', 'Dagbani', 'Hausa', 'French', 'Other'];
const emptyBook  = {
  title: '', author: '', isbn: '', subject: '', category: 'general', level: '',
  publisher: '', year_published: '', edition: '', language: 'English', cover_url: '',
};

function Catalogue() {
  const [books,   setBooks]   = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const [modal,  setModal]  = useState<'none'|'add'|'edit'>('none');
  const [form,   setForm]   = useState(emptyBook);
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  // Copies panel
  const [selBook,    setSelBook]    = useState<Book | null>(null);
  const [copies,     setCopies]     = useState<BookCopy[]>([]);
  const [copiesLoad, setCopiesLoad] = useState(false);
  const [newCopy,    setNewCopy]    = useState({ copy_number: '', condition: 'Good', shelf_location: '' });
  const [copySaving, setCopySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teacherApi.get<Book[]>('/api/library/books');
      setBooks(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadCopies(b: Book) {
    setSelBook(b); setCopiesLoad(true);
    try {
      const { data } = await teacherApi.get<BookCopy[]>(`/api/library/books/${b.id}/copies`);
      setCopies(data);
    } finally { setCopiesLoad(false); }
  }

  function openAdd() { setForm(emptyBook); setEditId(''); setErr(''); setModal('add'); }
  function openEdit(b: Book) {
    setForm({
      title: b.title, author: b.author ?? '', isbn: b.isbn ?? '',
      subject: b.subject ?? '', category: 'general', level: '',
      publisher: b.publisher ?? '', year_published: b.year_published ? String(b.year_published) : '',
      edition: '', language: b.language ?? 'English', cover_url: '',
    });
    setEditId(b.id); setErr(''); setModal('edit');
  }

  async function saveBook() {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        ...form,
        author: form.author || null, isbn: form.isbn || null,
        subject: form.subject || null, level: form.level || null,
        publisher: form.publisher || null,
        year_published: form.year_published ? parseInt(form.year_published) : null,
        edition: form.edition || null, cover_url: form.cover_url || null,
      };
      if (modal === 'add') {
        const { data } = await teacherApi.post<Book>('/api/library/books', payload);
        setBooks(prev => [...prev, data].sort((a, b) => a.title.localeCompare(b.title)));
      } else {
        const { data } = await teacherApi.put<Book>(`/api/library/books/${editId}`, payload);
        setBooks(prev => prev.map(b => b.id === editId ? data : b));
        if (selBook?.id === editId) setSelBook(data);
      }
      setModal('none');
    } catch (e: any) { setErr(e.response?.data?.error ?? 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function deleteBook(id: string) {
    if (!confirm('Delete this book and all its copies?')) return;
    try {
      await teacherApi.delete(`/api/library/books/${id}`);
      setBooks(prev => prev.filter(b => b.id !== id));
      if (selBook?.id === id) setSelBook(null);
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  async function addCopy() {
    if (!newCopy.copy_number.trim() || !selBook) return;
    setCopySaving(true);
    try {
      const { data } = await teacherApi.post<BookCopy>(`/api/library/books/${selBook.id}/copies`, {
        ...newCopy, shelf_location: newCopy.shelf_location || null,
      });
      setCopies(prev => [...prev, data]);
      setNewCopy({ copy_number: '', condition: 'Good', shelf_location: '' });
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to add copy'); }
    finally { setCopySaving(false); }
  }

  async function deleteCopy(copyId: string, bookId: string) {
    try {
      await teacherApi.delete(`/api/library/books/${bookId}/copies/${copyId}`);
      setCopies(prev => prev.filter(c => c.id !== copyId));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete copy'); }
  }

  async function markCopyLost(copyId: string, bookId: string) {
    if (!confirm('Mark this copy as lost? It will be removed from circulation.')) return;
    try {
      await teacherApi.put(`/api/library/books/${bookId}/copies/${copyId}`, { status: 'lost' });
      setCopies(prev => prev.map(c => c.id === copyId ? { ...c, status: 'lost', is_available: false } : c));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to update copy'); }
  }

  const filtered = books.filter(b => {
    const s = search.toLowerCase();
    return !s || b.title.toLowerCase().includes(s) || (b.author ?? '').toLowerCase().includes(s) || (b.isbn ?? '').includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title, author, or ISBN…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white shrink-0"
          style={{ background: '#15803D' }}>
          + Add Book
        </button>
      </div>

      <div className="flex gap-4">
        {/* Book list */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">No books found.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(b => (
                <div key={b.id}
                  onClick={() => loadCopies(b)}
                  className={`cursor-pointer px-4 py-3 flex items-center gap-3 transition-colors ${selBook?.id === b.id ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
                    <p className="text-xs text-gray-500">{b.author ?? 'Unknown author'}{b.isbn ? ` · ISBN: ${b.isbn}` : ''}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${b.available_copies > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {b.available_copies}/{b.total_copies}
                  </span>
                  <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(b)} className="text-xs text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => deleteBook(b.id)} className="text-xs text-red-500 hover:underline">Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Copies panel */}
        {selBook && (
          <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex justify-between items-start">
              <p className="text-sm font-semibold text-gray-900">{selBook.title}</p>
              <button onClick={() => setSelBook(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            {copiesLoad ? <div className="flex justify-center py-4"><div className="w-5 h-5 rounded-full border-4 border-green-600 border-t-transparent animate-spin" /></div> : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {copies.map(c => (
                  <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-900">#{c.copy_number}</p>
                      <p className="text-xs text-gray-500">{c.condition}{c.shelf_location ? ` · ${c.shelf_location}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        c.status === 'lost' ? 'bg-red-100 text-red-700' :
                        c.status === 'damaged' ? 'bg-orange-100 text-orange-700' :
                        c.status === 'on_loan' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {c.status === 'available' ? 'In' : c.status === 'on_loan' ? 'Out' : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                      {c.status === 'available' && (
                        <>
                          <button onClick={() => markCopyLost(c.id, selBook.id)} className="text-xs text-orange-500 hover:text-orange-700 font-medium">Lost</button>
                          <button onClick={() => deleteCopy(c.id, selBook.id)} className="text-xs text-red-500 hover:text-red-700">&times;</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {copies.length === 0 && <p className="text-xs text-gray-400">No copies yet.</p>}
              </div>
            )}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Copy</p>
              <div className="flex gap-1.5">
                <input value={newCopy.copy_number} onChange={e => setNewCopy(p => ({ ...p, copy_number: e.target.value }))}
                  placeholder="Copy #" className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none" />
                <select value={newCopy.condition} onChange={e => setNewCopy(p => ({ ...p, condition: e.target.value }))}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs bg-white">
                  {['Good','Fair','Poor'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <input value={newCopy.shelf_location} onChange={e => setNewCopy(p => ({ ...p, shelf_location: e.target.value }))}
                placeholder="Shelf location (optional)" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none" />
              <button onClick={addCopy} disabled={copySaving || !newCopy.copy_number.trim()}
                className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: '#15803D' }}>
                {copySaving ? 'Adding…' : 'Add Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">{modal === 'add' ? 'Add Book' : 'Edit Book'}</h2>
              <button onClick={() => setModal('none')} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Title *" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))}
                  placeholder="Author" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
                <input value={form.publisher} onChange={e => setForm(p => ({ ...p, publisher: e.target.value }))}
                  placeholder="Publisher" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input value={form.isbn} onChange={e => setForm(p => ({ ...p, isbn: e.target.value }))}
                  placeholder="ISBN (optional)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
                <input value={form.edition} onChange={e => setForm(p => ({ ...p, edition: e.target.value }))}
                  placeholder="Edition (e.g. 3rd)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
                <input value={form.year_published} onChange={e => setForm(p => ({ ...p, year_published: e.target.value }))}
                  placeholder="Year (e.g. 2019)" type="number" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Subject" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
                <input value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))}
                  placeholder="Level / Class" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Language</label>
                  <select value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none">
                    {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModal('none')} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200">Cancel</button>
              <button onClick={saveBook} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#15803D' }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Add Book' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeacherLibraryPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'issue',     label: 'Issue Book' },
    { id: 'return',    label: 'Return / Loans' },
    { id: 'overdue',   label: 'Overdue' },
    { id: 'catalogue', label: 'Catalogue' },
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
      {tab === 'catalogue' && <Catalogue />}
    </div>
  );
}
