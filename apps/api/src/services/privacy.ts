/**
 * Privacy Service — URL cleaning, tracker removal (P1)
 */

// UTM and tracking parameters to strip
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_cid', 'utm_reader', 'utm_name', 'utm_social', 'utm_social-type',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'twclid', 'li_fat_id',
  'mc_cid', 'mc_eid',  // Mailchimp
  'oly_enc_id', 'oly_anon_id',  // Omeda
  '_hsenc', '_hsmi', 'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src', 'hsa_ad', 'hsa_acc', 'hsa_net', 'hsa_ver', 'hsa_la', 'hsa_ol', 'hsa_kw',  // HubSpot
  'vero_id', 'vero_conv',
  'nr_email_referer', 'ck_subscriber_id',
  '_ga', '_gl', '_ke',
  'ref', 'referer', 'referrer',
  'source', 'src',
]);

/**
 * Strip tracking parameters from a URL
 */
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const keysToDelete: string[] = [];
    
    parsed.searchParams.forEach((_value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => parsed.searchParams.delete(key));
    
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Resolve FeedBurner redirect URLs to original URLs
 */
export function resolveFeedBurner(url: string): string {
  try {
    const parsed = new URL(url);
    
    // FeedBurner patterns
    if (parsed.hostname.includes('feedproxy.google.com') || 
        parsed.hostname.includes('feeds.feedburner.com') ||
        parsed.hostname.includes('feedburner.com')) {
      // Try to extract the original URL from the redirect
      const origUrl = parsed.searchParams.get('url') || parsed.searchParams.get('u');
      if (origUrl) return origUrl;
    }
    
    return url;
  } catch {
    return url;
  }
}

// Pixel tracker patterns (1x1 images used for tracking)
const PIXEL_PATTERNS = [
  /<img[^>]+(?:width|height)\s*=\s*["']?1["']?[^>]+(?:width|height)\s*=\s*["']?1["']?[^>]*\/?>/gi,
  /<img[^>]+(?:src=["'][^"']*(?:track|pixel|beacon|analytics|count|open|view|imp)[^"']*["'])[^>]*\/?>/gi,
  /<img[^>]+(?:src=["'][^"']*(?:mailchimp\.com|list-manage\.com|feedburner\.com|google-analytics\.com|doubleclick\.net|facebook\.com\/tr|bat\.bing\.com)[^"']*["'])[^>]*\/?>/gi,
];

/**
 * Remove pixel trackers from HTML content
 */
export function removePixelTrackers(html: string): string {
  let cleaned = html;
  
  for (const pattern of PIXEL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned;
}

/**
 * Clean all links in HTML content (strip tracking params)
 */
export function cleanHtmlLinks(html: string): string {
  return html.replace(/href=["']([^"']+)["']/gi, (_match, url: string) => {
    const cleaned = cleanUrl(resolveFeedBurner(url));
    return `href="${cleaned}"`;
  });
}

/**
 * Full privacy sanitization of entry content
 */
export function sanitizeContent(content: string): string {
  let sanitized = content;
  sanitized = removePixelTrackers(sanitized);
  sanitized = cleanHtmlLinks(sanitized);
  return sanitized;
}

/**
 * Sanitize a URL (clean + resolve FeedBurner)
 */
export function sanitizeUrl(url: string): string {
  return cleanUrl(resolveFeedBurner(url));
}
