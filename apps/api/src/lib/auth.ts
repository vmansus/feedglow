/**
 * Authentication utilities
 * JWT-based auth for FeedGlow Feed Engine
 */

import { sign, verify } from 'hono/jwt';
import type { Context, Next } from 'hono';

const JWT_SECRET = process.env.JWT_SECRET || 'feedglow-dev-secret-change-me';
const TOKEN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

export interface JWTPayload {
  userId: number;
  username: string;
  isAdmin?: boolean;
  exp: number;
}

/**
 * Generate JWT token for authenticated user
 */
export async function generateToken(payload: Omit<JWTPayload, 'exp'>): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY;
  return await sign({ ...payload, exp }, JWT_SECRET);
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256');
    return payload as JWTPayload;
  } catch (err) {
    console.error('[Auth] Token verification failed:', err);
    return null;
  }
}

/**
 * Auth middleware - validates JWT and injects user context.
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Inject user info into context
  c.set('user', payload);
  c.set('userId', payload.userId);

  await next();
}

/**
 * Optional auth middleware - doesn't fail if no token
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (payload) {
      c.set('user', payload);
      c.set('userId', payload.userId);
    }
  }

  await next();
}
