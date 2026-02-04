'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import { 
  X, 
  Star, 
  ExternalLink, 
  Languages, 
  Sparkles,
  MessageCircle
} from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useToggleBookmark, useSummarize } from '@/hooks';
import { ReaderSettingsButton, useReaderSettings, getReaderStyles } from '@/components/ui/reader-settings';
import { ChatPanel } from './chat-panel';
import { BilingualContent } from './bilingual-content';

interface EntryReaderProps {
  entry: Entry;
  onClose?: () => void;
}

export function EntryReader({ entry, onClose }: EntryReaderProps) {
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [isStarred, setIsStarred] = useState(entry.starred);
  const [readProgress, setReadProgress] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const toggleBookmark = useToggleBookmark();
  const summarize = useSummarize();
  const readerSettings = useReaderSettings();

  useEffect(() => {
    setIsStarred(entry.starred);
    setTranslateEnabled(false);
    setReadProgress(0);
  }, [entry.id, entry.starred]);

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
              onClick={onClose}
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
          <ReaderSettingsButton {...readerSettings} />
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

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <article className="max-w-2xl mx-auto px-6 py-8">
          {/* Meta */}
          <div className="flex items-center gap-3 mb-4 text-sm text-muted">
            <span>{entry.feedTitle}</span>
            <span>•</span>
            <time>{formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true })}</time>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold mb-4 leading-tight text-[rgb(var(--text-primary))]">
            {entry.title}
          </h1>

          {entry.author && (
            <p className="text-sm text-muted mb-6">By {entry.author}</p>
          )}

          {/* AI Summary Card - Glow Feature */}
          {(entry.summary || summarize.data) ? (
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
          ) : (
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
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mb-8 pb-6 border-b border-default flex-wrap">
            {/* Translation toggle - simple on/off */}
            <button
              onClick={() => setTranslateEnabled(!translateEnabled)}
              className={cn(
                "btn-subtle flex items-center gap-2",
                translateEnabled && "bg-orange-500/20 text-orange-400 border-orange-500/40"
              )}
            >
              <Languages className="w-4 h-4" />
              {translateEnabled ? '关闭翻译' : '逐段翻译'}
            </button>
          </div>

          {/* Main Content - with optional bilingual translation */}
          <div style={getReaderStyles(readerSettings.settings)}>
            <BilingualContent 
              content={entry.content}
              entryId={entry.id}
              enabled={translateEnabled}
              language="zh-CN"
            />
          </div>

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="mt-8 pt-6 border-t border-default">
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span 
                    key={tag} 
                    className="px-2 py-1 text-xs bg-[rgb(var(--bg-hover))] text-muted rounded-lg"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Chat Panel */}
      <ChatPanel entry={entry} isOpen={showChat} onClose={() => setShowChat(false)} />
    </motion.div>
  );
}
