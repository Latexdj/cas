'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface Batch {
  id: string; exam_body: string; year: number; school_number: string | null;
  source: 'upload' | 'paste'; candidate_count: number; created_at: string; updated_at: string;
}

export default function WaecResultsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/api/admin/exam-results/batches', { params: { exam_body: 'WAEC' } });
    setBatches(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!confirm('Delete this year’s imported results? This cannot be undone.')) return;
    setDeleting(id);
    try { await api.delete(`/api/admin/exam-results/batches/${id}`); await load(); }
    finally { setDeleting(null); }
  }

  if (!batches) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WAEC Results</h1>
          <p className="text-sm text-slate-400 mt-0.5">Import a year&apos;s WASSCE results listing and generate the Regional Education Office analysis report automatically.</p>
        </div>
        <div className="flex gap-2">
          {batches.length > 0 && (
            <Link href="/waec-results/analytics"><Button variant="secondary">View Analytics</Button></Link>
          )}
          <Link href="/waec-results/import"><Button>Import New Year</Button></Link>
        </div>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center space-y-3">
          <p className="text-sm text-slate-500">No results imported yet.</p>
          <Link href="/waec-results/import"><Button>Import your first year</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 font-semibold">
              <tr>
                <th className="text-left px-4 py-2.5">Year</th>
                <th className="text-left px-4 py-2.5">Candidates</th>
                <th className="text-left px-4 py-2.5">Source</th>
                <th className="text-left px-4 py-2.5">Imported</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{b.year}</td>
                  <td className="px-4 py-3 text-slate-600">{b.candidate_count}</td>
                  <td className="px-4 py-3 text-slate-400 capitalize">{b.source}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/waec-results/${b.id}`} className="text-xs font-semibold text-[#145C44] hover:underline mr-3">View report</Link>
                    <button onClick={() => remove(b.id)} disabled={deleting === b.id} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
