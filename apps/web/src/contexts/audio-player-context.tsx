'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import { getStoredAuth } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface AudioTrack {
  url: string;
  title?: string;
  feedTitle?: string;
  entryId?: number | string;
}

interface AudioPlayerState {
  track: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isLoading: boolean;
  isSeeking: boolean;
  buffered: number; // 0-100 percentage
}

interface AudioPlayerContextValue extends AudioPlayerState {
  play: (track: AudioTrack) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  skip: (seconds: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}

/** Build the proxy URL for streaming audio through our server */
function getProxyUrl(entryId: number | string): string {
  const auth = getStoredAuth();
  const token = auth.token || '';
  return `${API_BASE}/api/podcast/stream/${entryId}?token=${encodeURIComponent(token)}`;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [buffered, setBuffered] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedProgress = useRef(0);
  const hasRestoredRef = useRef(false);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onLoadStart = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => setIsPlaying(false);
    const onSeeking = () => setIsSeeking(true);
    const onSeeked = () => setIsSeeking(false);
    const onWaiting = () => setIsSeeking(true);
    const onPlaying = () => { setIsSeeking(false); setIsLoading(false); };
    const onProgress = () => {
      if (audio.buffered.length > 0 && audio.duration > 0) {
        const end = audio.buffered.end(audio.buffered.length - 1);
        setBuffered((end / audio.duration) * 100);
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadstart', onLoadStart);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('progress', onProgress);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadstart', onLoadStart);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('progress', onProgress);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Auto-save progress every 30s while playing
  useEffect(() => {
    if (!isPlaying || !track?.entryId || !duration) return;
    const interval = setInterval(() => {
      if (Math.abs(currentTime - lastSavedProgress.current) >= 10) {
        lastSavedProgress.current = currentTime;
        api.savePodcastProgress(track.entryId!, currentTime, duration);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isPlaying, track?.entryId, currentTime, duration]);

  // Save on pause
  const saveProgress = useCallback(() => {
    if (!track?.entryId || !duration || currentTime <= 0) return;
    if (Math.abs(currentTime - lastSavedProgress.current) >= 5) {
      lastSavedProgress.current = currentTime;
      api.savePodcastProgress(track.entryId, currentTime, duration);
    }
  }, [track?.entryId, currentTime, duration]);

  const play = useCallback((newTrack: AudioTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Same track? Just resume
    if (track?.url === newTrack.url || (track?.entryId && track.entryId === newTrack.entryId)) {
      audio.play();
      setIsPlaying(true);
      return;
    }

    // Save previous track progress
    if (track?.entryId && duration > 0) {
      api.savePodcastProgress(track.entryId, audio.currentTime, duration);
    }

    // New track
    hasRestoredRef.current = false;
    lastSavedProgress.current = 0;
    setTrack(newTrack);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);

    // Use proxy URL when entryId is available for better Range request support
    const audioSrc = newTrack.entryId
      ? getProxyUrl(newTrack.entryId)
      : newTrack.url;
    audio.src = audioSrc;
    audio.playbackRate = playbackRate;

    // Restore position then play
    const startPlaying = async () => {
      if (newTrack.entryId && !hasRestoredRef.current) {
        hasRestoredRef.current = true;
        try {
          const saved = await api.getPodcastProgress(newTrack.entryId);
          if (saved && saved.position > 5 && saved.position < (saved.duration - 5)) {
            audio.currentTime = saved.position;
            setCurrentTime(saved.position);
          }
        } catch { /* ignore - play from start */ }
      }
      audio.play();
      setIsPlaying(true);
    };

    audio.addEventListener('canplay', () => startPlaying(), { once: true });
    audio.load();
  }, [track, duration, playbackRate]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    saveProgress();
  }, [saveProgress]);

  const resume = useCallback(() => {
    audioRef.current?.play();
    setIsPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else resume();
  }, [isPlaying, pause, resume]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + seconds), duration);
  }, [duration]);

  const setRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    saveProgress();
    audio.pause();
    audio.src = '';
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [saveProgress]);

  return (
    <AudioPlayerContext.Provider value={{
      track, isPlaying, currentTime, duration, playbackRate, isLoading, isSeeking, buffered,
      play, pause, resume, togglePlay, seek, skip, setRate, stop,
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}
