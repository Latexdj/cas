'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

interface Student {
  id: string; student_code: string; name: string; class_name: string; house?: string;
  internal_used: number; external_used: number;
}
interface ExeatData {
  internal_quota: number; external_quota: number; students: Student[];
}

function QuotaBar({ used, quota, color }: { used: number; quota: number; color: string }) {
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <div style={{ flex: 1, height: 6, background: '#E2E8F0', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#EF4444' : pct >= 75 ? '#F59E0B' : color, borderRadius: 3 }} />
      </div>
      <span style={{ color: pct >= 100 ? '#EF4444' : pct >= 75 ? '#F59E0B' : undefined, minWidth: 36, textAlign: 'right' }}>
        {used}/{quota}
      </span>
    </div>
  );
}

export default function ExeatsPage() {
  const { theme }             = useTheme();
  const [mounted, setMounted] = useState(false);
  const [cls,     setCls]     = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [data,    setData]    = useState<ExeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [editQuota, setEditQuota] = useState(false);
  const [intQ,    setIntQ]    = useState('');
  const [extQ,    setExtQ]    = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const load = () => {
    setLoading(true);
    principalApi.get(`/api/principal/exeats${cls ? `?class=${encodeURIComponent(cls)}` : ''}`)
      .then(r => {
        setData(r.data);
        const cls2 = [...new Set<string>(r.data.students.map((s: Student) => s.class_name))].sort();
        setClasses(cls2);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [cls]);

  const dark = mounted && theme === 'dark';

  const students = data?.students ?? [];
  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.student_code.toLowerCase().includes(search.toLowerCase())
  );

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered);

  const overLimit = students.filter(s =>
    s.internal_used >= (data?.internal_quota ?? 5) || s.external_used >= (data?.external_quota ?? 2)
  ).length;

  async function saveQuota() {
    setSaving(true);
    try {
      const r = await principalApi.patch('/api/principal/exeat-settings', {
        max_internal: parseInt(intQ) || 0,
        max_external: parseInt(extQ) || 0,
      });
      setData(prev => prev ? { ...prev, internal_quota: r.data.max_internal, external_quota: r.data.max_external } : prev);
      setEditQuota(false);
    } catch { alert('Failed to update quota.'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>Exeat Management</h2>
          {overLimit > 0 && (
            <p style={{ fontSize: 13, color: '#EF4444', marginTop: 2 }}>
              {overLimit} student{overLimit !== 1 ? 's' : ''} at/over quota
            </p>
          )}
        </div>
        {data && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: dark ? '#94A3B8' : '#64748B' }}>
              School quota: <strong style={{ color: dark ? '#F1F5F9' : '#0F172A' }}>
                {data.internal_quota} internal / {data.external_quota} external
              </strong>
            </div>
            <button
              onClick={() => { setIntQ(String(data.internal_quota)); setExtQ(String(data.external_quota)); setEditQuota(true); }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: dark ? '#334155' : '#F1F5F9', color: dark ? '#CBD5E1' : '#475569',
                border: `1px solid ${dark ? '#475569' : '#E2E8F0'}`, cursor: 'pointer',
              }}
            >
              Override Quota
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Search name or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
            background: dark ? '#1E293B' : '#FFFFFF', color: dark ? '#F1F5F9' : '#0F172A',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
          }}
        />
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
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: dark ? '#64748B' : '#94A3B8' }}>Loading…</div>
      ) : (<>
        <div style={{
          background: dark ? '#1E293B' : '#FFFFFF',
          border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: dark ? '#0F172A' : '#F8FAFC', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
                  <Th label="Student" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }} />
                  <Th label="Class" sortKey="class_name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }} />
                  <Th label="Internal Exeats" sortKey="internal_used" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }} />
                  <Th label="External Exeats" sortKey="external_used" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }} />
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: dark ? '#475569' : '#94A3B8' }}>No students found</td></tr>
                ) : (displayRows as Student[]).map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < displayRows.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F1F5F9'}` : 'none' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A' }}>{s.name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: dark ? '#64748B' : '#94A3B8' }}>{s.student_code}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: dark ? '#CBD5E1' : '#374151' }}>{s.class_name}</td>
                    <td style={{ padding: '10px 14px', minWidth: 140 }}>
                      <QuotaBar used={s.internal_used} quota={data?.internal_quota ?? 5} color="#6366F1" />
                    </td>
                    <td style={{ padding: '10px 14px', minWidth: 140 }}>
                      <QuotaBar used={s.external_used} quota={data?.external_quota ?? 2} color="#10B981" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
      </>)}

      {/* Quota override modal */}
      {editQuota && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', padding: 16,
        }}>
          <div style={{
            background: dark ? '#1E293B' : '#FFFFFF', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380,
          }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 4 }}>
              Override School Exeat Quota
            </h3>
            <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8', marginBottom: 20 }}>
              This sets the maximum number of exeats allowed per student for the whole school.
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                  MAX INTERNAL
                </label>
                <input
                  type="number" min={0} max={20}
                  value={intQ}
                  onChange={e => setIntQ(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, fontSize: 14,
                    border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                    background: dark ? '#0F172A' : '#F8FAFC', color: dark ? '#F1F5F9' : '#0F172A',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', marginBottom: 6 }}>
                  MAX EXTERNAL
                </label>
                <input
                  type="number" min={0} max={20}
                  value={extQ}
                  onChange={e => setExtQ(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, fontSize: 14,
                    border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                    background: dark ? '#0F172A' : '#F8FAFC', color: dark ? '#F1F5F9' : '#0F172A',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setEditQuota(false)}
                disabled={saving}
                style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: dark ? '#334155' : '#F1F5F9', color: dark ? '#CBD5E1' : '#475569',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveQuota}
                disabled={saving}
                style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: '#10B981', color: '#FFFFFF', border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save Quota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
