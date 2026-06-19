'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { getPrincipal, clearPrincipal, getRoleLabel, type PrincipalUser } from '@/lib/principal-auth';

interface NavItem { href: string; label: string; icon: ReactNode }

const NAV: NavItem[] = [
  { href: '/principal', label: 'Dashboard', icon: <DashIcon /> },
  { href: '/principal/occupancy', label: 'Classroom Occupancy', icon: <GridIcon /> },
  { href: '/principal/attendance', label: 'Teacher Attendance', icon: <CheckIcon /> },
  { href: '/principal/leaves', label: 'Leave Requests', icon: <LeaveIcon /> },
  { href: '/principal/exeats', label: 'Exeat Management', icon: <ExeatIcon /> },
  { href: '/principal/clearance', label: 'Student Clearance', icon: <ClearanceIcon /> },
  { href: '/principal/personnel', label: 'Personnel Records', icon: <PersonnelIcon /> },
  { href: '/principal/reports', label: 'Reports', icon: <ReportsIcon /> },
];

function DashIcon()      { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> }
function GridIcon()      { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125l.007.005A.5.5 0 003.375 19.5M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v13.5c0 .621-.504 1.125-1.125 1.125m0-15.75c0-.621-.504-1.125-1.125-1.125M21.375 4.5H3.375" /></svg> }
function CheckIcon()     { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
function LeaveIcon()     { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg> }
function ExeatIcon()     { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg> }
function ClearanceIcon() { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75" /></svg> }
function PersonnelIcon() { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> }
function ReportsIcon()   { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> }
function MenuIcon()      { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg> }
function MoonIcon()      { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg> }
function SunIcon()       { return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg> }

export default function PrincipalShell({ children }: { children: ReactNode }) {
  const pathname           = usePathname();
  const router             = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted,   setMounted]   = useState(false);
  const [user,      setUser]      = useState<PrincipalUser | null>(null);
  const [sideOpen,  setSideOpen]  = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = getPrincipal();
    if (!u && !pathname.startsWith('/principal/login') && !pathname.startsWith('/principal/setup')) {
      router.replace('/principal/login');
    } else {
      setUser(u);
    }
  }, [pathname, router]);

  function handleLogout() {
    clearPrincipal();
    router.push('/principal/login');
  }

  const dark = mounted && theme === 'dark';

  // Skip shell for login/setup
  if (!mounted || pathname === '/principal/login' || pathname === '/principal/setup') {
    return <>{children}</>;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: dark ? '#0F172A' : '#F8FAFC' }}>
      {/* Sidebar overlay (mobile) */}
      {sideOpen && (
        <div
          onClick={() => setSideOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.4)' }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        width: 240, display: 'flex', flexDirection: 'column',
        background: dark ? '#1E293B' : '#FFFFFF',
        borderRight: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
        transform: sideOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}
        className="lg:translate-x-0 lg:static lg:flex"
      >
        {/* Logo / Title */}
        <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: dark ? '#F1F5F9' : '#1E293B', letterSpacing: '0.02em' }}>
            Management Portal
          </div>
          {user && (
            <div style={{ fontSize: 11, color: dark ? '#94A3B8' : '#64748B', marginTop: 4 }}>
              {getRoleLabel(user.role)} · {user.school?.name ?? ''}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {NAV.map(item => {
            const active = pathname === item.href || (item.href !== '/principal' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSideOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 8, marginBottom: 2, textDecoration: 'none',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? '#10B981' : (dark ? '#CBD5E1' : '#475569'),
                  background: active ? (dark ? '#064E3B22' : '#ECFDF5') : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ color: active ? '#10B981' : (dark ? '#64748B' : '#94A3B8') }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${dark ? '#334155' : '#E2E8F0'}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: dark ? '#F1F5F9' : '#1E293B', marginBottom: 2 }}>
            {user?.name ?? ''}
          </div>
          <div style={{ fontSize: 11, color: dark ? '#64748B' : '#94A3B8', marginBottom: 8 }}>
            {user ? getRoleLabel(user.role) : ''}
          </div>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 12, color: '#EF4444', background: 'none', border: 'none',
              padding: 0, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', marginLeft: 0 }}
           className="lg:ml-60"
      >
        {/* Topbar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: dark ? '#1E293B' : '#FFFFFF',
          borderBottom: `1px solid ${dark ? '#334155' : '#E2E8F0'}`,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 52,
        }}>
          <button
            onClick={() => setSideOpen(s => !s)}
            className="lg:hidden"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#94A3B8' : '#64748B', padding: 4 }}
          >
            <MenuIcon />
          </button>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: dark ? '#F1F5F9' : '#1E293B' }}>
            {NAV.find(n => n.href === pathname || (n.href !== '/principal' && pathname.startsWith(n.href)))?.label ?? 'Dashboard'}
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={{
              background: dark ? '#334155' : '#F1F5F9', border: 'none', borderRadius: 8,
              padding: '6px 8px', cursor: 'pointer', color: dark ? '#CBD5E1' : '#475569',
              display: 'flex', alignItems: 'center',
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
