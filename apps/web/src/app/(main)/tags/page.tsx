'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Tag, ArrowLeft } from 'lucide-react';
import { useTags } from '@/hooks';
import { cn } from '@feedglow/ui';

// Generate consistent color from string
function stringToColor(str: string): string {
  const colors = [
    'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
    'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
    'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
    'bg-green-500/20 text-green-400 hover:bg-green-500/30',
    'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
    'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30',
    'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30',
    'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function TagsPage() {
  const { data: tags, isLoading } = useTags();
  
  const tagList = Array.isArray(tags) ? tags : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <Link
            href="/all"
            className="p-2 -ml-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Tag className="w-6 h-6 text-orange-500" />
              All Tags
            </h1>
            <p className="text-muted text-sm mt-1">
              {tagList.length} tags in your library
            </p>
          </div>
        </motion.div>

        {/* Tags Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-[rgb(var(--bg-hover))] animate-pulse"
              />
            ))}
          </div>
        ) : tagList.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
          >
            {tagList.map((tag: { id: string; name: string; count?: number }, index: number) => (
              <motion.div
                key={tag.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.02 }}
              >
                <Link
                  href={`/tag/${encodeURIComponent(tag.name)}`}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-all",
                    stringToColor(tag.name)
                  )}
                >
                  <span className="font-medium truncate">#{tag.name}</span>
                  {tag.count !== undefined && tag.count > 0 && (
                    <span className="text-sm opacity-70">{tag.count}</span>
                  )}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-muted"
          >
            <Tag className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">No tags yet</p>
            <p className="text-sm">Add tags to articles to organize your reading</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
