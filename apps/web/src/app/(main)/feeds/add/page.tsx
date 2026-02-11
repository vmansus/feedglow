'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateFeed, useCategories } from '@/hooks';
import type { Category } from '@feedglow/shared';
import { t } from '@/lib/i18n';

// Build flat list with indentation for <select> options
function buildCategoryOptions(categories: Category[]): { id: number; label: string }[] {
  const result: { id: number; label: string }[] = [];
  const childrenMap = new Map<number | null, Category[]>();
  
  for (const cat of categories) {
    const pid = (cat as any).parent_id || null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(cat);
  }
  
  function walk(parentId: number | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const cat of children) {
      const prefix = depth > 0 ? '　'.repeat(depth) + '↳ ' : '';
      result.push({ id: cat.id, label: prefix + cat.title });
      walk(cat.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export default function AddFeedPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const { categories } = useCategories();
  const createFeed = useCreateFeed();
  const categoryOptions = useMemo(() => buildCategoryOptions(categories || []), [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createFeed.mutateAsync({ url, categoryId });
      router.push('/unread');
    } catch {
      // Error is handled by the mutation's onError callback
    }
  };

  return (
    <div className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span>➕</span> Add New Feed
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="url" className="block text-sm font-medium mb-2">
            {t('settings.actions.fieldFeedUrl')}
          </label>
          <input
            id="url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('page.feedsAdd.urlHint')}
            className="w-full px-4 py-2 rounded-lg border border-default bg-[rgb(var(--bg-elevated))] focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-muted"
            required
          />
          <p className="mt-1 text-sm text-muted">
            {t('page.feedsAdd.urlHint')}
          </p>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-2">
            Category (optional)
          </label>
          <select
            id="category"
            value={categoryId || ''}
            onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-4 py-2 rounded-lg border border-default bg-[rgb(var(--bg-elevated))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">No category</option>
            {categoryOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {createFeed.isError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
            {createFeed.error.message}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={createFeed.isPending}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            {createFeed.isPending ? 'Adding...' : 'Add Feed'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
