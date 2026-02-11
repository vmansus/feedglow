/**
 * Reading Time Estimation (P1 #11)
 */

// Chinese characters per minute
const CJK_WPM = 300;
// English words per minute
const EN_WPM = 200;

// Regex to match CJK characters
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff\u3000-\u303f\u31c0-\u31ef\ufe30-\ufe4f\u3200-\u32ff\u3300-\u33ff]/g;

/**
 * Strip HTML tags from content
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Estimate reading time in minutes for a piece of content
 */
export function estimateReadingTime(content: string): number {
  const text = stripHtml(content);
  if (!text) return 0;

  // Count CJK characters
  const cjkChars = text.match(CJK_REGEX);
  const cjkCount = cjkChars ? cjkChars.length : 0;

  // Remove CJK characters and count remaining words (English/Latin)
  const nonCjkText = text.replace(CJK_REGEX, ' ').trim();
  const words = nonCjkText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Calculate time for each
  const cjkMinutes = cjkCount / CJK_WPM;
  const enMinutes = wordCount / EN_WPM;

  // Total reading time, minimum 1 minute
  const total = cjkMinutes + enMinutes;
  return Math.max(1, Math.round(total));
}

/**
 * Get word/character count
 */
export function getContentStats(content: string): {
  readingTimeMinutes: number;
  wordCount: number;
  charCount: number;
} {
  const text = stripHtml(content);
  const cjkChars = text.match(CJK_REGEX);
  const cjkCount = cjkChars ? cjkChars.length : 0;
  const nonCjkText = text.replace(CJK_REGEX, ' ').trim();
  const wordCount = nonCjkText.split(/\s+/).filter(w => w.length > 0).length;

  return {
    readingTimeMinutes: estimateReadingTime(content),
    wordCount: wordCount + cjkCount,
    charCount: text.length,
  };
}
