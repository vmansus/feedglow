/**
 * Third-party Integrations Service (P2 #17)
 */

import { query } from '../lib/db.js';

export interface IntegrationConfig {
  service: string;
  enabled: boolean;
  config: Record<string, string>;
}

/**
 * Get all integrations for a user
 */
export async function getUserIntegrations(userId: number): Promise<IntegrationConfig[]> {
  const result = await query(
    `SELECT service, enabled, config FROM fg_integrations WHERE user_id = $1 ORDER BY service`,
    [userId]
  );
  return result.rows.map(r => ({
    service: r.service,
    enabled: r.enabled,
    config: JSON.parse(r.config || '{}'),
  }));
}

/**
 * Get a specific integration config
 */
export async function getIntegration(userId: number, service: string): Promise<IntegrationConfig | null> {
  const result = await query(
    `SELECT service, enabled, config FROM fg_integrations WHERE user_id = $1 AND service = $2`,
    [userId, service]
  );
  if (!result.rows[0]) return null;
  return {
    service: result.rows[0].service,
    enabled: result.rows[0].enabled,
    config: JSON.parse(result.rows[0].config || '{}'),
  };
}

/**
 * Save integration config
 */
export async function saveIntegration(userId: number, service: string, enabled: boolean, config: Record<string, string>): Promise<void> {
  await query(
    `INSERT INTO fg_integrations (user_id, service, enabled, config)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, service) DO UPDATE SET enabled = $3, config = $4, updated_at = NOW()`,
    [userId, service, enabled, JSON.stringify(config)]
  );
}

/**
 * Delete integration
 */
export async function deleteIntegration(userId: number, service: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM fg_integrations WHERE user_id = $1 AND service = $2`,
    [userId, service]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============ Service Implementations ============

const SUPPORTED_SERVICES = ['pocket', 'telegram', 'readwise', 'notion', 'discord'] as const;
export type ServiceName = typeof SUPPORTED_SERVICES[number];

export function getSupportedServices() {
  return [
    { id: 'pocket', name: 'Pocket', description: 'Save to Pocket for later reading', fields: ['consumer_key', 'access_token'] },
    { id: 'telegram', name: 'Telegram Bot', description: 'Send articles to Telegram', fields: ['bot_token', 'chat_id'] },
    { id: 'readwise', name: 'Readwise Reader', description: 'Sync to Readwise Reader', fields: ['access_token'] },
    { id: 'notion', name: 'Notion', description: 'Save to Notion database', fields: ['api_key', 'database_id'] },
    { id: 'discord', name: 'Discord Webhook', description: 'Send to Discord channel', fields: ['webhook_url'] },
  ];
}

/**
 * Save an entry to a third-party service
 */
export async function saveToService(
  service: string,
  config: Record<string, string>,
  entry: { title: string; url: string; content?: string; author?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (service) {
      case 'pocket':
        return await saveToPocket(config, entry);
      case 'telegram':
        return await sendToTelegram(config, entry);
      case 'discord':
        return await sendToDiscord(config, entry);
      case 'readwise':
        return await saveToReadwise(config, entry);
      case 'notion':
        return await saveToNotion(config, entry);
      default:
        return { success: false, error: `Unknown service: ${service}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function saveToPocket(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://getpocket.com/v3/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Accept': 'application/json' },
    body: JSON.stringify({
      url: entry.url,
      title: entry.title,
      consumer_key: config.consumer_key,
      access_token: config.access_token,
    }),
  });
  if (!res.ok) return { success: false, error: `Pocket API error: ${res.status}` };
  return { success: true };
}

async function sendToTelegram(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const text = `📰 <b>${escapeHtml(entry.title)}</b>\n\n<a href="${entry.url}">Read article</a>`;
  const res = await fetch(`https://api.telegram.org/bot${config.bot_token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chat_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) return { success: false, error: `Telegram API error: ${res.status}` };
  return { success: true };
}

async function sendToDiscord(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(config.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: entry.title,
        url: entry.url,
        color: 0x6366f1,
        footer: { text: 'Sent from FeedGlow' },
      }],
    }),
  });
  if (!res.ok) return { success: false, error: `Discord webhook error: ${res.status}` };
  return { success: true };
}

async function saveToReadwise(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://readwise.io/api/v3/save/', {
    method: 'POST',
    headers: { 'Authorization': `Token ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: entry.url, title: entry.title }),
  });
  if (!res.ok) return { success: false, error: `Readwise API error: ${res.status}` };
  return { success: true };
}

async function saveToNotion(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.api_key}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: config.database_id },
      properties: {
        Name: { title: [{ text: { content: entry.title } }] },
        URL: { url: entry.url },
      },
    }),
  });
  if (!res.ok) return { success: false, error: `Notion API error: ${res.status}` };
  return { success: true };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
