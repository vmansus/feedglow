/**
 * Backfill Types — shared between frontend and backend
 */

export interface BackfillResult {
  feedId: number;
  siteUrl: string;
  discovered: number;
  fetched: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface BackfillEntry {
  id: string;
  feedId: number;
  title: string;
  url: string;
  content: string;
  author: string;
  publishedAt: string;
  status: 'unread' | 'read';
  starred: boolean;
  _backfilled: true;
}

export interface EntriesResponseWithBackfill {
  total: number;
  entries: any[]; // Entry | BackfillEntry
  backfilling?: boolean;
}
