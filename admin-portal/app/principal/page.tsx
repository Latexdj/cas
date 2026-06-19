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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: dark ? '#94A3B8' : '#64748B', marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Quick Actions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12 }}>
            {[
              { href: '/principal/occupancy',  label: 'Classroom Occupancy', emoji: '🏫' },
              { href: '/principal/leaves',      label: 'Approve Leaves',      emoji: '📋' },
              { href: '/principal/clearance',   label: 'Check Clearance',     emoji: '✅' },
              { href: '/principal/personnel',   label: 'Export Records',      emoji: '📂' },
              { href: '/principal/reports',     label: 'View Reports',        emoji: '📊' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                background: dark ? '#1E293B' : '#FFFFFF',
                border: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
                borderRadius: 12, padding: '14px 16px',
                color: dark ? '#CBD5E1' : '#475569', fontSize: 13, fontWeight: 500,
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 20 }}>{item.emoji}</span>
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
