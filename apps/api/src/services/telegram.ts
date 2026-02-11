/**
 * Telegram Bot Integration Service
 * Handles sending messages, webhook processing, and user binding
 */

import { query } from '../lib/db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import crypto from 'crypto';

const TELEGRAM_API = 'https://api.telegram.org/bot';

// Cache bot config in memory to avoid DB lookups on every notification
let botConfigCache: { token: string; username: string; userId: number; cachedAt: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get bot config from user settings (encrypted in DB)
 */
async function getBotConfig(userId?: number): Promise<{ token: string; username: string } | null> {
  // Check cache first
  if (botConfigCache && Date.now() - botConfigCache.cachedAt < CACHE_TTL) {
    return { token: botConfigCache.token, username: botConfigCache.username };
  }

  // Query: if userId given, get that user's config; otherwise get any configured bot
  const r = userId
    ? await query(
        `SELECT telegram_bot_token, telegram_bot_username FROM fg_user_settings WHERE user_id = $1 AND telegram_bot_token IS NOT NULL`,
        [userId]
      )
    : await query(
        `SELECT telegram_bot_token, telegram_bot_username, user_id FROM fg_user_settings WHERE telegram_bot_token IS NOT NULL LIMIT 1`
      );

  if (!r.rows[0]?.telegram_bot_token) return null;

  try {
    const token = decrypt(r.rows[0].telegram_bot_token);
    const username = r.rows[0].telegram_bot_username || '';
    botConfigCache = { token, username, userId: userId || r.rows[0].user_id, cachedAt: Date.now() };
    return { token, username };
  } catch {
    return null;
  }
}

/**
 * Save bot config (encrypted)
 */
export async function saveBotConfig(userId: number, botToken: string, botUsername: string): Promise<{ success: boolean; error?: string }> {
  // Validate token by calling getMe
  try {
    const res = await fetch(`${TELEGRAM_API}${botToken}/getMe`, { method: 'GET' });
    if (!res.ok) {
      return { success: false, error: 'Bot Token 无效，请检查后重试' };
    }
    const data = await res.json();
    const actualUsername = data.result?.username || botUsername;

    // Ensure user_settings row exists
    await query(`INSERT INTO fg_user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);

    // Encrypt and save
    const encryptedToken = encrypt(botToken);
    await query(
      `UPDATE fg_user_settings SET telegram_bot_token = $1, telegram_bot_username = $2 WHERE user_id = $3`,
      [encryptedToken, actualUsername, userId]
    );

    // Invalidate cache
    botConfigCache = null;

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '验证失败' };
  }
}

/**
 * Get bot config for display (masked token)
 */
export async function getBotConfigForDisplay(userId: number): Promise<{ configured: boolean; botUsername?: string; maskedToken?: string }> {
  const r = await query(
    `SELECT telegram_bot_token, telegram_bot_username FROM fg_user_settings WHERE user_id = $1`,
    [userId]
  );

  if (!r.rows[0]?.telegram_bot_token) {
    return { configured: false };
  }

  try {
    const token = decrypt(r.rows[0].telegram_bot_token);
    const masked = token.length > 10 ? token.slice(0, 6) + '••••••' + token.slice(-4) : '••••••••';
    return { configured: true, botUsername: r.rows[0].telegram_bot_username, maskedToken: masked };
  } catch {
    return { configured: false };
  }
}

/**
 * Remove bot config
 */
export async function removeBotConfig(userId: number): Promise<void> {
  await query(
    `UPDATE fg_user_settings SET telegram_bot_token = NULL, telegram_bot_username = NULL WHERE user_id = $1`,
    [userId]
  );
  botConfigCache = null;
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: string = 'HTML',
  tokenOverride?: string
): Promise<boolean> {
  let token = tokenOverride;
  if (!token) {
    const config = await getBotConfig();
    token = config?.token;
  }
  if (!token) {
    console.warn('[Telegram] Bot token not configured');
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Telegram] Send failed:', err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram] Send error:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Generate a bind code for user-telegram linking
 */
export async function generateBindCode(userId: number): Promise<{ bindCode: string; deepLink: string }> {
  const bindCode = 'fg_' + crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Clean up any existing codes for this user
  await query('DELETE FROM fg_telegram_bindings WHERE user_id = $1', [userId]);

  await query(
    `INSERT INTO fg_telegram_bindings (user_id, bind_code, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, bindCode, expiresAt]
  );

  const config = await getBotConfig(userId);
  const botUsername = config?.username || '';
  const deepLink = botUsername
    ? `https://t.me/${botUsername}?start=${bindCode}`
    : `(bot username not configured) code: ${bindCode}`;

  return { bindCode, deepLink };
}

/**
 * Get user's telegram binding status
 */
export async function getTelegramStatus(userId: number): Promise<{
  bound: boolean;
  chatId?: string;
  notificationsEnabled: boolean;
}> {
  const r = await query(
    `SELECT telegram_chat_id, telegram_notifications
     FROM fg_user_settings WHERE user_id = $1`,
    [userId]
  );

  if (!r.rows[0] || !r.rows[0].telegram_chat_id) {
    return { bound: false, notificationsEnabled: false };
  }

  return {
    bound: true,
    chatId: r.rows[0].telegram_chat_id,
    notificationsEnabled: r.rows[0].telegram_notifications ?? false,
  };
}

/**
 * Unbind telegram from user
 */
export async function unbindTelegram(userId: number): Promise<void> {
  await query(
    `UPDATE fg_user_settings
     SET telegram_chat_id = NULL, telegram_notifications = false
     WHERE user_id = $1`,
    [userId]
  );
}

/**
 * Handle incoming Telegram webhook update
 */
export async function handleTelegramWebhook(update: any): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  // Handle /start command with bind code
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const bindCode = parts[1];

    if (!bindCode) {
      await sendTelegramMessage(chatId, '👋 欢迎使用 FeedGlow 通知 Bot！\n\n请在 FeedGlow 设置页面点击「绑定 Telegram」获取绑定链接。');
      return;
    }

    // First check fg_notification_channels for bind code
    const channelBind = await query(
      `SELECT id, config FROM fg_notification_channels
       WHERE bind_code = $1 AND bind_expires_at > NOW() AND type = 'telegram'`,
      [bindCode]
    );

    if (channelBind.rows[0]) {
      // New multi-channel binding
      const channelId = channelBind.rows[0].id;
      const config = typeof channelBind.rows[0].config === 'string'
        ? JSON.parse(channelBind.rows[0].config) : channelBind.rows[0].config;
      config.chat_id = chatId;
      config.bound = true;

      await query(
        `UPDATE fg_notification_channels SET config = $1, bind_code = NULL, bind_expires_at = NULL WHERE id = $2`,
        [JSON.stringify(config), channelId]
      );

      await sendTelegramMessage(chatId, '✅ 绑定成功！你将收到 FeedGlow 的文章更新通知。\n\n你可以在 FeedGlow 设置中管理通知偏好。');
      console.log(`[Telegram] Channel ${channelId} bound to chat ${chatId}`);
      return;
    }

    // Fallback: legacy fg_telegram_bindings
    const r = await query(
      `SELECT user_id FROM fg_telegram_bindings
       WHERE bind_code = $1 AND expires_at > NOW()`,
      [bindCode]
    );

    if (!r.rows[0]) {
      await sendTelegramMessage(chatId, '❌ 绑定码无效或已过期，请重新获取。');
      return;
    }

    const userId = r.rows[0].user_id;

    // Ensure user_settings row exists
    await query(
      `INSERT INTO fg_user_settings (user_id)
       VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Bind chat_id to user
    await query(
      `UPDATE fg_user_settings
       SET telegram_chat_id = $1, telegram_notifications = true
       WHERE user_id = $2`,
      [chatId, userId]
    );

    // Delete used bind code
    await query('DELETE FROM fg_telegram_bindings WHERE bind_code = $1', [bindCode]);

    await sendTelegramMessage(chatId, '✅ 绑定成功！你将收到 FeedGlow 的文章更新通知。\n\n你可以在 FeedGlow 设置中管理通知偏好，或为每个订阅源单独开启通知。');
    console.log(`[Telegram] User ${userId} bound to chat ${chatId}`);
    return;
  }

  // Handle /help
  if (text === '/help') {
    await sendTelegramMessage(
      chatId,
      '📖 FeedGlow Telegram Bot\n\n' +
      '• 在 FeedGlow 设置中绑定此 Bot\n' +
      '• 为订阅源开启「新文章通知」\n' +
      '• 有新文章时自动推送到这里\n\n' +
      `管理通知：${process.env.PUBLIC_URL || 'your FeedGlow instance'}`
    );
    return;
  }
}

/**
 * Send a Discord webhook message (embed)
 */
async function sendDiscordWebhook(
  webhookUrl: string,
  feedTitle: string,
  entries: Array<{ title: string; url: string; content?: string }>,
  feedType: string
): Promise<boolean> {
  try {
    const maxEntries = 5;
    const shown = entries.slice(0, maxEntries);
    const remaining = entries.length - maxEntries;

    const description = shown.map(entry => {
      let line = entry.url
        ? `[${entry.title || '无标题'}](${entry.url})`
        : (entry.title || '无标题');
      if (feedType === 'social' && entry.content) {
        const preview = stripHtml(entry.content).slice(0, 100);
        if (preview) line += `\n> ${preview}${entry.content.length > 100 ? '...' : ''}`;
      }
      return line;
    }).join('\n\n');

    const footer = remaining > 0 ? `+${remaining} 篇更多` : undefined;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `📰 ${feedTitle}`,
          description,
          color: 0xf97316, // orange-500
          footer: footer ? { text: footer } : { text: 'Sent from FeedGlow' },
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!res.ok) {
      console.error(`[Discord] Webhook failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Discord] Webhook error:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Check if a notification rule's triggers match a given feed/entries
 */
function ruleMatchesFeed(
  triggers: any,
  feedId: number,
  categoryId: number | null,
  entries: Array<{ title: string; url: string; content?: string }>
): boolean {
  switch (triggers?.type) {
    case 'new_article':
      return true;
    case 'feed':
      return triggers.feedId === feedId;
    case 'category':
      return categoryId != null && triggers.categoryId === categoryId;
    case 'keyword':
      if (triggers.keywords?.length) {
        const kws = triggers.keywords.map((k: string) => k.toLowerCase());
        for (const entry of entries) {
          const text = ((entry.title || '') + ' ' + stripHtml(entry.content || '')).toLowerCase();
          if (kws.some((kw: string) => text.includes(kw))) return true;
        }
      }
      return false;
    default:
      return false;
  }
}

/**
 * Notify users about new entries for a feed — driven by notification rules
 * Called from scheduler after new entries are inserted.
 * Supports Telegram push and Discord webhook channels.
 */
export async function notifyNewEntries(
  userId: number,
  feedId: number,
  feedTitle: string,
  feedType: string,
  categoryId: number | null,
  entries: Array<{ title: string; url: string; content?: string }>
): Promise<void> {
  if (entries.length === 0) return;

  // Find matching notification rules
  const rulesResult = await query(
    `SELECT * FROM fg_notification_rules
     WHERE user_id = $1 AND enabled = true`,
    [userId]
  );

  if (rulesResult.rows.length === 0) return;

  // Collect all channel IDs from matching rules
  const channelIds = new Set<number>();
  // Legacy flags for backward compatibility
  let legacyTelegram = false;
  let legacyDiscord = false;

  for (const row of rulesResult.rows) {
    const triggers = typeof row.triggers === 'string' ? JSON.parse(row.triggers) : row.triggers;
    const channels = typeof row.channels === 'string' ? JSON.parse(row.channels) : row.channels;

    if (!ruleMatchesFeed(triggers, feedId, categoryId, entries)) continue;

    // New format: channelIds array
    if (channels?.channelIds && Array.isArray(channels.channelIds)) {
      for (const cid of channels.channelIds) channelIds.add(cid);
    }
    // Legacy format: push/discord booleans
    if (channels?.push) legacyTelegram = true;
    if (channels?.discord) legacyDiscord = true;
  }

  // --- New multi-channel dispatch ---
  if (channelIds.size > 0) {
    const chResult = await query(
      `SELECT id, type, config, enabled FROM fg_notification_channels
       WHERE id = ANY($1) AND user_id = $2 AND enabled = true`,
      [Array.from(channelIds), userId]
    );

    for (const ch of chResult.rows) {
      const config = typeof ch.config === 'string' ? JSON.parse(ch.config) : ch.config;
      if (ch.type === 'telegram') {
        if (config.bound && config.chat_id && config.bot_token) {
          let token = config.bot_token;
          try { token = decrypt(token); } catch { /* already plain */ }
          const msg = buildTelegramMessage(feedTitle, feedType, entries);
          const ok = await sendTelegramMessage(config.chat_id, msg, 'HTML', token);
          if (ok) console.log(`[Telegram] Channel ${ch.id}: notified about ${entries.length} entries in "${feedTitle}"`);
        }
      } else if (ch.type === 'discord') {
        if (config.webhook_url) {
          const ok = await sendDiscordWebhook(config.webhook_url, feedTitle, entries, feedType);
          if (ok) console.log(`[Discord] Channel ${ch.id}: notified about ${entries.length} entries in "${feedTitle}"`);
        }
      }
    }
  }

  // --- Legacy Telegram push (backward compat) ---
  if (legacyTelegram && channelIds.size === 0) {
    const config = await getBotConfig();
    const status = await getTelegramStatus(userId);
    if (config?.token && status.bound && status.chatId && status.notificationsEnabled) {
      const msg = buildTelegramMessage(feedTitle, feedType, entries);
      const ok = await sendTelegramMessage(status.chatId, msg, 'HTML');
      if (ok) console.log(`[Telegram] Notified user ${userId} about ${entries.length} new entries in "${feedTitle}"`);
    }
  }

  // --- Legacy Discord webhook (backward compat) ---
  if (legacyDiscord && channelIds.size === 0) {
    const discordConfig = await query(
      `SELECT discord_webhook_url, discord_notifications FROM fg_user_settings WHERE user_id = $1`,
      [userId]
    );
    const row = discordConfig.rows[0];
    if (row?.discord_webhook_url && row?.discord_notifications) {
      const ok = await sendDiscordWebhook(row.discord_webhook_url, feedTitle, entries, feedType);
      if (ok) console.log(`[Discord] Notified user ${userId} about ${entries.length} new entries in "${feedTitle}"`);
    }
  }
}

/**
 * Build Telegram HTML message for new entries
 */
function buildTelegramMessage(
  feedTitle: string,
  feedType: string,
  entries: Array<{ title: string; url: string; content?: string }>
): string {
  const maxEntries = 5;
  const shown = entries.slice(0, maxEntries);
  const remaining = entries.length - maxEntries;

  let msg = `📰 <b>${escapeHtml(feedTitle)}</b>\n`;

  for (const entry of shown) {
    msg += '\n';
    if (entry.url) {
      msg += `<a href="${escapeHtml(entry.url)}">${escapeHtml(entry.title || '无标题')}</a>`;
    } else {
      msg += escapeHtml(entry.title || '无标题');
    }

    if (feedType === 'social' && entry.content) {
      const preview = stripHtml(entry.content).slice(0, 100);
      if (preview) {
        msg += `\n<i>${escapeHtml(preview)}${entry.content.length > 100 ? '...' : ''}</i>`;
      }
    }
  }

  if (remaining > 0) {
    msg += `\n\n+${remaining} 篇更多`;
  }

  return msg;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
