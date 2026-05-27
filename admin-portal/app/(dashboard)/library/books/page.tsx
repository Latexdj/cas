'use client';
import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Book {
  id: string; title: string; author: string | null; isbn: string | null;
  subject: string | null; category: string; level: string | null;
  total_copies: number; available_copies: number; cover_url: string | null;
}
interface Copy {
  id: string; copy_number: string; condition: string; is_available: boolean;
  loan_id: string | null; borrower_name: string | null; borrower_code: string | null; due_date: string | null;
}

const CATEGORIES = ['general', 'textbook', 'reference', 'fiction', 'non-fiction', 'past_question'];

const emptyBook = { title: '', author: '', isbn: '', subject: '', category: 'general', level: '', cover_url: '' };

export default function BookCatalogPage() {
  const [books,   setBooks]   = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const [modal, setModal] = useState<'none' | 'add' | 'edit'>('none');
  const [form,  setForm]  = useState(emptyBook);
  const [editId, setEditId]  = useState('');
  const [saving, setSaving]  = useState(false);
  const [error,  setError]   = useState('');

  // Copies panel
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [copies,       setCopies]       = useState<Copy[]>([]);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [newCopy, setNewCopy] = useState({ copy_number: '', condition: 'Good' });
  const [copySaving, setCopySaving] = useState(false);

  function load() {
    setLoading(true);
    api.get<Book[]>('/api/library-admin/books', { params: { search: search || undefined } })
      .then(r => setBooks(r.data)).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function loadCopies(book: Book) {
    setSelectedBook(book); setCopiesLoading(true);
    try {
      const r = await api.get<Copy[]>(`/api/library-admin/books/${book.id}/copies`);
      setCopies(r.data);
    } catch { } finally { setCopiesLoading(false); }
  }

  function openAdd() { setForm(emptyBook); setEditId(''); setError(''); setModal('add'); }
  function openEdit(b: Book) {
    setForm({ title: b.title, author: b.author ?? '', isbn: b.isbn ?? '', subject: b.subject ?? '', category: b.category, level: b.level ?? '', cover_url: b.cover_url ?? '' });
    setEditId(b.id); setError(''); setModal('edit');
  }

  async function saveBook() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title: form.title, author: form.author || null, isbn: form.isbn || null,
        subject: form.subject || null, category: form.category, level: form.level || null,
        cover_url: form.cover_url || null,
      };
      if (modal === 'add') {
        const r = await api.post<Book>('/api/library-admin/books', payload);
        setBooks(prev => [...prev, r.data].sort((a, b) => a.title.localeCompare(b.title)));
      } else {
        const r = await api.put<Book>(`/api/library-admin/books/${editId}`, payload);
        setBooks(prev => prev.map(b => b.id === editId ? r.data : b));
        if (selectedBook?.id === editId) setSelectedBook(r.data);
      }
      setModal('none');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Failed to save');
    } finally { setSaving(false); }
  }

  async function deleteBook(id: string) {
    if (!confirm('Delete this book and all its copies?')) return;
    try {
      await api.delete(`/api/library-admin/books/${id}`);
      setBooks(prev => prev.filter(b => b.id !== id));
      if (selectedBook?.id === id) setSelectedBook(null);
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete'); }
  }

  async function addCopy() {
    if (!newCopy.copy_number.trim() || !selectedBook) return;
    setCopySaving(true);
    try {
      const r = await api.post<Copy>(`/api/library-admin/books/${selectedBook.id}/copies`, newCopy);
      setCopies(prev => [...prev, r.data]);
      setNewCopy({ copy_number: '', condition: 'Good' });
      setBooks(prev => prev.map(b => b.id === selectedBook.id ? { ...b, total_copies: b.total_copies + 1, available_copies: b.available_copies + 1 } : b));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to add copy'); }
    finally { setCopySaving(false); }
  }

  async function deleteCopy(copyId: string) {
    if (!selectedBook) return;
    try {
      await api.delete(`/api/library-admin/books/${selectedBook.id}/copies/${copyId}`);
      const removed = copies.find(c => c.id === copyId);
      setCopies(prev => prev.filter(c => c.id !== copyId));
      if (removed?.is_available) {
        setBooks(prev => prev.map(b => b.id === selectedBook.id ? { ...b, total_copies: b.total_copies - 1, available_copies: b.available_copies - 1 } : b));
      } else {
        setBooks(prev => prev.map(b => b.id === selectedBook.id ? { ...b, total_copies: b.total_copies - 1 } : b));
      }
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to delete copy'); }
  }

  const filtered = books.filter(b =>
    !search || b.title.toLowerCase().includes(search.toLowerCase()) || (b.author ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Book Catalog</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{books.length} book(s) in catalog</p>
        </div>
        <Button onClick={openAdd} size="sm">+ Add Book</Button>
      </div>

      <div className="max-w-sm">
        <Input placeholder="Search by title or author…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-5">
        {/* Book list */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No books found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide hidden md:table-cell">Subject</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">Copies</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">Avail.</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => loadCopies(b)}
                    className={`cursor-pointer transition-colors ${selectedBook?.id === b.id ? 'bg-green-50 dark:bg-green-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">{b.title}</p>
                      {b.author && <p className="text-xs text-slate-500 dark:text-slate-400">{b.author}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden md:table-cell">{b.subject ?? '—'}</td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700 dark:text-slate-300">{b.total_copies}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${b.available_copies > 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {b.available_copies}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(b)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                        <button onClick={() => deleteBook(b.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Copies panel */}
        {selectedBook && (
          <div className="w-80 flex-shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{selectedBook.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedBook.total_copies} copies</p>
              </div>
              <button onClick={() => setSelectedBook(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">&times;</button>
            </div>

            {copiesLoading ? <p className="text-sm text-slate-500">Loading…</p> : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {copies.length === 0 && <p className="text-xs text-slate-500">No copies yet.</p>}
                {copies.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">#{c.copy_number}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{c.condition}</p>
                      {!c.is_available && c.borrower_name && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Out: {c.borrower_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${c.is_available ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                        {c.is_available ? 'In' : 'Out'}
                      </span>
                      {c.is_available && (
                        <button onClick={() => deleteCopy(c.id)} className="text-xs text-red-500 hover:text-red-700">&times;</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Add Copy</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="Copy #"
                  value={newCopy.copy_number}
                  onChange={e => setNewCopy(p => ({ ...p, copy_number: e.target.value }))}
                />
                <select
                  className="rounded-lg px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600"
                  value={newCopy.condition}
                  onChange={e => setNewCopy(p => ({ ...p, condition: e.target.value }))}
                >
                  {['Good','Fair','Poor'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <Button size="sm" loading={copySaving} onClick={addCopy} className="w-full">Add Copy</Button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal !== 'none'} onClose={() => setModal('none')} title={modal === 'add' ? 'Add Book' : 'Edit Book'} maxWidth="max-w-lg">
        <div className="space-y-4">
          <Input label="Title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          <Input label="Author" value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="ISBN" value={form.isbn} onChange={e => setForm(p => ({ ...p, isbn: e.target.value }))} />
            <Input label="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</label>
              <select
                className="w-full rounded-lg px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <Input label="Level / Class" value={form.level} onChange={e => setForm(p => ({ ...p, level: e.target.value }))} />
          </div>
          <Input label="Cover URL (optional)" value={form.cover_url} onChange={e => setForm(p => ({ ...p, cover_url: e.target.value }))} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModal('none')}>Cancel</Button>
            <Button loading={saving} onClick={saveBook}>{modal === 'add' ? 'Add Book' : 'Save Changes'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
