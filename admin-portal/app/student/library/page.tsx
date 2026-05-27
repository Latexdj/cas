'use client';

import { useEffect, useState } from 'react';
import { studentApi } from '@/lib/student-api';
import { getStudentColors } from '@/lib/student-auth';

interface Book {
  id: string; title: string; author: string | null; subject: string | null;
  category: string; level: string | null; cover_url: string | null;
  total_copies: number; available_copies: number;
}
interface MyLoan {
  id: string; status: string; issued_at: string; due_date: string; returned_at: string | null;
  fine_amount: number; fine_paid: boolean;
  book_title: string; author: string | null; cover_url: string | null; copy_number: string;
  is_overdue: boolean;
}
interface Resource {
  id: string; title: string; subject: string | null; resource_type: string;
  academic_year: string | null; level: string | null;
  file_url: string; file_name: string; file_size_kb: number | null; download_count: number;
}

const TYPE_LABELS: Record<string, string> = { ebook: 'E-Book', past_question: 'Past Question', notes: 'Notes', other: 'Other' };
const TYPE_COLORS: Record<string, string> = {
  ebook:         'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  past_question: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  notes:         'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  other:         'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

type Tab = 'books' | 'my-loans' | 'resources';

export default function StudentLibraryPage() {
  const [tab,     setTab]     = useState<Tab>('books');
  const [primary, setPrimary] = useState('#3B82F6');

  // Books
  const [books,        setBooks]        = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [bookSearch,   setBookSearch]   = useState('');

  // My Loans
  const [loans,        setLoans]        = useState<MyLoan[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);

  // Resources
  const [resources,        setResources]        = useState<Resource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resType,          setResType]          = useState('');
  const [downloading,      setDownloading]      = useState<string | null>(null);

  useEffect(() => {
    const c = typeof window !== 'undefined' ? getStudentColors() : { primary: '#3B82F6' };
    setPrimary(c.primary);
  }, []);

  useEffect(() => {
    if (tab === 'books' && books.length === 0) {
      setBooksLoading(true);
      studentApi.get<Book[]>('/api/student/library/books')
        .then(r => setBooks(r.data)).catch(() => {}).finally(() => setBooksLoading(false));
    }
    if (tab === 'my-loans' && loans.length === 0) {
      setLoansLoading(true);
      studentApi.get<MyLoan[]>('/api/student/library/my-loans')
        .then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoansLoading(false));
    }
    if (tab === 'resources') {
      setResourcesLoading(true);
      studentApi.get<Resource[]>('/api/student/library/resources', { params: { resource_type: resType || undefined } })
        .then(r => setResources(r.data)).catch(() => {}).finally(() => setResourcesLoading(false));
    }
  }, [tab, resType]);

  async function handleDownload(resource: Resource) {
    setDownloading(resource.id);
    try {
      await studentApi.post(`/api/student/library/resources/${resource.id}/download`, {});
      setResources(prev => prev.map(r => r.id === resource.id ? { ...r, download_count: r.download_count + 1 } : r));
      window.open(resource.file_url, '_blank');
    } catch { window.open(resource.file_url, '_blank'); }
    finally { setDownloading(null); }
  }

  function formatSize(kb: number | null) {
    if (!kb) return '';
    return kb < 1024 ? `${kb}KB` : `${(kb / 1024).toFixed(1)}MB`;
  }

  const filteredBooks = books.filter(b => {
    const s = bookSearch.toLowerCase();
    return !s || b.title.toLowerCase().includes(s) || (b.author ?? '').toLowerCase().includes(s) || (b.subject ?? '').toLowerCase().includes(s);
  });

  const activeLoans   = loans.filter(l => l.status === 'active');
  const returnedLoans = loans.filter(l => l.status === 'returned');

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Library</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Browse books, view your loans, and access digital resources</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
        {([['books', 'Books'], ['my-loans', `My Loans${activeLoans.length > 0 ? ` (${activeLoans.length})` : ''}`], ['resources', 'Resources']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${tab === key ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
            style={tab === key ? { background: primary } : {}}>
            {label}
          </button>
        ))}
      </div>

      {/* Books */}
      {tab === 'books' && (
        <div className="space-y-4">
          <input
            value={bookSearch}
            onChange={e => setBookSearch(e.target.value)}
            placeholder="Search by title, author, or subject…"
            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: primary }}
          />
          {booksLoading ? <p className="text-sm text-slate-500">Loading…</p> : filteredBooks.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No books found.</p>
          ) : (
            <div className="grid gap-3">
              {filteredBooks.map(b => (
                <div key={b.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex gap-3">
                  {b.cover_url ? (
                    <img src={b.cover_url} alt="" className="w-12 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="w-6 h-6 text-slate-400">
                        <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{b.title}</p>
                    {b.author && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{b.author}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {b.subject && <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{b.subject}</span>}
                      {b.level   && <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{b.level}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${b.available_copies > 0 ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                      {b.available_copies > 0 ? `${b.available_copies} available` : 'All out'}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">{b.total_copies} total</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Loans */}
      {tab === 'my-loans' && (
        <div className="space-y-4">
          {loansLoading ? <p className="text-sm text-slate-500">Loading…</p> : loans.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">You have no loan history.</p>
          ) : (
            <>
              {activeLoans.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Active Loans</h2>
                  <div className="space-y-3">
                    {activeLoans.map(l => (
                      <div key={l.id} className={`bg-white dark:bg-slate-800 rounded-xl border p-4 ${l.is_overdue ? 'border-red-200 dark:border-red-900' : 'border-slate-100 dark:border-slate-700'}`}>
                        <div className="flex justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white text-sm">{l.book_title}</p>
                            {l.author && <p className="text-xs text-slate-500 dark:text-slate-400">{l.author}</p>}
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Copy #{l.copy_number} · Issued: {new Date(l.issued_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {l.is_overdue ? (
                              <span className="inline-block px-2 py-0.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-bold">OVERDUE</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold">Active</span>
                            )}
                            <p className={`text-xs mt-1 font-semibold ${l.is_overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                              Due: {l.due_date}
                            </p>
                          </div>
                        </div>
                        {l.fine_amount > 0 && (
                          <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-2">
                            Fine: GHS {l.fine_amount.toFixed(2)}{l.fine_paid ? ' (paid)' : ' (unpaid)'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {returnedLoans.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Return History</h2>
                  <div className="space-y-2">
                    {returnedLoans.map(l => (
                      <div key={l.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-3 flex justify-between items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{l.book_title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Returned: {l.returned_at ? new Date(l.returned_at).toLocaleDateString() : '—'}</p>
                        </div>
                        {l.fine_amount > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Fine: GHS {l.fine_amount.toFixed(2)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resources */}
      {tab === 'resources' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[{ value: '', label: 'All' }, { value: 'ebook', label: 'E-Books' }, { value: 'past_question', label: 'Past Questions' }, { value: 'notes', label: 'Notes' }].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setResType(value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${resType === value ? 'text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                style={resType === value ? { background: primary } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          {resourcesLoading ? <p className="text-sm text-slate-500">Loading…</p> : resources.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No resources available.</p>
          ) : (
            <div className="space-y-3">
              {resources.map(r => (
                <div key={r.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${primary}20` }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{r.title}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[r.resource_type]}`}>
                        {TYPE_LABELS[r.resource_type] ?? r.resource_type}
                      </span>
                      {r.subject       && <span className="text-xs text-slate-500 dark:text-slate-400">{r.subject}</span>}
                      {r.academic_year && <span className="text-xs text-slate-400 dark:text-slate-500">{r.academic_year}</span>}
                      {r.file_size_kb  && <span className="text-xs text-slate-400 dark:text-slate-500">{formatSize(r.file_size_kb)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(r)}
                    disabled={downloading === r.id}
                    className="text-xs font-semibold px-4 py-2 rounded-lg text-white shrink-0 disabled:opacity-50"
                    style={{ background: primary }}
                  >
                    {downloading === r.id ? '…' : 'Open'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
