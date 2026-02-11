/**
 * FeedGlow Auth - Self-owned user authentication
 * Replaces Miniflux credential-based login
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sign, verify } from 'hono/utils/jwt/jwt';
import { getUserByUsername, getUserByEmail, createUser, updateLastLogin, updateUserPassword, getUserPasswordHash, type FGUser } from './store.js';
import { query } from '../lib/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ACCESS_TOKEN_EXPIRY_MINUTES = 15;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const SALT_ROUNDS = 12;

// Registration mode: 'open' | 'invite' | 'closed'
const REGISTRATION_MODE = (process.env.REGISTRATION_MODE || 'closed') as 'open' | 'invite' | 'closed';

// Login rate limiting (in-memory)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface AuthPayload {
  userId: number;
  username: string;
  isAdmin: boolean;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Get current registration mode
 */
export function getRegistrationMode(): string {
  return REGISTRATION_MODE;
}

/**
 * Register a new user
 */
export async function register(
  username: string,
  password: string,
  email?: string,
  inviteCode?: string
): Promise<{ user: FGUser; accessToken: string; refreshToken: string }> {
  // Check registration mode
  if (REGISTRATION_MODE === 'closed') {
    throw new AuthError('Registration is currently closed', 403);
  }

  if (REGISTRATION_MODE === 'invite') {
    if (!inviteCode) throw new AuthError('Invite code is required', 400);
    const invite = await validateInviteCode(inviteCode);
    if (!invite) throw new AuthError('Invalid or expired invite code', 400);
  }

  // Validate
  if (username.length < 3) throw new AuthError('Username must be at least 3 characters', 400);
  if (password.length < 8) throw new AuthError('Password must be at least 8 characters', 400);
  if (email && !email.includes('@')) throw new AuthError('Invalid email address', 400);

  // Check existing
  const existingUser = await getUserByUsername(username);
  if (existingUser) throw new AuthError('Username already taken', 409);

  if (email) {
    const existingEmail = await getUserByEmail(email);
    if (existingEmail) throw new AuthError('Email already registered', 409);
  }

  // Create user
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser(username, passwordHash, email);

  // Mark invite as used
  if (REGISTRATION_MODE === 'invite' && inviteCode) {
    await markInviteUsed(inviteCode, user.id);
  }

  const { accessToken, refreshToken } = await generateTokenPair(user);
  return { user, accessToken, refreshToken };
}

/**
 * Check login rate limit
 */
function checkRateLimit(ip: string): void {
  const entry = loginAttempts.get(ip);
  if (!entry) return;

  if (entry.lockedUntil > Date.now()) {
    const remainingMin = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    throw new AuthError(`Too many login attempts. Try again in ${remainingMin} minutes`, 429);
  }

  // Reset if lockout expired
  if (entry.lockedUntil <= Date.now() && entry.count >= MAX_LOGIN_ATTEMPTS) {
    loginAttempts.delete(ip);
  }
}

function recordFailedLogin(ip: string): void {
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }
  loginAttempts.set(ip, entry);
}

function clearFailedLogins(ip: string): void {
  loginAttempts.delete(ip);
}

/**
 * Login with username/email + password
 */
export async function login(
  usernameOrEmail: string,
  password: string,
  ip?: string
): Promise<{ user: FGUser; accessToken: string; refreshToken: string }> {
  // Rate limit check
  if (ip) checkRateLimit(ip);

  // Try username first, then email
  let userWithHash = await getUserByUsername(usernameOrEmail);
  if (!userWithHash && usernameOrEmail.includes('@')) {
    userWithHash = await getUserByEmail(usernameOrEmail);
  }

  if (!userWithHash) {
    if (ip) recordFailedLogin(ip);
    throw new AuthError('Invalid credentials', 401);
  }

  const valid = await bcrypt.compare(password, userWithHash.passwordHash);
  if (!valid) {
    if (ip) recordFailedLogin(ip);
    throw new AuthError('Invalid credentials', 401);
  }

  if (ip) clearFailedLogins(ip);
  await updateLastLogin(userWithHash.id);

  // Strip passwordHash from response
  const { passwordHash: _, ...user } = userWithHash;
  const { accessToken, refreshToken } = await generateTokenPair(user);
  return { user, accessToken, refreshToken };
}

/**
 * Change password for authenticated user
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 8) throw new AuthError('New password must be at least 8 characters', 400);

  const passwordHash = await getUserPasswordHash(userId);
  if (!passwordHash) throw new AuthError('User not found', 404);

  const valid = await bcrypt.compare(currentPassword, passwordHash);
  if (!valid) throw new AuthError('Current password is incorrect', 403);

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await updateUserPassword(userId, newHash);
}

/**
 * Verify JWT token and return payload
 */
export async function verifyToken(token: string): Promise<AuthPayload> {
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256') as any;
    return {
      userId: payload.userId,
      username: payload.username,
      isAdmin: payload.isAdmin || false,
      exp: payload.exp,
    };
  } catch (err) {
    console.error('[FeedEngine Auth] Token verify failed:', err instanceof Error ? err.message : err);
    console.error('[FeedEngine Auth] JWT_SECRET:', JWT_SECRET.slice(0, 10) + '...');
    console.error('[FeedEngine Auth] Token prefix:', token.slice(0, 50) + '...');
    throw new AuthError('Invalid or expired token', 401);
  }
}

/**
 * Sign an arbitrary JWT payload (used by legacy login)
 */
export async function signJwt(payload: Record<string, any>): Promise<string> {
  return await sign(payload, JWT_SECRET);
}

/**
 * Generate access token (short-lived, 15 min)
 */
async function generateAccessToken(user: FGUser | Omit<FGUser, 'createdAt' | 'lastLoginAt' | 'language' | 'timezone'>): Promise<string> {
  const payload: AuthPayload = {
    userId: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    exp: Math.floor(Date.now() / 1000) + (ACCESS_TOKEN_EXPIRY_MINUTES * 60),
  };
  return await sign(payload, JWT_SECRET);
}

/**
 * Generate refresh token (long-lived, 30 days) and store hash in DB
 */
async function generateRefreshToken(userId: number, deviceInfo?: string, ipAddress?: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 3600 * 1000);

  await query(
    `INSERT INTO fg_refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, deviceInfo || null, ipAddress || null, expiresAt]
  );

  return token;
}

/**
 * Generate both access + refresh tokens
 */
export async function generateTokenPair(
  user: FGUser | Omit<FGUser, 'createdAt' | 'lastLoginAt' | 'language' | 'timezone'>,
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const accessToken = await generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id, deviceInfo, ipAddress);
  return { accessToken, refreshToken };
}

/**
 * Refresh: validate refresh token → issue new access token + rotate refresh token
 */
export async function refreshAccessToken(
  oldRefreshToken: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string; user: FGUser }> {
  const tokenHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

  // Find and validate
  const result = await query(
    `SELECT rt.*, u.* FROM fg_refresh_tokens rt
     JOIN fg_users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  if (!result.rows[0]) {
    throw new AuthError('Invalid or expired refresh token', 401);
  }

  const row = result.rows[0];
  const user: FGUser = {
    id: row.user_id,
    username: row.username,
    email: row.email || undefined,
    isAdmin: row.is_admin,
    language: row.language,
    timezone: row.timezone,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };

  // Rotate: delete old token, create new one
  await query('DELETE FROM fg_refresh_tokens WHERE token_hash = $1', [tokenHash]);

  const accessToken = await generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id, deviceInfo, ipAddress);

  return { accessToken, refreshToken: newRefreshToken, user };
}

/**
 * Revoke a specific refresh token (logout)
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await query('DELETE FROM fg_refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

/**
 * Revoke all refresh tokens for a user (logout everywhere)
 */
export async function revokeAllRefreshTokens(userId: number): Promise<void> {
  await query('DELETE FROM fg_refresh_tokens WHERE user_id = $1', [userId]);
}

/**
 * List active sessions for a user
 */
export async function getActiveSessions(userId: number): Promise<Array<{
  id: number;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}>> {
  const result = await query(
    `SELECT id, device_info, ip_address, created_at, expires_at
     FROM fg_refresh_tokens
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map((r: any) => ({
    id: r.id,
    deviceInfo: r.device_info,
    ipAddress: r.ip_address,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/**
 * Revoke a specific session by ID
 */
export async function revokeSession(userId: number, sessionId: number): Promise<void> {
  await query('DELETE FROM fg_refresh_tokens WHERE id = $1 AND user_id = $2', [sessionId, userId]);
}

// ============ Invite Codes ============

/**
 * Generate an invite code (admin only)
 */
export async function generateInviteCode(createdBy: number, expiresInHours?: number): Promise<string> {
  const code = crypto.randomBytes(16).toString('base64url');
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600 * 1000)
    : null;

  await query(
    `INSERT INTO fg_invites (code, created_by, expires_at) VALUES ($1, $2, $3)`,
    [code, createdBy, expiresAt]
  );

  return code;
}

/**
 * Validate an invite code
 */
async function validateInviteCode(code: string): Promise<boolean> {
  const result = await query(
    `SELECT id FROM fg_invites
     WHERE code = $1 AND used_by IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [code]
  );
  return result.rows.length > 0;
}

/**
 * Mark invite as used
 */
async function markInviteUsed(code: string, userId: number): Promise<void> {
  await query(
    `UPDATE fg_invites SET used_by = $1, used_at = NOW() WHERE code = $2`,
    [userId, code]
  );
}

/**
 * List invites (admin)
 */
export async function listInvites(createdBy?: number): Promise<any[]> {
  const result = createdBy
    ? await query('SELECT * FROM fg_invites WHERE created_by = $1 ORDER BY created_at DESC', [createdBy])
    : await query('SELECT * FROM fg_invites ORDER BY created_at DESC');
  return result.rows;
}

/**
 * Hono middleware - auth for feed engine routes
 */
export function feedEngineAuthMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyToken(token);
      c.set('user', payload);
      c.set('userId', payload.userId);
      await next();
    } catch (err) {
      if (err instanceof AuthError) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: 'Authentication failed' }, 401);
    }
  };
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AuthError';
  }
}
