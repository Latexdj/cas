'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

type Scope = 'students' | 'teachers';

const STUDENT_TYPES = [
  { value: 'program_distribution',   label: 'Program Distribution' },
  { value: 'program_residential',    label: 'Program × Residential Status' },
  { value: 'class_distribution',     label: 'Class Distribution' },
  { value: 'house_distribution',     label: 'House Distribution' },
  { value: 'religion_distribution',  label: 'Religion Distribution' },
  { value: 'age_distribution',       label: 'Age Distribution' },
  { value: 'aggregate_distribution', label: 'Aggregate Range Distribution' },
];
const TEACHER_TYPES = [
  { value: 'gender_summary',            label: 'Gender Summary' },
  { value: 'department_distribution',   label: 'Department Distribution' },
  { value: 'rank_distribution',         label: 'GES Rank Distribution' },
  { value: 'qualification_distribution', label: 'Qualification Distribution' },
  { value: 'association_distribution',  label: 'Association Distribution' },
];

interface ReportData {
  label: string;
  columns: string[];
  keys: string[];
  rows: Record<string, string | number>[];
  totals: Record<string, string | number>;
}

export default function ReportsPage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scope,   setScope]   = useState<Scope>('students');
  const [type,    setType]    = useState('program_distribution');
  const [status,  setStatus]  = useState('active');
  const [report,  setReport]  = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => { setMounted(true); }, []);

  const types = scope === 'students' ? STUDENT_TYPES : TEACHER_TYPES;

  useEffect(() => {
    setType(types[0].value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    setLoading(true); setError(''); setReport(null);
    principalApi.get(`/api/principal/reports?scope=${scope}&type=${type}&status=${status}`)
      .then(r => setReport(r.data))
      .catch(() => setError('Failed to load report.'))
      .finally(() => setLoading(false));
  }, [scope, type, status]);

  const dark = mounted && theme === 'dark';

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>Reports</h2>
        <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8', marginTop: 2 }}>
          Read-only view of school data reports.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Scope toggle */}
        <div style={{ display: 'flex', gap: 4, background: dark ? '#334155' : '#F1F5F9', borderRadius: 10, padding: 4 }}>
          {(['students', 'teachers'] as Scope[]).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: scope === s ? '#10B981' : 'transparent',
                color: scope === s ? '#FFFFFF' : (dark ? '#94A3B8' : '#64748B'),
                transition: 'all 0.15s',
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value="active">Active Only</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#EF4444' }}>{error}</div>
      ) : report ? (
        <div style={{
          background: dark ? '#1E293B' : '#FFFFFF',
          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: dark ? '#F1F5F9' : '#0F172A' }}>
              {report.label}
            </span>
            <span style={{ fontSize: 12, color: dark ? '#64748B' : '#94A3B8' }}>
              {report.rows.length} group{report.rows.length !== 1 ? 's' : ''} · {status === 'all' ? 'All statuses' : 'Active only'}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                  {report.columns.map(c => (
                    <th key={c} style={{
                      padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                      color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${dark ? '#1E293B' : '#F1F5F9'}`,
                    background: i % 2 === 0 ? 'transparent' : (dark ? '#0F172A22' : '#F8FAFC66'),
                  }}>
                    {report.keys.map((k, ki) => (
                      <td key={k} style={{
                        padding: '10px 16px',
                        color: ki === 0
                          ? (dark ? '#F1F5F9' : '#0F172A')
                          : (dark ? '#CBD5E1' : '#374151'),
                        fontWeight: ki === 0 ? 500 : 400,
                      }}>
                        {row[k] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: dark ? '#0F172A' : '#F0FDF4', borderTop: `2px solid ${dark ? '#334155' : '#BBF7D0'}` }}>
                  {report.keys.map((k, ki) => (
                    <td key={k} style={{
                      padding: '10px 16px', fontWeight: 700,
                      color: ki === 0 ? (dark ? '#10B981' : '#15803D') : (dark ? '#F1F5F9' : '#0F172A'),
                    }}>
                      {report.totals[k] ?? '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
