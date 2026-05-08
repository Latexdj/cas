import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, registerUnauthorizedHandler } from '@/lib/api';
import { storage } from '@/lib/storage';
import { User } from '@/types/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (params: { type: string; name?: string; username?: string; pin?: string; password?: string; schoolId?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    rehydrate();
    registerUnauthorizedHandler(logout);
  }, []);

  async function rehydrate() {
    try {
      const [token, id, name, role, schoolId] = await Promise.all([
        storage.getToken(),
        storage.getUserId(),
        storage.getUserName(),
        storage.getUserRole(),
        storage.getSchoolId(),
      ]);
      if (token && id && name && role) {
        setUser({ id, name, role: role as User['role'], schoolId: schoolId ?? '' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(params: Parameters<AuthState['login']>[0]) {
    const { data } = await api.post('/api/auth/login', params);
    await storage.saveSession(data.token, data.id, data.name, data.role, data.schoolId ?? '');
    setUser({ id: data.id, name: data.name, role: data.role, schoolId: data.schoolId ?? '' });
  }

  async function logout() {
    await storage.clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
