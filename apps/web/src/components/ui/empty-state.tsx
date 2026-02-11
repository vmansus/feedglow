'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, Star, Search, Rss, BookOpen } from 'lucide-react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center h-full text-center p-8"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="text-6xl mb-6"
      >
        {icon}
      </motion.div>
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-semibold text-gray-900 dark:text-white mb-2"
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-gray-500 dark:text-gray-400 max-w-sm mb-6"
        >
          {description}
        </motion.p>
      )}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              {action.label}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// Preset empty states
export function AllCaughtUpState() {
  return (
    <EmptyState
      icon={
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500" />
        </motion.div>
      }
      title="All caught up!"
      description="You've read everything. Take a break or add more feeds to discover new content."
      action={{ label: "Add Feed", href: "/feeds/add" }}
    />
  );
}

export function NoStarredState() {
  return (
    <EmptyState
      icon={<Star className="w-16 h-16 text-muted" />}
      title="No starred articles"
      description="Star articles you want to read later or save for reference."
    />
  );
}

export function NoSearchResultsState({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<Search className="w-16 h-16 text-muted" />}
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try different keywords.`}
    />
  );
}

export function NoFeedsState() {
  return (
    <EmptyState
      icon={<Rss className="w-16 h-16 text-muted" />}
      title="No feeds yet"
      description="Subscribe to RSS feeds to start reading. Add your favorite blogs, news sites, or YouTube channels."
      action={{ label: "Add Your First Feed", href: "/feeds/add" }}
    />
  );
}

export function SelectArticleState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full text-gray-400"
    >
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="mb-4"
      >
        <BookOpen className="w-16 h-16 text-muted" />
      </motion.div>
      <p className="mb-2">Select an article to read</p>
      <p className="text-sm text-gray-500">
        Press <kbd className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">?</kbd> for keyboard shortcuts
      </p>
    </motion.div>
  );
}
