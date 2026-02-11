/**
 * Platform Credentials Service
 * Manages encrypted storage of platform credentials (e.g., Twitter)
 * and updates RSSHub Docker container environment variables.
 */

import { query } from '../lib/db.js';
import { encrypt, decrypt, maskApiKey } from '../lib/crypto.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============ Types ============

export interface TwitterCredentials {
  authToken?: string;
  username?: string;
  password?: string;
  authSecret?: string;
  phoneOrEmail?: string;
  proxy?: string;
}

export interface PlatformCredentials {
  twitter?: TwitterCredentials;
}

export interface PlatformCredentialsResponse {
  twitter?: {
    hasAuthToken: boolean;
    authTokenMasked?: string;
    hasUsername: boolean;
    usernameMasked?: string;
    hasPassword: boolean;
    hasAuthSecret: boolean;
    hasPhoneOrEmail: boolean;
    phoneOrEmailMasked?: string;
    hasProxy: boolean;
    proxyMasked?: string;
  };
}

// ============ Helpers ============

function encryptField(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  return encrypt(value);
}

function decryptField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return undefined;
  }
}

function maskField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decrypted = decrypt(value);
    return maskApiKey(decrypted);
  } catch {
    return '••••••••';
  }
}

// ============ Database ============

/**
 * Get raw encrypted platform credentials from DB
 */
async function getRawCredentials(userId: number): Promise<PlatformCredentials> {
  const result = await query(
    'SELECT platform_credentials FROM fg_user_settings WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0 || !result.rows[0].platform_credentials) {
    return {};
  }

  return result.rows[0].platform_credentials as PlatformCredentials;
}

/**
 * Get platform credentials for API response (masked)
 */
export async function getPlatformCredentialsForResponse(userId: number): Promise<PlatformCredentialsResponse> {
  const creds = await getRawCredentials(userId);

  const response: PlatformCredentialsResponse = {};

  if (creds.twitter) {
    response.twitter = {
      hasAuthToken: !!creds.twitter.authToken,
      authTokenMasked: maskField(creds.twitter.authToken),
      hasUsername: !!creds.twitter.username,
      usernameMasked: creds.twitter.username ? maskField(creds.twitter.username) : undefined,
      hasPassword: !!creds.twitter.password,
      hasAuthSecret: !!creds.twitter.authSecret,
      hasPhoneOrEmail: !!creds.twitter.phoneOrEmail,
      phoneOrEmailMasked: creds.twitter.phoneOrEmail ? maskField(creds.twitter.phoneOrEmail) : undefined,
      hasProxy: !!creds.twitter.proxy,
      proxyMasked: creds.twitter.proxy ? maskField(creds.twitter.proxy) : undefined,
    };
  }

  return response;
}

/**
 * Get decrypted platform credentials (for internal use, e.g., building Docker commands)
 */
export async function getDecryptedCredentials(userId: number): Promise<PlatformCredentials> {
  const creds = await getRawCredentials(userId);

  const decrypted: PlatformCredentials = {};

  if (creds.twitter) {
    decrypted.twitter = {
      authToken: decryptField(creds.twitter.authToken),
      username: decryptField(creds.twitter.username),
      password: decryptField(creds.twitter.password),
      authSecret: decryptField(creds.twitter.authSecret),
      phoneOrEmail: decryptField(creds.twitter.phoneOrEmail),
      proxy: decryptField(creds.twitter.proxy),
    };
  }

  return decrypted;
}

/**
 * Save platform credentials (encrypt before storing)
 */
export async function savePlatformCredentials(
  userId: number,
  input: PlatformCredentials
): Promise<void> {
  // Merge with existing credentials (don't drop fields that aren't in input)
  const existing = await getRawCredentials(userId);
  const encrypted: PlatformCredentials = { ...existing };

  if (input.twitter) {
    const existingTwitter = existing.twitter || {};
    encrypted.twitter = { ...existingTwitter };

    // Only overwrite fields that are provided (non-empty string)
    if (input.twitter.authToken !== undefined && input.twitter.authToken.trim() !== '') {
      encrypted.twitter.authToken = encryptField(input.twitter.authToken);
    }
    if (input.twitter.username !== undefined && input.twitter.username.trim() !== '') {
      encrypted.twitter.username = encryptField(input.twitter.username);
    }
    if (input.twitter.password !== undefined && input.twitter.password.trim() !== '') {
      encrypted.twitter.password = encryptField(input.twitter.password);
    }
    if (input.twitter.authSecret !== undefined && input.twitter.authSecret.trim() !== '') {
      encrypted.twitter.authSecret = encryptField(input.twitter.authSecret);
    }
    if (input.twitter.phoneOrEmail !== undefined && input.twitter.phoneOrEmail.trim() !== '') {
      encrypted.twitter.phoneOrEmail = encryptField(input.twitter.phoneOrEmail);
    }
    if (input.twitter.proxy !== undefined && input.twitter.proxy.trim() !== '') {
      encrypted.twitter.proxy = encryptField(input.twitter.proxy);
    }
  }

  // Upsert into fg_user_settings
  await query(
    `INSERT INTO fg_user_settings (user_id, platform_credentials, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       platform_credentials = $2, updated_at = NOW()`,
    [userId, JSON.stringify(encrypted)]
  );
}

// ============ RSSHub Docker Management ============

/**
 * Restart RSSHub Docker container with updated environment variables
 */
export async function restartRSSHub(userId: number): Promise<{ success: boolean; message: string }> {
  // Only run in production (same machine as RSSHub)
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    console.log('[Platform] Skipping RSSHub restart in development mode');
    return { success: true, message: 'Skipped in development mode' };
  }

  try {
    const creds = await getDecryptedCredentials(userId);
    const twitter = creds.twitter || {};

    // Build environment variables
    const envVars: string[] = [
      '-e NODE_ENV=production',
      '-e TZ=Asia/Shanghai',
    ];

    if (twitter.authToken) {
      // Auth token mode: only pass the token, skip username/password to avoid failed login attempts
      envVars.push(`-e TWITTER_AUTH_TOKEN=${shellEscape(twitter.authToken)}`);
    } else {
      // Username/password fallback: only when no auth token
      if (twitter.username) {
        envVars.push(`-e TWITTER_USERNAME=${shellEscape(twitter.username)}`);
      }
      if (twitter.password) {
        envVars.push(`-e TWITTER_PASSWORD=${shellEscape(twitter.password)}`);
      }
      if (twitter.authSecret) {
        envVars.push(`-e TWITTER_AUTHENTICATION_SECRET=${shellEscape(twitter.authSecret)}`);
      }
      if (twitter.phoneOrEmail) {
        envVars.push(`-e TWITTER_PHONE_OR_EMAIL=${shellEscape(twitter.phoneOrEmail)}`);
      }
    }

    const envString = envVars.join(' ');

    // Stop and remove existing container, then start new one
    const command = `docker stop rsshub 2>/dev/null; docker rm rsshub 2>/dev/null; docker run -d --name rsshub --restart always -p 1200:1200 ${envString} diygod/rsshub:latest`;

    console.log('[Platform] Restarting RSSHub container...');
    const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
    console.log('[Platform] RSSHub restart stdout:', stdout.trim());
    if (stderr) {
      console.log('[Platform] RSSHub restart stderr:', stderr.trim());
    }

    return { success: true, message: 'RSSHub 已重启' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Platform] RSSHub restart failed:', message);
    return { success: false, message: `RSSHub 重启失败: ${message}` };
  }
}

/**
 * Test platform connection by calling RSSHub endpoint
 */
export async function testPlatformConnection(
  platform: string,
  _userId: number
): Promise<{ success: boolean; message: string }> {
  if (platform !== 'twitter') {
    return { success: false, message: `不支持的平台: ${platform}` };
  }

  try {
    // Try to fetch a known Twitter user via RSSHub
    const rsshubUrl = process.env.RSSHUB_URL || 'http://localhost:1200';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${rsshubUrl}/twitter/user/_RSSHub`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = await res.text();
      if (text.includes('<item>') || text.includes('<entry>')) {
        return { success: true, message: '✅ Twitter 连接成功，可正常获取推文' };
      }
      return { success: true, message: 'RSSHub 响应正常，但未返回推文数据' };
    }

    const errorText = await res.text().catch(() => '');
    const plainError = errorText.replace(/<[^>]*>/g, '').trim();

    // Parse specific RSSHub error patterns
    if (plainError.includes('ConfigNotFoundError')) {
      // Extract just the invalid config value (stop before "Route" or other HTML artifacts)
      const match = plainError.match(/Invalid twitter configs?:\s*([^\s]+)/);
      if (match) {
        let invalidValue = match[1].replace(/Route.*$/, '').replace(/[^a-zA-Z0-9@._\-]/g, '');
        if (invalidValue.includes('@') && invalidValue.includes('.')) {
          return { success: false, message: `❌ 用户名格式错误：「${invalidValue}」是邮箱地址。\n用户名应该是 Twitter handle（如 elonmusk），邮箱请填在「手机号/邮箱」字段。` };
        }
        if (plainError.includes('login failed') || plainError.includes('403')) {
          return { success: false, message: `❌ 账号「${invalidValue}」登录失败（服务器 IP 被 Twitter 拦截）。\n请改用 Auth Token (Cookie) 方式，从浏览器 F12 → Cookies → x.com → auth_token 获取。` };
        }
        return { success: false, message: `❌ Twitter 凭证「${invalidValue}」无效，请检查用户名和密码。` };
      }
      return { success: false, message: '❌ Twitter API 未配置或凭证无效，请检查设置。' };
    }
    if (plainError.includes('not configured')) {
      return { success: false, message: '❌ Twitter API 未配置，请先保存凭证并确保 RSSHub 已重启' };
    }
    if (plainError.includes('Rate limit') || plainError.includes('429')) {
      return { success: false, message: '⚠️ Twitter API 频率限制，凭证可能有效但需要稍后再试' };
    }
    if (plainError.includes('Unauthorized') || plainError.includes('401')) {
      return { success: false, message: '❌ Twitter 认证失败：凭证已过期或无效' };
    }
    if (plainError.includes('Forbidden') || plainError.includes('403')) {
      return { success: false, message: '❌ Twitter 访问被拒：账号可能被锁定或凭证无效' };
    }
    if (res.status === 503) {
      if (plainError.includes('login failed') || plainError.includes('403')) {
        return { success: false, message: '❌ 登录失败（服务器 IP 被 Twitter 拦截）。请改用 Auth Token (Cookie) 方式。' };
      }
      return { success: false, message: '❌ Twitter 认证失败，请检查凭证是否正确。' };
    }
    return { success: false, message: `❌ RSSHub 返回 ${res.status}: ${plainError.slice(0, 300)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('abort') || message.includes('timeout')) {
      return { success: false, message: 'RSSHub 连接超时，请检查服务是否运行' };
    }
    if (message.includes('ECONNREFUSED')) {
      return { success: false, message: 'RSSHub 服务未运行，请先保存配置以启动服务' };
    }
    return { success: false, message: `连接测试失败: ${message}` };
  }
}

// ============ Utils ============

/**
 * Escape a string for safe use in shell commands
 */
function shellEscape(str: string): string {
  // Wrap in single quotes and escape any single quotes within
  return `'${str.replace(/'/g, "'\\''")}'`;
}
