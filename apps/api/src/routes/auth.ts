/**
 * Authentication routes
 * Login with Miniflux credentials, get JWT token
 */

import { Hono } from 'hono';
import { generateToken, verifyToken, authMiddleware } from '../lib/auth.js';

const auth = new Hono();

interface LoginRequest {
  minifluxUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

/**
 * POST /auth/login
 * Authenticate with Miniflux and get JWT token
 */
auth.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>();
  const { minifluxUrl, username, password, apiKey } = body;

  if (!minifluxUrl) {
    return c.json({ error: 'minifluxUrl is required' }, 400);
  }

  if (!apiKey && (!username || !password)) {
    return c.json({ error: 'Either apiKey or username/password is required' }, 400);
  }

  try {
    // Normalize URL
    const baseUrl = minifluxUrl.replace(/\/$/, '');
    
    // Build auth header
    let authHeader: string;
    let finalApiKey: string;

    if (apiKey) {
      // Use API key directly
      authHeader = `X-Auth-Token: ${apiKey}`;
      finalApiKey = apiKey;
    } else {
      // Use basic auth to get/create API key
      authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      
      // First, verify credentials by calling /me
      const meRes = await fetch(`${baseUrl}/v1/me`, {
        headers: { 'Authorization': authHeader },
      });

      if (!meRes.ok) {
        return c.json({ error: 'Invalid Miniflux credentials' }, 401);
      }

      // Try to get existing API keys
      const keysRes = await fetch(`${baseUrl}/v1/me/api-keys`, {
        headers: { 'Authorization': authHeader },
      });

      if (keysRes.ok) {
        const keys = await keysRes.json();
        const feedglowKey = keys.find((k: any) => k.description === 'FeedGlow');
        
        if (feedglowKey) {
          // Can't retrieve existing key value, need to create new one
          finalApiKey = feedglowKey.api_key || '';
        }
      }

      // Create new API key for FeedGlow
      if (!finalApiKey) {
        const createRes = await fetch(`${baseUrl}/v1/me/api-keys`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ description: 'FeedGlow' }),
        });

        if (!createRes.ok) {
          // Fall back to using basic auth token approach
          // Just verify the connection works
          finalApiKey = `basic:${Buffer.from(`${username}:${password}`).toString('base64')}`;
        } else {
          const newKey = await createRes.json();
          finalApiKey = newKey.api_key;
        }
      }
    }

    // Verify the connection works
    const verifyRes = await fetch(`${baseUrl}/v1/me`, {
      headers: apiKey 
        ? { 'X-Auth-Token': finalApiKey }
        : { 'Authorization': `Basic ${finalApiKey.replace('basic:', '')}` },
    });

    if (!verifyRes.ok) {
      return c.json({ error: 'Failed to verify Miniflux connection' }, 401);
    }

    const user = await verifyRes.json();

    // Generate JWT
    const token = await generateToken({
      userId: user.id,
      username: user.username,
      minifluxUrl: baseUrl,
      minifluxApiKey: finalApiKey,
    });

    return c.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin,
      },
      minifluxUrl: baseUrl,
    });
  } catch (err) {
    console.error('Login error:', err);
    return c.json({ 
      error: 'Failed to connect to Miniflux',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /auth/me
 * Get current user info
 */
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({
    id: user.userId,
    username: user.username,
    minifluxUrl: user.minifluxUrl,
  });
});

/**
 * POST /auth/verify
 * Verify a token is valid
 */
auth.post('/verify', async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  
  if (!token) {
    return c.json({ valid: false, error: 'No token provided' });
  }

  const payload = await verifyToken(token);
  
  if (!payload) {
    return c.json({ valid: false, error: 'Invalid or expired token' });
  }

  return c.json({
    valid: true,
    user: {
      id: payload.userId,
      username: payload.username,
    },
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  });
});

/**
 * POST /auth/logout
 * Logout (client should discard token)
 */
auth.post('/logout', (c) => {
  // JWT is stateless, logout is handled client-side
  return c.json({ success: true, message: 'Token should be discarded by client' });
});

export default auth;
