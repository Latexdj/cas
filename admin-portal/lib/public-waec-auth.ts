'use client';

export interface PublicWaecUser {
  id: string;
  name: string;
  email: string;
  token: string;
}

export function getPublicWaecUser(): PublicWaecUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cas_pwaec_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function savePublicWaecUser(user: PublicWaecUser) {
  localStorage.setItem('cas_pwaec_token', user.token);
  localStorage.setItem('cas_pwaec_user', JSON.stringify(user));
}

export function clearPublicWaecUser() {
  localStorage.removeItem('cas_pwaec_token');
  localStorage.removeItem('cas_pwaec_user');
}
