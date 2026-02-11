'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { FeedTypeProvider } from '@/contexts/feed-type-context';
import { CommandPaletteProvider } from '@/components/ui/command-palette';
import { AudioPlayerProvider, useAudioPlayer } from '@/contexts/audio-player-context';
import { MiniPlayer } from '@/components/layout/mini-player';
import { useCustomCss } from '@/hooks/use-custom-css';

function LayoutInner({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer();
  const hasTrack = !!player.track;
  useCustomCss(); // Inject user custom CSS into <head>

  return (
    <div className="flex flex-col h-screen surface-base">
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative flex flex-col">
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </main>
      </div>
      {hasTrack && <MiniPlayer />}
    </div>
  );
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeedTypeProvider>
      <AudioPlayerProvider>
        <CommandPaletteProvider>
          <LayoutInner>{children}</LayoutInner>
        </CommandPaletteProvider>
      </AudioPlayerProvider>
    </FeedTypeProvider>
  );
}
