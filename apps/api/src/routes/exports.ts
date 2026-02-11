/**
 * Export Routes (P1 #15)
 */

import { Hono } from 'hono';
import { authMiddleware, type JWTPayload } from '../lib/auth.js';
import { getDataClient } from '../feed-engine/data-source.js';
import { query } from '../lib/db.js';

const exports_ = new Hono();

exports_.use('*', authMiddleware);

// Export articles as JSON
exports_.get('/articles', async (c) => {
  const user = c.get('user') as JWTPayload;
  const format = c.req.query('format') || 'json';
  const starred = c.req.query('starred') === 'true';
  const limit = parseInt(c.req.query('limit') || '500');
  const feedId = c.req.query('feedId') ? parseInt(c.req.query('feedId')!) : undefined;
  const categoryId = c.req.query('categoryId') ? parseInt(c.req.query('categoryId')!) : undefined;

  const client = getDataClient(c);

  const result = await client.getEntries({
    starred: starred || undefined,
    category_id: categoryId,
    limit: Math.min(limit, 1000),
    order: 'published_at',
    direction: 'desc',
  });

  // Filter by feedId if specified (Miniflux getEntries doesn't directly support feedId filter with other params)
  let entries = result.entries;
  if (feedId) {
    entries = entries.filter(e => e.feed_id === feedId);
  }

  const exportData = entries.map(e => ({
    id: e.id,
    title: e.title,
    url: e.url,
    author: e.author,
    content: e.content,
    status: e.status,
    starred: e.starred,
    published_at: e.published_at,
    created_at: e.created_at,
    reading_time: e.reading_time,
    feed_id: e.feed_id,
    feed_title: e.feed?.title,
    tags: e.tags,
  }));

  if (format === 'csv') {
    const headers = ['id', 'title', 'url', 'author', 'status', 'starred', 'published_at', 'feed_title', 'tags'];
    const csvRows = [
      headers.join(','),
      ...exportData.map(e => headers.map(h => {
        const val = (e as any)[h];
        if (Array.isArray(val)) return `"${val.join('; ')}"`;
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return String(val ?? '');
      }).join(','))
    ];

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="feedglow-articles-${new Date().toISOString().split('T')[0]}.csv"`);
    return c.body(csvRows.join('\n'));
  }

  if (format === 'markdown') {
    const date = new Date().toISOString().split('T')[0];
    const lines: string[] = [
      `# FeedGlow 文章导出`,
      `> 导出时间: ${new Date().toISOString()} | 共 ${exportData.length} 篇`,
      '',
      '---',
      '',
    ];

    for (const article of exportData) {
      lines.push(`## ${article.title || '(无标题)'}`);
      lines.push('');
      const meta: string[] = [];
      if (article.feed_title) meta.push(`**来源**: ${article.feed_title}`);
      if (article.author) meta.push(`**作者**: ${article.author}`);
      if (article.published_at) meta.push(`**发布**: ${new Date(article.published_at).toLocaleString('zh-CN')}`);
      if (article.starred) meta.push('⭐ 收藏');
      if (meta.length) lines.push(meta.join(' | '));
      if (article.url) lines.push(`🔗 ${article.url}`);
      lines.push('');
      // Strip HTML tags for markdown content
      if (article.content) {
        const text = article.content
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        lines.push(text);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="feedglow-articles-${date}.md"`);
    return c.body(lines.join('\n'));
  }

  // JSON format (default)
  c.header('Content-Disposition', `attachment; filename="feedglow-articles-${new Date().toISOString().split('T')[0]}.json"`);
  return c.json({
    exported_at: new Date().toISOString(),
    count: exportData.length,
    articles: exportData,
  });
});

// Export starred articles
exports_.get('/starred', async (c) => {
  const client = getDataClient(c);
  
  const result = await client.getEntries({
    starred: true,
    limit: 1000,
    order: 'published_at',
    direction: 'desc',
  });

  c.header('Content-Disposition', `attachment; filename="feedglow-starred-${new Date().toISOString().split('T')[0]}.json"`);
  return c.json({
    exported_at: new Date().toISOString(),
    count: result.entries.length,
    articles: result.entries.map(e => ({
      id: e.id,
      title: e.title,
      url: e.url,
      author: e.author,
      content: e.content,
      published_at: e.published_at,
      feed_title: e.feed?.title,
    })),
  });
});

// Export reading history
exports_.get('/reading-history', async (c) => {
  const user = c.get('user') as JWTPayload;

  const result = await query(
    `SELECT entry_id, progress, scroll_position, time_spent, finished, last_read_at
     FROM fg_reading_progress
     WHERE user_id = $1
     ORDER BY last_read_at DESC
     LIMIT 1000`,
    [user.userId]
  );

  c.header('Content-Disposition', `attachment; filename="feedglow-history-${new Date().toISOString().split('T')[0]}.json"`);
  return c.json({
    exported_at: new Date().toISOString(),
    count: result.rows.length,
    history: result.rows,
  });
});

export default exports_;
