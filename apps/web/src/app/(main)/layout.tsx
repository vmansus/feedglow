'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette, useCommandPalette } from '@/components/ui/command-palette';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const commandPalette = useCommandPalette();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
      <CommandPalette isOpen={commandPalette.isOpen} onClose={commandPalette.close} />
    </div>
  );
}
