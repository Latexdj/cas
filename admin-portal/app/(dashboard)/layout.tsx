'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

const pageTitles: Record<string, string> = {
  '/dashboard':          'Dashboard',
  '/teachers':           'Teachers',
  '/students':           'Students',
  '/attendance':         'Teacher Attendance',
  '/meetings':           'Meetings',
  '/student-attendance': 'Student Attendance',
  '/absences':           'Absences & Remedials',
  '/manual-entry':       'Manual Attendance Entry',
  '/timetable':          'Timetable',
  '/school-breaks':      'Bell Schedule',
  '/academic-years':     'Academic Years',
  '/results':            'Results',
  '/transcript':         'Transcript',
  '/form-teachers':      'Form Teacher Assignments',
  '/curriculum':         'Curriculum',
  '/school-calendar':    'School Calendar',
  '/locations':          'Locations',
  '/classroom-qr':       'Classroom QR Codes',
  '/audit-log':          'Audit Log',
  '/settings':           'Settings',
  '/clearance':          'Student Clearance',
  '/clearance/offices':  'Clearance Offices & Staff',
  '/houses':             'Houses',
  '/exeat':              'Exeat Records',
  '/lms':               'LMS Overview',
  '/lms/pasco':         'Pasco Bank',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready,       setReady]       = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace('/login');
    } else if (typeof window !== 'undefined' && localStorage.getItem('cas_school_level') === 'primary') {
      router.replace('/primary/admin/dashboard');
    } else {
      setReady(true);
    }
  }, [router]);

  // Close sidebar on route change (mobile navigation)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const title = pageTitles[pathname] ?? 'Admin Portal';

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
        <Header title={title} onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
