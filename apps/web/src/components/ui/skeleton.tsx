'use client';

import { cn } from '@feedglow/ui';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-gray-700',
        className
      )}
    />
  );
}

export function EntryListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function FeedHeaderSkeleton() {
  return (
    <div className="p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-7 h-7 rounded" />
        <Skeleton className="w-8 h-8 rounded" />
        <div className="flex-1">
          <Skeleton className="h-5 w-40 mb-1" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3 pl-9">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center gap-2 pl-9">
        <Skeleton className="h-6 w-16 rounded-lg" />
        <Skeleton className="h-6 w-14 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
    </div>
  );
}

export function ReaderSkeleton() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex gap-2 pb-6 border-b border-gray-200 dark:border-gray-700">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
