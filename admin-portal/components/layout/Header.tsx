'use client';
import { useRouter } from 'next/navigation';
import { clearUser, getUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';

interface Props { title: string; }

export function Header({ title }: Props) {
  const router = useRouter();
  const user   = getUser();

  function logout() {
    clearUser();
    router.replace('/login');
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-gray-500">
            {user.name}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={logout}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
