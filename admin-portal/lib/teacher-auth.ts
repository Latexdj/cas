'use client';

export interface TeacherUser {
  id: string;
  name: string;
  role: string;
  schoolId: string;
  token: string;
}

export function getTeacher(): TeacherUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cas_t_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveTeacher(user: TeacherUser) {
  localStorage.setItem('cas_t_token', user.token);
  localStorage.setItem('cas_t_user', JSON.stringify(user));
}

export function clearTeacher() {
  localStorage.removeItem('cas_t_token');
  localStorage.removeItem('cas_t_user');
  localStorage.removeItem('cas_school_code');
  localStorage.removeItem('cas_t_primary_color');
  localStorage.removeItem('cas_t_accent_color');
}

export function getSchoolCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cas_school_code');
}

export function saveSchoolCode(code: string) {
  localStorage.setItem('cas_school_code', code);
}

export function getTeacherColors(): { primary: string; accent: string; logoUrl: string | null } {
  if (typeof window === 'undefined') return { primary: '#2ab289', accent: '#1a8a6a', logoUrl: null };
  return {
    primary: localStorage.getItem('cas_t_primary_color') ?? '#2ab289',
    accent:  localStorage.getItem('cas_t_accent_color')  ?? '#1a8a6a',
    logoUrl: localStorage.getItem('cas_t_logo_url'),
  };
}

export function saveTeacherColors(primary: string, accent: string, logoUrl?: string | null) {
  localStorage.setItem('cas_t_primary_color', primary);
  localStorage.setItem('cas_t_accent_color', accent);
  if (logoUrl) localStorage.setItem('cas_t_logo_url', logoUrl);
  else localStorage.removeItem('cas_t_logo_url');
}
