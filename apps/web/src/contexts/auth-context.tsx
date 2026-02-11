'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  type User,
  type LoginResponse,
  getStoredAuth,
  login as apiLogin,
  logout as apiLogout,
  getCurrentUser,
  refreshToken,
} from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (params: {
    username?: string;
    password?: string;
  }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PUBLIC_PATHS = ['/', '/login', '/offline'];
const PUBLIC_PREFIXES = ['/shared/'];

// Refresh access token 2 minutes before it expires (13 min interval for 15 min tokens)
const REFRESH_INTERVAL_MS = 13 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(async () => {
      const result = await refreshToken();
      if (!result) {
        // Refresh failed — token expired, force logout
        setUser(null);
        router.push('/login?expired=1');
      }
    }, REFRESH_INTERVAL_MS);
  }, [router]);

  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const stored = getStoredAuth();
      
      if (stored.token) {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          startRefreshTimer();
        }
      }
      
      setIsLoading(false);
    };

    initAuth();

    return () => stopRefreshTimer();
  }, [startRefreshTimer, stopRefreshTimer]);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
    if (!isLoading && !user && !isPublic) {
      router.push('/login');
    }
  }, [isLoading, user, pathname, router]);

  const login = async (params: {
    username?: string;
    password?: string;
  }) => {
    const response = await apiLogin(params);
    setUser(response.user);
    startRefreshTimer();
    return response;
  };

  const logout = async () => {
    stopRefreshTimer();
    await apiLogout();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
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
