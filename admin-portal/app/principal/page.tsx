'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { principalApi } from '@/lib/principal-api';
import { getPrincipal } from '@/lib/principal-auth';

interface Snapshot {
  teacherAttendanceRate: number | null;
  teachersScheduledToday: number;
  teachersSubmittedToday: number;
  autoAbsencesToday: number;
  pendingLeaves: number;
  activeExeats: number;
  activeStudents: number;
}

interface StatCardProps {
  label: string; value: string | number; sub?: string;
  color: string; href?: string; dark: boolean;
}
function StatCard({ label, value, sub, color, href, dark }: StatCardProps) {
  const card = (
    <div style={{
      background: dark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
      borderRadius: 14, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 4,
      cursor: href ? 'pointer' : 'default',
      transition: 'box-shadow 0.15s',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: dark ? '#64748B' : '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: dark ? '#475569' : '#94A3B8' }}>{sub}</span>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: 'none' }}>{card}</Link>;
  return card;
}

export default function PrincipalDashboard() {
  const { theme }        = useTheme();
  const [mounted, setMounted] = useState(false);
  const [snap, setSnap]       = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const user                  = getPrincipal();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    principalApi.get('/api/principal/snapshot')
      .then(r => setSnap(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const dark = mounted && theme === 'dark';

  const today = new Date().toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: dark ? '#F1F5F9' : '#0F172A', marginBottom: 4 }}>
          Good {getGreeting()}, {user?.name?.split(' ')[0] ?? ''}
        </h2>
        <p style={{ fontSize: 13, color: dark ? '#64748B' : '#94A3B8' }}>{today}</p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              height: 108, borderRadius: 14, background: dark ? '#1E293B' : '#F1F5F9',
              animation: 'pulse 1.5s infinite',
            }} />
          ))}
        </div>
      ) : snap ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16, marginBottom: 32 }}>
            <StatCard
              label="Teacher Attendance Rate"
              value={snap.teacherAttendanceRate != null ? `${snap.teacherAttendanceRate}%` : 'N/A'}
              sub={`${snap.teachersSubmittedToday} of ${snap.teachersScheduledToday} submitted`}
              color={snap.teacherAttendanceRate == null ? (dark ? '#64748B' : '#94A3B8') :
                snap.teacherAttendanceRate >= 80 ? '#10B981' :
                snap.teacherAttendanceRate >= 60 ? '#F59E0B' : '#EF4444'}
              href="/principal/attendance"
              dark={dark}
            />
            <StatCard
              label="Unexcused Absences Today"
              value={snap.autoAbsencesToday}
              sub="auto-flagged, unresolved"
              color={snap.autoAbsencesToday === 0 ? '#10B981' : snap.autoAbsencesToday > 5 ? '#EF4444' : '#F59E0B'}
              href="/principal/attendance"
              dark={dark}
            />
            <StatCard
              label="Pending Leave Requests"
              value={snap.pendingLeaves}
              sub="awaiting approval"
              color={snap.pendingLeaves === 0 ? '#10B981' : '#F59E0B'}
              href="/principal/leaves"
              dark={dark}
            />
            <StatCard
              label="Active Exeats"
              value={snap.activeExeats}
              sub="students currently out"
              color={dark ? '#818CF8' : '#6366F1'}
              href="/principal/exeats"
              dark={dark}
            />
            <StatCard
              label="Active Students"
              value={snap.activeStudents.toLocaleString()}
              sub="enrolled this term"
              color={dark ? '#38BDF8' : '#0EA5E9'}
              dark={dark}
            />
          </div>

          {/* Quick links */}
          <h3 style={{ fontSize: 11, fontWeight: 700, color: dark ? '#334155' : '#94A3B8', marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Quick Actions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
            {[
              {
                href: '/principal/occupancy', label: 'Classroom Occupancy', color: '#6366F1',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />,
              },
              {
                href: '/principal/leaves', label: 'Approve Leaves', color: '#F59E0B',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
              },
              {
                href: '/principal/clearance', label: 'Check Clearance', color: '#10B981',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />,
              },
              {
                href: '/principal/personnel', label: 'Export Records', color: '#0EA5E9',
                icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></>,
              },
              {
                href: '/principal/reports', label: 'View Reports', color: '#8B5CF6',
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
              },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                background: dark ? '#1E293B' : '#FFFFFF',
                border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                borderRadius: 12, padding: '14px 16px',
                color: dark ? '#CBD5E1' : '#475569', fontSize: 13, fontWeight: 500,
                transition: 'all 0.15s',
              }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: `${item.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={item.color} style={{ width: 17, height: 17 }}>
                    {item.icon}
                  </svg>
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div style={{ color: '#EF4444', textAlign: 'center', padding: 40 }}>Failed to load dashboard.</div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
