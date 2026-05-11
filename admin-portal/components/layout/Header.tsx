'use client';
import { useRouter } from 'next/navigation';
import { clearUser, getUser } from '@/lib/auth';

interface Props { title: string; }

export function Header({ title }: Props) {
  const router = useRouter();
  const user   = getUser();
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? 'A';

  function logout() {
    clearUser();
    router.replace('/login');
  }

  return (
    <header className="h-16 bg-white flex items-center justify-between px-6 flex-shrink-0" style={{ borderBottom: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div>
        <h1 className="text-base font-semibold" style={{ color: '#0F172A' }}>{title}</h1>
        <p className="text-xs" style={{ color: '#94A3B8' }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium" style={{ color: '#1E293B' }}>{user.name}</p>
              <p className="text-xs capitalize" style={{ color: '#94A3B8' }}>{user.role}</p>
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
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: '#64748B', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
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
