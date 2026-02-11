/**
 * Privacy sanitizer for feed entries.
 * Strips tracking parameters, removes tracking pixels, and secures links.
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid',
  'oly_enc_id', 'oly_anon_id', '__s', 'vero_id',
  '_hsenc', '_hsmi', 'mkt_tok',
]);

const TRACKING_DOMAINS = [
  'doubleclick.net', 'google-analytics.com', 'facebook.com/tr',
  'pixel.', 'track.', 'open.',
  'mailchimp.com/track', 'list-manage.com/track',
];

// Base64 1x1 GIF
const TINY_GIF_PREFIX = 'data:image/gif;base64,R0lGODlhAQAB';

/**
 * Remove tracking query parameters from a URL string.
 */
export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}

/**
 * Remove tracking pixels from HTML content.
 */
export function removeTrackingPixels(html: string): string {
  // Remove <img> tags that match tracking pixel patterns
  return html.replace(/<img\b[^>]*\/?>/gi, (tag) => {
    // 1x1 dimension attributes
    if (/\bwidth\s*=\s*["']?1["']?/i.test(tag) || /\bheight\s*=\s*["']?1["']?/i.test(tag)) {
      return '';
    }
    // Style with 1px
    const styleMatch = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
    if (styleMatch && /\b1px\b/.test(styleMatch[1])) {
      return '';
    }
    // Known tracking domains in src
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']*)["']/i);
    if (srcMatch) {
      const src = srcMatch[1].toLowerCase();
      // 1x1 data gif
      if (src.startsWith(TINY_GIF_PREFIX.toLowerCase())) {
        return '';
      }
      for (const domain of TRACKING_DOMAINS) {
        if (src.includes(domain)) {
          return '';
        }
      }
    }
    return tag;
  });
}

/**
 * Strip tracking params from all <a href> in HTML.
 * Handles &amp; encoded URLs (common in RSS/HTML content).
 */
function stripTrackingFromLinks(html: string): string {
  return html.replace(/(<a\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_match, before, href, after) => {
    // Decode &amp; → & before parsing URL, then re-encode after
    const decoded = href.replace(/&amp;/g, '&');
    const cleaned = stripTrackingParams(decoded);
    // Re-encode & → &amp; for valid HTML
    const reEncoded = cleaned.replace(/&/g, '&amp;');
    return before + reEncoded + after;
  });
}

/**
 * Sanitize links: add rel="noopener noreferrer", referrerpolicy, target="_blank".
 */
export function sanitizeLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    // Only process links with href
    if (!/\bhref\s*=/i.test(attrs)) return _match;

    // Remove existing target, rel, referrerpolicy
    let cleaned = attrs
      .replace(/\s*target\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*rel\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\s*referrerpolicy\s*=\s*["'][^"']*["']/gi, '');

    return `<a${cleaned} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">`;
  });
}

/**
 * Main sanitizer: combines all privacy transformations.
 */
export function sanitizeContent(html: string, url?: string): { html: string; url: string } {
  let sanitized = html;
  sanitized = removeTrackingPixels(sanitized);
  sanitized = stripTrackingFromLinks(sanitized);
  sanitized = sanitizeLinks(sanitized);

  const cleanUrl = url ? stripTrackingParams(url) : '';

  return { html: sanitized, url: cleanUrl };
}
