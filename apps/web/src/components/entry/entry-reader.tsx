'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// Format date: relative for < 30 days, specific date+time for >= 30 days
function formatEntryDate(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days < 30) {
    return formatDistanceToNow(date, { addSuffix: false, locale: getLocale() === 'zh' ? zhCN : undefined });
  }
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日 HH:mm' : 'MMM d, yyyy HH:mm');
}
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import { 
  X, 
  Star, 
  ExternalLink, 
  Languages, 
  Sparkles,
  MessageCircle,
  Maximize2,
  Minimize2,
  FileText,
  Share2
} from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useToggleBookmark, useSummarize, useFullContent, useShareEntry, useUnshareEntry, useTags, useAddTagToEntry, useRemoveTagFromEntry, useAISettings, useRecordReadEvent, useReadingProgress } from '@/hooks';
import { getEntryDuplicates, type DuplicateInfo } from '@/lib/api';
import { useLayout } from '@/contexts/layout-context';
import { ReaderSettingsButton, useReaderSettings, getReaderStyles } from '@/components/ui/reader-settings';
import { t, getLocale } from '@/lib/i18n';
import { ChatPanel } from './chat-panel';
import { BilingualContent } from './bilingual-content';
import { ShareModal } from './share-modal';
import { TagInput } from './tag-input';
import { RelatedArticles } from './related-articles';
import { MediaPlayer } from './media-player';
import { SaveToMenu } from './save-to-menu';
import { AddToCollection } from './add-to-collection';
import { useTextSelection } from '@/hooks/use-text-selection';
import { HighlightToolbar } from './highlight-toolbar';
import { createHighlight, getHighlights, updateHighlight, type Highlight } from '@/lib/api';
import toast from 'react-hot-toast';

interface EntryReaderProps {
  entry: Entry;
  onClose?: () => void;
}

export function EntryReader({ entry, onClose }: EntryReaderProps) {
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [isStarred, setIsStarred] = useState(entry.starred);
  const [showChat, setShowChat] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [fetchFullEnabled, setFetchFullEnabled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const toggleBookmark = useToggleBookmark();
  const summarize = useSummarize();
  const fullContentQuery = useFullContent(entry.id, fetchFullEnabled);
  const shareEntry = useShareEntry();
  const unshareEntry = useUnshareEntry();
  const { data: allTags } = useTags();
  const addTag = useAddTagToEntry();
  const removeTag = useRemoveTagFromEntry();
  const readerSettings = useReaderSettings();
  const { fullscreen, toggleFullscreen, setFullscreen } = useLayout();
  const { selection, clearSelection, setManualSelection } = useTextSelection(contentRef);
  const [savedHighlights, setSavedHighlights] = useState<Highlight[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);

  // Fetch existing highlights for this entry
  useEffect(() => {
    getHighlights(entry.id).then(setSavedHighlights).catch(() => {});
  }, [entry.id]);

  // Fetch duplicate info if entry is marked as duplicate
  useEffect(() => {
    if ((entry as any).isDuplicate) {
      getEntryDuplicates(entry.id)
        .then(data => setDuplicates(data.duplicates || []))
        .catch(() => {});
    } else {
      setDuplicates([]);
    }
  }, [entry.id, (entry as any).isDuplicate]);

  const handleSaveHighlight = async (data: {
    text: string; note?: string; color: string;
    positionStart: number; positionEnd: number; xpath: string;
  }) => {
    try {
      const saved = await createHighlight({
        entryId: entry.id,
        text: data.text,
        note: data.note,
        color: data.color,
        positionStart: data.positionStart,
        positionEnd: data.positionEnd,
        xpath: data.xpath,
      });
      // Add to local state so it renders immediately
      setSavedHighlights(prev => [...prev, saved]);
      toast.success(t('entry.highlightSaved'));
      clearSelection();
    } catch {
      toast.error(t('entry.saveFailed'));
    }
  };
  // Click on highlighted text → open toolbar immediately (no double-click needed)
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Skip if user is making a text selection (mouseup after drag)
    const nativeSel = window.getSelection();
    if (nativeSel && !nativeSel.isCollapsed) return;

    // Skip if clicking on a link or interactive element
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [data-highlight-toolbar], .feedglow-note-icon')) return;

    if (!contentRef.current || savedHighlights.length === 0) return;

    // Fast path: clicking a <mark> element (fallback renderer)
    const markEl = target.closest('mark[data-highlight-id]') as HTMLElement | null;
    if (markEl) {
      const hlId = Number(markEl.getAttribute('data-highlight-id'));
      const hit = savedHighlights.find(h => h.id === hlId);
      if (hit) {
        const markRect = markEl.getBoundingClientRect();
        setManualSelection({
          text: hit.text,
          positionStart: hit.position_start ?? 0,
          positionEnd: hit.position_end ?? 0,
          xpath: hit.xpath || '/',
          rect: markRect,
        });
        return;
      }
    }

    // CSS Custom Highlights API path: use caretRangeFromPoint
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!range || !range.startContainer.textContent) return;

    // Calculate the character offset within the content container
    const container = contentRef.current;
    if (!container.contains(range.startContainer)) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let charOffset = 0;
    while (walker.nextNode()) {
      if (walker.currentNode === range.startContainer) {
        charOffset += range.startOffset;
        break;
      }
      charOffset += (walker.currentNode.textContent || '').length;
    }

    // Check if this offset falls within any saved highlight
    const hit = savedHighlights.find(h =>
      h.position_start != null && h.position_end != null &&
      charOffset >= h.position_start && charOffset <= h.position_end
    );
    if (!hit) return;

    // Build a rect for the toolbar position (use the click point)
    const rect = new DOMRect(e.clientX - 40, e.clientY, 80, 0);

    setManualSelection({
      text: hit.text,
      positionStart: hit.position_start ?? 0,
      positionEnd: hit.position_end ?? 0,
      xpath: hit.xpath || '/',
      rect,
    });
  }, [savedHighlights, setManualSelection]);

  // Reading progress sync (articles only — skip video/podcast/social)
  const isArticle = (entry as any).feedType === 'article';
  const { progress: readProgress } = useReadingProgress({
    entryId: isArticle ? entry.id : null,
    scrollRef: contentRef,
  });

  const { data: aiSettings } = useAISettings();
  const recordReadEvent = useRecordReadEvent();
  
  // Track reading time - record actual duration when leaving article
  const readingStartRef = useRef<number>(Date.now());

  useEffect(() => {
    setIsStarred(entry.starred);
    setTranslateEnabled(false);
    // Check if we already have cached full content for this entry
    setFetchFullEnabled(!!fullContentQuery.data);
    // Reset reading tracking for new entry
    readingStartRef.current = Date.now();
  }, [entry.id, entry.starred]);

  // Track max scroll depth
  const maxScrollRef = useRef(0);
  useEffect(() => {
    if (readProgress > maxScrollRef.current) {
      maxScrollRef.current = readProgress;
    }
  }, [readProgress]);

  // Record read event ONLY when leaving the article (switching or closing)
  // This ensures we capture the full reading duration
  const recordReadEventRef = useRef(recordReadEvent);
  recordReadEventRef.current = recordReadEvent;
  
  useEffect(() => {
    const currentEntryId = entry.id;
    const currentFeedId = entry.feedId;
    
    return () => {
      // This runs when entry changes or component unmounts
      const readingTime = Math.round((Date.now() - readingStartRef.current) / 1000);
      const scrollDepth = Math.round(maxScrollRef.current * 100);
      
      // Only record if meaningful engagement (3+ seconds)
      if (readingTime >= 3 && currentFeedId && currentEntryId) {
        recordReadEventRef.current.mutate({
          entryId: currentEntryId,
          feedId: currentFeedId,
          duration: readingTime,
          scrollDepth: scrollDepth,
        });
      }
      
      // Reset for next article
      maxScrollRef.current = 0;
    };
  }, [entry.id, entry.feedId]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="h-full flex flex-col surface-elevated"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-default">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={() => {
                if (fullscreen) setFullscreen(false);
                onClose();
              }}
              className="p-2 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsStarred(!isStarred);
              toggleBookmark.mutate(entry.id);
            }}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isStarred 
                ? "text-yellow-500 bg-yellow-500/10" 
                : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
            )}
          >
            <Star className={cn("w-4 h-4", isStarred && "fill-current")} />
          </button>
          <button
            onClick={() => setShowChat(!showChat)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showChat
                ? "text-orange-500 bg-orange-500/10"
                : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
            )}
            title="Ask AI about this article"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <SaveToMenu entryId={entry.id} />
          <AddToCollection entryId={String(entry.id)} />
          <button
            onClick={() => setShowShare(true)}
            className="p-2 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            title={t('action.share')}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className={cn(
              "p-2 rounded-lg transition-colors",
              fullscreen
                ? "text-orange-500 bg-orange-500/10"
                : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
            )}
            title={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <ReaderSettingsButton {...readerSettings} />
        </div>
      </div>

      {/* Reading Progress */}
      <div className="h-0.5 bg-[rgb(var(--bg-hover))]">
        <motion.div 
          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 glow"
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(readProgress * 100)}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Highlight Toolbar */}
      <HighlightToolbar
        selection={selection}
        existingHighlights={savedHighlights}
        onSave={handleSaveHighlight}
        onUpdateNote={async (id, note) => {
          try {
            await updateHighlight(id, { note: note || undefined });
            setSavedHighlights(prev => prev.map(h => h.id === id ? { ...h, note } : h));
            toast.success(t('entry.noteSaved'));
          } catch { toast.error(t('entry.saveFailed')); }
        }}
        onDismiss={clearSelection}
      />

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto" onClick={handleContentClick}>
        <article className="mx-auto px-6 py-8" style={{ maxWidth: `${readerSettings.settings.contentWidth}px` }}>
          {/* Meta */}
          <div className="flex items-center gap-3 mb-4 text-sm text-muted flex-wrap">
            <span>{entry.feedTitle}</span>
            <span>•</span>
            <time>{formatEntryDate(new Date(entry.publishedAt))}</time>
            {(entry as any).readingTime > 0 && (entry as any).feedType === 'article' && (
              <>
                <span>•</span>
                <span>📖 {(entry as any).readingTime} min</span>
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold mb-4 leading-tight text-[rgb(var(--text-primary))]">
            {entry.title}
          </h1>

          {entry.author && (
            <p className="text-sm text-muted mb-6">By {entry.author}</p>
          )}

          {/* Duplicate banner */}
          {duplicates.length > 0 && (
            <div className="mb-6 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="4" width="10" height="14" rx="1" />
                  <rect x="10" y="6" width="10" height="14" rx="1" />
                </svg>
                {t('entry.duplicateArticle')}
              </div>
              <div className="space-y-1">
                {duplicates.slice(0, 3).map(d => (
                  <div key={d.id} className="text-xs text-muted flex items-center gap-1.5">
                    <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                      {d.matchType === 'url' ? 'URL' : d.matchType === 'title' ? t('entry.matchTitle') : t('entry.matchContent')}
                    </span>
                    <span className="truncate">
                      {t('entry.fromSource', { source: d.originalFeedTitle || t('entry.unknownSource') })}
                    </span>
                    {d.originalUrl && (
                      <a
                        href={d.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-500 hover:underline flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t('entry.viewOriginal')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Summary Card - Glow Feature */}
          {aiSettings?.enableSummary !== false && (entry.summary || summarize.data) ? (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mb-8 p-5 rounded-2xl border-2 border-orange-500/50 relative overflow-hidden"
              style={{ 
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(249, 115, 22, 0.08) 50%, rgba(249, 115, 22, 0.05) 100%)',
                boxShadow: `
                  0 0 20px rgba(249, 115, 22, 0.4),
                  0 0 40px rgba(249, 115, 22, 0.3),
                  0 0 60px rgba(249, 115, 22, 0.2),
                  0 0 80px rgba(249, 115, 22, 0.1),
                  inset 0 1px 0 rgba(255,255,255,0.15)
                ` 
              }}
            >
              {/* Animated glow pulse */}
              <div 
                className="absolute inset-0 rounded-2xl animate-pulse"
                style={{ 
                  background: 'radial-gradient(circle at 30% 30%, rgba(249, 115, 22, 0.15), transparent 60%)',
                  pointerEvents: 'none'
                }}
              />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center"
                    style={{ boxShadow: '0 0 15px rgba(249, 115, 22, 0.6)' }}
                  >
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-orange-400 text-lg tracking-tight">AI Summary</span>
                </div>
                <p className="text-secondary text-sm leading-relaxed">
                  {summarize.data?.summary || entry.summary}
                </p>
                {(summarize.data?.keyPoints || entry.keyPoints) && (
                  <ul className="mt-4 space-y-2">
                    {(summarize.data?.keyPoints || entry.keyPoints)?.map((point, i) => (
                      <li key={i} className="text-xs text-muted flex items-start gap-2">
                        <span className="text-orange-400 mt-0.5">▸</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          ) : aiSettings?.enableSummary !== false ? (
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="mb-8 p-5 rounded-2xl border border-orange-500/30 cursor-pointer transition-all hover:border-orange-500/50"
              style={{ 
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.03) 100%)',
                boxShadow: '0 0 30px rgba(249, 115, 22, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)' 
              }}
              onClick={() => !summarize.isPending && summarize.mutate(entry.id)}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/40 to-orange-600/40 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-orange-300" />
                </div>
                <span className="font-semibold text-orange-400 text-lg">AI Summary</span>
              </div>
              <p className="text-sm text-orange-400/80 hover:text-orange-300 transition-colors">
                {summarize.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : (
                  'Click to generate AI summary →'
                )}
              </p>
            </motion.div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mb-8 pb-6 border-b border-default flex-wrap">
            {/* Fetch full content */}
            <button
              onClick={() => !entry.hasFullContent && setFetchFullEnabled(true)}
              disabled={entry.hasFullContent || fullContentQuery.isFetching || !!fullContentQuery.data}
              className={cn(
                "btn-subtle flex items-center gap-2",
                (entry.hasFullContent || fullContentQuery.data) && "bg-green-500/20 text-green-400 border-green-500/40"
              )}
            >
              <FileText className="w-4 h-4" />
              {entry.hasFullContent ? t('entry.fullContentFetched') : fullContentQuery.isFetching ? t('entry.fetchingContent') : fullContentQuery.data ? t('entry.fullContentFetched') : t('entry.fetchFull')}
            </button>

            {/* Translation toggle - simple on/off */}
            {aiSettings?.enableTranslation !== false && (
              <button
                onClick={() => setTranslateEnabled(!translateEnabled)}
                className={cn(
                  "btn-subtle flex items-center gap-2",
                  translateEnabled && "bg-orange-500/20 text-orange-400 border-orange-500/40"
                )}
              >
                <Languages className="w-4 h-4" />
                {translateEnabled ? t('entry.closeTranslation') : t('entry.paragraphTranslation')}
              </button>
            )}
          </div>

          {/* Media Player for podcast/video enclosures */}
          {entry.enclosures && entry.enclosures.length > 0 && 
           entry.enclosures.some(e => e.mime_type?.startsWith('audio/') || e.mime_type?.startsWith('video/')) && (
            <div className="mb-8">
              <MediaPlayer
                enclosures={entry.enclosures
                  .filter(e => e.mime_type?.startsWith('audio/') || e.mime_type?.startsWith('video/'))
                  .map(e => ({ url: e.url, mimeType: e.mime_type, size: Number(e.size) || 0 }))}
                title={entry.title}
                feedTitle={entry.feedTitle}
                entryId={entry.id}
              />
            </div>
          )}

          {/* Main Content - with optional bilingual translation */}
          <div style={getReaderStyles(readerSettings.settings)}>
            <BilingualContent 
              content={fullContentQuery.data?.content || entry.content}
              entryId={entry.id}
              enabled={translateEnabled}
              entryUrl={entry.url}
              entryAuthor={entry.author}
              feedTitle={entry.feedTitle}
              highlights={savedHighlights}
            />
          </div>

          {/* Tags Section */}
          <div className="mt-8 pt-6 border-t border-default">
            <p className="text-xs text-muted mb-2">{t('entry.tags')}</p>
            <TagInput
              tags={(Array.isArray(entry.tags) ? entry.tags : []).map(t => ({ name: t, isAI: false }))}
              suggestions={(Array.isArray(allTags) ? allTags : []).map(t => ({ id: t.id, name: t.name }))}
              onAdd={(name) => addTag.mutate({ entryId: entry.id, tagName: name })}
              onRemove={(tag) => tag.id && removeTag.mutate({ entryId: entry.id, tagId: tag.id })}
            />
          </div>

          {/* Related Articles - auto-generated from knowledge graph */}
          <RelatedArticles entryId={entry.id} />
        </article>
      </div>

      {/* Chat Panel */}
      <ChatPanel entry={entry} isOpen={showChat} onClose={() => setShowChat(false)} />
      
      {/* Share Modal */}
      <ShareModal
        entry={entry}
        isOpen={showShare}
        onClose={() => setShowShare(false)}
        onShare={async () => {
          const result = await shareEntry.mutateAsync(entry.id);
          return result.url;
        }}
        onUnshare={async () => {
          await unshareEntry.mutateAsync(entry.id);
        }}
      />
    </motion.div>
  );
}
