'use client';

import { getLocale, t } from '@/lib/i18n';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatDistanceToNow, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { 
  X, 
  ExternalLink, 
  Trash2,
  Maximize2,
  Minimize2,
  Twitter,
  Bookmark,
  Pencil,
  Sparkles,
  Languages,
} from 'lucide-react';
import { summarizeSavedItem, getHighlights, createHighlight, updateHighlight } from '@/lib/api';
import type { SavedItem, Highlight } from '@/lib/api';
import { useLayout } from '@/contexts/layout-context';
import { useAISettings } from '@/hooks/use-ai-settings';
import { useTextSelection } from '@/hooks/use-text-selection';
import { HighlightToolbar } from '../entry/highlight-toolbar';
import { BilingualContent } from '../entry/bilingual-content';
import { TwitterEmbed } from './twitter-embed';

// Format date
function formatDate(date: Date): string {
  const days = differenceInDays(new Date(), date);
  if (days < 30) {
    return formatDistanceToNow(date, { addSuffix: true, locale: getLocale() === 'zh' ? zhCN : undefined });
  }
  return format(date, getLocale() === 'zh' ? 'yyyy年M月d日 HH:mm' : 'MMM d, yyyy HH:mm');
}

// Source styling
const SOURCE_CONFIG: Record<string, { Icon: typeof Twitter; label: string; bgColor: string; textColor: string }> = {
  twitter: { Icon: Twitter, label: 'Twitter', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400' },
  extension: { Icon: Bookmark, label: 'Clipper', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400' },
  manual: { Icon: Pencil, label: 'Manual', bgColor: 'bg-gray-500/10', textColor: 'text-gray-400' },
};

interface SavedItemReaderProps {
  item: SavedItem;
  onClose?: () => void;
  onDelete?: () => void;
}

export function SavedItemReader({ item, onClose, onDelete }: SavedItemReaderProps) {
  const confirmDialog = useConfirm();
  const [readProgress, setReadProgress] = useState(0);
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggleFullscreen, setFullscreen } = useLayout();
  const source = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.manual;
  const { data: aiSettings } = useAISettings();
  const { selection, clearSelection, setManualSelection } = useTextSelection(contentRef);
  const [savedHighlights, setSavedHighlights] = useState<Highlight[]>([]);

  // AI Summary
  const summarize = useMutation({
    mutationFn: () => summarizeSavedItem(item.id),
    onError: (err: Error) => {
      toast.error(err.message || t('saved.aiSummaryFailed'));
    },
  });

  // Fetch existing highlights for this saved item
  useEffect(() => {
    getHighlights(undefined, item.id).then(setSavedHighlights).catch(() => {});
  }, [item.id]);

  const handleSaveHighlight = async (data: {
    text: string; note?: string; color: string;
    positionStart: number; positionEnd: number; xpath: string;
  }) => {
    try {
      const saved = await createHighlight({
        savedItemId: item.id,
        text: data.text,
        note: data.note,
        color: data.color,
        positionStart: data.positionStart,
        positionEnd: data.positionEnd,
        xpath: data.xpath,
      });
      setSavedHighlights(prev => [...prev, saved]);
      toast.success(t('entry.highlightSaved'));
      clearSelection();
    } catch {
      toast.error(t('entry.saveFailed'));
    }
  };

  // Click on highlighted text → open toolbar
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const nativeSel = window.getSelection();
    if (nativeSel && !nativeSel.isCollapsed) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [data-highlight-toolbar], .feedglow-note-icon')) return;
    if (!contentRef.current || savedHighlights.length === 0) return;

    const markEl = target.closest('mark[data-highlight-id]') as HTMLElement | null;
    if (markEl) {
      const hlId = Number(markEl.getAttribute('data-highlight-id'));
      const hit = savedHighlights.find(h => h.id === hlId);
      if (hit) {
        setManualSelection({
          text: hit.text,
          positionStart: hit.position_start ?? 0,
          positionEnd: hit.position_end ?? 0,
          xpath: hit.xpath ?? '',
          rect: markEl.getBoundingClientRect(),
        });
      }
    }
  }, [savedHighlights, setManualSelection]);

  // Reset progress on item change
  useEffect(() => {
    setReadProgress(0);
  }, [item.id]);

  // Track reading progress
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setReadProgress(Math.min(100, Math.max(0, progress)));
    };

    content.addEventListener('scroll', handleScroll);
    return () => content.removeEventListener('scroll', handleScroll);
  }, []);

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
          {/* Source badge */}
          <span className={cn('px-2 py-1 rounded text-xs font-medium flex items-center gap-1', source.bgColor, source.textColor)}>
            <source.Icon className="w-3.5 h-3.5" /> {source.label}
          </span>
          <span className="text-xs text-muted">
            {formatDate(new Date(item.createdAt))}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            title={t('saved.openOriginal')}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          {onDelete && (
            <button
              onClick={async () => {
                const ok = await confirmDialog({ message: t('saved.confirmDelete'), variant: 'danger', confirmText: t('common.delete') });
                if (ok) onDelete();
              }}
              className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title={t('action.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className={cn(
              "p-2 rounded-lg transition-colors",
              fullscreen
                ? "text-orange-500 bg-orange-500/10"
                : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
            )}
            title={fullscreen ? t('saved.exitFullscreen') : t('saved.fullscreen')}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Reading Progress */}
      <div className="h-0.5 bg-[rgb(var(--bg-hover))]">
        <motion.div 
          className="h-full bg-gradient-to-r from-orange-500 to-orange-400 glow"
          initial={{ width: 0 }}
          animate={{ width: `${readProgress}%` }}
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
        <article className="max-w-2xl mx-auto px-6 py-8">
          {/* Title */}
          <h1 className="text-2xl font-bold mb-4 leading-tight text-[rgb(var(--text-primary))]">
            {item.title || 'Untitled'}
          </h1>

          {/* URL */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[rgb(var(--accent))] hover:underline break-all"
          >
            {item.url}
          </a>

          {/* AI Summary Card - Glow Feature (same as entry-reader) */}
          {aiSettings?.enableSummary !== false && summarize.data ? (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mt-6 mb-8 p-5 rounded-2xl border-2 border-orange-500/50 relative overflow-hidden"
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
                  {summarize.data.summary}
                </p>
                {summarize.data.keyPoints && summarize.data.keyPoints.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {summarize.data.keyPoints.map((point: string, i: number) => (
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
              className="mt-6 mb-8 p-5 rounded-2xl border border-orange-500/30 cursor-pointer transition-all hover:border-orange-500/50"
              style={{ 
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.03) 100%)',
                boxShadow: '0 0 30px rgba(249, 115, 22, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)' 
              }}
              onClick={() => !summarize.isPending && summarize.mutate()}
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
            {/* Translation toggle */}
            {aiSettings?.enableTranslation !== false && (
              <button
                onClick={() => setTranslateEnabled(!translateEnabled)}
                className={cn(
                  "btn-subtle flex items-center gap-2",
                  translateEnabled && "bg-orange-500/20 text-orange-400 border-orange-500/40"
                )}
              >
                <Languages className="w-4 h-4" />
                {translateEnabled ? t('saved.closeTranslation') : t('saved.paragraphTranslation')}
              </button>
            )}
          </div>

          {/* Twitter Embed for Twitter sources */}
          {item.source === 'twitter' ? (
            <div className="space-y-6">
              <TwitterEmbed 
                url={item.url} 
                fallbackContent={item.content || item.description}
              />
              {item.content && !item.content.includes('twitter-embed') && !item.content.includes('blockquote class="twitter-tweet"') && (
                <BilingualContent
                  content={item.content}
                  entryId={item.id}
                  enabled={translateEnabled}
                  highlights={savedHighlights}
                />
              )}
            </div>
          ) : (
            <>
              {/* Thumbnail */}
              {item.thumbnail && (
                <img
                  src={item.thumbnail}
                  alt=""
                  className="w-full max-w-lg rounded-xl mb-6"
                />
              )}

              {/* Main Content with bilingual translation */}
              {item.content ? (
                <BilingualContent
                  content={item.content}
                  entryId={item.id}
                  enabled={translateEnabled}
                  highlights={savedHighlights}
                />
              ) : item.description ? (
                <p className="text-secondary leading-relaxed">{item.description}</p>
              ) : (
                <p className="text-muted italic">{t('saved.noContent')}</p>
              )}
            </>
          )}

        </article>
      </div>
    </motion.div>
  );
}
