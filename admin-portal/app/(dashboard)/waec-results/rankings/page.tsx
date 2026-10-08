'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Batch { id: string; year: number; candidate_count: number }
interface Candidate {
  indexNumber: string; name: string; gender: string;
  grades: Record<string, string>; bestSixAggregate: number; subjectsCounted: number;
}
interface Rankings { year: number; gradePoints: Record<string, number>; subjects: string[]; candidates: Candidate[] }

export default function WaecRankingsPage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [gender, setGender] = useState('');
  const [subject, setSubject] = useState('');
  const [data, setData] = useState<Rankings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Batch[]>('/api/admin/exam-results/batches', { params: { exam_body: 'WAEC' } })
      .then(r => { setBatches(r.data); if (r.data.length) setYear(r.data[0].year); })
      .catch(() => setBatches([]));
  }, []);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get<Rankings>('/api/admin/exam-results/rankings', { params: { year: y } });
      setData(res);
    } catch {
      setError('Could not load rankings for this year.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (year !== null) load(year); }, [year, load]);

  // Gender filter always applies. When a subject is picked, candidates
  // without a scoreable grade in it drop out and ranking re-sorts by that
  // subject's grade (best first); otherwise ranking is by best-6 aggregate.
  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.candidates.filter(c => !gender || c.gender === gender);
    if (subject) {
      list = list
        .filter(c => data.gradePoints[c.grades[subject]] != null)
        .sort((a, b) => data.gradePoints[a.grades[subject]] - data.gradePoints[b.grades[subject]] || a.bestSixAggregate - b.bestSixAggregate);
    } else {
      list = [...list].sort((a, b) => a.bestSixAggregate - b.bestSixAggregate);
    }
    return list;
  }, [data, gender, subject]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Rankings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Best to worst performing students, by best-6 aggregate (or a single subject).</p>
      </div>

      {batches && batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-400">No results imported yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Year</label>
              <select value={year ?? ''} onChange={e => setYear(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                {batches?.map(b => <option key={b.id} value={b.year}>{b.year} ({b.candidate_count} candidates)</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Gender</label>
              <select value={gender} onChange={e => setGender(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">All</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Best-6 aggregate (all subjects)</option>
                {data?.subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(gender || subject) && (
              <button onClick={() => { setGender(''); setSubject(''); }} className="text-xs font-semibold text-[#145C44] hover:underline">Clear filters</button>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-10 text-center">
              <p className="text-sm text-slate-400">No candidates match this filter.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-2.5">#</th>
                    <th className="text-left px-4 py-2.5">Name</th>
                    <th className="text-left px-4 py-2.5">Index Number</th>
                    <th className="text-left px-4 py-2.5">Gender</th>
                    {subject && <th className="text-left px-4 py-2.5">{subject}</th>}
                    <th className="text-left px-4 py-2.5">Best-6 Aggregate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c, i) => (
                    <tr key={c.indexNumber}>
                      <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{c.indexNumber}</td>
                      <td className="px-4 py-2.5 text-slate-500">{c.gender}</td>
                      {subject && <td className="px-4 py-2.5 font-semibold text-slate-800">{c.grades[subject]}</td>}
                      <td className="px-4 py-2.5 font-semibold text-[#145C44]">{c.bestSixAggregate}{c.subjectsCounted < 6 && <span className="text-slate-400 font-normal"> ({c.subjectsCounted} subj.)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
