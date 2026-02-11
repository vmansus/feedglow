'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getLocale } from '@/lib/i18n';
import { 
  Headphones, 
  Play, 
  Pause,
  ChevronRight,
  Clock,
  Radio
} from 'lucide-react';
import { cn } from '@feedglow/ui';
import * as api from '@/lib/api';
import { MediaPlayer } from '@/components/entry/media-player';
import type { Entry, Feed } from '@feedglow/shared';

interface PodcastFeed extends Feed {
  latestEpisodeDate?: string;
  episodeCount?: number;
}

interface PodcastEpisode extends Entry {
  duration?: number;
}

export default function PodcastsPage() {
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed | null>(null);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);

  // Fetch podcast feeds
  const { data: feedsData, isLoading: loadingFeeds } = useQuery({
    queryKey: ['podcast-feeds'],
    queryFn: api.getPodcastFeeds,
  });

  // Fetch episodes for selected feed
  const { data: episodesData, isLoading: loadingEpisodes } = useQuery({
    queryKey: ['podcast-episodes', selectedFeed?.id],
    queryFn: () => selectedFeed ? api.getEntries({ feedId: selectedFeed.id, limit: 50 }) : null,
    enabled: !!selectedFeed,
  });

  const feeds = Array.isArray(feedsData) ? feedsData : Array.isArray((feedsData as any)?.feeds) ? (feedsData as any).feeds : [];
  const episodes = Array.isArray(episodesData?.entries) ? episodesData.entries : [];

  // Filter episodes that have audio enclosures
  const podcastEpisodes = episodes.filter((ep: Entry) => {
    const enclosures = (ep as PodcastEpisode).enclosures || [];
    return enclosures.some(e => (e.mime_type || (e as any).mimeType)?.startsWith('audio/'));
  }) as PodcastEpisode[];

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-default">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Podcasts</h1>
            <p className="text-sm text-muted">{feeds.length} podcast feeds</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Feed List */}
        <div className="w-72 border-r border-default overflow-y-auto">
          {loadingFeeds ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[rgb(var(--bg-hover))] animate-pulse" />
              ))}
            </div>
          ) : feeds.length > 0 ? (
            <div className="p-2">
              {feeds.map((feed: PodcastFeed) => (
                <button
                  key={feed.id}
                  onClick={() => setSelectedFeed(feed)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all",
                    selectedFeed?.id === feed.id 
                      ? "bg-[rgb(var(--bg-hover))]" 
                      : "hover:bg-[rgb(var(--bg-hover))]"
                  )}
                >
                  {feed.iconUrl ? (
                    <img 
                      src={feed.iconUrl} 
                      alt="" 
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                      <Radio className="w-5 h-5 text-purple-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{feed.title}</p>
                    {feed.episodeCount && (
                      <p className="text-xs text-muted">{feed.episodeCount} episodes</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted" />
                </button>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted p-4"
            >
              <Headphones className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-center">No podcast feeds found</p>
              <p className="text-xs text-center mt-1">Subscribe to podcast RSS feeds to see them here</p>
            </motion.div>
          )}
        </div>

        {/* Episodes List */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {selectedFeed ? (
              <motion.div
                key={selectedFeed.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-4"
              >
                {/* Feed Header */}
                <div className="flex items-center gap-4 mb-6">
                  {selectedFeed.iconUrl ? (
                    <img 
                      src={selectedFeed.iconUrl} 
                      alt="" 
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                      <Radio className="w-8 h-8 text-purple-400" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold">{selectedFeed.title}</h2>
                    <p className="text-sm text-muted">{podcastEpisodes.length} episodes</p>
                  </div>
                </div>

                {/* Episodes */}
                {loadingEpisodes ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-20 rounded-lg bg-[rgb(var(--bg-hover))] animate-pulse" />
                    ))}
                  </div>
                ) : podcastEpisodes.length > 0 ? (
                  <div className="space-y-2">
                    {podcastEpisodes.map((episode) => (
                      <motion.div
                        key={episode.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "p-4 rounded-lg border transition-all cursor-pointer",
                          nowPlaying?.id === episode.id
                            ? "border-purple-500/50 bg-purple-500/10"
                            : "border-default hover:border-[rgb(var(--border-default))] hover:bg-[rgb(var(--bg-hover))]"
                        )}
                        onClick={() => setNowPlaying(episode)}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                              nowPlaying?.id === episode.id
                                ? "bg-purple-500 text-white"
                                : "bg-[rgb(var(--bg-hover))] text-muted hover:text-[rgb(var(--text-primary))]"
                            )}
                          >
                            {nowPlaying?.id === episode.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4 ml-0.5" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium line-clamp-2">{episode.title}</h3>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                              <span>
                                {formatDistanceToNow(new Date(episode.publishedAt), { addSuffix: true, locale: getLocale() === 'zh' ? zhCN : undefined })}
                              </span>
                              {episode.duration && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(episode.duration)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted">
                    <Headphones className="w-12 h-12 mb-3 opacity-50" />
                    <p>No episodes found</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full text-muted"
              >
                <Headphones className="w-16 h-16 mb-4 opacity-50" />
                <p>Select a podcast to view episodes</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Now Playing Bar */}
      <AnimatePresence>
        {nowPlaying && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="border-t border-default bg-[rgb(var(--bg-elevated))] p-4"
          >
            <MediaPlayer
              enclosures={(nowPlaying.enclosures || [])
                .filter(e => (e.mime_type || (e as any).mimeType)?.startsWith('audio/'))
                .map(e => ({ url: e.url, mimeType: e.mime_type || 'audio/mpeg', size: Number(e.size) || 0 }))}
              title={nowPlaying.title}
              entryId={nowPlaying.id}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
