/**
 * Auth API client
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface User {
  id: number;
  username: string;
  email?: string;
  isAdmin?: boolean;
}

export interface LoginResponse {
  token: string;
  accessToken: string;
  user: User;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

const TOKEN_KEY = 'feedglow_token';
const USER_KEY = 'feedglow_user';

export function getStoredAuth(): AuthState {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }
  
  const token = localStorage.getItem(TOKEN_KEY);
  const userStr = localStorage.getItem(USER_KEY);
  
  return {
    token,
    user: userStr ? JSON.parse(userStr) : null,
  };
}

export function setStoredAuth(data: { token?: string; accessToken?: string; user: User }): void {
  const token = data.accessToken || data.token || '';
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  // Clean up legacy keys
  localStorage.removeItem('feedglow_miniflux_url');
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('feedglow_miniflux_url');
}

export function getAuthHeader(): Record<string, string> {
  const { token } = getStoredAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Refresh access token using httpOnly cookie
 */
export async function refreshToken(): Promise<LoginResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',  // sends httpOnly cookie
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    setStoredAuth(data);
    return data;
  } catch {
    return null;
  }
}

export async function login(params: {
  username?: string;
  password?: string;
}): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',  // receive httpOnly cookie
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

export async function register(params: {
  username: string;
  password: string;
  email?: string;
  inviteCode?: string;
}): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Registration failed');
  }

  const data = await res.json();
  setStoredAuth(data);
  return data;
}

export async function getRegistrationMode(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/registration-mode`);
    if (!res.ok) return 'closed';
    const data = await res.json();
    return data.mode || 'closed';
  } catch {
    return 'closed';
  }
}

export async function changePassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to change password');
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const { token } = getStoredAuth();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Try refresh
      const refreshed = await refreshToken();
      if (refreshed) return refreshed.user;
      clearStoredAuth();
      return null;
    }

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
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeader(),
    });
  } catch {
    // Ignore errors
  }
  clearStoredAuth();
}
