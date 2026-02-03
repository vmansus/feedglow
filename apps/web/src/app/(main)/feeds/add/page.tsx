'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateFeed, useCategories } from '@/hooks';

export default function AddFeedPage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const { categories } = useCategories();
  const createFeed = useCreateFeed();

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
            Feed URL
          </label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter the URL of the RSS or Atom feed
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
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            <option value="">No category</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
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
            className="px-6 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
