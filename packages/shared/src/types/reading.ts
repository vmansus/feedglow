/**
 * Reading Types — shared between frontend and backend
 */

export interface ReadingProgress {
  entryId: number;
  scrollPosition: number;
  completed: boolean;
  updatedAt: string;
}

export interface ReadingPreferences {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia';
  maxWidth: number;
}

export interface ReadEvent {
  entryId: number;
  duration: number; // seconds
  completed: boolean;
  scrollDepth?: number; // 0-100
}

export interface ActionEvent {
  entryId: number;
  action: 'bookmark' | 'share' | 'like' | 'dislike';
}
