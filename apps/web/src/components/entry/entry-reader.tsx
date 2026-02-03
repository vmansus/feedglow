'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@feedglow/ui';
import type { Entry } from '@feedglow/shared';
import { useToggleBookmark, useSummarize, useTranslate } from '@/hooks';

interface EntryReaderProps {
  entry: Entry;
}

export function EntryReader({ entry }: EntryReaderProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [isStarred, setIsStarred] = useState(entry.starred);
  const toggleBookmark = useToggleBookmark();
  const summarize = useSummarize();
  const translate = useTranslate();

  // Sync local state when entry changes (e.g., selecting a different article)
  useEffect(() => {
    setIsStarred(entry.starred);
  }, [entry.id, entry.starred]);

  const handleSummarize = () => {
    summarize.mutate(entry.id);
  };

  const handleTranslate = () => {
    translate.mutate({ id: entry.id, language: 'zh-CN' });
  };

  return (
    <article className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
          <span>{entry.feedTitle}</span>
          <span>•</span>
          <time>{formatDistanceToNow(new Date(entry.publishedAt), { addSuffix: true })}</time>
          <span>•</span>
          <span>{entry.readingTime} min read</span>
        </div>

        <h1 className="text-3xl font-bold mb-4 leading-tight">{entry.title}</h1>

        {entry.author && (
          <p className="text-gray-600 dark:text-gray-400">By {entry.author}</p>
        )}
      </header>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => {
            setIsStarred(!isStarred); // Immediate UI update
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
        </button>

        <button
          onClick={handleSummarize}
          disabled={summarize.isPending}
          className="px-3 py-1.5 rounded-lg text-sm bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 flex items-center gap-2 hover:bg-orange-200 transition-colors disabled:opacity-50"
        >
          {summarize.isPending ? '⏳' : '🤖'} AI Summary
        </button>

        <button
          onClick={handleTranslate}
          disabled={translate.isPending}
          className="px-3 py-1.5 rounded-lg text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 flex items-center gap-2 hover:bg-blue-200 transition-colors disabled:opacity-50"
        >
          {translate.isPending ? '⏳' : '🌐'} Translate
        </button>

        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex items-center gap-2 hover:bg-gray-200 transition-colors ml-auto"
        >
          🔗 Original
        </a>
      </div>

      {/* AI Summary */}
      {(entry.summary || summarize.data) && (
        <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800">
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
        </div>
      )}

      {/* Translation */}
      {(entry.translation || translate.data) && (
        <div className="mb-6">
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className="text-sm text-blue-600 hover:underline mb-2"
          >
            {showTranslation ? '🔼 Hide translation' : '🔽 Show translation'}
          </button>
          {showTranslation && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
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
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div
        className="prose dark:prose-invert max-w-none prose-img:rounded-lg prose-a:text-orange-600"
        dangerouslySetInnerHTML={{ __html: entry.content }}
      />

      {/* Tags */}
      {entry.tags && entry.tags.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
          <h4 className="text-sm font-medium mb-2">Tags:</h4>
          <div className="flex flex-wrap gap-2">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
