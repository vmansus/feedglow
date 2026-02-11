'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@feedglow/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Trash2,
  Loader2,
  Link2,
  Unlink,
  ExternalLink,
  Send,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

const DiscordIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

type ChannelType = 'telegram' | 'discord';

export function ChannelSettings() {
  const confirmDialog = useConfirm();
  const [channels, setChannels] = useState<api.NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<ChannelType>('telegram');
  const [addName, setAddName] = useState('');
  const [addBotToken, setAddBotToken] = useState('');
  const [addWebhookUrl, setAddWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [bindingId, setBindingId] = useState<number | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChannels = async () => {
    try {
      const data = await api.getNotificationChannels();
      setChannels(data.channels || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleCreate = async () => {
    if (!addName.trim()) { toast.error(t('settings.channels.enterName')); return; }
    setCreating(true);
    try {
      const config = addType === 'telegram'
        ? { bot_token: addBotToken.trim() }
        : { webhook_url: addWebhookUrl.trim() };
      await api.createNotificationChannel({ type: addType, name: addName.trim(), config });
      toast.success(t('settings.channels.created'));
      setShowAddForm(false);
      setAddName('');
      setAddBotToken('');
      setAddWebhookUrl('');
      await loadChannels();
    } catch (err: any) {
      const msg = err?.message || t('settings.sharedFeeds.createFailed');
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog({ message: t('settings.channels.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (!ok) return;
    try {
      await api.deleteNotificationChannel(id);
      toast.success(t('settings.filterRules.deleted'));
      setChannels(prev => prev.filter(c => c.id !== id));
    } catch {
      toast.error(t('settings.telegram.removeFailed'));
    }
  };

  const handleToggle = async (ch: api.NotificationChannel) => {
    try {
      await api.updateNotificationChannel(ch.id, { enabled: !ch.enabled });
      setChannels(prev => prev.map(c => c.id === ch.id ? { ...c, enabled: !c.enabled } : c));
    } catch {
      toast.error(t('settings.telegram.operationFailed'));
    }
  };

  const handleBind = async (id: number) => {
    try {
      const result = await api.bindTelegramChannel(id);
      setBindingId(id);
      setDeepLink(result.deepLink);

      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getTelegramChannelStatus(id);
          if (s.bound) {
            setBindingId(null);
            setDeepLink(null);
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            toast.success(t('settings.telegram.telegramBound'));
            await loadChannels();
          }
        } catch { /* ignore */ }
      }, 2000);

      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBindingId(null);
          setDeepLink(null);
        }
      }, 5 * 60 * 1000);
    } catch {
      toast.error(t('settings.telegram.bindFailed'));
    }
  };

  const handleUnbind = async (id: number) => {
    const ok2 = await confirmDialog({ message: t('settings.channels.confirmUnbind'), variant: 'danger', confirmText: t('common.confirm') }); if (!ok2) return;
    try {
      await api.unbindTelegramChannel(id);
      toast.success(t('settings.channels.unbound_success'));
      await loadChannels();
    } catch {
      toast.error(t('settings.telegram.unbindFailed'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold">{t('settings.notifications.channelsLabel')}</h2>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {t('settings.channels.addChannel')}
        </Button>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
        {t('settings.channels.desc')}
      </p>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border border-orange-300 dark:border-orange-800 rounded-lg overflow-hidden"
          >
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 space-y-4">
              <h3 className="font-medium">{t('settings.channels.addTitle')}</h3>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.channels.channelType')}</label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as ChannelType)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="telegram">Telegram Bot</option>
                  <option value="discord">Discord Webhook</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">{t('settings.newsletter.nameRequired')}</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={t('settings.channels.namePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </div>

              {addType === 'telegram' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Bot Token</label>
                  <input
                    type="text"
                    value={addBotToken}
                    onChange={(e) => setAddBotToken(e.target.value)}
                    placeholder="123456:ABCdef..."
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    <a href="https://t.me/BotFather?start=newbot" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      {t('settings.channels.createBot')}
                    </a>
                    {' '}{t('settings.channels.getToken')}
                  </p>
                </div>
              )}

              {addType === 'discord' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Webhook URL</label>
                  <input
                    type="url"
                    value={addWebhookUrl}
                    onChange={(e) => setAddWebhookUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                  />
                  <p className="text-xs text-zinc-400 mt-1">{t('settings.channels.discordWebhookDesc')}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleCreate} disabled={creating || !addName.trim()}>
                  {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {t('settings.common.create')}
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>{t('settings.common.cancel')}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel list */}
      <div className="space-y-3">
        {channels.map(ch => (
          <div key={ch.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  ch.type === 'telegram'
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-indigo-100 dark:bg-indigo-900/30'
                }`}>
                  {ch.type === 'telegram' ? (
                    <Send className="w-5 h-5 text-blue-500" />
                  ) : (
                    <DiscordIcon />
                  )}
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {ch.name}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      {ch.type}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500">
                    {ch.type === 'telegram' && (
                      ch.config.bound
                        ? <span className="text-green-500">✓ {t('settings.channels.bound')} · @{ch.config.bot_username}</span>
                        : <span className="text-yellow-500">⚠ {t('settings.channels.unbound')} · @{ch.config.bot_username}</span>
                    )}
                    {ch.type === 'discord' && (
                      <span className="font-mono text-xs">{ch.config.webhook_url}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(ch)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    ch.enabled ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    ch.enabled ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>
            </div>

            {/* Telegram bind/unbind */}
            {ch.type === 'telegram' && (
              <div className="mt-3 flex items-center gap-2">
                {!ch.config.bound && bindingId !== ch.id && (
                  <Button size="sm" variant="outline" onClick={() => handleBind(ch.id)} className="flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    {t('settings.telegram.bindTelegram')}
                  </Button>
                )}
                {ch.config.bound && (
                  <Button size="sm" variant="outline" onClick={() => handleUnbind(ch.id)}
                    className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:border-red-300">
                    <Unlink className="w-3.5 h-3.5" />
                    {t('settings.channels.unbind')}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handleDelete(ch.id)}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:border-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('settings.common.delete')}
                </Button>
              </div>
            )}

            {/* Discord delete */}
            {ch.type === 'discord' && (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => handleDelete(ch.id)}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:border-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('settings.common.delete')}
                </Button>
              </div>
            )}

            {/* Deep link for binding */}
            {bindingId === ch.id && deepLink && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm space-y-2"
              >
                <p>{t('settings.telegram.bindInstructions')}</p>
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 font-medium hover:underline break-all"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  {deepLink}
                </a>
                <div className="flex items-center gap-2 text-xs opacity-70">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('settings.channels.waitingBind')}
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {channels.length === 0 && !showAddForm && (
        <div className="text-center py-12 text-zinc-500">
          <Radio className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{t('settings.channels.empty')}</p>
          <p className="text-sm mt-1">{t('settings.channels.emptyDesc')}</p>
        </div>
      )}
    </div>
  );
}
