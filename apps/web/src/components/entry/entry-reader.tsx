'use client';

import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import { useToggleBookmark, useSummarize, useTranslate, useFetchFullContent } from '@/hooks';
import { ProgressBar } from '@/components/ui/motion';
import { ReaderSettingsButton, useReaderSettings, getReaderStyles } from '@/components/ui/reader-settings';

interface EntryReaderProps {
  entry: Entry;
  onClose?: () => void;
}

export function EntryReader({ entry, onClose }: EntryReaderProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);
  const [isStarred, setIsStarred] = useState(entry.starred);
  const [readProgress, setReadProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const toggleBookmark = useToggleBookmark();
  const summarize = useSummarize();
  const translate = useTranslate();
  const fetchFullContent = useFetchFullContent();
  const readerSettings = useReaderSettings();

  // Sync local state when entry changes
  useEffect(() => {
    setIsStarred(entry.starred);
    setShowFullContent(false);
    setShowTranslation(false);
    setReadProgress(0);
    fetchFullContent.reset();
    translate.reset();
  }, [entry.id, entry.starred]);

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

  const handleSummarize = () => {
    summarize.mutate(entry.id);
  };

  const handleTranslate = () => {
    translate.mutate({ id: entry.id, language: 'zh-CN' }, {
      onSuccess: () => setShowTranslation(true),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="h-full flex flex-col"
    >
      {/* Progress bar */}
      <ProgressBar progress={readProgress} className="sticky top-0 z-10" />
      
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <article className="max-w-3xl mx-auto p-6">
          {/* Header */}
          <motion.header 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
              <span>{entry.feedTitle}</span>
              <span>•</span>
              <time>{formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true })}</time>
              <span>•</span>
              <span>{entry.readingTime} min read</span>
            </div>

            <h1 className="text-3xl font-bold mb-4 leading-tight dark:text-white">{entry.title}</h1>

            {entry.author && (
              <p className="text-gray-600 dark:text-gray-400">By {entry.author}</p>
            )}
          </motion.header>

          {/* Action bar */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-2 mb-6 pb-6 border-b border-gray-200 dark:border-gray-800 flex-wrap"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setIsStarred(!isStarred);
                toggleBookmark.mutate(entry.id);
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors',
                isStarred
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              )}
            >
              {isStarred ? '★ Starred' : '☆ Star'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSummarize}
              disabled={summarize.isPending}
              className="px-3 py-1.5 rounded-lg text-sm bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 flex items-center gap-2 hover:bg-orange-200 dark:hover:bg-orange-900/30 transition-colors disabled:opacity-50"
            >
              {summarize.isPending ? '⏳' : '🤖'} AI Summary
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleTranslate}
              disabled={translate.isPending}
              className="px-3 py-1.5 rounded-lg text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 flex items-center gap-2 hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
            >
              {translate.isPending ? '⏳' : '🌐'} Translate
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => fetchFullContent.mutate(entry.id)}
              disabled={fetchFullContent.isPending || !!fetchFullContent.data}
              className="px-3 py-1.5 rounded-lg text-sm bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 flex items-center gap-2 hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50"
            >
              {fetchFullContent.isPending ? '⏳' : '📄'} {fetchFullContent.data ? 'Fetched' : 'Full Article'}
            </motion.button>

            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ml-auto"
            >
              🔗 Original
            </a>

            <ReaderSettingsButton {...readerSettings} />
          </motion.div>

          {/* AI Summary */}
          {(entry.summary || summarize.data) && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800"
            >
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span>🤖</span> AI Summary
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                {summarize.data?.summary || entry.summary}
              </p>
              {(summarize.data?.keyPoints || entry.keyPoints) && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Key Points:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {(summarize.data?.keyPoints || entry.keyPoints)?.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Translation */}
          {(entry.translation || translate.data) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <button
                onClick={() => setShowTranslation(!showTranslation)}
                className="text-sm text-blue-600 hover:underline mb-2"
              >
                {showTranslation ? '🔼 Hide translation' : '🔽 Show translation'}
              </button>
              {showTranslation && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <span>🌐</span> Translation
                  </h3>
                  <h4 className="font-medium mb-2">
                    {translate.data?.title || entry.translation?.title}
                  </h4>
                  <div
                    className="prose dark:prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{
                      __html: translate.data?.content || entry.translation?.content || '',
                    }}
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Full Article Content */}
          {fetchFullContent.data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <button
                onClick={() => setShowFullContent(!showFullContent)}
                className="text-sm text-green-600 hover:underline mb-2 flex items-center gap-1"
              >
                {showFullContent ? '🔼 Show RSS content' : '🔽 Show full article'}
                {fetchFullContent.data.cached && <span className="text-gray-400">(cached)</span>}
              </button>
              {showFullContent && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <span>📄</span> Full Article
                    </h3>
                    <span className="text-xs text-gray-400">
                      {Math.round(fetchFullContent.data.length / 1000)}k chars
                    </span>
                  </div>
                  {fetchFullContent.data.byline && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {fetchFullContent.data.byline}
                    </p>
                  )}
                  <div
                    className="prose dark:prose-invert max-w-none prose-img:rounded-lg prose-a:text-orange-600"
                    dangerouslySetInnerHTML={{ __html: fetchFullContent.data.content }}
                  />
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            style={getReaderStyles(readerSettings.settings)}
            className={cn(
              "prose dark:prose-invert max-w-none prose-img:rounded-lg prose-a:text-orange-600 prose-headings:text-gray-900 dark:prose-headings:text-white",
              showFullContent && "hidden"
            )}
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800"
            >
              <h4 className="text-sm font-medium mb-2">Tags:</h4>
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg">
                    #{tag}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </article>
      </div>
    </motion.div>
  );
}
