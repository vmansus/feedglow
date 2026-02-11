/**
 * Auth Routes - FeedGlow authentication
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  register, login, changePassword, refreshAccessToken,
  revokeRefreshToken, revokeAllRefreshTokens, getActiveSessions, revokeSession,
  generateInviteCode, listInvites, getRegistrationMode,
  feedEngineAuthMiddleware, AuthError
} from './auth.js';
import { getUserById } from './store.js';

const authRoutes = new Hono();

const REFRESH_COOKIE_NAME = 'fg_refresh_token';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 3600; // 30 days in seconds
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function setRefreshCookie(c: any, refreshToken: string) {
  setCookie(c, REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown';
}

// ============ Registration Mode ============

authRoutes.get('/registration-mode', (c) => {
  return c.json({ mode: getRegistrationMode() });
});

// ============ Register ============

const registerSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(8),
  email: z.string().email().optional(),
  inviteCode: z.string().optional(),
});

authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { username, password, email, inviteCode } = c.req.valid('json');

  try {
    const { user, accessToken, refreshToken } = await register(username, password, email, inviteCode);
    setRefreshCookie(c, refreshToken);
    return c.json({
      token: accessToken,  // backward compat
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    }, 201);
  } catch (err) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

// ============ Login ============

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { username, password } = c.req.valid('json');
  const ip = getClientIp(c);
  const deviceInfo = c.req.header('user-agent') || undefined;

  try {
    const { user, accessToken, refreshToken } = await login(username, password, ip);
    setRefreshCookie(c, refreshToken);
    return c.json({
      token: accessToken,  // backward compat
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

// ============ Refresh Token ============

authRoutes.post('/refresh', async (c) => {
  // Try cookie first, then body
  let refreshToken = getCookie(c, REFRESH_COOKIE_NAME);

  if (!refreshToken) {
    try {
      const body = await c.req.json();
      refreshToken = body.refreshToken;
    } catch {}
  }

  if (!refreshToken) {
    return c.json({ error: 'No refresh token provided' }, 401);
  }

  try {
    const deviceInfo = c.req.header('user-agent') || undefined;
    const ipAddress = getClientIp(c);
    const result = await refreshAccessToken(refreshToken, deviceInfo, ipAddress);

    setRefreshCookie(c, result.refreshToken);
    return c.json({
      token: result.accessToken,  // backward compat
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        isAdmin: result.user.isAdmin,
      },
    });
  } catch (err) {
    // Clear invalid cookie
    deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/api/auth' });
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

// ============ Logout ============

authRoutes.post('/logout', async (c) => {
  const refreshToken = getCookie(c, REFRESH_COOKIE_NAME);
  if (refreshToken) {
    try {
      await revokeRefreshToken(refreshToken);
    } catch {}
  }
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/api/auth' });
  return c.json({ message: 'Logged out' });
});

// ============ Logout All Sessions ============

authRoutes.post('/logout-all', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  await revokeAllRefreshTokens(payload.userId);
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/api/auth' });
  return c.json({ message: 'All sessions revoked' });
});

// ============ Change Password ============

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRoutes.post('/change-password', feedEngineAuthMiddleware(), zValidator('json', changePasswordSchema), async (c) => {
  const { currentPassword, newPassword } = c.req.valid('json');
  const payload = c.get('user') as any;

  try {
    await changePassword(payload.userId, currentPassword, newPassword);
    // Revoke all sessions (including current)
    await revokeAllRefreshTokens(payload.userId);
    // Issue new tokens for current session so user stays logged in
    const { generateTokenPair } = await import('./auth.js');
    const user = { id: payload.userId, username: payload.username, isAdmin: payload.isAdmin ?? false };
    const deviceInfo = c.req.header('user-agent') || undefined;
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const { accessToken, refreshToken } = await generateTokenPair(user, deviceInfo, ipAddress);

    // Set new refresh token cookie
    c.header('Set-Cookie', `fg_refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${30 * 24 * 60 * 60}`);

    return c.json({
      message: 'Password changed successfully',
      accessToken,
      token: accessToken,
      user: { id: payload.userId, username: payload.username, isAdmin: payload.isAdmin },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

// ============ Sessions ============

authRoutes.get('/sessions', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  const sessions = await getActiveSessions(payload.userId);
  return c.json({ sessions });
});

authRoutes.delete('/sessions/:id', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  const sessionId = parseInt(c.req.param('id'));
  await revokeSession(payload.userId, sessionId);
  return c.json({ message: 'Session revoked' });
});

// ============ Invite Codes (Admin) ============

authRoutes.post('/invites', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  if (!payload.isAdmin) return c.json({ error: 'Admin only' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const expiresInHours = body.expiresInHours || undefined;
  const code = await generateInviteCode(payload.userId, expiresInHours);
  return c.json({ code }, 201);
});

authRoutes.get('/invites', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  if (!payload.isAdmin) return c.json({ error: 'Admin only' }, 403);

  const invites = await listInvites();
  return c.json({ invites });
});

// ============ Me (current user info) ============

authRoutes.get('/me', feedEngineAuthMiddleware(), async (c) => {
  const payload = c.get('user') as any;
  const user = await getUserById(payload.userId);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.isAdmin,
    language: user.language,
    timezone: user.timezone,
  });
});

export default authRoutes;
