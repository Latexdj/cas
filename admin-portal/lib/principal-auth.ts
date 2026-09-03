export interface PrincipalUser {
  id: string;
  name: string;
  role: string;
  managementCode: string;
  schoolId: string;
  school: { name: string; primaryColor: string; accentColor: string; logoUrl: string };
}

const TOKEN_KEY = 'cas_p_token';
const USER_KEY  = 'cas_p_user';

export function getPrincipalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getPrincipal(): PrincipalUser | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function savePrincipal(token: string, user: PrincipalUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearPrincipal() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getRoleLabel(role: string) {
  if (role === 'principal') return 'Principal';
  if (role === 'vice_principal') return 'Vice Principal';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
