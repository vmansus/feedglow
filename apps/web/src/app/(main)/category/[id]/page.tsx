'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useCategories, useEntries } from '@/hooks';
import { EntryList } from '@/components/entry/entry-list';
import { EntryReader } from '@/components/entry/entry-reader';
import { Folder, RefreshCw } from 'lucide-react';
import type { Entry } from '@feedglow/shared';

export default function CategoryPage() {
  const params = useParams();
  const categoryId = Number(params.id);
  
  const { categories } = useCategories();
  const { data: entriesData, isLoading } = useEntries({ categoryId });
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  
  const category = categories?.find(c => c.id === categoryId);
  const entries = entriesData?.entries || [];

  return (
    <div className="flex h-full">
      {/* Left panel - Entry list */}
      <div className={`${selectedEntry ? 'w-1/2 border-r border-gray-200 dark:border-gray-800' : 'w-full'} flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <Folder className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold dark:text-white">
                {category?.title || 'Category'}
              </h1>
              <p className="text-sm text-gray-500">
                {entries?.length || 0} entries
              </p>
            </div>
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : entries.length > 0 ? (
            <EntryList
              entries={entries}
              selectedId={selectedEntry?.id}
              onSelect={setSelectedEntry}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              <p>No entries in this category</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Entry reader */}
      {selectedEntry && (
        <div className="w-1/2 overflow-auto bg-white dark:bg-gray-950">
          <EntryReader entry={selectedEntry} />
        </div>
      )}
    </div>
  );
}
