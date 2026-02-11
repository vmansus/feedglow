'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Loader2, Eye, EyeOff, Repeat2 } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useMarkAsRead, useMarkAsUnread, useToggleBookmark } from '@/hooks';
import { EntryListSkeleton } from '@/components/ui/skeleton';
import { AllCaughtUpState } from '@/components/ui/empty-state';
import { getLocale, t } from '@/lib/i18n';

// ── Helpers ──

/** Decode HTML entities in URLs (e.g. &amp; → &) */
function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Proxy Twitter media URLs through our server to bypass CORS / hotlink protection */
function proxyTwitterUrl(url: string): string {
  if (!url) return url;
  // Decode HTML entities first (DB stores &amp; not &)
  const decoded = decodeHtmlEntities(url);
  if (decoded.includes('twimg.com') && !decoded.startsWith('/api/proxy')) {
    return `/api/proxy/media?url=${encodeURIComponent(decoded)}`;
  }
  return decoded;
}

function formatTweetDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = differenceInDays(now, date);

  if (diffMin < 1) return t('entry.social.justNow');
  if (diffMin < 60) return t('entry.social.minutesAgo', { n: diffMin });
  if (diffH < 24) return t('entry.social.hoursAgo', { n: diffH });
  if (diffD < 7) return t('entry.social.daysAgo', { n: diffD });
  if (diffD < 365) return format(date, getLocale() === 'zh' ? 'M月d日' : 'MMM d');
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日' : 'MMM d, yyyy');
}

/** Extract @handle from author string. "John (@john)" → { name: "John", handle: "john" } */
function parseAuthor(author?: string): { name: string; handle: string } {
  if (!author) return { name: 'Unknown', handle: '' };
  
  // Try "Name (@handle)" pattern
  const m = author.match(/^(.+?)\s*\(@?([^)]+)\)$/);
  if (m) return { name: m[1].trim(), handle: m[2].trim() };
  
  // Try "@handle" alone
  if (author.startsWith('@')) return { name: author.slice(1), handle: author.slice(1) };
  
  // Just a name — derive handle from name
  return { name: author, handle: author.replace(/\s+/g, '').toLowerCase() };
}

/** Extract images and videos from HTML content */
function extractMedia(html: string): { images: string[]; videos: { src: string; poster?: string }[] } {
  const images: string[] = [];
  const videos: { src: string; poster?: string }[] = [];

  // Images
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    const url = m[1];
    const lower = url.toLowerCase();
    const skipPatterns = ['pixel', 'tracking', 'beacon', 'spacer', '1x1', 'blank.gif',
      'clear.gif', 'favicon', 'icon', 'logo', 'badge', 'button', 'analytics', 'feedburner', 'emoji'];
    if (!skipPatterns.some(p => lower.includes(p))) {
      images.push(url);
    }
  }

  // Videos — extract the whole <video> tag then parse attributes separately
  //   (combined regex with optional groups fails because [^>]* is too greedy)
  const videoTagRe = /<video[^>]+>/gi;
  while ((m = videoTagRe.exec(html)) !== null) {
    const tag = m[0];
    const srcM = tag.match(/\bsrc=["']([^"']+)["']/);
    const posterM = tag.match(/\bposter=["']([^"']+)["']/);
    let src = srcM?.[1] || '';
    const poster = posterM?.[1] || undefined;
    // Also check for <source> tag inside
    if (!src) {
      const rest = html.slice(m.index);
      const sourceM = rest.match(/<source[^>]+src=["']([^"']+)["']/i);
      src = sourceM?.[1] || '';
    }
    if (src) {
      videos.push({ src, poster });
    }
  }

  return { images, videos };
}

/** Strip HTML to plain text, but preserve <div class="rsshub-quote"> boundaries */
function stripHtmlKeepQuotes(html: string): { mainText: string; quoteHtml: string | null; isRT: boolean; rtAuthor: string } {
  let isRT = false;
  let rtAuthor = '';
  let quoteHtml: string | null = null;

  // Extract rsshub-quote blocks
  const quoteRe = /<div\s+class=["']rsshub-quote["'][^>]*>([\s\S]*?)<\/div>/gi;
  const quoteMatch = quoteRe.exec(html);
  if (quoteMatch) {
    quoteHtml = quoteMatch[1];
    html = html.replace(quoteMatch[0], '');
  }

  // Check for RT prefix — match on raw HTML before stripping tags
  // Format: "RT Username<br>tweet text..."
  const rtHtmlRe = /^RT\s+(.+?)(?:<br\s*\/?>|$)/i;
  const rtMatch = rtHtmlRe.exec(html.trim());
  if (rtMatch) {
    isRT = true;
    rtAuthor = rtMatch[1].replace(/<[^>]*>/g, '').trim();
    // Remove "RT username<br>" from the beginning
    html = html.replace(/^RT\s+.+?(?:<br\s*\/?>)/i, '');
  }

  // Remove images and videos (we render them separately)
  html = html.replace(/<img[^>]*>/gi, '');
  html = html.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '');
  html = html.replace(/<video[^>]*\/>/gi, '');
  
  // Convert <br> to newlines, strip remaining tags
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
  
  // Clean up excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return { mainText: text, quoteHtml, isRT, rtAuthor };
}

/** Parse quote block to extract author and content */
function parseQuote(html: string): { author: string; text: string; images: string[] } {
  let author = '';
  let text = '';
  const images: string[] = [];

  // Extract images from quote
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    images.push(m[1]);
  }

  // Remove images/videos
  let clean = html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '')
    .replace(/<video[^>]*\/>/gi, '');

  // Remove leading <br>
  clean = clean.replace(/^(\s*<br\s*\/?>)+/i, '');

  // Convert <br> to newlines, then strip remaining tags
  const plainText = clean
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  const colonIdx = plainText.indexOf(':');
  if (colonIdx > 0 && colonIdx < 50) {
    author = plainText.substring(0, colonIdx).trim();
    text = plainText.substring(colonIdx + 1).trim();
  } else {
    text = plainText;
  }

  return { author, text, images };
}

// ── Sub-components ──

function AvatarInitials({ name, className }: { name: string; className?: string }) {
  const initial = name.charAt(0).toUpperCase();
  // Generate consistent color from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-bold select-none flex-shrink-0',
        className
      )}
      style={{ background: `hsl(${hue}, 55%, 45%)` }}
    >
      {initial}
    </div>
  );
}

function AvatarWithFallback({ name, handle, profileImageUrl, isTwitter }: {
  name: string;
  handle: string;
  profileImageUrl?: string;
  isTwitter?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  
  // Priority: profileImageUrl (from feed) > unavatar (for Twitter handles) > initials
  const imgSrc = profileImageUrl
    ? proxyTwitterUrl(profileImageUrl)
    : (isTwitter && handle)
      ? `https://unavatar.io/x/${encodeURIComponent(handle)}`
      : undefined;

  if (imgSrc && !errored) {
    return (
      <img
        src={imgSrc}
        alt=""
        className="w-10 h-10 rounded-full object-cover"
        onError={() => setErrored(true)}
      />
    );
  }
  
  return <AvatarInitials name={name} className="w-10 h-10 text-base" />;
}

function MediaGrid({ images, onClick }: { images: string[]; onClick?: () => void }) {
  if (images.length === 0) return null;
  
  const count = Math.min(images.length, 4);
  
  return (
    <div
      className={cn(
        'mt-3 rounded-xl overflow-hidden grid gap-0.5',
        count === 1 && 'grid-cols-1',
        count === 2 && 'grid-cols-2',
        count >= 3 && 'grid-cols-2'
      )}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
      {images.slice(0, 4).map((src, i) => (
        <a
          key={i}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'block overflow-hidden bg-[rgb(var(--bg-hover))]',
            count === 1 && 'max-h-[500px]',
            count === 2 && 'aspect-[4/3]',
            count === 3 && i === 0 && 'row-span-2 aspect-auto',
            count >= 3 && i > 0 && 'aspect-square',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={proxyTwitterUrl(src)}
            alt=""
            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </a>
      ))}
    </div>
  );
}

function VideoPlayer({ src, poster, entryUrl }: { src: string; poster?: string; entryUrl?: string }) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <a
        href={entryUrl || src}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block relative rounded-xl overflow-hidden bg-[rgb(var(--bg-hover))] cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        {poster && <img src={poster} alt="" className="w-full rounded-xl" />}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="bg-blue-500/90 rounded-full w-12 h-12 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </a>
    );
  }

  // Proxy Twitter videos through our server (also decodes &amp; → &)
  const proxiedSrc = proxyTwitterUrl(src);
  const proxiedPoster = poster ? proxyTwitterUrl(poster) : undefined;

  return (
    <video
      src={proxiedSrc}
      poster={proxiedPoster}
      controls
      preload="metadata"
      className="mt-3 rounded-xl w-full max-h-[500px] bg-black"
      onError={() => setErrored(true)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function QuoteCard({ html, entryUrl }: { html: string; entryUrl?: string }) {
  const { author, text, images } = parseQuote(html);
  const { videos } = extractMedia(html);

  return (
    <div
      className="mt-3 border border-[rgb(var(--border-default))] rounded-xl p-3 hover:bg-[rgb(var(--bg-hover))] transition-colors cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      {author && (
        <div className="flex items-center gap-1.5 mb-1">
          <svg className="w-3.5 h-3.5 opacity-40 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="font-bold text-sm text-[rgb(var(--text-primary))]">{author}</span>
        </div>
      )}
      {text && (
        <p className="text-sm text-[rgb(var(--text-secondary))] whitespace-pre-wrap">{text}</p>
      )}
      {images.length > 0 && <MediaGrid images={images} />}
      {videos.map((v, i) => (
        <VideoPlayer key={i} src={v.src} poster={v.poster} entryUrl={entryUrl} />
      ))}
    </div>
  );
}

// ── Main component ──

interface SocialEntryListProps {
  entries: Entry[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

export function SocialEntryList({
  entries: rawEntries,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: SocialEntryListProps) {
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const toggleBookmark = useToggleBookmark();
  
  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage?.();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (isLoading) {
    return (
      <div className="max-w-[680px] mx-auto px-4">
        <EntryListSkeleton count={5} />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-[680px] mx-auto px-4">
        <AllCaughtUpState />
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto">
      <AnimatePresence mode="popLayout">
        {entries.map((entry, index) => (
          <TweetCard
            key={entry.id}
            entry={entry}
            index={index}
            onToggleBookmark={() => toggleBookmark.mutate(entry.id)}
            onMarkRead={() => {
              if (entry.status === 'unread') markAsRead.mutate(entry.id);
            }}
            onToggleRead={() => {
              if (entry.status === 'unread') markAsRead.mutate(entry.id);
              else markAsUnread.mutate(entry.id);
            }}
          />
        ))}
      </AnimatePresence>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* Loading indicator */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
          <span className="ml-2 text-sm text-[rgb(var(--text-muted))]">{t('entry.loadMore')}</span>
        </div>
      )}
    </div>
  );
}

// ── Auto mark-as-read on scroll visibility ──

function useAutoMarkRead(isUnread: boolean, onMarkRead: () => void, delayMs = 1500) {
  const ref = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isUnread) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Start timer when visible
          timerRef.current = setTimeout(() => {
            onMarkRead();
          }, delayMs);
        } else {
          // Cancel if scrolled away before timer fires
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold: 0.5 } // At least 50% visible
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isUnread, onMarkRead, delayMs]);

  return ref;
}

// ── Tweet Card ──

function TweetCard({
  entry,
  index,
  onToggleBookmark,
  onMarkRead,
  onToggleRead,
}: {
  entry: Entry;
  index: number;
  onToggleBookmark: () => void;
  onMarkRead: () => void;
  onToggleRead: () => void;
}) {
  const { mainText, quoteHtml, isRT, rtAuthor: originalAuthor } = stripHtmlKeepQuotes(entry.content);
  
  // For RTs: rtAuthor is the ORIGINAL tweet author (from "RT Username<br>")
  //          entry.author is the feed owner (the retweeter)
  // For non-RTs: entry.author is the tweet author
  const displayAuthor = isRT ? originalAuthor : entry.author;
  const { name, handle } = parseAuthor(displayAuthor);
  // The retweeter is the feed owner
  const retweeterName = isRT ? (entry.author || entry.feedTitle?.replace(/^Twitter @/, '') || '') : '';
  
  const { images, videos } = extractMedia(entry.content);
  // Remove media that's inside the quote (avoid duplication)
  const quoteMeta = quoteHtml ? extractMedia(quoteHtml) : { images: [], videos: [] };
  const quoteVideoSrcs = new Set(quoteMeta.videos.map(v => v.src));
  const mainImages = images.filter(img => !quoteMeta.images.includes(img));
  const mainVideos = videos.filter(v => !quoteVideoSrcs.has(v.src));
  const isUnread = entry.status === 'unread';

  // Auto mark-as-read when tweet is visible for 1.5s
  const autoReadRef = useAutoMarkRead(isUnread, onMarkRead);

  const handleCardClick = () => {
    // Also mark read on click (instant)
    onMarkRead();
    if (entry.url) {
      window.open(entry.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <motion.article
      ref={autoReadRef as React.Ref<HTMLElement>}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.015, 0.15) }}
      layout
      onClick={handleCardClick}
      className={cn(
        'px-4 py-3 border-b border-[rgb(var(--border-default))] cursor-pointer transition-colors',
        'hover:bg-[rgb(var(--bg-hover))]',
        !isUnread && 'opacity-60'
      )}
    >
      {/* RT header — retweeter is the feed owner (entry.author) */}
      {isRT && retweeterName && (
        <div className="flex items-center gap-1.5 text-[rgb(var(--text-muted))] text-xs mb-1 ml-12">
          <Repeat2 className="w-3.5 h-3.5" />
          <span>{retweeterName} {t('entry.retweet')}</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar — use profile image for feed owner, unavatar for RT authors */}
        <div className="flex-shrink-0 pt-0.5">
          <AvatarWithFallback
            name={name}
            handle={handle}
            profileImageUrl={!isRT ? (entry.feedProfileImageUrl || entry.feedIconUrl) : undefined}
            isTwitter={true}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: name + handle + time */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-sm text-[rgb(var(--text-primary))] truncate max-w-[200px]">
              {name}
            </span>
            {handle && (
              <span className="text-sm text-[rgb(var(--text-muted))] truncate max-w-[150px]">
                @{handle}
              </span>
            )}
            <span className="text-[rgb(var(--text-muted))]">·</span>
            <span className="text-sm text-[rgb(var(--text-muted))] flex-shrink-0">
              {formatTweetDate(new Date(entry.publishedAt))}
            </span>
            {/* Unread dot */}
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 ml-1" />
            )}
          </div>

          {/* Tweet text */}
          {mainText && (
            <div className="mt-1 text-[15px] leading-[1.45] text-[rgb(var(--text-primary))] whitespace-pre-wrap break-words">
              {mainText}
            </div>
          )}

          {/* Media */}
          {mainImages.length > 0 && <MediaGrid images={mainImages} />}
          {mainVideos.map((v, i) => (
            <VideoPlayer key={i} src={v.src} poster={v.poster} entryUrl={entry.url} />
          ))}

          {/* Quote tweet */}
          {quoteHtml && <QuoteCard html={quoteHtml} entryUrl={entry.url} />}

          {/* Action buttons */}
          <div className="flex items-center gap-1 mt-2 -ml-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
              className={cn(
                'p-2 rounded-full transition-colors group',
                entry.starred
                  ? 'text-yellow-500 hover:bg-yellow-500/10'
                  : 'text-[rgb(var(--text-muted))] hover:text-yellow-500 hover:bg-yellow-500/10'
              )}
              title={entry.starred ? t('action.unstar') : t('action.star')}
            >
              <Star className={cn('w-4 h-4', entry.starred && 'fill-current')} />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onToggleRead(); }}
              className={cn(
                'p-2 rounded-full transition-colors',
                isUnread
                  ? 'text-blue-500 hover:bg-blue-500/10'
                  : 'text-[rgb(var(--text-muted))] hover:text-blue-500 hover:bg-blue-500/10'
              )}
              title={isUnread ? t('action.markRead') : t('action.markUnread')}
            >
              {isUnread ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            {/* External link indicator */}
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full text-[rgb(var(--text-muted))] hover:text-orange-500 hover:bg-orange-500/10 transition-colors ml-auto"
              onClick={(e) => e.stopPropagation()}
              title={t('entry.social.openInTwitter')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
