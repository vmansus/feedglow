'use client';

import { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw,
  RotateCw,
  Download,
  Loader2,
  Captions,
  CaptionsOff
} from 'lucide-react';
import { cn } from '@feedglow/ui';
import { t } from '@/lib/i18n';
import { useAudioPlayer } from '@/contexts/audio-player-context';
import { TranscriptViewer } from './transcript-viewer';

interface Enclosure {
  url: string;
  mimeType: string;
  size?: number;
}

interface MediaPlayerProps {
  enclosures: Enclosure[];
  title?: string;
  feedTitle?: string;
  entryId?: number | string;
}

export function MediaPlayer({ enclosures, title, feedTitle, entryId }: MediaPlayerProps) {
  const player = useAudioPlayer();
  const [showTranscript, setShowTranscript] = useState(false);

  const currentMedia = enclosures[0];
  if (!currentMedia) return null;

  const isThisTrack = player.track?.url === currentMedia.url;
  const isPlaying = isThisTrack && player.isPlaying;
  const progress = isThisTrack ? player.currentTime : 0;
  const duration = isThisTrack ? player.duration : 0;
  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  const handlePlay = () => {
    if (isThisTrack) {
      player.togglePlay();
    } else {
      player.play({
        url: currentMedia.url,
        title: title,
        feedTitle: feedTitle,
        entryId: entryId,
      });
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isThisTrack || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    player.seek(ratio * duration);
  };

  const rates = [0.75, 1, 1.25, 1.5, 2];

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-xl border border-default p-3 bg-[rgb(var(--bg-elevated))]">
      {/* Row 1: Play + Progress + Time */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center flex-shrink-0 transition-colors"
        >
          {(isThisTrack && player.isLoading) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div 
            className="h-1.5 bg-[rgb(var(--bg-hover))] rounded-full cursor-pointer group relative"
            onClick={seek}
          >
            <div 
              className="h-full bg-orange-500 rounded-full relative transition-all"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        <span className="text-xs text-muted tabular-nums flex-shrink-0">
          {fmt(progress)} / {fmt(duration)}
        </span>
      </div>

      {/* Row 2: Controls */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => isThisTrack && player.skip(-15)}
            className={cn("p-1.5 rounded-lg transition-colors", isThisTrack ? "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]" : "text-muted/40")}
            title="-15s"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => isThisTrack && player.skip(30)}
            className={cn("p-1.5 rounded-lg transition-colors", isThisTrack ? "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]" : "text-muted/40")}
            title="+30s"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              const idx = rates.indexOf(player.playbackRate);
              player.setRate(rates[(idx + 1) % rates.length]);
            }}
            className="px-2 py-1 rounded-lg text-xs font-mono text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
          >
            {player.playbackRate}x
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Transcript / CC toggle */}
          {entryId && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                showTranscript
                  ? "text-orange-500 bg-orange-500/10"
                  : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
              )}
              title={showTranscript ? 'Hide transcript' : 'Show transcript'}
            >
              {showTranscript ? <CaptionsOff className="w-3.5 h-3.5" /> : <Captions className="w-3.5 h-3.5" />}
            </button>
          )}
          <a
            href={currentMedia.url}
            download
            className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
            title={t('entry.media.download')}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Transcript Panel */}
      {showTranscript && entryId && (
        <div className="mt-2 border-t border-[rgb(var(--border-default))]">
          <TranscriptViewer
            entryId={entryId}
            onClose={() => setShowTranscript(false)}
          />
        </div>
      )}
    </div>
  );
}
