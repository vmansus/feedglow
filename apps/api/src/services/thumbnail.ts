/**
 * Thumbnail extraction service
 * Extracts thumbnail image from article content
 */

import type { Entry, Enclosure } from '../lib/types.js';

export interface ThumbnailResult {
  url: string;
  source: 'enclosure' | 'content' | 'og';
  width?: number;
  height?: number;
}

/**
 * Extract thumbnail from an entry
 * Priority: enclosures (images) > first img in content > null
 */
export function extractThumbnail(entry: Entry): ThumbnailResult | null {
  // 1. Check enclosures for image
  if (entry.enclosures && entry.enclosures.length > 0) {
    const imageEnclosure = entry.enclosures.find(e => 
      e.mime_type?.startsWith('image/')
    );
    if (imageEnclosure) {
      return {
        url: imageEnclosure.url,
        source: 'enclosure',
      };
    }
  }

  // 2. Extract first image from content
  if (entry.content) {
    const imgMatch = entry.content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      let imgUrl = imgMatch[1];
      
      // Skip common tracking pixels and icons
      if (isLikelyThumbnail(imgUrl)) {
        // Try to extract dimensions
        const widthMatch = entry.content.match(/width=["']?(\d+)/i);
        const heightMatch = entry.content.match(/height=["']?(\d+)/i);
        
        return {
          url: imgUrl,
          source: 'content',
          width: widthMatch ? parseInt(widthMatch[1]) : undefined,
          height: heightMatch ? parseInt(heightMatch[1]) : undefined,
        };
      }
    }
    
    // 3. Try srcset for higher quality images
    const srcsetMatch = entry.content.match(/srcset=["']([^"']+)["']/i);
    if (srcsetMatch) {
      const srcset = srcsetMatch[1];
      // Get the largest image from srcset
      const urls = srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        const url = parts[0];
        const size = parts[1] ? parseInt(parts[1]) : 0;
        return { url, size };
      });
      
      const largest = urls.sort((a, b) => b.size - a.size)[0];
      if (largest && isLikelyThumbnail(largest.url)) {
        return {
          url: largest.url,
          source: 'content',
        };
      }
    }
  }

  return null;
}

/**
 * Check if URL is likely a real thumbnail (not tracking pixel, icon, etc.)
 */
function isLikelyThumbnail(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Skip common tracking/pixel patterns
  const skipPatterns = [
    'pixel',
    'tracking',
    'beacon',
    'spacer',
    '1x1',
    'blank.gif',
    'clear.gif',
    'favicon',
    'icon',
    'logo',
    'badge',
    'button',
    'analytics',
    'stat.',
    '/feeds/',
    'feedburner',
  ];
  
  if (skipPatterns.some(p => lowerUrl.includes(p))) {
    return false;
  }
  
  // Skip very small images (likely icons)
  const sizeMatch = url.match(/[_-](\d+)x(\d+)/);
  if (sizeMatch) {
    const width = parseInt(sizeMatch[1]);
    const height = parseInt(sizeMatch[2]);
    if (width < 100 || height < 100) {
      return false;
    }
  }
  
  return true;
}

/**
 * Extract all images from entry content
 */
export function extractAllImages(entry: Entry): string[] {
  const images: string[] = [];
  
  // From enclosures
  if (entry.enclosures) {
    for (const enc of entry.enclosures) {
      if (enc.mime_type?.startsWith('image/')) {
        images.push(enc.url);
      }
    }
  }
  
  // From content
  if (entry.content) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(entry.content)) !== null) {
      if (isLikelyThumbnail(match[1])) {
        images.push(match[1]);
      }
    }
  }
  
  return [...new Set(images)]; // Dedupe
}
