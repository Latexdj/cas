'use client';
import { useRouter } from 'next/navigation';
import { clearUser, getUser } from '@/lib/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationsBell } from '@/components/NotificationsBell';

interface Props {
  title: string;
  onMenuClick: () => void;
}

export function Header({ title, onMenuClick }: Props) {
  const router   = useRouter();
  const user     = getUser();
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'A';

  function logout() {
    clearUser();
    router.replace('/login');
  }

  return (
    <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between px-4 md:px-6 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-lg gap-1.5 flex-shrink-0 text-slate-500 dark:text-slate-400"
          aria-label="Open menu"
        >
          <span className="block w-5 h-0.5 rounded-full bg-current" />
          <span className="block w-5 h-0.5 rounded-full bg-current" />
          <span className="block w-5 h-0.5 rounded-full bg-current" />
        </button>

        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-xs hidden sm:block text-slate-400 dark:text-slate-500">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationsBell />
        {user && (
          <>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{user.name}</p>
              <p className="text-xs capitalize text-slate-400 dark:text-slate-500">{user.role}</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: '#15803D' }}
            >
              {initials}
            </div>
          </>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </header>
  );
}
