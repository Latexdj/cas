'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';

type NavItem = { href: string; label: string; icon: React.ReactNode };
type Section = { label: string; items: NavItem[] };

const sections: Section[] = [
  {
    label: 'OVERVIEW',
    items: [
      {
        href: '/dashboard', label: 'Dashboard',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
      },
    ],
  },
  {
    label: 'PEOPLE',
    items: [
      {
        href: '/teachers', label: 'Teachers',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
      },
      {
        href: '/students', label: 'Students',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
      },
    ],
  },
  {
    label: 'ATTENDANCE',
    items: [
      {
        href: '/attendance', label: 'Teacher Attendance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
      },
      {
        href: '/student-attendance', label: 'Student Attendance',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
      },
      {
        href: '/absences', label: 'Absences & Remedials',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
      },
      {
        href: '/manual-entry', label: 'Manual Entry',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
      },
    ],
  },
  {
    label: 'SCHEDULING',
    items: [
      {
        href: '/timetable', label: 'Timetable',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
      },
      {
        href: '/academic-years', label: 'Academic Years',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />,
      },
      {
        href: '/school-calendar', label: 'School Calendar',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />,
      },
    ],
  },
  {
    label: 'SETUP',
    items: [
      {
        href: '/curriculum', label: 'Curriculum',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
      },
      {
        href: '/locations', label: 'Locations',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />,
      },
      {
        href: '/classroom-qr', label: 'Classroom QR',
        icon: <><rect x="3" y="3" width="5" height="5" rx="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /><rect x="16" y="3" width="5" height="5" rx="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /><rect x="3" y="16" width="5" height="5" rx="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 10h5M16 14h3M21 14v5M10 3v5M10 16v5M3 10h5M10 10h.01" /></>,
      },
      {
        href: '/settings', label: 'Settings',
        icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/admin/settings').then(r => setLogoUrl(r.data.logo_url ?? null)).catch(() => {});
  }, []);

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#0F172A' }}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="School logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#15803D' }}>
              <span className="text-white text-sm font-bold">C</span>
            </div>
          )}
          <div>
            <p className="text-white text-sm font-bold leading-tight">CAS Admin</p>
            <p className="text-xs leading-tight" style={{ color: '#64748B' }}>Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section, si) => (
          <div key={section.label} className={si > 0 ? 'mt-5' : ''}>
            <p className="px-3 text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#334155' }}>
              {section.label}
            </p>
            {section.items.map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-all"
                  style={{
                    backgroundColor: active ? 'rgba(21,128,61,0.15)' : 'transparent',
                    color: active ? '#4ADE80' : '#94A3B8',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-[17px] h-[17px] flex-shrink-0">
                    {icon}
                  </svg>
                  <span className="truncate">{label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <p className="text-xs text-center" style={{ color: '#334155' }}>Classroom Attendance System</p>
      </div>
    </aside>
  );
}
