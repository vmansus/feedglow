/**
 * Twitter Token Auto-Refresh Service
 * 
 * Automatically refreshes Twitter auth_token when it expires:
 * 1. Detects stale/expired tokens via RSSHub health check
 * 2. Logs into x.com via Playwright with stored credentials + TOTP 2FA
 * 3. Extracts new auth_token cookie
 * 4. Updates DB + restarts RSSHub container
 * 
 * TOTP algorithm: RFC 6238 (HMAC-SHA1, 30s time step, 6 digits)
 */

import { createHmac } from 'crypto';
import { query } from '../lib/db.js';
import { 
  getDecryptedCredentials, 
  savePlatformCredentials, 
  restartRSSHub 
} from './platform-credentials.js';

// ============ TOTP Implementation (RFC 6238) ============

/**
 * Base32 decode (RFC 4648)
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = encoded.toUpperCase().replace(/[=\s]/g, '');
  
  let bits = '';
  for (const char of cleaned) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error(`Invalid base32 character: ${char}`);
    bits += val.toString(2).padStart(5, '0');
  }
  
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  
  return Buffer.from(bytes);
}

/**
 * Generate TOTP code from secret
 * @param secret - Base32 encoded TOTP secret
 * @param timeStep - Time step in seconds (default 30)
 * @param digits - Number of digits (default 6)
 * @returns 6-digit TOTP code string
 */
export function generateTOTP(secret: string, timeStep = 30, digits = 6): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  
  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);
  
  // HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % Math.pow(10, digits);
  
  return code.toString().padStart(digits, '0');
}

// ============ Playwright Twitter Login ============

/**
 * Log into Twitter via Playwright and extract auth_token cookie
 */
async function loginTwitterWithPlaywright(
  username: string,
  password: string,
  totpSecret?: string,
  phoneOrEmail?: string,
  proxy?: string
): Promise<{ authToken: string; ct0?: string }> {
  // Use playwright-extra with stealth plugin to bypass anti-automation
  const { chromium } = await import('playwright-extra');
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  chromium.use(StealthPlugin());
  
  // Parse proxy URL if provided
  const launchOptions: Record<string, unknown> = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  };
  
  if (proxy) {
    console.log('[TwitterAuth] Using proxy:', proxy.replace(/:([^:@]+)@/, ':***@'));
    
    // Parse proxy URL: http://user:pass@host:port → { server, username, password }
    const proxyConfig: Record<string, string> = {};
    try {
      const url = new URL(proxy);
      proxyConfig.server = `${url.protocol}//${url.hostname}:${url.port}`;
      if (url.username) proxyConfig.username = decodeURIComponent(url.username);
      if (url.password) proxyConfig.password = decodeURIComponent(url.password);
      console.log('[TwitterAuth] Proxy server:', proxyConfig.server, 'user:', proxyConfig.username ? 'yes' : 'no');
    } catch {
      // If URL parsing fails, pass as-is
      proxyConfig.server = proxy;
      console.log('[TwitterAuth] Proxy (raw):', proxy);
    }
    launchOptions.proxy = proxyConfig;
  }
  
  const browser = await chromium.launch(launchOptions);
  
  // Randomized viewport to look less bot-like
  const viewportWidth = 1280 + Math.floor(Math.random() * 100);
  const viewportHeight = 720 + Math.floor(Math.random() * 80);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: viewportWidth, height: viewportHeight },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
  
  const page = await context.newPage();
  
  // Helper: human-like delay
  const humanDelay = (min = 800, max = 2000) => 
    page.waitForTimeout(min + Math.floor(Math.random() * (max - min)));
  
  // Helper: type like a human (character by character with random delays)
  const humanType = async (locator: ReturnType<typeof page.locator>, text: string) => {
    await locator.click();
    await humanDelay(300, 600);
    for (const char of text) {
      await page.keyboard.type(char, { delay: 50 + Math.floor(Math.random() * 150) });
    }
  };
  
  try {
    console.log('[TwitterAuth] Starting login flow (stealth mode)...');
    
    // Navigate to login page (use domcontentloaded — networkidle never settles on x.com)
    await page.goto('https://x.com/i/flow/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    // Wait for JS to render the login form
    await humanDelay(3000, 5000);
    
    // Step 1: Enter username (type like a human)
    console.log('[TwitterAuth] Entering username...');
    const usernameInput = page.locator('input[autocomplete="username"], input[name="text"]');
    await usernameInput.waitFor({ timeout: 15000 });
    await humanType(usernameInput, username);
    await humanDelay(500, 1000);
    
    // Click "Next" — try multiple strategies
    console.log('[TwitterAuth] Clicking Next...');
    const nextButton = page.getByRole('button', { name: /next|下一步/i });
    await nextButton.click();
    await humanDelay(2000, 4000);
    
    // Step 1.5: Handle challenge before password
    // Could be: identity verification (phone/email) OR unusual activity screen
    const challengeInput = page.locator('input[data-testid="ocfEnterTextTextInput"]');
    const hasChallengeInput = await challengeInput.isVisible().catch(() => false);
    const passwordVisibleNow = await page.locator('input[type="password"]').isVisible().catch(() => false);
    
    if (hasChallengeInput && !passwordVisibleNow) {
      // Check page text to determine challenge type
      const pageText = await page.textContent('body').catch(() => '');
      const is2FAChallenge = /verification code|验证码|two-factor|双重|authenticator/i.test(pageText || '');
      
      if (is2FAChallenge && totpSecret) {
        console.log('[TwitterAuth] 2FA challenge detected before password...');
        const code = generateTOTP(totpSecret);
        console.log('[TwitterAuth] TOTP code:', code);
        await humanType(challengeInput, code);
      } else if (phoneOrEmail) {
        console.log('[TwitterAuth] Identity challenge detected, entering phone/email...');
        await humanType(challengeInput, phoneOrEmail);
      } else {
        throw new Error('Twitter 要求身份验证但未配置 phoneOrEmail 或 TOTP Secret');
      }
      await humanDelay(500, 1000);
      const challengeNext = page.locator('button[data-testid="ocfEnterTextNextButton"]');
      await challengeNext.click();
      await humanDelay(2000, 4000);
    }
    
    // Step 2: Enter password (type like a human)
    console.log('[TwitterAuth] Entering password...');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    await passwordInput.waitFor({ timeout: 10000 });
    await humanType(passwordInput, password);
    await humanDelay(500, 1000);
    
    // Click "Log in"
    const loginButton = page.locator('button[data-testid="LoginForm_Login_Button"], button:has-text("Log in"), button:has-text("登录")');
    await loginButton.click();
    await humanDelay(2000, 4000);
    
    // Step 3: Handle 2FA if needed
    const twoFAInput = page.locator('input[data-testid="ocfEnterTextTextInput"], input[inputmode="numeric"], input[autocomplete="one-time-code"]');
    const has2FA = await twoFAInput.isVisible().catch(() => false);
    
    if (has2FA) {
      if (!totpSecret) {
        throw new Error('Twitter 要求 2FA 验证码，但未配置 TOTP Secret');
      }
      
      console.log('[TwitterAuth] Generating TOTP code and entering 2FA...');
      const totpCode = generateTOTP(totpSecret);
      await humanType(twoFAInput, totpCode);
      await humanDelay(500, 1000);
      
      // Click "Next" / "Confirm"
      const confirmButton = page.locator('button[data-testid="ocfEnterTextNextButton"], button:has-text("Next"), button:has-text("确认"), button:has-text("Confirm")');
      await confirmButton.click();
      await humanDelay(2000, 4000);
    }
    
    // Step 4: Wait for redirect to home / verify login success
    console.log('[TwitterAuth] Waiting for login completion...');
    
    // Wait for either home page, cookies page, or an error
    try {
      await page.waitForURL(/x\.com\/home|x\.com\/\?|x\.com(?!.*\/i\/flow\/login)/, { timeout: 15000 });
    } catch {
      const currentUrl = page.url();
      console.log('[TwitterAuth] Current URL after login:', currentUrl);
      
      // Check for error messages
      const errorText = await page.locator('[data-testid="error-detail"], [role="alert"]').textContent().catch(() => '');
      if (errorText) {
        throw new Error(`Twitter 登录失败: ${errorText}`);
      }
      
      // If still on login page, something went wrong
      if (currentUrl.includes('/i/flow/login')) {
        throw new Error('登录流程未完成，可能凭证错误或遇到未知验证步骤');
      }
      // Otherwise we might be on some intermediate page but still logged in
      console.log('[TwitterAuth] Not on home page but checking cookies anyway...');
    }
    
    // Step 5: Extract cookies
    console.log('[TwitterAuth] Extracting cookies...');
    const cookies = await context.cookies('https://x.com');
    
    const authTokenCookie = cookies.find(c => c.name === 'auth_token');
    const ct0Cookie = cookies.find(c => c.name === 'ct0');
    
    if (!authTokenCookie?.value) {
      throw new Error('登录成功但未找到 auth_token cookie');
    }
    
    console.log('[TwitterAuth] Login successful! Got auth_token:', authTokenCookie.value.slice(0, 8) + '...');
    
    return {
      authToken: authTokenCookie.value,
      ct0: ct0Cookie?.value,
    };
    
  } finally {
    await browser.close();
  }
}

// ============ Token Health Check ============

/**
 * Check if current Twitter token is healthy by testing RSSHub
 */
export async function checkTwitterTokenHealth(): Promise<{
  healthy: boolean;
  stale: boolean;
  message: string;
  latestTweetAge?: number; // hours since latest tweet
}> {
  const rsshubUrl = process.env.RSSHUB_URL || 'http://localhost:1200';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    // Test with a popular account that tweets frequently
    const res = await fetch(`${rsshubUrl}/twitter/user/elonmusk`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (text.includes('error') || res.status >= 400) {
        return { healthy: false, stale: false, message: `RSSHub 返回 ${res.status}` };
      }
    }
    
    const xml = await res.text();
    
    // Check if we got actual content
    if (!xml.includes('<item>') && !xml.includes('<entry>')) {
      return { healthy: false, stale: false, message: '无推文数据返回' };
    }
    
    // Parse latest pubDate to check freshness
    const pubDateMatch = xml.match(/<pubDate>([^<]+)<\/pubDate>/);
    if (pubDateMatch) {
      const latestDate = new Date(pubDateMatch[1]);
      const ageHours = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60);
      
      // If latest tweet is older than 7 days, token is likely stale
      if (ageHours > 168) {
        return {
          healthy: false,
          stale: true,
          message: `最新推文已过期 ${Math.round(ageHours / 24)} 天，Token 可能已失效`,
          latestTweetAge: ageHours,
        };
      }
      
      return {
        healthy: true,
        stale: false,
        message: `Token 正常，最新推文 ${ageHours < 1 ? '不到 1 小时' : Math.round(ageHours) + ' 小时'}前`,
        latestTweetAge: ageHours,
      };
    }
    
    // Can't parse date but got content — assume OK
    return { healthy: true, stale: false, message: '连接正常' };
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.includes('abort') || msg.includes('timeout')) {
      return { healthy: false, stale: false, message: 'RSSHub 连接超时' };
    }
    if (msg.includes('ECONNREFUSED')) {
      return { healthy: false, stale: false, message: 'RSSHub 未运行' };
    }
    return { healthy: false, stale: false, message: `检查失败: ${msg}` };
  }
}

// ============ Auto-Refresh Orchestrator ============

/**
 * Attempt to refresh Twitter token for a user
 * Returns the new auth_token on success
 */
export async function refreshTwitterToken(userId: number): Promise<{
  success: boolean;
  message: string;
  newToken?: string;
}> {
  console.log(`[TwitterAuth] Starting token refresh for user ${userId}...`);
  
  // Get stored credentials
  const creds = await getDecryptedCredentials(userId);
  const twitter = creds.twitter;
  
  if (!twitter?.username || !twitter?.password) {
    return {
      success: false,
      message: '未配置 Twitter 用户名/密码，无法自动刷新 Token。请在设置中配置。',
    };
  }
  
  try {
    // Login via Playwright (with proxy if configured)
    const result = await loginTwitterWithPlaywright(
      twitter.username,
      twitter.password,
      twitter.authSecret,
      twitter.phoneOrEmail,
      twitter.proxy
    );
    
    // Save new auth_token to DB
    await savePlatformCredentials(userId, {
      twitter: {
        authToken: result.authToken,
      },
    });
    
    // Restart RSSHub with new token
    const restartResult = await restartRSSHub(userId);
    
    if (!restartResult.success) {
      return {
        success: false,
        message: `Token 获取成功但 RSSHub 重启失败: ${restartResult.message}`,
        newToken: result.authToken,
      };
    }
    
    // Log the refresh event
    await logRefreshEvent(userId, true, 'Token 自动刷新成功');
    
    console.log(`[TwitterAuth] Token refresh successful for user ${userId}`);
    
    return {
      success: true,
      message: '✅ Twitter Token 自动刷新成功，RSSHub 已重启',
      newToken: result.authToken,
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[TwitterAuth] Token refresh failed for user ${userId}:`, message);
    
    await logRefreshEvent(userId, false, message);
    
    return {
      success: false,
      message: `Token 刷新失败: ${message}`,
    };
  }
}

/**
 * Auto-refresh check: runs periodically, refreshes if token is stale
 */
export async function autoRefreshCheck(): Promise<{
  checked: boolean;
  refreshed: boolean;
  message: string;
}> {
  console.log('[TwitterAuth] Running auto-refresh check...');
  
  // Check token health
  const health = await checkTwitterTokenHealth();
  
  if (health.healthy) {
    console.log('[TwitterAuth] Token is healthy:', health.message);
    return { checked: true, refreshed: false, message: health.message };
  }
  
  console.log('[TwitterAuth] Token unhealthy:', health.message);
  
  // Find a user with Twitter credentials configured
  // (For single-user setup, just get the first user with credentials)
  const result = await query(
    `SELECT user_id FROM fg_user_settings 
     WHERE platform_credentials IS NOT NULL 
       AND platform_credentials::text LIKE '%username%'
     LIMIT 1`
  );
  
  if (result.rows.length === 0) {
    return {
      checked: true,
      refreshed: false,
      message: 'Token 失效但无用户配置了登录凭证，无法自动刷新',
    };
  }
  
  const userId = result.rows[0].user_id;
  
  // Check cooldown: don't refresh more than once per hour
  const lastRefresh = await getLastRefreshTime(userId);
  if (lastRefresh && Date.now() - lastRefresh.getTime() < 3600000) {
    return {
      checked: true,
      refreshed: false,
      message: `上次刷新不到 1 小时前 (${lastRefresh.toISOString()})，跳过`,
    };
  }
  
  // Attempt refresh
  const refreshResult = await refreshTwitterToken(userId);
  
  return {
    checked: true,
    refreshed: refreshResult.success,
    message: refreshResult.message,
  };
}

// ============ Refresh Log ============

/**
 * Ensure refresh log table exists
 */
async function ensureRefreshLogTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS fg_twitter_refresh_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES fg_users(id),
      success BOOLEAN NOT NULL,
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

/**
 * Log a refresh attempt
 */
async function logRefreshEvent(userId: number, success: boolean, message: string): Promise<void> {
  try {
    await ensureRefreshLogTable();
    await query(
      'INSERT INTO fg_twitter_refresh_log (user_id, success, message) VALUES ($1, $2, $3)',
      [userId, success, message]
    );
  } catch (err) {
    console.error('[TwitterAuth] Failed to log refresh event:', err);
  }
}

/**
 * Get last successful refresh time
 */
async function getLastRefreshTime(userId: number): Promise<Date | null> {
  try {
    await ensureRefreshLogTable();
    const result = await query(
      `SELECT created_at FROM fg_twitter_refresh_log 
       WHERE user_id = $1 AND success = true 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0 ? new Date(result.rows[0].created_at) : null;
  } catch {
    return null;
  }
}

/**
 * Get refresh history for a user
 */
export async function getRefreshHistory(userId: number, limit = 20): Promise<Array<{
  success: boolean;
  message: string;
  createdAt: string;
}>> {
  try {
    await ensureRefreshLogTable();
    const result = await query(
      `SELECT success, message, created_at FROM fg_twitter_refresh_log 
       WHERE user_id = $1 
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(row => ({
      success: row.success,
      message: row.message,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

// ============ Scheduled Check (integrate with feed engine) ============

let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic token health checks (every 6 hours)
 */
export function startAutoRefreshScheduler(intervalMs = 6 * 60 * 60 * 1000): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  console.log(`[TwitterAuth] Auto-refresh scheduler started (interval: ${intervalMs / 3600000}h)`);
  
  // Run initial check after 30 seconds (let server start up)
  setTimeout(() => {
    autoRefreshCheck().catch(err => {
      console.error('[TwitterAuth] Initial auto-refresh check failed:', err);
    });
  }, 30000);
  
  // Schedule periodic checks
  refreshInterval = setInterval(() => {
    autoRefreshCheck().catch(err => {
      console.error('[TwitterAuth] Scheduled auto-refresh check failed:', err);
    });
  }, intervalMs);
}

/**
 * Stop the auto-refresh scheduler
 */
export function stopAutoRefreshScheduler(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('[TwitterAuth] Auto-refresh scheduler stopped');
  }
}
