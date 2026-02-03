'use client';

import { useState } from 'react';
import { useEntries } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import type { Entry } from '@feedglow/shared';

export default function AllArticlesPage() {
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const { data, isLoading, error } = useEntries();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🌟</div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-500">
          <span className="text-4xl mb-4 block">❌</span>
          <p>Error loading entries</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-96 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-white dark:bg-gray-900">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <span>📰</span> All Articles
            {data?.total !== undefined && (
              <span className="text-sm font-normal text-gray-500">
                ({data.total})
              </span>
            )}
          </h1>
        </div>
        <EntryList
          entries={data?.entries || []}
          selectedId={selectedEntry?.id}
          onSelect={setSelectedEntry}
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        {selectedEntry ? (
          <EntryReader entry={selectedEntry} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📖</span>
              <p>Select an article to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
