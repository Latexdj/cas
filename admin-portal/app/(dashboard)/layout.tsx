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
  '/student-attendance': 'Student Attendance',
  '/absences':           'Absences & Remedials',
  '/manual-entry':       'Manual Attendance Entry',
  '/timetable':          'Timetable',
  '/academic-years':     'Academic Years',
  '/curriculum':         'Curriculum',
  '/school-calendar':    'School Calendar',
  '/locations':          'Locations',
  '/classroom-qr':       'Classroom QR Codes',
  '/settings':           'Settings',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const title = pageTitles[pathname] ?? 'Admin Portal';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
