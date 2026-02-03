/**
 * Auth API client
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface User {
  id: number;
  username: string;
  isAdmin?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
  minifluxUrl: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  minifluxUrl: string | null;
}

const TOKEN_KEY = 'feedglow_token';
const USER_KEY = 'feedglow_user';
const MINIFLUX_URL_KEY = 'feedglow_miniflux_url';

export function getStoredAuth(): AuthState {
  if (typeof window === 'undefined') {
    return { token: null, user: null, minifluxUrl: null };
  }
  
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  const minifluxUrl = localStorage.getItem(MINIFLUX_URL_KEY);
  
  return {
    token,
    user: userStr ? JSON.parse(userStr) : null,
    minifluxUrl,
  };
}

export function setStoredAuth(auth: LoginResponse): void {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
  localStorage.setItem(MINIFLUX_URL_KEY, auth.minifluxUrl);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(MINIFLUX_URL_KEY);
}

export function getAuthHeader(): Record<string, string> {
  const { token } = getStoredAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(params: {
  minifluxUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
}): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await res.json();
  setStoredAuth(data);
  return data;
}

export async function verifyToken(token: string): Promise<{ valid: boolean; user?: User }> {
  const res = await fetch(`${API_BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  return res.json();
}

export async function getCurrentUser(): Promise<User | null> {
  const { token } = getStoredAuth();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      clearStoredAuth();
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const { token } = getStoredAuth();
  
  if (token) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore errors, just clear local storage
    }
  }
  
  clearStoredAuth();
}
