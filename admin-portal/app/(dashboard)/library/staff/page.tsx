'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface LibraryTeacher {
  id: string; teacher_id: string; teacher_name: string; teacher_code: string;
  is_active: boolean; created_at: string;
}
interface Teacher { id: string; name: string; teacher_code: string; }

export default function LibraryStaffPage() {
  const router = useRouter();
  const [libTeachers, setLibTeachers] = useState<LibraryTeacher[]>([]);
  const [teachers,    setTeachers]    = useState<Teacher[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [adding,      setAdding]      = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<LibraryTeacher[]>('/api/school-staff/library-teachers'),
      api.get<Teacher[]>('/api/teachers'),
    ]).then(([lt, t]) => { setLibTeachers(lt.data); setTeachers(t.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function assign(teacherId: string) {
    setAdding(true);
    try {
      const r = await api.post<LibraryTeacher>('/api/school-staff/library-teachers', { teacher_id: teacherId });
      setLibTeachers(prev => [...prev, r.data]);
      setSearch('');
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to assign'); }
    finally { setAdding(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this teacher from library management?')) return;
    try {
      await api.delete(`/api/school-staff/library-teachers/${id}`);
      setLibTeachers(prev => prev.filter(t => t.id !== id));
    } catch (e: any) { alert(e.response?.data?.error ?? 'Failed to remove'); }
  }

  const assignedIds = new Set(libTeachers.map(t => t.teacher_id));
  const filtered = teachers.filter(t =>
    !assignedIds.has(t.id) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
     t.teacher_code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Library Staff</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Assign teachers to library management. For dedicated librarian accounts,
            use <button onClick={() => router.push('/staff-accounts')} className="text-green-700 dark:text-green-400 underline font-semibold">Staff Accounts</button>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Assigned library teachers */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Library Teachers ({libTeachers.length})</p>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : libTeachers.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No library teachers assigned. Search and add from the panel on the right.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {libTeachers.map(lt => (
                <div key={lt.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">{lt.teacher_name}</p>
                    <p className="text-xs text-slate-400">{lt.teacher_code}</p>
                  </div>
                  <button onClick={() => remove(lt.id)} className="text-xs text-red-500 hover:underline font-semibold">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assign panel */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Assign a Teacher</p>
          </div>
          <div className="p-3 space-y-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or teacher code…"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filtered.slice(0, 15).map(t => (
                <button key={t.id} onClick={() => assign(t.id)} disabled={adding}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.teacher_code}</p>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">
                  {teachers.length === assignedIds.size ? 'All teachers already assigned' : 'No matching teachers'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
