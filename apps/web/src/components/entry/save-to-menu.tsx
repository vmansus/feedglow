'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Book, Send, BookOpen, FileText, Link2, type LucideIcon } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useIntegrations, useSaveToService } from '@/hooks/use-integrations';
import { t } from '@/lib/i18n';
import toast from 'react-hot-toast';

const SERVICE_ICONS: Record<string, LucideIcon> = {
  pocket: Book,
  telegram: Send,
  readwise: BookOpen,
  notion: FileText,
};

const SERVICE_NAMES: Record<string, string> = {
  pocket: 'Pocket',
  telegram: 'Telegram',
  readwise: 'Readwise',
  notion: 'Notion',
};

interface SaveToMenuProps {
  entryId: number | string;
}

export function SaveToMenu({ entryId }: SaveToMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: integrations } = useIntegrations();
  const saveToService = useSaveToService();

  const enabledIntegrations = (integrations || []).filter(i => i.enabled);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (enabledIntegrations.length === 0) return null;

  const handleSave = (service: string) => {
    setOpen(false);
    const name = SERVICE_NAMES[service] || service;
    
    if (String(entryId).startsWith('bf-')) {
      toast.error(t('entry.save.cannotSaveBackfill'));
      return;
    }

    const toastId = toast.loading(t('entry.save.savingTo', { name }));
    saveToService.mutate(
      { service, entryId: entryId as number },
      {
        onSuccess: () => {
          toast.success(t('entry.save.savedTo', { name }), { id: toastId });
        },
        onError: () => {
          toast.error(t('entry.save.failedTo', { name }), { id: toastId });
        },
      }
    );
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "p-2 rounded-lg transition-colors",
          open
            ? "text-orange-500 bg-orange-500/10"
            : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
        )}
        title={t('entry.save.saveTo')}
      >
        <Download className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] py-1 rounded-lg border border-default surface-elevated shadow-xl">
          <div className="px-3 py-1.5 text-xs text-muted border-b border-default mb-1">{t('entry.save.saveTo')}</div>
          {enabledIntegrations.map(integration => {
            const IconComponent = SERVICE_ICONS[integration.service] || Link2;
            return (
              <button
                key={integration.service}
                onClick={() => handleSave(integration.service)}
                disabled={saveToService.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:bg-[rgb(var(--bg-hover))] transition-colors disabled:opacity-50"
              >
                <IconComponent className="w-4 h-4" />
                <span>{SERVICE_NAMES[integration.service] || integration.service}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
