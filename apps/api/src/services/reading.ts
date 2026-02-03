/**
 * Reading Preferences & Progress Service
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data', 'reading');

// Reading preferences
export interface ReadingPreferences {
  fontSize: number;        // 14-24
  fontFamily: 'sans' | 'serif' | 'mono';
  lineHeight: number;      // 1.4-2.0
  contentWidth: 'narrow' | 'medium' | 'wide';  // 600/720/900px
  theme: 'light' | 'dark' | 'sepia' | 'system';
  autoMarkRead: boolean;
  showImages: boolean;
  showReadingTime: boolean;
}

// Reading progress for an entry
export interface ReadingProgress {
  entryId: number;
  scrollPosition: number;  // percentage 0-100
  readAt: number;          // timestamp
  completed: boolean;
}

// User reading data
interface UserReadingData {
  userId: number;
  preferences: ReadingPreferences;
  progress: Record<number, ReadingProgress>;  // entryId -> progress
  updatedAt: number;
}

// Default preferences
const DEFAULT_PREFERENCES: ReadingPreferences = {
  fontSize: 18,
  fontFamily: 'sans',
  lineHeight: 1.6,
  contentWidth: 'medium',
  theme: 'system',
  autoMarkRead: true,
  showImages: true,
  showReadingTime: true,
};

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function getDataPath(userId: number): string {
  return join(DATA_DIR, `user-${userId}.json`);
}

/**
 * Load user reading data
 */
async function loadUserData(userId: number): Promise<UserReadingData> {
  await ensureDataDir();
  const path = getDataPath(userId);

  try {
    const data = await readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      userId,
      preferences: { ...DEFAULT_PREFERENCES },
      progress: {},
      updatedAt: Date.now(),
    };
  }
}

/**
 * Save user reading data
 */
async function saveUserData(data: UserReadingData): Promise<void> {
  await ensureDataDir();
  const path = getDataPath(data.userId);
  data.updatedAt = Date.now();
  await writeFile(path, JSON.stringify(data, null, 2));
}

/**
 * Get reading preferences
 */
export async function getReadingPreferences(userId: number): Promise<ReadingPreferences> {
  const data = await loadUserData(userId);
  return data.preferences;
}

/**
 * Update reading preferences
 */
export async function updateReadingPreferences(
  userId: number,
  updates: Partial<ReadingPreferences>
): Promise<ReadingPreferences> {
  const data = await loadUserData(userId);
  
  data.preferences = {
    ...data.preferences,
    ...updates,
  };
  
  await saveUserData(data);
  return data.preferences;
}

/**
 * Get reading progress for an entry
 */
export async function getReadingProgress(
  userId: number,
  entryId: number
): Promise<ReadingProgress | null> {
  const data = await loadUserData(userId);
  return data.progress[entryId] || null;
}

/**
 * Save reading progress
 */
export async function saveReadingProgress(
  userId: number,
  progress: Omit<ReadingProgress, 'readAt'>
): Promise<ReadingProgress> {
  const data = await loadUserData(userId);
  
  const fullProgress: ReadingProgress = {
    ...progress,
    readAt: Date.now(),
  };
  
  data.progress[progress.entryId] = fullProgress;
  
  // Keep only last 500 entries
  const entries = Object.entries(data.progress);
  if (entries.length > 500) {
    const sorted = entries.sort((a, b) => b[1].readAt - a[1].readAt);
    data.progress = Object.fromEntries(sorted.slice(0, 500));
  }
  
  await saveUserData(data);
  return fullProgress;
}

/**
 * Get recent reading history
 */
export async function getReadingHistory(
  userId: number,
  limit: number = 20
): Promise<ReadingProgress[]> {
  const data = await loadUserData(userId);
  
  return Object.values(data.progress)
    .sort((a, b) => b.readAt - a.readAt)
    .slice(0, limit);
}

/**
 * Clear reading progress for an entry
 */
export async function clearReadingProgress(
  userId: number,
  entryId: number
): Promise<void> {
  const data = await loadUserData(userId);
  delete data.progress[entryId];
  await saveUserData(data);
}
