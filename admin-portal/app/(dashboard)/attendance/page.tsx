'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { AttendanceRecord, Teacher } from '@/types/api';

export default function AttendancePage() {
  const [records, setRecords]   = useState<AttendanceRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [teacherId, setTeacherId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateFrom)  params.from      = dateFrom;
      if (dateTo)    params.to        = dateTo;
      if (teacherId) params.teacherId = teacherId;
      const [r, t] = await Promise.all([
        api.get<AttendanceRecord[]>('/api/attendance', { params }),
        teachers.length ? Promise.resolve({ data: teachers }) : api.get<Teacher[]>('/api/teachers'),
      ]);
      setRecords(r.data); setTeachers(t.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, teacherId, teachers]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(e: React.FormEvent) {
    e.preventDefault(); await load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex items-end gap-3 flex-wrap">
        <Input label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        <Input label="To"   type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="w-40" />
        <div>
          <label className="text-sm font-medium text-gray-700">Teacher</label>
          <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="mt-1 w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <Button type="submit">Filter</Button>
        <Button type="button" variant="secondary" onClick={() => { setDateFrom(''); setDateTo(''); setTeacherId(''); }}>
          Clear
        </Button>
      </form>

      <p className="text-sm text-gray-500">{records.length} record{records.length !== 1 ? 's' : ''}</p>

      {loading ? (
        <div className="flex justify-center h-32 items-center">
          <div className="w-6 h-6 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Date','Teacher','Subject','Class','Periods','Topic','Location','Photo','Week'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{r.date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.teacher_name}</td>
                  <td className="px-4 py-3 text-gray-700">{r.subject}</td>
                  <td className="px-4 py-3 text-gray-700">{r.class_names}</td>
                  <td className="px-4 py-3 text-gray-700">{r.periods}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-48 truncate">{r.topic ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.location_name
                      ? <span className={`text-xs font-medium ${r.location_verified ? 'text-green-600' : 'text-yellow-600'}`}>
                          {r.location_name} {r.location_verified ? '✓' : '~'}
                        </span>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.photo_url
                      ? <a href={r.photo_url} target="_blank" rel="noopener noreferrer"
                           className="text-blue-600 hover:underline text-xs">View</a>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">Wk {r.week_number}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
