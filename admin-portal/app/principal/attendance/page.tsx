'use client';
import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { principalApi } from '@/lib/principal-api';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester: number | null; }

interface ClassRow {
  id: string; name: string; department: string;
  present_periods: number; absent_periods: number; excused_periods: number;
  total_scheduled: number; attendance_pct: number | null;
}

interface MeetingRow {
  id: string; name: string; department: string;
  present_count: number; absent_count: number;
  total_scheduled: number; attendance_pct: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function attendanceStatus(pct: number | null): { label: string; color: string; bg: string } {
  if (pct === null) return { label: 'No Data',        color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' };
  if (pct >= 90)   return { label: 'Excellent',       color: '#10B981', bg: 'rgba(16,185,129,0.12)'  };
  if (pct >= 75)   return { label: 'Good',            color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  };
  if (pct >= 60)   return { label: 'Needs Attention', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  };
  return               { label: 'Critical',       color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PctCell({ pct, dark }: { pct: number | null; dark: boolean }) {
  const st = attendanceStatus(pct);
  return (
    <td style={{ padding: '11px 14px', minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: dark ? '#334155' : '#E2E8F0' }}>
          <div style={{ width: `${Math.min(pct ?? 0, 100)}%`, height: '100%', borderRadius: 3, background: st.color }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 38, textAlign: 'right', color: st.color }}>
          {pct !== null ? `${pct}%` : '—'}
        </span>
      </div>
    </td>
  );
}

function StatusCell({ pct, dark }: { pct: number | null; dark: boolean }) {
  const st = attendanceStatus(pct);
  void dark;
  return (
    <td style={{ padding: '11px 14px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: st.bg, color: st.color,
      }}>{st.label}</span>
    </td>
  );
}

function TableWrap({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: dark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
    }}>
      <div style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ text, dark }: { text: string; dark: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: dark ? '#475569' : '#94A3B8', fontSize: 14 }}>
      {text}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '3px solid #10B981', borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

// ── CLASS ATTENDANCE TABLE ────────────────────────────────────────────────────

function ClassTable({ rows, dark, search }: { rows: ClassRow[]; dark: boolean; search: string }) {
  const filtered = rows.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.department.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce(
    (a, r) => ({ p: a.p + r.present_periods, ab: a.ab + r.absent_periods, ex: a.ex + r.excused_periods, s: a.s + r.total_scheduled }),
    { p: 0, ab: 0, ex: 0, s: 0 }
  );
  const schoolPct = totals.s > 0 ? Math.round(100 * totals.p / totals.s) : null;

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered as Record<string, unknown>[]);

  const hStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontWeight: 600,
    color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    background: dark ? '#0F172A' : '#F8FAFC',
    borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
  };

  if (filtered.length === 0) return <EmptyState text="No data for the selected period." dark={dark} />;

  return (
    <>
    <TableWrap dark={dark}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
        <thead>
          <tr>
            <Th label="Teacher" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <Th label="Department" sortKey="department" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <th style={hStyle}>Scheduled</th>
            <th style={hStyle}>Present</th>
            <th style={hStyle}>Absent</th>
            <th style={hStyle}>Excused</th>
            <Th label="Attendance %" sortKey="attendance_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <th style={hStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {(displayRows as ClassRow[]).map((r, i) => (
            <tr key={r.id} style={{
              borderBottom: i < displayRows.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F8FAFC'}` : 'none',
              background: i % 2 === 0 ? 'transparent' : (dark ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.6)'),
            }}>
              <td style={{ padding: '11px 14px', fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A' }}>{r.name}</td>
              <td style={{ padding: '11px 14px', fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>{r.department}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', color: dark ? '#CBD5E1' : '#475569' }}>{r.total_scheduled}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: '#10B981' }}>{r.present_periods}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: r.absent_periods > 0 ? '#EF4444' : (dark ? '#475569' : '#94A3B8') }}>{r.absent_periods}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: r.excused_periods > 0 ? '#7C3AED' : (dark ? '#475569' : '#94A3B8') }}>{r.excused_periods}</td>
              <PctCell pct={r.attendance_pct} dark={dark} />
              <StatusCell pct={r.attendance_pct} dark={dark} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${dark ? '#334155' : '#E2E8F0'}`, background: dark ? '#0F172A' : '#F8FAFC' }}>
            <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: dark ? '#64748B' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>School Total</td>
            <td style={{ padding: '10px 14px' }} />
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>{totals.s}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: '#10B981' }}>{totals.p}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: totals.ab > 0 ? '#EF4444' : (dark ? '#475569' : '#94A3B8') }}>{totals.ab}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: totals.ex > 0 ? '#7C3AED' : (dark ? '#475569' : '#94A3B8') }}>{totals.ex}</td>
            <PctCell pct={schoolPct} dark={dark} />
            <StatusCell pct={schoolPct} dark={dark} />
          </tr>
        </tfoot>
      </table>
    </TableWrap>
    <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
    </>
  );
}

// ── MEETING / PLC TABLE ───────────────────────────────────────────────────────

function MeetingTable({ rows, dark, search }: { rows: MeetingRow[]; dark: boolean; search: string }) {
  const filtered = rows.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.department.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce(
    (a, r) => ({ p: a.p + r.present_count, ab: a.ab + r.absent_count, s: a.s + r.total_scheduled }),
    { p: 0, ab: 0, s: 0 }
  );
  const schoolPct = totals.s > 0 ? Math.round(100 * totals.p / totals.s) : null;

  const { displayRows, total, page, setPage, pageSize, setPageSize, sortKey, sortDir, handleSort } =
    useTableControls(filtered as Record<string, unknown>[]);

  const hStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontWeight: 600,
    color: dark ? '#94A3B8' : '#64748B', fontSize: 11, letterSpacing: '0.04em',
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    background: dark ? '#0F172A' : '#F8FAFC',
    borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
  };

  if (filtered.length === 0) return <EmptyState text="No data for the selected period." dark={dark} />;

  return (
    <>
    <TableWrap dark={dark}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
        <thead>
          <tr>
            <Th label="Teacher" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <Th label="Department" sortKey="department" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <th style={hStyle}>Sessions</th>
            <th style={hStyle}>Present</th>
            <th style={hStyle}>Absent</th>
            <Th label="Attendance %" sortKey="attendance_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} style={hStyle} />
            <th style={hStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {(displayRows as MeetingRow[]).map((r, i) => (
            <tr key={r.id} style={{
              borderBottom: i < displayRows.length - 1 ? `1px solid ${dark ? '#1E293B' : '#F8FAFC'}` : 'none',
              background: i % 2 === 0 ? 'transparent' : (dark ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.6)'),
            }}>
              <td style={{ padding: '11px 14px', fontWeight: 600, color: dark ? '#F1F5F9' : '#0F172A' }}>{r.name}</td>
              <td style={{ padding: '11px 14px', fontSize: 12, color: dark ? '#94A3B8' : '#64748B' }}>{r.department}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', color: dark ? '#CBD5E1' : '#475569' }}>{r.total_scheduled}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: '#10B981' }}>{r.present_count}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: r.absent_count > 0 ? '#EF4444' : (dark ? '#475569' : '#94A3B8') }}>{r.absent_count}</td>
              <PctCell pct={r.attendance_pct} dark={dark} />
              <StatusCell pct={r.attendance_pct} dark={dark} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${dark ? '#334155' : '#E2E8F0'}`, background: dark ? '#0F172A' : '#F8FAFC' }}>
            <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: dark ? '#64748B' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>School Total</td>
            <td style={{ padding: '10px 14px' }} />
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A' }}>{totals.s}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: '#10B981' }}>{totals.p}</td>
            <td style={{ padding: '10px 14px', fontFamily: 'monospace', textAlign: 'center', fontWeight: 700, color: totals.ab > 0 ? '#EF4444' : (dark ? '#475569' : '#94A3B8') }}>{totals.ab}</td>
            <PctCell pct={schoolPct} dark={dark} />
            <StatusCell pct={schoolPct} dark={dark} />
          </tr>
        </tfoot>
      </table>
    </TableWrap>
    <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={p => { setPageSize(p); setPage(1); }} />
    </>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'class',    label: 'Class Attendance' },
  { key: 'plc',      label: 'PLC' },
  { key: 'briefing', label: 'Morning Briefings' },
  { key: 'staff',    label: 'Staff Meetings' },
] as const;

type TabKey = typeof TABS[number]['key'];

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function TeacherAttendancePage() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const dark = mounted && theme === 'dark';

  const [tab,          setTab]          = useState<TabKey>('class');
  const [search,       setSearch]       = useState('');
  const [years,        setYears]        = useState<AcademicYear[]>([]);
  const [filterYear,   setFilterYear]   = useState('');
  const [filterSem,    setFilterSem]    = useState('');

  const [classRows,    setClassRows]    = useState<ClassRow[]>([]);
  const [plcRows,      setPlcRows]      = useState<MeetingRow[]>([]);
  const [briefRows,    setBriefRows]    = useState<MeetingRow[]>([]);
  const [staffRows,    setStaffRows]    = useState<MeetingRow[]>([]);

  const [loading,      setLoading]      = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load academic years once
  useEffect(() => {
    principalApi.get('/api/principal/academic-years').then(r => {
      setYears(r.data);
      const current = r.data.find((y: AcademicYear) => y.is_current);
      if (current) {
        setFilterYear(current.id);
        setFilterSem(current.current_semester ? String(current.current_semester) : '');
      }
    }).catch(() => {});
  }, []);

  const loadAll = useCallback(async (yearId: string, sem: string) => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (yearId) params.academic_year_id = yearId;
    if (sem)    params.semester = sem;
    const qs = new URLSearchParams(params).toString();
    const [cls, plc, brief, staff] = await Promise.allSettled([
      principalApi.get(`/api/principal/teacher-attendance?${qs}`),
      principalApi.get(`/api/principal/plc-summary?${qs}`),
      principalApi.get(`/api/principal/meetings-summary?${qs}&type=Morning+Briefing`),
      principalApi.get(`/api/principal/meetings-summary?${qs}&type=Staff+Meeting`),
    ]);
    if (cls.status   === 'fulfilled') setClassRows(cls.value.data);
    if (plc.status   === 'fulfilled') setPlcRows(plc.value.data);
    if (brief.status === 'fulfilled') setBriefRows(brief.value.data);
    if (staff.status === 'fulfilled') setStaffRows(staff.value.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (filterYear || filterSem) loadAll(filterYear, filterSem);
  }, [filterYear, filterSem, loadAll]);

  const sel: React.CSSProperties = {
    border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
    background: dark ? '#1E293B' : '#FFFFFF',
    color: dark ? '#F1F5F9' : '#0F172A',
    borderRadius: 8, padding: '7px 12px', fontSize: 13,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 4 }}>
          Teacher Attendance
        </h2>
        <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8' }}>
          Class attendance and meeting participation summaries
        </p>
      </div>

      {/* Shared filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search teacher or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...sel, flex: 1, minWidth: 200 }}
        />
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={sel}>
          {years.map(y => (
            <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (Current)' : ''}</option>
          ))}
        </select>
        <select value={filterSem} onChange={e => setFilterSem(e.target.value)} style={sel}>
          <option value="">All Semesters</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none',
              background: 'transparent', cursor: 'pointer', borderRadius: '8px 8px 0 0',
              color: tab === t.key ? '#10B981' : (dark ? '#64748B' : '#94A3B8'),
              borderBottom: tab === t.key ? '2px solid #10B981' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : tab === 'class' ? (
        <ClassTable rows={classRows} dark={dark} search={search} />
      ) : tab === 'plc' ? (
        <MeetingTable rows={plcRows} dark={dark} search={search} />
      ) : tab === 'briefing' ? (
        <MeetingTable rows={briefRows} dark={dark} search={search} />
      ) : (
        <MeetingTable rows={staffRows} dark={dark} search={search} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
