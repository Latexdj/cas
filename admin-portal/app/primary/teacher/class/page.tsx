'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface MyClass {
  id: string;
  class_name: string;
  academic_year_name: string;
  student_count: number;
}
interface Student {
  id: string;
  admission_number: string;
  surname: string;
  other_names: string | null;
  sex: string | null;
  date_of_birth: string | null;
  status: string;
}

export default function PrimaryTeacherClassPage() {
  const [myClass,  setMyClass]  = useState<MyClass | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    Promise.all([
      api.get<MyClass>('/api/primary/my-class'),
      api.get<Student[]>('/api/primary/students'),
    ]).then(([cls, sts]) => {
      setMyClass(cls.data);
      setStudents(sts.data);
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const filtered = students.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.surname.toLowerCase().includes(q) || (s.other_names ?? '').toLowerCase().includes(q) || s.admission_number.toLowerCase().includes(q);
  });

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-7 h-7 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  if (!myClass) return (
    <div className="text-center py-20">
      <div className="text-4xl mb-3">📚</div>
      <p className="text-slate-600 font-medium">You have not been assigned a class yet.</p>
      <p className="text-sm text-slate-400 mt-1">Contact your school admin to get assigned.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{myClass.class_name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{myClass.academic_year_name} · {myClass.student_count} student{myClass.student_count !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…"
        className="w-full sm:w-72 border border-slate-200 rounded-lg px-3 py-2 text-sm" />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['#','Adm. No.','Name','Sex','D.O.B','Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s, i) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{s.admission_number}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{s.surname}{s.other_names ? ` ${s.other_names}` : ''}</td>
                  <td className="px-3 py-2.5 text-slate-600">{s.sex ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === 'Active' ? 'text-green-700 bg-green-50' : 'text-slate-500 bg-slate-100'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No students found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
