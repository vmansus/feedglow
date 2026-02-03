'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  type User,
  type LoginResponse,
  getStoredAuth,
  login as apiLogin,
  logout as apiLogout,
  getCurrentUser,
} from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  minifluxUrl: string | null;
  login: (params: {
    minifluxUrl: string;
    username?: string;
    password?: string;
    apiKey?: string;
  }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/', '/login'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [minifluxUrl, setMinifluxUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initAuth = async () => {
      const stored = getStoredAuth();
      
      if (stored.token) {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          setMinifluxUrl(stored.minifluxUrl);
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.push('/login');
    }
  }, [isLoading, user, pathname, router]);

  const login = async (params: {
    minifluxUrl: string;
    username?: string;
    password?: string;
    apiKey?: string;
  }) => {
    const response = await apiLogin(params);
    setUser(response.user);
    setMinifluxUrl(response.minifluxUrl);
    return response;
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setMinifluxUrl(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        minifluxUrl,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
