'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/dashboard',        label: 'Dashboard',       icon: '⬛' },
  { href: '/teachers',         label: 'Teachers',        icon: '👤' },
  { href: '/timetable',        label: 'Timetable',       icon: '📅' },
  { href: '/locations',        label: 'Locations',       icon: '📍' },
  { href: '/academic-years',   label: 'Academic Years',  icon: '🎓' },
  { href: '/attendance',       label: 'Attendance',      icon: '✅' },
  { href: '/absences',         label: 'Absences',        icon: '⚠️'  },
  { href: '/remedials',        label: 'Remedials',       icon: '🔄' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="font-bold text-gray-900">CAS Admin</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {nav.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-1 transition-colors
                ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
