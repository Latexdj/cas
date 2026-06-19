'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

interface Teacher {
  id: string; name: string; teacher_code: string; department: string; rank: string;
  unexcused: number; excused: number; total_absences: number; total_submitted: number;
}

export default function TeacherAttendancePage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [months,  setMonths]  = useState(3);
  const [data,    setData]    = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [sortBy,  setSortBy]  = useState<'unexcused' | 'total_absences' | 'total_submitted'>('unexcused');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true); setError('');
    principalApi.get(`/api/principal/teacher-attendance?months=${months}`)
      .then(r => setData(r.data.teachers ?? []))
      .catch(() => setError('Failed to load attendance data.'))
      .finally(() => setLoading(false));
  }, [months]);

  const dark = mounted && theme === 'dark';

  const filtered = data
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.teacher_code.toLowerCase().includes(search.toLowerCase()) || (t.department ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));

  const totalUnexcused = data.reduce((s, t) => s + t.unexcused, 0);
  const totalExcused   = data.reduce((s, t) => s + t.excused, 0);
  const totalSubmitted = data.reduce((s, t) => s + t.total_submitted, 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 4 }}>
          Teacher Attendance
        </h2>
        <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8' }}>
          Absence summary over the last {months} month{months !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search name, code, department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        />
        <select
          value={months}
          onChange={e => setMonths(Number(e.target.value))}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value={1}>Last 1 month</option>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value="unexcused">Sort by Unexcused</option>
          <option value="total_absences">Sort by Total Absences</option>
          <option value="total_submitted">Sort by Submissions</option>
        </select>
      </div>

      {/* Summary row */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Unexcused', value: totalUnexcused, color: '#EF4444' },
            { label: 'Total Excused',   value: totalExcused,   color: '#F59E0B' },
            { label: 'Total Submitted', value: totalSubmitted, color: '#10B981' },
            { label: 'Teachers',        value: data.length,    color: dark ? '#818CF8' : '#6366F1' },
          ].map(s => (
            <div key={s.label} style={{
              background: dark ? '#1E293B' : '#FFFFFF',
              border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
              borderRadius: 10, padding: '10px 16px', minWidth: 120, flex: 1,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: dark ? '#64748B' : '#94A3B8', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#EF4444' }}>{error}</div>
      ) : (
        <div style={{
          background: dark ? '#1E293B' : '#FFFFFF',
          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                  {['Teacher', 'Department', 'Rank', 'Unexcused', 'Excused', 'Total Absences', 'Submitted'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                      color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: dark ? '#475569' : '#94A3B8' }}>
                      No results
                    </td>
                  </tr>
                ) : filtered.map((t, i) => (
                  <tr key={t.id} style={{
                    borderBottom: i < filtered.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` : 'none',
                    background: i % 2 === 0 ? 'transparent' : (dark ? '#0F172A22' : '#F8FAFC66'),
                  }}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A' }}>{t.name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: dark ? '#64748B' : '#94A3B8' }}>{t.teacher_code}</div>
                    </td>
                    <td style={{ padding: '11px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{t.department || '—'}</td>
                    <td style={{ padding: '11px 14px', color: dark ? '#CBD5E1' : '#374151', fontSize: 12 }}>{t.rank || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontWeight: 700, fontSize: 15,
                        color: t.unexcused === 0 ? '#10B981' : t.unexcused > 5 ? '#EF4444' : '#F59E0B',
                      }}>{t.unexcused}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: t.excused > 0 ? '#F59E0B' : (dark ? '#475569' : '#94A3B8'), fontWeight: t.excused > 0 ? 600 : 400 }}>
                      {t.excused}
                    </td>
                    <td style={{ padding: '11px 14px', color: dark ? '#CBD5E1' : '#374151', fontWeight: 500 }}>{t.total_absences}</td>
                    <td style={{ padding: '11px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{t.total_submitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
