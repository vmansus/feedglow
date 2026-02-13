'use client';

import { useState, useRef } from 'react';
import { useAudioPlayer } from '@/contexts/audio-player-context';
import { Play, Pause, X, RotateCcw, RotateCw, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';

export function MiniPlayer() {
  const player = useAudioPlayer();
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState(false);
  const [dragPct, setDragPct] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);

  if (!player.track) return null;

  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayPct = isDragging ? dragPct : pct;
  const rates = [0.75, 1, 1.25, 1.5, 2];
  const showSpinner = player.isLoading || player.isSeeking;

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getRatioFromEvent = (e: React.MouseEvent | MouseEvent) => {
    const bar = progressRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const handleProgressClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const ratio = getRatioFromEvent(e);
    player.seek(ratio * player.duration);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const ratio = getRatioFromEvent(e);
    setDragPct(ratio * 100);

    const onMove = (ev: MouseEvent) => {
      const r = getRatioFromEvent(ev);
      setDragPct(r * 100);
    };
    const onUp = (ev: MouseEvent) => {
      const r = getRatioFromEvent(ev);
      player.seek(r * player.duration);
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="w-full flex-shrink-0 bg-[rgb(var(--bg-primary))] border-t border-[rgb(var(--border-default))]">
      {/* Progress bar (thicker, with buffer indicator and seek handle) */}
      <div
        ref={progressRef}
        className="relative h-2 bg-[rgb(var(--bg-hover))] cursor-pointer group"
        onClick={handleProgressClick}
        onMouseEnter={() => setHoverProgress(true)}
        onMouseLeave={() => setHoverProgress(false)}
      >
        {/* Buffer progress (lighter) */}
        <div
          className="absolute inset-y-0 left-0 bg-orange-500/20 transition-all"
          style={{ width: `${player.buffered}%` }}
        />
        {/* Playback progress */}
        <div
          className="absolute inset-y-0 left-0 bg-orange-500 transition-[width] duration-100"
          style={{ width: `${displayPct}%` }}
        />
        {/* Seek handle (visible on hover or drag) */}
        {(hoverProgress || isDragging) && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-orange-500 rounded-full shadow-md border-2 border-white z-10"
            style={{ left: `${displayPct}%` }}
            onMouseDown={handleDragStart}
          />
        )}
      </div>

      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{player.track.title || 'Podcast'}</p>
          <p className="text-xs text-muted truncate">{player.track.feedTitle}</p>
        </div>

        {/* Time + buffering indicator */}
        <span className="text-xs text-muted tabular-nums hidden sm:flex sm:items-center sm:gap-1.5">
          {showSpinner && (
            <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
          )}
          {showSpinner ? (
            <span className="text-orange-500">Buffering...</span>
          ) : (
            <>{fmt(player.currentTime)} / {fmt(player.duration)}</>
          )}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => player.skip(-15)}
            className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] transition-colors hidden sm:block">
            <RotateCcw className="w-4 h-4" />
          </button>

          <button onClick={player.togglePlay}
            className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors relative">
            {showSpinner ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : player.isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <button onClick={() => player.skip(30)}
            className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] transition-colors hidden sm:block">
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Speed */}
          <button onClick={() => {
            const idx = rates.indexOf(player.playbackRate);
            player.setRate(rates[(idx + 1) % rates.length]);
          }}
            className="px-2 py-1 rounded-lg text-xs font-mono text-muted hover:text-[rgb(var(--text-primary))] transition-colors hidden sm:block">
            {player.playbackRate}x
          </button>

          {/* Expand */}
          <button onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] transition-colors sm:hidden">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {/* Close */}
          <button onClick={player.stop}
            className="p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile expanded controls */}
      {expanded && (
        <div className="flex items-center justify-center gap-4 pb-3 sm:hidden">
          <button onClick={() => player.skip(-15)} className="p-2 text-muted">
            <RotateCcw className="w-5 h-5" />
          </button>

          <span className="text-xs text-muted tabular-nums flex items-center gap-1.5">
            {showSpinner && <Loader2 className="w-3 h-3 animate-spin text-orange-500" />}
            {showSpinner ? 'Buffering...' : `${fmt(player.currentTime)} / ${fmt(player.duration)}`}
          </span>

          <button onClick={() => player.skip(30)} className="p-2 text-muted">
            <RotateCw className="w-5 h-5" />
          </button>

          <button onClick={() => {
            const idx = rates.indexOf(player.playbackRate);
            player.setRate(rates[(idx + 1) % rates.length]);
          }} className="px-2 py-1 text-xs font-mono text-muted">
            {player.playbackRate}x
          </button>
        </div>
      )}
    </div>
  );
}
