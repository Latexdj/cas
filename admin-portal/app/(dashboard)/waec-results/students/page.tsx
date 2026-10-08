'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface SearchResult { index_number: string; name: string; gender: string; year: number }
interface StudentResult {
  year: number; indexNumber: string; name: string; gender: string;
  grades: { subjectName: string; grade: string }[];
  bestSixAggregate: number | null; subjectsCounted: number;
}

export default function WaecStudentLookupPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [student, setStudent] = useState<StudentResult | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get<SearchResult[]>('/api/admin/exam-results/students/search', { params: { q: query.trim() } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // A WAEC index number is a center number + per-year sequence, so the
  // same number is reused for a different candidate in a different year
  // — a lookup must pin down both the year and the index number together,
  // never the index number alone.
  const openStudent = useCallback(async (result: SearchResult) => {
    setSelected(result);
    setLoadingStudent(true);
    setError('');
    try {
      const { data } = await api.get<StudentResult>(`/api/admin/exam-results/students/${result.year}/${encodeURIComponent(result.index_number)}`);
      setStudent(data);
    } catch {
      setStudent(null);
      setError('Could not load this student’s results.');
    } finally {
      setLoadingStudent(false);
    }
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/waec-results" className="text-xs font-semibold text-slate-400 hover:text-slate-600">&larr; WAEC Results</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Student Lookup</h1>
        <p className="text-sm text-slate-400 mt-0.5">Search for an individual student&apos;s WASSCE results by name or index number.</p>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); setStudent(null); }}
          placeholder="Search by name or index number…"
          className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {searching && <p className="text-xs text-slate-400">Searching…</p>}

      {results && results.length === 0 && query.trim().length >= 2 && !searching && (
        <p className="text-sm text-slate-400">No matching student found.</p>
      )}

      {results && results.length > 0 && !selected && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
          {results.map(r => (
            <button key={`${r.index_number}-${r.year}`} onClick={() => openStudent(r)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                <p className="text-xs text-slate-400">{r.index_number} · {r.gender}</p>
              </div>
              <span className="text-xs font-semibold text-slate-400">{r.year}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          <button onClick={() => { setSelected(null); setStudent(null); }} className="text-xs font-semibold text-[#145C44] hover:underline">
            &larr; Back to results
          </button>

          {loadingStudent ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>
          ) : student ? (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <p className="text-lg font-bold text-slate-900">{student.name}</p>
                  <p className="text-xs text-slate-400">{student.indexNumber} · {student.gender} · WASSCE {student.year}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#145C44]">{student.bestSixAggregate ?? '—'}</p>
                  <p className="text-xs text-slate-400">Best {student.subjectsCounted} Aggregate</p>
                </div>
              </div>
              <table className="w-full text-sm mt-4">
                <thead className="text-xs text-slate-500 font-semibold">
                  <tr><th className="text-left py-1.5">Subject</th><th className="text-left py-1.5">Grade</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {student.grades.map(g => (
                    <tr key={g.subjectName}>
                      <td className="py-1.5 text-slate-700">{g.subjectName}</td>
                      <td className="py-1.5 font-semibold text-slate-800">{g.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
}
