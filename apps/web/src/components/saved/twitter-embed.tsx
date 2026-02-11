'use client';

import { t } from '@/lib/i18n';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Repeat2, Eye, ExternalLink, Play } from 'lucide-react';

interface TwitterEmbedProps {
  url: string;
  fallbackContent?: string;
}

interface TweetData {
  id: string;
  text?: string;
  author?: {
    name?: string;
    username?: string;
    avatar?: string;
    verified?: boolean;
  };
  createdAt?: string;
  media?: {
    type: string;
    url: string;
    width?: number;
    height?: number;
  }[];
  stats?: {
    replies?: number;
    retweets?: number;
    likes?: number;
    views?: number;
  };
  quotedTweet?: {
    id: string;
    text: string;
    author: {
      name?: string;
      username?: string;
      avatar?: string;
    };
  };
  error?: string;
}

// Extract tweet ID from URL
function getTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

// Extract username from URL
function getUsername(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status/);
  return match ? match[1] : null;
}

// Format number (1000 -> 1K)
function formatNumber(num?: number): string {
  if (!num) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// Format relative time
function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  
  const days = Math.floor(hours / 24);
  if (days < 30) return t('time.daysAgo', { n: days });
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TwitterEmbed({ url, fallbackContent }: TwitterEmbedProps) {
  const [tweet, setTweet] = useState<TweetData | null>(null);
  const [loading, setLoading] = useState(true);

  const tweetId = getTweetId(url);
  const username = getUsername(url);

  useEffect(() => {
    if (!tweetId) {
      setLoading(false);
      return;
    }

    const fetchTweet = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/api/twitter/tweet/${tweetId}`);
        
        if (res.ok) {
          const data = await res.json();
          setTweet(data);
        }
      } catch (err) {
        console.error('Failed to fetch tweet:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTweet();
  }, [tweetId]);

  if (loading) {
    return (
      <div className="border border-default rounded-2xl p-6 animate-pulse max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[rgb(var(--bg-hover))]" />
          <div className="flex-1">
            <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-32 mb-2" />
            <div className="h-3 bg-[rgb(var(--bg-hover))] rounded w-24" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-full" />
          <div className="h-4 bg-[rgb(var(--bg-hover))] rounded w-3/4" />
        </div>
      </div>
    );
  }

  // Use tweet data or fallback
  const authorName = tweet?.author?.name || username || 'Unknown';
  const authorUsername = tweet?.author?.username || username || 'unknown';
  const authorAvatar = tweet?.author?.avatar;
  const isVerified = tweet?.author?.verified;
  const text = tweet?.text || fallbackContent || '';
  const media = tweet?.media || [];
  const stats = tweet?.stats;
  const quotedTweet = tweet?.quotedTweet;
  const createdAt = tweet?.createdAt;

  return (
    <div className="border border-default rounded-2xl overflow-hidden bg-[rgb(var(--bg-primary))] max-w-xl">
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        {/* Avatar */}
        {authorAvatar ? (
          <img 
            src={authorAvatar} 
            alt={authorName}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {authorName.charAt(0).toUpperCase()}
          </div>
        )}
        
        {/* Author info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground truncate">{authorName}</span>
            {isVerified && (
              <svg viewBox="0 0 22 22" className="w-5 h-5 text-[#1D9BF0]" fill="currentColor">
                <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
              </svg>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted text-sm">
            <span>@{authorUsername}</span>
            {createdAt && (
              <>
                <span>·</span>
                <span>{formatTime(createdAt)}</span>
              </>
            )}
          </div>
        </div>

        {/* X logo */}
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-muted hover:text-foreground transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-foreground whitespace-pre-wrap text-[15px] leading-relaxed">
          {text}
        </p>
      </div>

      {/* Quoted Tweet */}
      {quotedTweet && (
        <div className="mx-4 mb-3 border border-default rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            {quotedTweet.author?.avatar ? (
              <img src={quotedTweet.author.avatar} alt="" className="w-5 h-5 rounded-full" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-400" />
            )}
            <span className="font-semibold text-sm">{quotedTweet.author?.name}</span>
            <span className="text-muted text-sm">@{quotedTweet.author?.username}</span>
          </div>
          <p className="text-sm text-foreground line-clamp-3">{quotedTweet.text}</p>
        </div>
      )}

      {/* Media */}
      {media.length > 0 && (
        <div className={`mx-4 mb-3 grid gap-1 ${media.length > 1 ? 'grid-cols-2' : ''}`}>
          {media.slice(0, 4).map((m, i) => (
            <div 
              key={i} 
              className={`rounded-xl overflow-hidden ${media.length === 1 ? 'max-h-[400px]' : 'aspect-square'}`}
            >
              {m.type === 'video' ? (
                <div className="w-full h-full bg-black flex items-center justify-center gap-2">
                  <Play className="w-5 h-5 text-white fill-current" />
                  <span className="text-white">Video</span>
                </div>
              ) : (
                <img 
                  src={m.url} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="px-4 py-3 flex items-center gap-6 text-muted text-sm border-t border-default">
          <div className="flex items-center gap-1.5 hover:text-blue-500 transition-colors">
            <MessageCircle className="w-4 h-4" />
            <span>{formatNumber(stats.replies)}</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-green-500 transition-colors">
            <Repeat2 className="w-4 h-4" />
            <span>{formatNumber(stats.retweets)}</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-pink-500 transition-colors">
            <Heart className="w-4 h-4" />
            <span>{formatNumber(stats.likes)}</span>
          </div>
          {stats.views && (
            <div className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span>{formatNumber(stats.views)}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-[#1D9BF0] hover:bg-[rgb(var(--bg-hover))] transition-colors border-t border-default"
      >
        <ExternalLink className="w-4 h-4" />
        {t('saved.viewOnX')}
      </a>
    </div>
  );
}
