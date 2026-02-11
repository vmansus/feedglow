/**
 * Share Types — shared between frontend and backend
 */

export interface Share {
  id: string;
  entryId: number;
  shareCode: string;
  title: string;
  content: string;
  url: string;
  author: string;
  feedTitle: string;
  publishedAt: string;
  createdAt: string;
}

export interface ShareResult {
  code: string;
  url: string;
}
