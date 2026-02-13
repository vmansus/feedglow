'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@feedglow/ui';
import { getTranscript, type TranscriptData, type TranscriptSegment } from '@/lib/api';
import { useAudioPlayer } from '@/contexts/audio-player-context';
import { Loader2, X } from 'lucide-react';

interface TranscriptViewerProps {
  entryId: number | string;
  onClose?: () => void;
  className?: string;
}

/** Format seconds to MM:SS or HH:MM:SS */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TranscriptViewer({ entryId, onClose, className }: TranscriptViewerProps) {
  const player = useAudioPlayer();
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch transcript
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getTranscript(entryId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setTranscript(data);
        } else {
          setError('No transcript available for this episode.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load transcript.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entryId]);

  // Find current active segment based on playback time
  const activeIndex = useMemo(() => {
    if (!transcript?.segments) return -1;
    const time = player.currentTime;
    for (let i = transcript.segments.length - 1; i >= 0; i--) {
      if (time >= transcript.segments[i].startTime) return i;
    }
    return -1;
  }, [transcript?.segments, player.currentTime]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (!autoScroll || activeIndex < 0 || !activeRef.current || !containerRef.current) return;

    activeRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeIndex, autoScroll]);

  // Detect user scroll to temporarily disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!userScrolledRef.current) {
      userScrolledRef.current = true;
      setAutoScroll(false);
    }
    // Re-enable auto-scroll after 5 seconds of no scrolling
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrolledRef.current = false;
      setAutoScroll(true);
    }, 5000);
  }, []);

  const handleSegmentClick = useCallback((segment: TranscriptSegment) => {
    player.seek(segment.startTime);
    // Re-enable auto-scroll when user clicks a segment
    setAutoScroll(true);
    userScrolledRef.current = false;
  }, [player]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-12 text-muted", className)}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading transcript...</span>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-muted", className)}>
        <p className="text-sm">{error || 'No transcript available.'}</p>
      </div>
    );
  }

  // Group consecutive segments by speaker for visual clarity
  let lastSpeaker = '';

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[rgb(var(--border-default))]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[rgb(var(--text-primary))]">📝 Transcript</span>
          <span className="text-xs text-muted">
            {transcript.segments.length} segments
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); userScrolledRef.current = false; }}
              className="text-xs text-orange-500 hover:text-orange-400 transition-colors"
            >
              Resume auto-scroll
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-muted hover:text-[rgb(var(--text-primary))] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Transcript body */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 max-h-[400px]"
        onScroll={handleScroll}
      >
        {transcript.segments.map((segment, i) => {
          const isActive = i === activeIndex;
          const showSpeaker = segment.speaker && segment.speaker !== lastSpeaker;
          if (segment.speaker) lastSpeaker = segment.speaker;

          return (
            <div key={i}>
              {showSpeaker && (
                <div className="mt-3 mb-1 first:mt-0">
                  <span className="text-xs font-semibold text-orange-500">
                    {segment.speaker}
                  </span>
                </div>
              )}
              <div
                ref={isActive ? activeRef : undefined}
                onClick={() => handleSegmentClick(segment)}
                className={cn(
                  "flex gap-3 py-1.5 px-2 rounded-lg cursor-pointer transition-all duration-200 group",
                  isActive
                    ? "bg-orange-500/15 border border-orange-500/30"
                    : "hover:bg-[rgb(var(--bg-hover))] border border-transparent"
                )}
              >
                {/* Timestamp */}
                <span
                  className={cn(
                    "text-xs tabular-nums flex-shrink-0 pt-0.5 font-mono",
                    isActive ? "text-orange-500 font-medium" : "text-muted group-hover:text-orange-400"
                  )}
                >
                  {formatTime(segment.startTime)}
                </span>

                {/* Text */}
                <span
                  className={cn(
                    "text-sm leading-relaxed",
                    isActive ? "text-[rgb(var(--text-primary))] font-medium" : "text-[rgb(var(--text-secondary))]"
                  )}
                >
                  {segment.text}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Source info */}
      {transcript.url && (
        <div className="px-4 py-2 border-t border-[rgb(var(--border-default))]">
          <a
            href={transcript.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-orange-500 transition-colors truncate block"
          >
            Source: {transcript.url}
          </a>
        </div>
      )}
    </div>
  );
}
