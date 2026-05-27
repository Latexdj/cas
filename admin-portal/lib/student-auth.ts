'use client';

export interface StudentUser {
  id: string;
  name: string;
  role: 'student';
  schoolId: string;
  token: string;
}

export function getStudent(): StudentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cas_s_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveStudent(user: StudentUser) {
  localStorage.setItem('cas_s_token', user.token);
  localStorage.setItem('cas_s_user', JSON.stringify(user));
}

export function clearStudent() {
  localStorage.removeItem('cas_s_token');
  localStorage.removeItem('cas_s_user');
  localStorage.removeItem('cas_s_school_code');
  localStorage.removeItem('cas_s_primary_color');
  localStorage.removeItem('cas_s_accent_color');
  localStorage.removeItem('cas_s_logo_url');
}

export function getStudentSchoolCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cas_s_school_code');
}

export function saveStudentSchoolCode(code: string) {
  localStorage.setItem('cas_s_school_code', code);
}

export function getStudentColors(): { primary: string; accent: string; logoUrl: string | null } {
  if (typeof window === 'undefined') return { primary: '#3B82F6', accent: '#1D4ED8', logoUrl: null };
  return {
    primary: localStorage.getItem('cas_s_primary_color') ?? '#3B82F6',
    accent:  localStorage.getItem('cas_s_accent_color')  ?? '#1D4ED8',
    logoUrl: localStorage.getItem('cas_s_logo_url'),
  };
}

export function saveStudentColors(primary: string, accent: string, logoUrl?: string | null) {
  localStorage.setItem('cas_s_primary_color', primary);
  localStorage.setItem('cas_s_accent_color', accent);
  if (logoUrl) localStorage.setItem('cas_s_logo_url', logoUrl);
  else localStorage.removeItem('cas_s_logo_url');
}
