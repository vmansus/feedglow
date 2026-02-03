'use client';

import { motion } from 'framer-motion';

// Reading progress bar
export function ProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div className={`h-1 bg-gray-200 dark:bg-gray-800 ${className}`}>
      <motion.div
        className="h-full bg-orange-500"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

export { motion };
