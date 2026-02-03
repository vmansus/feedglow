/**
 * User Events Service
 * Tracks reading behavior for smart ranking
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data', 'events');

// Event types
export interface ReadEvent {
  type: 'read';
  entryId: number;
  feedId: number;
  duration: number;      // seconds spent reading
  scrollDepth: number;   // 0-100 percentage
  completed: boolean;    // read to end
  timestamp: number;
}

export interface ActionEvent {
  type: 'action';
  action: 'star' | 'share' | 'summarize' | 'translate' | 'click_link';
  entryId: number;
  feedId: number;
  timestamp: number;
}

export type UserEvent = ReadEvent | ActionEvent;

export interface UserProfile {
  userId: number;
  events: UserEvent[];
  feedScores: Record<number, number>;      // feedId -> engagement score
  topicInterests: Record<string, number>;  // topic -> interest score
  lastUpdated: number;
}

// In-memory cache
const profileCache = new Map<number, UserProfile>();

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function getProfilePath(userId: number): string {
  return join(DATA_DIR, `user-${userId}.json`);
}

/**
 * Load user profile from disk
 */
export async function loadUserProfile(userId: number): Promise<UserProfile> {
  // Check cache first
  if (profileCache.has(userId)) {
    return profileCache.get(userId)!;
  }

  await ensureDataDir();
  const path = getProfilePath(userId);

  try {
    const data = await readFile(path, 'utf-8');
    const profile = JSON.parse(data) as UserProfile;
    profileCache.set(userId, profile);
    return profile;
  } catch {
    // Create new profile
    const profile: UserProfile = {
      userId,
      events: [],
      feedScores: {},
      topicInterests: {},
      lastUpdated: Date.now(),
    };
    profileCache.set(userId, profile);
    return profile;
  }
}

/**
 * Save user profile to disk
 */
async function saveUserProfile(profile: UserProfile): Promise<void> {
  await ensureDataDir();
  const path = getProfilePath(profile.userId);
  profile.lastUpdated = Date.now();
  await writeFile(path, JSON.stringify(profile, null, 2));
  profileCache.set(profile.userId, profile);
}

/**
 * Record a read event
 */
export async function recordReadEvent(
  userId: number,
  event: Omit<ReadEvent, 'type' | 'timestamp'>
): Promise<void> {
  const profile = await loadUserProfile(userId);

  const readEvent: ReadEvent = {
    type: 'read',
    ...event,
    timestamp: Date.now(),
  };

  profile.events.push(readEvent);

  // Update feed score based on engagement
  const engagementScore = calculateEngagementScore(readEvent);
  profile.feedScores[event.feedId] = (profile.feedScores[event.feedId] || 0) + engagementScore;

  // Keep only last 1000 events
  if (profile.events.length > 1000) {
    profile.events = profile.events.slice(-1000);
  }

  await saveUserProfile(profile);
}

/**
 * Record an action event
 */
export async function recordActionEvent(
  userId: number,
  event: Omit<ActionEvent, 'type' | 'timestamp'>
): Promise<void> {
  const profile = await loadUserProfile(userId);

  const actionEvent: ActionEvent = {
    type: 'action',
    ...event,
    timestamp: Date.now(),
  };

  profile.events.push(actionEvent);

  // Update feed score based on action
  const actionScore = getActionScore(event.action);
  profile.feedScores[event.feedId] = (profile.feedScores[event.feedId] || 0) + actionScore;

  // Keep only last 1000 events
  if (profile.events.length > 1000) {
    profile.events = profile.events.slice(-1000);
  }

  await saveUserProfile(profile);
}

/**
 * Calculate engagement score from read event
 */
function calculateEngagementScore(event: ReadEvent): number {
  let score = 0;

  // Time spent (max 10 points for 5+ minutes)
  score += Math.min(event.duration / 30, 10);

  // Scroll depth (max 5 points)
  score += (event.scrollDepth / 100) * 5;

  // Completion bonus
  if (event.completed) {
    score += 5;
  }

  return score;
}

/**
 * Get score for different actions
 */
function getActionScore(action: ActionEvent['action']): number {
  const scores: Record<string, number> = {
    star: 10,
    share: 15,
    summarize: 5,
    translate: 5,
    click_link: 3,
  };
  return scores[action] || 1;
}

/**
 * Get feed engagement scores for ranking
 */
export async function getFeedScores(userId: number): Promise<Record<number, number>> {
  const profile = await loadUserProfile(userId);
  return profile.feedScores;
}

/**
 * Calculate entry score for ranking
 */
export function calculateEntryScore(
  entry: { id: number; feedId: number; publishedAt: string; readingTime: number },
  feedScores: Record<number, number>
): number {
  let score = 0;

  // Feed engagement score (0-50 points)
  const feedScore = feedScores[entry.feedId] || 0;
  score += Math.min(feedScore, 50);

  // Recency score (0-30 points, decays over 7 days)
  const ageHours = (Date.now() - new Date(entry.publishedAt).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 30 - (ageHours / 168) * 30);
  score += recencyScore;

  // Reading time preference (assume 3-10 min is ideal, 0-20 points)
  const readingTime = entry.readingTime || 5;
  if (readingTime >= 3 && readingTime <= 10) {
    score += 20;
  } else if (readingTime < 3) {
    score += 10;
  } else {
    score += Math.max(0, 20 - (readingTime - 10) * 2);
  }

  return score;
}

/**
 * Get user stats
 */
export async function getUserStats(userId: number): Promise<{
  totalReads: number;
  totalTime: number;
  topFeeds: { feedId: number; score: number }[];
}> {
  const profile = await loadUserProfile(userId);

  const readEvents = profile.events.filter(e => e.type === 'read') as ReadEvent[];
  const totalReads = readEvents.length;
  const totalTime = readEvents.reduce((sum, e) => sum + e.duration, 0);

  const topFeeds = Object.entries(profile.feedScores)
    .map(([feedId, score]) => ({ feedId: parseInt(feedId), score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { totalReads, totalTime, topFeeds };
}
