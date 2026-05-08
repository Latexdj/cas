'use client';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  schoolId: string;
  token: string;
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cas_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveUser(user: AuthUser) {
  localStorage.setItem('cas_token', user.token);
  localStorage.setItem('cas_user', JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem('cas_token');
  localStorage.removeItem('cas_user');
}
