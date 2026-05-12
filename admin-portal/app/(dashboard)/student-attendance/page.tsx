'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { StudentAttendanceSession, StudentAttendanceRecord } from '@/types/api';

interface SessionDetail {
  session: StudentAttendanceSession & { teacher_name: string; lesson_end_time: string | null };
  records: StudentAttendanceRecord[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Present: { bg: '#DCFCE7', color: '#15803D' },
  Absent:  { bg: '#FEF2F2', color: '#DC2626' },
  Late:    { bg: '#FFFBEB', color: '#D97706' },
};

export default function StudentAttendancePage() {
  const [sessions,    setSessions]    = useState<StudentAttendanceSession[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [detail,      setDetail]      = useState<SessionDetail | null>(null);
  const [loadingDtl,  setLoadingDtl]  = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [savingId,    setSavingId]    = useState<string | null>(null);
  const [editError,   setEditError]   = useState('');

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const [from,        setFrom]        = useState(today);
  const [to,          setTo]          = useState(today);
  const [filterClass, setFilterClass] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (filterClass) params.set('class_name', filterClass);
      const res = await api.get<StudentAttendanceSession[]>(`/api/student-attendance?${params}`);
      setSessions(res.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [from, to, filterClass]);

  async function openDetail(sessionId: string) {
    setLoadingDtl(true); setDetail(null); setEditingId(null); setEditError('');
    try {
      const res = await api.get<SessionDetail>(`/api/student-attendance/session/${sessionId}`);
      setDetail(res.data);
    } finally { setLoadingDtl(false); }
  }

  async function saveStatus(recordId: string, status: string) {
    setSavingId(recordId); setEditError('');
    try {
      await api.patch(`/api/student-attendance/records/${recordId}`, { status });
      // Refresh detail
      if (detail) {
        setDetail(prev => prev ? {
          ...prev,
          records: prev.records.map(r => r.id === recordId ? { ...r, status: status as any } : r),
        } : null);
      }
      setEditingId(null);
    } catch (e: any) {
      setEditError(e?.response?.data?.error || 'Save failed');
    } finally { setSavingId(null); }
  }

  const uniqueClasses = [...new Set(sessions.map(s => s.class_name))].sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Student Attendance</h1>
        <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>Session records with per-student drill-down</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: '#64748B' }}>From</label>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold" style={{ color: '#64748B' }}>To</label>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: '#E2D9CC', color: '#0F172A' }}
          value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Sessions table */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }}>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} /></div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: '#94A3B8' }}>No sessions found for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#F8FAFC' }}>
                  {['Date', 'Class', 'Subject', 'Teacher', 'Present', 'Absent', 'Late', 'Total', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors cursor-pointer"
                    style={{ borderBottom: i < sessions.length - 1 ? '1px solid #F8FAFC' : 'none' }}
                    onClick={() => openDetail(s.id)}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#475569' }}>{s.date}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{s.class_name}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{s.subject}</td>
                    <td className="px-4 py-3" style={{ color: '#475569' }}>{s.teacher_name}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: '#15803D' }}>{s.present}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: s.absent > 0 ? '#DC2626' : '#94A3B8' }}>{s.absent}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: s.late > 0 ? '#D97706' : '#94A3B8' }}>{s.late}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#64748B' }}>{s.total}</td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#2563EB' }}>View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Session detail modal */}
      {(detail || loadingDtl) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl" style={{ border: '1px solid #E2D9CC' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <div>
                <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>
                  {detail ? `${detail.session.class_name} — ${detail.session.subject}` : 'Loading…'}
                </h2>
                {detail && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{detail.session.date} · {detail.session.teacher_name}</p>}
              </div>
              {detail && (
                <div className="flex gap-4 text-sm">
                  <span className="font-bold" style={{ color: '#15803D' }}>{detail.records.filter(r => r.status === 'Present').length} Present</span>
                  <span className="font-bold" style={{ color: '#DC2626' }}>{detail.records.filter(r => r.status === 'Absent').length} Absent</span>
                  {detail.records.filter(r => r.status === 'Late').length > 0 && (
                    <span className="font-bold" style={{ color: '#D97706' }}>{detail.records.filter(r => r.status === 'Late').length} Late</span>
                  )}
                </div>
              )}
              <button className="text-xl font-bold" style={{ color: '#94A3B8' }} onClick={() => setDetail(null)}>×</button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {loadingDtl && !detail && (
                <div className="flex justify-center py-8"><div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} /></div>
              )}
              {editError && <p className="text-sm mb-3 p-2 rounded" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>{editError}</p>}
              {detail && (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {['ID', 'Name', 'Status', ''].map(h => (
                        <th key={h} className="py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.records.map((r, i) => {
                      const sc = STATUS_COLORS[r.status];
                      const isEditing = editingId === r.id;
                      return (
                        <tr key={r.id} style={{ borderBottom: i < detail.records.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                          <td className="py-2.5 font-mono text-xs" style={{ color: '#64748B' }}>{r.student_code}</td>
                          <td className="py-2.5 font-semibold" style={{ color: '#0F172A' }}>{r.name}</td>
                          <td className="py-2.5">
                            {isEditing ? (
                              <div className="flex gap-2 items-center">
                                {['Present', 'Absent', 'Late'].map(st => (
                                  <button key={st}
                                    className="px-2 py-0.5 rounded-full text-xs font-semibold border-2 transition-all"
                                    style={{
                                      backgroundColor: r.status === st ? STATUS_COLORS[st].bg : 'transparent',
                                      color: STATUS_COLORS[st].color,
                                      borderColor: STATUS_COLORS[st].color,
                                    }}
                                    disabled={savingId === r.id}
                                    onClick={() => saveStatus(r.id, st)}
                                  >{st}</button>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: sc.bg, color: sc.color }}>{r.status}</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            {!isEditing && (
                              <button className="text-xs font-semibold" style={{ color: '#2563EB' }} onClick={() => { setEditingId(r.id); setEditError(''); }}>Edit</button>
                            )}
                            {isEditing && (
                              <button className="text-xs font-semibold" style={{ color: '#94A3B8' }} onClick={() => setEditingId(null)}>Cancel</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
