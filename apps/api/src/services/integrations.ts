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

const SUPPORTED_SERVICES = ['pocket', 'telegram', 'readwise', 'notion'] as const;
export type ServiceName = typeof SUPPORTED_SERVICES[number];

export function getSupportedServices() {
  return [
    {
      id: 'pocket', name: 'Pocket', description: '保存文章到 Pocket 稍后阅读', icon: '📕',
      configFields: [
        { name: 'consumer_key', type: 'password', label: 'Consumer Key', required: true, placeholder: 'Pocket Consumer Key' },
        { name: 'access_token', type: 'password', label: 'Access Token', required: true, placeholder: 'Pocket Access Token' },
      ]
    },
    {
      id: 'telegram', name: 'Telegram Bot', description: '发送文章到 Telegram（推送通知请到通知设置）', icon: '✈️',
      configFields: [
        { name: 'bot_token', type: 'password', label: 'Bot Token', required: true, placeholder: 'BotFather 提供的 Token' },
        { name: 'chat_id', type: 'text', label: 'Chat ID', required: true, placeholder: '你的 Telegram Chat ID' },
      ]
    },
    {
      id: 'readwise', name: 'Readwise Reader', description: '同步文章到 Readwise Reader', icon: '📖',
      configFields: [
        { name: 'access_token', type: 'password', label: 'Access Token', required: true, placeholder: 'Readwise Access Token' },
      ]
    },
    {
      id: 'notion', name: 'Notion', description: '保存文章到 Notion 数据库', icon: '📝',
      configFields: [
        { name: 'api_key', type: 'password', label: 'API Key', required: true, placeholder: 'Notion Integration Token' },
        { name: 'database_id', type: 'text', label: 'Database ID', required: true, placeholder: 'Notion Database ID' },
      ]
    },
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

async function saveToReadwise(config: Record<string, string>, entry: { title: string; url: string }): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('https://readwise.io/api/v3/save/', {
    method: 'POST',
    headers: { 'Authorization': `Token ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: entry.url, title: entry.title }),
  });
  if (!res.ok) return { success: false, error: `Readwise API error: ${res.status}` };
  return { success: true };
}

/**
 * Convert HTML content to Notion blocks (paragraphs).
 * Strips HTML tags, splits into paragraphs, respects 2000 char limit per block.
 */
function htmlToNotionBlocks(html: string): any[] {
  if (!html) return [];
  
  // Replace common block elements with newlines
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, '') // strip all remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n') // collapse excess newlines
    .trim();
  
  if (!text) return [];
  
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  const blocks: any[] = [];
  const MAX_LEN = 1900; // Notion limit is 2000, leave some margin
  
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    
    // Split long paragraphs
    if (trimmed.length <= MAX_LEN) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: trimmed } }],
        },
      });
    } else {
      // Split at sentence boundaries or MAX_LEN
      let remaining = trimmed;
      while (remaining.length > 0) {
        let chunk: string;
        if (remaining.length <= MAX_LEN) {
          chunk = remaining;
          remaining = '';
        } else {
          // Try to break at sentence boundary
          const cutPoint = remaining.lastIndexOf('。', MAX_LEN) + 1 ||
            remaining.lastIndexOf('. ', MAX_LEN) + 1 ||
            remaining.lastIndexOf('\n', MAX_LEN) + 1 ||
            MAX_LEN;
          chunk = remaining.slice(0, cutPoint).trim();
          remaining = remaining.slice(cutPoint).trim();
        }
        if (chunk) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: chunk } }],
            },
          });
        }
      }
    }
    
    // Notion API limit: max 100 blocks per request
    if (blocks.length >= 95) break;
  }
  
  return blocks;
}

async function saveToNotion(config: Record<string, string>, entry: { title: string; url: string; content?: string }): Promise<{ success: boolean; error?: string }> {
  // First, fetch database schema to find the actual title property name
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${config.database_id}`, {
    headers: {
      'Authorization': `Bearer ${config.api_key}`,
      'Notion-Version': '2022-06-28',
    },
  });
  if (!dbRes.ok) {
    const errText = await dbRes.text().catch(() => '');
    return { success: false, error: `Notion API error (database): ${dbRes.status} ${errText}` };
  }

  const dbData = await dbRes.json() as { properties: Record<string, { type: string }> };
  const titleProp = Object.entries(dbData.properties).find(([, v]) => v.type === 'title');
  const urlProp = Object.entries(dbData.properties).find(([, v]) => v.type === 'url');

  if (!titleProp) {
    return { success: false, error: 'Database has no title property' };
  }

  const properties: Record<string, any> = {
    [titleProp[0]]: { title: [{ text: { content: entry.title } }] },
  };
  if (urlProp) {
    properties[urlProp[0]] = { url: entry.url };
  }

  // Build page children (content blocks)
  const children: any[] = [];
  
  // Add bookmark block for the URL
  if (entry.url) {
    children.push({
      object: 'block',
      type: 'bookmark',
      bookmark: { url: entry.url },
    });
  }
  
  // Add article content as paragraphs
  if (entry.content) {
    const contentBlocks = htmlToNotionBlocks(entry.content);
    children.push(...contentBlocks);
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.api_key}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: config.database_id },
      properties,
      ...(children.length > 0 ? { children } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return { success: false, error: `Notion API error: ${res.status} ${errText}` };
  }
  return { success: true };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
