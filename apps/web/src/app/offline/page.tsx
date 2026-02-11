'use client';

import { t } from '@/lib/i18n';

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@feedglow/ui';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center p-8">
        <div className="w-20 h-20 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10 text-zinc-400" />
        </div>
        
        <h1 className="text-2xl font-bold mb-2">{t('offline.title')}</h1>
        <p className="text-zinc-500 mb-6">
          {t('offline.description')}
        </p>
        
        <Button onClick={handleRetry} className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          {t('offline.retry')}
        </Button>
        
        <div className="mt-8 text-sm text-zinc-400">
          <p>{t('offline.cachedContent')}</p>
        </div>
      </div>
    </div>
  );
}
