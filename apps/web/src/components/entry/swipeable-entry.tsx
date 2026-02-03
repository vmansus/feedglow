'use client';

import { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Check, Star, Undo2 } from 'lucide-react';
import type { Entry } from '@feedglow/shared';

interface SwipeableEntryProps {
  entry: Entry;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 100;

export function SwipeableEntry({
  entry,
  onMarkRead,
  onMarkUnread,
  onToggleStar,
  children,
}: SwipeableEntryProps) {
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef(null);
  const x = useMotionValue(0);

  // Transform swipe distance to background opacity
  const leftOpacity = useTransform(x, [-SWIPE_THRESHOLD * 1.5, -SWIPE_THRESHOLD, 0], [1, 0.8, 0]);
  const rightOpacity = useTransform(x, [0, SWIPE_THRESHOLD, SWIPE_THRESHOLD * 1.5], [0, 0.8, 1]);
  const leftScale = useTransform(x, [-SWIPE_THRESHOLD * 1.5, -SWIPE_THRESHOLD, 0], [1.2, 1, 0.5]);
  const rightScale = useTransform(x, [0, SWIPE_THRESHOLD, SWIPE_THRESHOLD * 1.5], [0.5, 1, 1.2]);

  const handleDragEnd = () => {
    setIsDragging(false);
    const currentX = x.get();

    if (currentX < -SWIPE_THRESHOLD) {
      // Swiped left - toggle star
      onToggleStar();
    } else if (currentX > SWIPE_THRESHOLD) {
      // Swiped right - toggle read status
      if (entry.status === 'unread') {
        onMarkRead();
      } else {
        onMarkUnread();
      }
    }
  };

  return (
    <div ref={constraintsRef} className="relative overflow-hidden">
      {/* Left action (swipe right to reveal) - Mark read/unread */}
      <motion.div
        className="absolute inset-y-0 left-0 flex items-center justify-start pl-6 w-24"
        style={{
          opacity: rightOpacity,
          background: entry.status === 'unread'
            ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.9) 0%, rgba(34, 197, 94, 0.3) 100%)'
            : 'linear-gradient(90deg, rgba(59, 130, 246, 0.9) 0%, rgba(59, 130, 246, 0.3) 100%)',
        }}
      >
        <motion.div style={{ scale: rightScale }}>
          {entry.status === 'unread' ? (
            <Check className="w-6 h-6 text-white" />
          ) : (
            <Undo2 className="w-6 h-6 text-white" />
          )}
        </motion.div>
      </motion.div>

      {/* Right action (swipe left to reveal) - Star */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-6 w-24"
        style={{
          opacity: leftOpacity,
          background: entry.starred
            ? 'linear-gradient(270deg, rgba(156, 163, 175, 0.9) 0%, rgba(156, 163, 175, 0.3) 100%)'
            : 'linear-gradient(270deg, rgba(234, 179, 8, 0.9) 0%, rgba(234, 179, 8, 0.3) 100%)',
        }}
      >
        <motion.div style={{ scale: leftScale }}>
          <Star className={`w-6 h-6 text-white ${entry.starred ? '' : 'fill-current'}`} />
        </motion.div>
      </motion.div>

      {/* Main content */}
      <motion.div
        drag="x"
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x }}
        className="relative bg-[rgb(var(--bg-base))] touch-pan-y"
        whileTap={{ cursor: 'grabbing' }}
      >
        <div className={isDragging ? 'pointer-events-none' : ''}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}

// Hook to detect mobile/touch device
export function useIsMobile() {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
