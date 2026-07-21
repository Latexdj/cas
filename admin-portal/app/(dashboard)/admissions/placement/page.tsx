'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface PlacementRow {
  id: string; index_number: string; full_name: string; gender: string;
  aggregate: number | null; programme: string; residential_status: string;
  is_registered: boolean; uploaded_at: string; total_count?: number;
}

export default function PlacementPage() {
  const [rows,     setRows]     = useState<PlacementRow[]>([]);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [uploading,setUploading]= useState(false);
  const [result,   setResult]   = useState<{ inserted: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/admissions/placement', { params: { search } });
      setRows(data.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/api/admin/admissions/placement/upload', fd);
      setResult(data); await load();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed';
      alert(msg);
    } finally { setUploading(false); }
  }

  async function del(id: string) {
    if (!confirm('Remove this student from the placement list?')) return;
    await api.delete(`/api/admin/admissions/placement/${id}`);
    load();
  }

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(rows);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placement List</h1>
          <p className="text-sm text-slate-400 mt-0.5">Upload the CSSPS placement Excel file. Columns: IndexNo, FullName, DOB, Gender, Aggregate, Programme, ResidentialStatus</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="text-sm text-slate-600" />
          <Button onClick={upload} loading={uploading}>Upload Excel</Button>
        </div>
      </div>

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 space-y-1">
          <p className="text-sm text-green-800 font-semibold">{result.inserted} record{result.inserted !== 1 ? 's' : ''} uploaded.</p>
          {result.skipped > 0 && <p className="text-xs text-amber-700">{result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped.</p>}
          {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">Row {e.row}: {e.message}</p>)}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by index or name…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        <span className="text-xs text-slate-400">{total} student{total !== 1 ? 's' : ''} on placement list</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Index No.</th>
              <Th label="Name" sortKey="full_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Gender</th>
              <Th label="Aggregate" sortKey="aggregate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400" />
              <Th label="Programme" sortKey="programme" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Residential</th>
              <Th label="Status" sortKey="is_registered" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center">
                <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No students on the placement list yet. Upload the CSSPS Excel file above.</td></tr>
            ) : (displayRows as unknown as PlacementRow[]).map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.index_number}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{r.full_name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.gender || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.aggregate ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.programme || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.residential_status || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_registered ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {r.is_registered ? 'Registered' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {!r.is_registered && (
                    <Button variant="danger" size="sm" onClick={() => del(r.id)}>Remove</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(p) => { setPageSize(p); setPage(1); }} />
    </div>
  );
}
