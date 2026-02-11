/**
 * Feed Polling Scheduler
 * Periodically checks feeds due for update, fetches new entries
 */

import { parseFeed } from './parser.js';
import { getFeedsDueForCheck, updateFeedCheckResult, insertEntries, getCategory, type FGFeed } from './store.js';
import { query } from '../lib/db.js';
import { evaluateRules, executeActions, type ActionEntryContext } from '../services/actions.js';
import { notifyNewEntries } from '../services/telegram.js';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Start the feed polling scheduler
 */
export function startScheduler(intervalMs = 60_000): void {
  if (schedulerInterval) return;
  console.log(`[FeedEngine] Scheduler started (interval: ${intervalMs / 1000}s)`);

  // Run immediately, then on interval
  checkFeeds().catch(console.error);
  schedulerInterval = setInterval(() => {
    checkFeeds().catch(console.error);
  }, intervalMs);
}

/**
 * Stop the feed polling scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[FeedEngine] Scheduler stopped');
  }
}

/**
 * Check all feeds that are due for update
 */
async function checkFeeds(): Promise<void> {
  if (isRunning) {
    console.log('[FeedEngine] Skipping check — previous run still active');
    return;
  }

  isRunning = true;
  try {
    const feeds = await getFeedsDueForCheck();
    if (feeds.length === 0) return;

    console.log(`[FeedEngine] Checking ${feeds.length} feeds...`);

    // Process feeds with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < feeds.length; i += concurrency) {
      const batch = feeds.slice(i, i + concurrency);
      await Promise.allSettled(batch.map(checkFeed));
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Check a single feed for new entries
 */
async function checkFeed(feed: FGFeed): Promise<void> {
  try {
    const result = await parseFeed(feed.feedUrl, {
      etag: feed.etag,
      lastModified: feed.lastModified,
      userAgent: feed.userAgent,
      crawler: feed.crawler,
      scraperRules: feed.scraperRules,
      blocklistRules: feed.blocklistRules,
      keeplistRules: feed.keeplistRules,
    });

    if (result.notModified) {
      // Feed hasn't changed
      await updateFeedCheckResult(feed.id, {
        etag: result.etag,
        lastModified: result.lastModified,
        errorCount: 0,
        errorMessage: undefined,
      });
      return;
    }

    // Build entry contexts for action evaluation
    const category = feed.categoryId ? await getCategory(feed.categoryId) : null;
    const entryContexts: ActionEntryContext[] = result.feed.items.map(item => ({
      title: item.title,
      url: item.url,
      content: item.content,
      author: item.author,
      feedTitle: feed.title,
      feedUrl: feed.feedUrl,
      feedSiteUrl: feed.siteUrl,
      feedCategory: category?.title || '',
      enclosureUrl: item.enclosureUrl,
      enclosureType: item.enclosureType,
      enclosureSize: item.enclosureSize,
    }));

    // Evaluate action rules BEFORE insertion (to filter blocked entries)
    const { blocked, entryActions } = await evaluateRules(feed.userId, entryContexts);

    // Filter out blocked entries
    const allowedItems = result.feed.items.filter((_, i) => !blocked.has(i));
    if (blocked.size > 0) {
      console.log(`[FeedEngine] ${feed.title}: ${blocked.size} entries blocked by rules`);
    }

    // Insert non-blocked entries
    const inserted = await insertEntries(feed.id, feed.userId, allowedItems);

    // Execute post-insert actions (summary, translate, star, etc.)
    if (entryActions.size > 0 && inserted > 0) {
      // Get the inserted entry IDs (most recent entries for this feed)
      const recentEntries = await query(
        `SELECT id, hash FROM fg_entries WHERE feed_id = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT $3`,
        [feed.id, feed.userId, allowedItems.length]
      );

      // Map hashes to entry IDs
      const hashToId = new Map(recentEntries.rows.map((r: any) => [r.hash, r.id]));

      // Re-index: original indices → allowed indices
      let allowedIdx = 0;
      for (let origIdx = 0; origIdx < result.feed.items.length; origIdx++) {
        if (blocked.has(origIdx)) continue;

        const actions = entryActions.get(origIdx);
        if (actions && actions.length > 0) {
          const item = result.feed.items[origIdx];
          const entryId = hashToId.get(item.hash);
          if (entryId) {
            executeActions(feed.userId, entryId, actions, entryContexts[origIdx]).catch(err =>
              console.error(`[FeedEngine] Action execution error:`, err.message)
            );
          }
        }
        allowedIdx++;
      }
    }

    // Update feed metadata
    const entryCount = feed.entryCount + inserted;
    await updateFeedCheckResult(feed.id, {
      etag: result.etag,
      lastModified: result.lastModified,
      errorCount: 0,
      errorMessage: undefined,
      entryCount,
      profileImageUrl: result.feed.imageUrl,
    });

    if (inserted > 0) {
      console.log(`[FeedEngine] ${feed.title}: ${inserted} new entries`);

      // Send Telegram notifications for new entries (driven by notification rules)
      notifyNewEntries(
        feed.userId,
        feed.id,
        feed.title,
        feed.feedType,
        feed.categoryId || null,
        allowedItems.slice(0, inserted).map(item => ({
          title: item.title,
          url: item.url,
          content: item.content,
        }))
      ).catch(err => console.error('[Telegram] Notification error:', err.message));
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const newErrorCount = feed.parsingErrorCount + 1;

    // Exponential backoff: increase polling interval on consecutive errors
    await updateFeedCheckResult(feed.id, {
      errorMessage,
      errorCount: newErrorCount,
    });

    // Apply exponential backoff to next_check_at
    const backoffMinutes = Math.min(feed.pollingFrequency * Math.pow(2, newErrorCount), 1440); // max 24h
    await import('../lib/db.js').then(db =>
      db.query(
        `UPDATE fg_feeds SET next_check_at = NOW() + ($1 || ' minutes')::INTERVAL WHERE id = $2`,
        [backoffMinutes, feed.id]
      )
    );

    console.error(`[FeedEngine] Error checking ${feed.title}: ${errorMessage} (errors: ${newErrorCount}, next: ${backoffMinutes}min)`);
  }
}

/**
 * Manually refresh a specific feed
 */
export async function refreshFeed(feed: FGFeed): Promise<{ inserted: number; error?: string }> {
  try {
    const result = await parseFeed(feed.feedUrl, {
      userAgent: feed.userAgent,
      // Skip etag/lastModified for manual refresh
    });

    const inserted = await insertEntries(feed.id, feed.userId, result.feed.items);

    await updateFeedCheckResult(feed.id, {
      etag: result.etag,
      lastModified: result.lastModified,
      errorCount: 0,
      errorMessage: undefined,
      entryCount: feed.entryCount + inserted,
    });

    return { inserted };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { inserted: 0, error };
  }
}
