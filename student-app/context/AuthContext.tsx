import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, registerUnauthorizedHandler } from '@/lib/api';
import { storage } from '@/lib/storage';
import { useUpdateTheme } from '@/context/ThemeContext';
import type { User } from '@/types/api';

interface AuthState {
  user:              User | null;
  mustChangePassword: boolean;
  isLoading:         boolean;
  login:             (username: string, password: string, schoolCode: string) => Promise<void>;
  logout:            () => Promise<void>;
  clearMustChange:   () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,              setUser]              = useState<User | null>(null);
  const [mustChangePassword, setMustChange]       = useState(false);
  const [isLoading,         setIsLoading]         = useState(true);
  const updateTheme = useUpdateTheme();

  useEffect(() => {
    rehydrate();
    registerUnauthorizedHandler(logout);
  }, []);

  async function rehydrate() {
    try {
      const [token, id, name, schoolId, mcp] = await Promise.all([
        storage.getToken(),
        storage.getUserId(),
        storage.getUserName(),
        storage.getSchoolId(),
        storage.getMustChangePwd(),
      ]);
      if (token && id && name) {
        setUser({ id, name, role: 'student', schoolId: schoolId ?? '' });
        setMustChange(mcp === '1');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string, schoolCode: string) {
    const { data } = await api.post('/api/auth/login', {
      type: 'student', username, password, schoolCode,
    });
    await storage.saveSession(data.token, data.id, data.name, data.schoolId ?? '', !!data.must_change_password);
    if (data.primary_color && data.accent_color) {
      await updateTheme(data.primary_color, data.accent_color);
    }
    await storage.saveTheme(data.primary_color ?? '', data.accent_color ?? '', data.logo_url ?? null);
    setMustChange(!!data.must_change_password);
    setUser({ id: data.id, name: data.name, role: 'student', schoolId: data.schoolId ?? '', mustChangePassword: !!data.must_change_password });
  }

  async function clearMustChange() {
    await storage.setMustChangePwd(false);
    setMustChange(false);
    if (user) setUser({ ...user, mustChangePassword: false });
  }

  async function logout() {
    await storage.clearSession();
    setUser(null);
    setMustChange(false);
  }

  return (
    <AuthContext.Provider value={{ user, mustChangePassword, isLoading, login, logout, clearMustChange }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
