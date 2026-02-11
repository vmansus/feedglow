'use client';

import { useState } from 'react';
import { useAudioPlayer } from '@/contexts/audio-player-context';
import { Play, Pause, X, RotateCcw, RotateCw, ChevronUp, ChevronDown } from 'lucide-react';

export function MiniPlayer() {
  const player = useAudioPlayer();
  const [expanded, setExpanded] = useState(false);

  if (!player.track) return null;

  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const rates = [0.75, 1, 1.25, 1.5, 2];

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex-shrink-0 bg-[rgb(var(--bg-primary))] border-t border-[rgb(var(--border-default))]">
      {/* Progress bar (thin) */}
      <div className="h-1 bg-[rgb(var(--bg-hover))] cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          player.seek(ratio * player.duration);
        }}
      >
        <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Main bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{player.track.title || 'Podcast'}</p>
          <p className="text-xs text-muted truncate">{player.track.feedTitle}</p>
        </div>

        {/* Time */}
        <span className="text-xs text-muted tabular-nums hidden sm:block">
          {fmt(player.currentTime)} / {fmt(player.duration)}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => player.skip(-15)}
            className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] transition-colors hidden sm:block">
            <RotateCcw className="w-4 h-4" />
          </button>

          <button onClick={player.togglePlay}
            className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors">
            {player.isPlaying
              ? <Pause className="w-4 h-4" />
              : <Play className="w-4 h-4 ml-0.5" />
            }
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

          <span className="text-xs text-muted tabular-nums">
            {fmt(player.currentTime)} / {fmt(player.duration)}
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
