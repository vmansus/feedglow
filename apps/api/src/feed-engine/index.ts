/**
 * FeedGlow Feed Engine
 * Self-owned RSS/Atom/JSON Feed fetching, parsing, and storage
 */

export { parseFeed, discoverFeeds, type ParsedFeed, type ParsedEntry } from './parser.js';
export { startScheduler, stopScheduler, refreshFeed } from './scheduler.js';
export { startTaskScheduler } from './task-scheduler.js';
export { register, login, verifyToken, feedEngineAuthMiddleware } from './auth.js';
export { migrateFromMiniflux } from './migrate.js';
export { feedRoutes, entryRoutes, categoryRoutes } from './routes-feeds.js';
export { default as authRoutes } from './routes-auth.js';
export { FeedEngineDataClient, getDataClient } from './data-source.js';
export { transformPlatformUrl, getNativeFeedUrl, isLikelyFeedUrl, getSupportedPlatforms } from './url-transformer.js';
export {
  // Users
  getUserById, getUserByUsername, getUserByEmail, createUser, updateLastLogin,
  type FGUser,
  // Categories
  getCategory, getCategories, createCategory, updateCategory, deleteCategory,
  type FGCategory,
  // Feeds
  getFeeds, getFeed, createFeed, updateFeed, deleteFeed, getFeedsDueForCheck,
  type FGFeed,
  // Entries
  getEntries, getEntry, insertEntries, updateEntryStatus, toggleStar, markAllRead, getCounters,
  type FGEntry, type EntryFilter,
} from './store.js';
