'use client';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';

type Scope = 'students' | 'teachers';

interface Student {
  student_code: string; name: string; class_name: string; program_name?: string; status: string;
  gender?: string; date_of_birth?: string; residential_status?: string; house?: string;
  mobile_number?: string; guardian_name?: string; guardian_mobile?: string;
}
interface Teacher {
  teacher_code: string; name: string; department?: string; rank?: string; status: string;
  gender?: string; phone?: string; email?: string; is_admin?: boolean;
}

export default function PersonnelPage() {
  const { theme }               = useTheme();
  const [mounted, setMounted]   = useState(false);
  const [scope,   setScope]     = useState<Scope>('students');
  const [cls,     setCls]       = useState('');
  const [status,  setStatus]    = useState('Active');
  const [dept,    setDept]      = useState('');
  const [search,  setSearch]    = useState('');
  const [data,    setData]      = useState<Student[] | Teacher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const classes = useRef<string[]>([]);
  const depts   = useRef<string[]>([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (scope === 'students' && cls) params.set('class', cls);
    if (scope === 'teachers' && dept) params.set('department', dept);

    principalApi.get(`/api/principal/personnel/${scope}?${params}`)
      .then(r => {
        setData(r.data);
        if (scope === 'students') {
          classes.current = [...new Set<string>(r.data.map((s: Student) => s.class_name))].sort();
        } else {
          depts.current = [...new Set<string>(r.data.filter((t: Teacher) => t.department).map((t: Teacher) => t.department!))].sort();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scope, cls, status, dept]);

  const dark = mounted && theme === 'dark';

  async function exportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (scope === 'students' && cls) params.set('class', cls);
      if (scope === 'teachers' && dept) params.set('department', dept);

      const r = await principalApi.get(
        `/api/principal/personnel/${scope}/excel?${params}`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(r.data as Blob);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `${scope}_${status || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed.'); }
    finally { setExporting(false); }
  }

  const filtered = (data as (Student & Teacher)[]).filter(r =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    ((r as Student).student_code || (r as Teacher).teacher_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const labelSt = (st: string) => {
    if (st === 'Active')    return { bg: '#DCFCE7', bgD: '#14532D33', text: '#15803D' };
    if (st === 'Inactive')  return { bg: '#F3F4F6', bgD: '#1E293B88', text: '#6B7280' };
    return { bg: '#FEF3C7', bgD: '#78350F33', text: '#D97706' };
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>Personnel Records</h2>
        <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8', marginTop: 2 }}>
          View and export teacher or student personal details.
        </p>
      </div>

      {/* Scope toggle */}
      <div style={{ display: 'flex', gap: 4, background: dark ? '#334155' : '#F1F5F9', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 20 }}>
        {(['students', 'teachers'] as Scope[]).map(s => (
          <button
            key={s}
            onClick={() => { setScope(s); setCls(''); setDept(''); setSearch(''); }}
            style={{
              padding: '7px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: scope === s ? '#10B981' : 'transparent',
              color: scope === s ? '#FFFFFF' : (dark ? '#94A3B8' : '#64748B'),
              transition: 'all 0.15s',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder={`Search ${scope}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        />

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{
            border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          {scope === 'students' && <option value="Graduated">Graduated</option>}
        </select>

        {scope === 'students' && classes.current.length > 0 && (
          <select
            value={cls}
            onChange={e => setCls(e.target.value)}
            style={{
              border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
              background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
              borderRadius: 8, padding: '7px 12px', fontSize: 13,
            }}
          >
            <option value="">All Classes</option>
            {classes.current.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {scope === 'teachers' && depts.current.length > 0 && (
          <select
            value={dept}
            onChange={e => setDept(e.target.value)}
            style={{
              border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
              background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
              borderRadius: 8, padding: '7px 12px', fontSize: 13,
            }}
          >
            <option value="">All Departments</option>
            {depts.current.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}

        <button
          onClick={exportExcel}
          disabled={exporting || data.length === 0}
          style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: exporting ? '#6EE7B7' : '#10B981', color: '#FFFFFF',
            border: 'none', cursor: exporting || data.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: 14, height: 14 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: dark ? '#475569' : '#94A3B8', marginBottom: 12 }}>
        Showing {filtered.length} of {data.length} records
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : (
        <div style={{
          background: dark ? '#1E293B' : '#FFFFFF',
          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            {scope === 'students' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                    {['ID', 'Name', 'Class', 'Program', 'Gender', 'Residential', 'Guardian', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(filtered as Student[]).length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: dark ? '#475569' : '#94A3B8' }}>No students found</td></tr>
                  ) : (filtered as Student[]).map((s, i) => {
                    const st = labelSt(s.status);
                    return (
                      <tr key={s.student_code} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` : 'none' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: dark ? '#64748B' : '#94A3B8', whiteSpace: 'nowrap' }}>{s.student_code}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A', whiteSpace: 'nowrap' }}>{s.name}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{s.class_name}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#94A3B8' : '#64748B', fontSize: 12 }}>{s.program_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{s.gender || '—'}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{s.residential_status || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>
                          <div style={{ color: dark ? '#CBD5E1' : '#374151' }}>{s.guardian_name || '—'}</div>
                          {s.guardian_mobile && <div style={{ color: dark ? '#64748B' : '#94A3B8' }}>{s.guardian_mobile}</div>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '2px 10px', background: dark ? st.bgD : st.bg, color: st.text }}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                    {['ID', 'Name', 'Department', 'Rank', 'Gender', 'Phone', 'Email', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(filtered as Teacher[]).length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: dark ? '#475569' : '#94A3B8' }}>No teachers found</td></tr>
                  ) : (filtered as Teacher[]).map((t, i) => {
                    const st = labelSt(t.status);
                    return (
                      <tr key={t.teacher_code} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` : 'none' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: dark ? '#64748B' : '#94A3B8', whiteSpace: 'nowrap' }}>{t.teacher_code}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A', whiteSpace: 'nowrap' }}>{t.name}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{t.department || '—'}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#94A3B8' : '#64748B', fontSize: 12 }}>{t.rank || '—'}</td>
                        <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{t.gender || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>
                          {t.phone ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: dark ? '#CBD5E1' : '#374151' }}>{t.phone}</span>
                              <a
                                href={`tel:${t.phone}`}
                                title={`Call ${t.phone}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                  background: dark ? '#14532D44' : '#DCFCE7', color: '#15803D',
                                  textDecoration: 'none', border: '1.5px solid #15803D55',
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                  strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                                </svg>
                              </a>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: dark ? '#94A3B8' : '#64748B', fontSize: 12 }}>{t.email || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 20, padding: '2px 10px', background: dark ? st.bgD : st.bg, color: st.text }}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
