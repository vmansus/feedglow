/**
 * Internationalization Service (P2 #19)
 * 
 * Basic i18n for API error messages and system text.
 */

type Locale = 'zh' | 'en';

const messages: Record<string, Record<Locale, string>> = {
  // Auth
  'auth.invalid_credentials': { zh: '用户名或密码错误', en: 'Invalid username or password' },
  'auth.token_expired': { zh: '登录已过期，请重新登录', en: 'Session expired, please login again' },
  'auth.unauthorized': { zh: '未授权，请先登录', en: 'Unauthorized, please login first' },

  // AI
  'ai.invalid_key': { zh: 'API Key 无效，请在设置中检查', en: 'Invalid API key, check your settings' },
  'ai.quota_exceeded': { zh: 'API 额度用完，请充值或更换 Key', en: 'API quota exceeded, please top up' },
  'ai.model_not_found': { zh: '模型不存在，请检查设置', en: 'Model not found, check your settings' },
  'ai.rate_limited': { zh: '请求太频繁，请稍后再试', en: 'Rate limited, please try again later' },
  'ai.connection_error': { zh: 'AI 服务连接超时', en: 'AI service connection timeout' },
  'ai.not_configured': { zh: '尚未配置 AI，请先设置 API Key', en: 'AI not configured, set up API key first' },

  // Feed
  'feed.not_found': { zh: '订阅源不存在', en: 'Feed not found' },
  'feed.no_rss': { zh: '未找到 RSS 源', en: 'No RSS feed found at this URL' },

  // Entry
  'entry.not_found': { zh: '文章不存在', en: 'Entry not found' },

  // General
  'error.internal': { zh: '服务器内部错误', en: 'Internal server error' },
  'error.bad_request': { zh: '请求参数错误', en: 'Bad request' },
  'error.not_found': { zh: '资源不存在', en: 'Not found' },
};

/**
 * Get locale from request Accept-Language header
 */
export function getLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return 'zh';  // Default to Chinese
  const lower = acceptLanguage.toLowerCase();
  if (lower.startsWith('en')) return 'en';
  return 'zh';
}

/**
 * Get translated message
 */
export function t(key: string, locale: Locale = 'zh'): string {
  const msg = messages[key];
  if (!msg) return key;
  return msg[locale] || msg['zh'] || key;
}

/**
 * Get locale from Hono context
 */
export function getLocaleFromContext(c: any): Locale {
  return getLocale(c.req.header('Accept-Language'));
}
