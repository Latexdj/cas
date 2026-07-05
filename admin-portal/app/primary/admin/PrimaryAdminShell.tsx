'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getUser, clearUser } from '@/lib/auth';

interface NavItem { href: string; label: string; d: string; }
interface Section { title: string; items: NavItem[]; }

const SECTIONS: Section[] = [
  {
    title: 'OVERVIEW',
    items: [
      { href: '/primary/admin/dashboard',    label: 'Dashboard',          d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    ],
  },
  {
    title: 'PEOPLE',
    items: [
      { href: '/primary/admin/teachers',     label: 'Teachers',           d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { href: '/primary/admin/students',     label: 'Students',           d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    ],
  },
  {
    title: 'ATTENDANCE',
    items: [
      { href: '/primary/admin/student-attendance', label: 'Student Attendance', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { href: '/primary/admin/teacher-attendance', label: 'Teacher Attendance',  d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    title: 'ACADEMICS',
    items: [
      { href: '/primary/admin/academic-years', label: 'Academic Years',    d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { href: '/primary/admin/terms',          label: 'Terms',             d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      { href: '/primary/admin/classes',        label: 'Class Setup',       d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { href: '/primary/admin/subjects',       label: 'Subjects',          d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      { href: '/primary/admin/grade-scale',    label: 'Grade Scale',       d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ],
  },
  {
    title: 'ASSESSMENTS',
    items: [
      { href: '/primary/admin/scores',   label: 'Score Entry',        d: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
      { href: '/primary/admin/reports',  label: 'Report Cards',       d: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ],
  },
  {
    title: 'SETUP',
    items: [
      { href: '/primary/admin/settings', label: 'School Settings',    d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ],
  },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  );
}

export default function PrimaryAdminShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [userName,  setUserName]  = useState('');
  const [open,      setOpen]      = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setUserName(user.name);
  }, [router]);

  function logout() {
    clearUser();
    if (typeof window !== 'undefined') localStorage.removeItem('cas_school_level');
    router.replace('/login');
  }

  const SidebarContent = (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0F172A' }}>
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#15803D' }}>
          <span className="text-white font-black text-xs">P</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#F1F5F9' }}>Primary Portal</p>
          <p className="text-[10px] truncate" style={{ color: '#475569' }}>Admin Dashboard</p>
        </div>
      </div>

      {/* Nav */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 px-2">
        {SECTIONS.map(section => (
          <div key={section.title} className="mb-4">
            <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#334155' }}>
              {section.title}
            </p>
            {section.items.map(item => {
              const active = pathname === item.href || (item.href !== '/primary/admin/dashboard' && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors"
                  style={active
                    ? { backgroundColor: 'rgba(21,128,61,0.15)', color: '#4ADE80' }
                    : { color: '#94A3B8' }
                  }>
                  <NavIcon d={item.d} />
                  <span className="truncate">{item.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#4ADE80' }} />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs font-semibold truncate mb-0.5" style={{ color: '#94A3B8' }}>{userName}</p>
        <button onClick={logout} className="text-xs transition-colors" style={{ color: '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 flex-col flex-shrink-0 h-full">
        {SidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 flex flex-col z-50">
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center gap-3 px-4 bg-white flex-shrink-0"
          style={{ borderBottom: '1px solid #E2E8F0' }}>
          <button onClick={() => setOpen(o => !o)} className="md:hidden text-slate-500 hover:text-slate-700 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">
              {SECTIONS.flatMap(s => s.items).find(i => pathname === i.href || pathname.startsWith(i.href + '/'))?.label ?? 'Primary Portal'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#15803D' }}>
              {userName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
