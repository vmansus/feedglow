/**
 * Podcast Transcript Service
 * 
 * Extracts, parses, and caches podcast transcripts from RSS content.
 * Supports:
 *   - Transcript URLs embedded in entry content HTML (e.g. Lex Fridman)
 *   - <podcast:transcript> tags (Podcasting 2.0 standard)
 *   - Common transcript page formats with (HH:MM:SS) timestamps
 */

import { query } from '../lib/db.js';

// ============ Types ============

export interface TranscriptSegment {
  startTime: number;   // seconds
  endTime: number;     // seconds
  speaker: string;
  text: string;
}

export interface TranscriptData {
  segments: TranscriptSegment[];
  source: 'webpage' | 'srt' | 'vtt' | 'json';
  url: string;
}

interface CachedTranscript {
  entryId: number;
  segments: TranscriptSegment[];
  sourceUrl: string;
  source: string;
  createdAt: string;
}

// ============ Cache (DB) ============

async function getCachedTranscript(entryId: number): Promise<CachedTranscript | null> {
  const result = await query(
    `SELECT * FROM fg_transcripts WHERE entry_id = $1`,
    [entryId]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    entryId: row.entry_id,
    segments: row.segments,
    sourceUrl: row.source_url,
    source: row.source,
    createdAt: row.created_at,
  };
}

async function cacheTranscript(entryId: number, data: TranscriptData): Promise<void> {
  await query(
    `INSERT INTO fg_transcripts (entry_id, segments, source_url, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (entry_id) DO UPDATE SET
       segments = $2, source_url = $3, source = $4, created_at = NOW()`,
    [entryId, JSON.stringify(data.segments), data.url, data.source]
  );
}

// ============ Transcript URL Extraction ============

/**
 * Extract transcript URL from HTML content.
 * Looks for links with "transcript" in the URL or text.
 */
export function extractTranscriptUrl(content: string): string | null {
  if (!content) return null;

  // Pattern 1: <a href="...transcript..."> links
  const linkRegex = /<a\s[^>]*href=["']([^"']*transcript[^"']*)["'][^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[1];
    // Skip anchor-only links and empty URLs
    if (url && !url.startsWith('#') && url.startsWith('http')) {
      return url;
    }
  }

  // Pattern 2: Links where the text contains "transcript" (case-insensitive)
  const allLinks = /<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  while ((match = allLinks.exec(content)) !== null) {
    const url = match[1];
    const text = match[2]?.replace(/<[^>]*>/g, '').trim().toLowerCase();
    if (text && text.includes('transcript') && url.startsWith('http')) {
      return url;
    }
  }

  // Pattern 3: Plain text URL containing "transcript"
  const urlRegex = /https?:\/\/[^\s<>"']+transcript[^\s<>"']*/gi;
  const urlMatch = content.match(urlRegex);
  if (urlMatch && urlMatch[0]) {
    return urlMatch[0];
  }

  return null;
}

// ============ Transcript Parsing ============

/**
 * Parse transcript text with (HH:MM:SS) or (MM:SS) timestamps.
 * 
 * Expected format:
 * (00:00:00)
 * Speaker Name
 * Spoken text here...
 * 
 * Or:
 * (00:00:00) Speaker Name
 * Spoken text here...
 */
export function parseTimestampTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  
  // Regex for timestamp: (HH:MM:SS) or (MM:SS)
  const timestampRegex = /^\s*\((\d{1,2}):(\d{2}):(\d{2})\)\s*$/;
  const timestampRegexShort = /^\s*\((\d{1,2}):(\d{2})\)\s*$/;
  
  let currentSpeaker = '';
  
  // Heuristic: detect if lines after timestamp are "SpeakerName\nText" or "Text"
  // First pass: find all timestamp positions
  interface TimestampBlock {
    startTime: number;
    lineIndex: number;
  }
  
  const timestampBlocks: TimestampBlock[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let time = -1;
    
    // Check standalone timestamp
    let m = timestampRegex.exec(line);
    if (m) {
      time = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    } else {
      m = timestampRegexShort.exec(line);
      if (m) {
        time = parseInt(m[1]) * 60 + parseInt(m[2]);
      }
    }
    
    if (time >= 0) {
      timestampBlocks.push({ startTime: time, lineIndex: i });
    }
  }
  
  if (timestampBlocks.length === 0) return [];
  
  // For each timestamp block, extract speaker + text
  for (let b = 0; b < timestampBlocks.length; b++) {
    const block = timestampBlocks[b];
    const nextBlockLine = b + 1 < timestampBlocks.length 
      ? timestampBlocks[b + 1].lineIndex 
      : lines.length;
    
    // Lines between this timestamp and the next
    const blockLines: string[] = [];
    for (let i = block.lineIndex + 1; i < nextBlockLine; i++) {
      const line = lines[i].trim();
      if (line) blockLines.push(line);
    }
    
    let speaker = '';
    let text = '';
    
    if (blockLines.length >= 2) {
      // Check if first line looks like a speaker name (short, no period at end, capitalized)
      const firstLine = blockLines[0];
      const looksLikeSpeaker = firstLine.length < 80 && 
        !firstLine.endsWith('.') && 
        !firstLine.endsWith('?') && 
        !firstLine.endsWith('!') &&
        /^[A-Z\u4e00-\u9fff]/.test(firstLine);
      
      if (looksLikeSpeaker) {
        speaker = firstLine;
        text = blockLines.slice(1).join(' ');
      } else {
        text = blockLines.join(' ');
      }
    } else if (blockLines.length === 1) {
      text = blockLines[0];
    }
    
    // Use previous speaker if none found for this block
    if (!speaker && currentSpeaker) {
      speaker = currentSpeaker;
    }
    if (speaker) {
      currentSpeaker = speaker;
    }
    
    if (text) {
      segments.push({
        startTime: block.startTime,
        endTime: 0, // will be filled in below
        speaker,
        text,
      });
    }
  }
  
  // Fill in endTime: next segment's startTime
  for (let i = 0; i < segments.length; i++) {
    if (i + 1 < segments.length) {
      segments[i].endTime = segments[i + 1].startTime;
    } else {
      // Last segment: endTime = startTime + 60 (arbitrary)
      segments[i].endTime = segments[i].startTime + 60;
    }
  }
  
  return segments;
}

/**
 * Parse SRT subtitle format
 */
export function parseSRT(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = text.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    
    // Find the timecode line (e.g., "00:01:23,456 --> 00:01:25,789")
    const timeLineIdx = lines.findIndex(l => /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(l));
    if (timeLineIdx < 0) continue;
    
    const timeLine = lines[timeLineIdx];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/);
    if (!timeMatch) continue;
    
    const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
    const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
    
    // Text lines are after the timecode
    const textLines = lines.slice(timeLineIdx + 1);
    const text = textLines.join(' ').replace(/<[^>]*>/g, '').trim();
    
    if (text) {
      segments.push({
        startTime,
        endTime,
        speaker: '',
        text,
      });
    }
  }
  
  return segments;
}

/**
 * Parse WebVTT format
 */
export function parseVTT(text: string): TranscriptSegment[] {
  // VTT is similar to SRT but with "WEBVTT" header and slightly different time format
  const withoutHeader = text.replace(/^WEBVTT.*?\n\n/s, '');
  return parseSRT(withoutHeader);
}

// ============ HTML Text Extraction ============

/**
 * Strip HTML tags and decode entities to get plain text
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============ Main Service ============

/**
 * Fetch and parse transcript for an entry.
 * 
 * 1. Check cache first
 * 2. Extract transcript URL from entry content
 * 3. Fetch the transcript page
 * 4. Parse timestamps and segments
 * 5. Cache and return
 */
export async function getTranscriptForEntry(
  entryId: number,
  content: string
): Promise<TranscriptData | null> {
  // 1. Check cache
  const cached = await getCachedTranscript(entryId);
  if (cached && cached.segments.length > 0) {
    return {
      segments: cached.segments,
      source: cached.source as TranscriptData['source'],
      url: cached.sourceUrl,
    };
  }
  
  // 2. Extract transcript URL
  const transcriptUrl = extractTranscriptUrl(content);
  if (!transcriptUrl) {
    return null;
  }
  
  // 3. Fetch the transcript page
  let transcriptText: string;
  let source: TranscriptData['source'] = 'webpage';
  
  try {
    const response = await fetch(transcriptUrl, {
      headers: {
        'User-Agent': 'FeedGlow/1.0 (Transcript Fetcher)',
        'Accept': 'text/html, text/plain, application/json, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      console.warn(`[Transcript] Failed to fetch ${transcriptUrl}: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    
    // Determine format from content type or URL
    if (contentType.includes('text/srt') || transcriptUrl.endsWith('.srt')) {
      transcriptText = body;
      source = 'srt';
    } else if (contentType.includes('text/vtt') || transcriptUrl.endsWith('.vtt')) {
      transcriptText = body;
      source = 'vtt';
    } else if (contentType.includes('application/json') || transcriptUrl.endsWith('.json')) {
      // Try JSON transcript format (Podcasting 2.0)
      try {
        const json = JSON.parse(body);
        if (Array.isArray(json.segments)) {
          const data: TranscriptData = {
            segments: json.segments,
            source: 'json',
            url: transcriptUrl,
          };
          await cacheTranscript(entryId, data);
          return data;
        }
      } catch {
        // Not valid JSON, treat as text
      }
      transcriptText = body;
    } else {
      // HTML or plain text - extract text
      transcriptText = htmlToText(body);
    }
  } catch (err) {
    console.warn(`[Transcript] Error fetching ${transcriptUrl}:`, err);
    return null;
  }
  
  // 4. Parse based on format
  let segments: TranscriptSegment[];
  
  if (source === 'srt') {
    segments = parseSRT(transcriptText);
  } else if (source === 'vtt') {
    segments = parseVTT(transcriptText);
  } else {
    segments = parseTimestampTranscript(transcriptText);
  }
  
  if (segments.length === 0) {
    return null;
  }
  
  // 5. Cache and return
  const data: TranscriptData = {
    segments,
    source,
    url: transcriptUrl,
  };
  
  await cacheTranscript(entryId, data);
  return data;
}
