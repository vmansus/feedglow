'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Loader2,
  Link2,
  Unlink,
  CheckCircle2,
  ExternalLink,
  Bot,
  Save,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function TelegramSettings() {
  const confirmDialog = useConfirm();
  const [isLoading, setIsLoading] = useState(true);
  // Bot config
  const [botConfigured, setBotConfigured] = useState(false);
  const [botUsername, setBotUsername] = useState('');
  const [, setMaskedToken] = useState('');
  const [botTokenInput, setBotTokenInput] = useState('');
  const [isSavingBot, setIsSavingBot] = useState(false);
  const [isRemovingBot, setIsRemovingBot] = useState(false);
  // Binding
  const [status, setStatus] = useState<{
    bound: boolean;
    chatId?: string;
    notificationsEnabled: boolean;
  } | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadAll = async () => {
    try {
      const [botConfig, s] = await Promise.all([
        api.getTelegramBotConfig().catch(() => ({ configured: false })),
        api.getTelegramStatus().catch(() => ({ bound: false, notificationsEnabled: false })),
      ]);
      setBotConfigured(botConfig.configured);
      setBotUsername((botConfig as any).botUsername || '');
      setMaskedToken((botConfig as any).maskedToken || '');
      setStatus(s as any);
    } catch {
      setStatus({ bound: false, notificationsEnabled: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBot = async () => {
    if (!botTokenInput.trim()) {
      toast.error(t('settings.telegram.enterBotToken'));
      return;
    }
    setIsSavingBot(true);
    try {
      const res = await api.saveTelegramBotConfig(botTokenInput.trim());
      if (res.success) {
        toast.success(t('settings.telegram.botSaved'));
        setBotTokenInput('');
        await loadAll();
        // Auto-start binding flow after saving bot
        handleBind();
      } else {
        toast.error(res.error || t('settings.common.saveFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.common.saveFailed'));
    } finally {
      setIsSavingBot(false);
    }
  };

  const handleRemoveBot = async () => {
    const ok = await confirmDialog({ message: t('settings.telegram.confirmRemoveBot'), variant: 'danger', confirmText: t('common.delete') }); if (!ok) return;
    setIsRemovingBot(true);
    try {
      await api.removeTelegramBotConfig();
      setBotConfigured(false);
      setBotUsername('');
      setMaskedToken('');
      setStatus({ bound: false, notificationsEnabled: false });
      toast.success(t('settings.telegram.botRemoved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.telegram.removeFailed'));
    } finally {
      setIsRemovingBot(false);
    }
  };

  const handleBind = async () => {
    setIsBinding(true);
    try {
      const result = await api.bindTelegram();
      setDeepLink(result.deepLink);

      // Start polling for binding status
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.getTelegramStatus();
          if (s.bound) {
            setStatus(s);
            setDeepLink(null);
            setIsBinding(false);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            toast.success(t('settings.telegram.telegramBound'));
          }
        } catch {
          // ignore polling errors
        }
      }, 2000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setIsBinding(false);
          setDeepLink(null);
        }
      }, 5 * 60 * 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.telegram.bindFailed'));
      setIsBinding(false);
    }
  };

  const handleUnbind = async () => {
    const ok2 = await confirmDialog({ message: t('settings.telegram.confirmUnbind'), variant: 'danger', confirmText: t('common.confirm') }); if (!ok2) return;
    setIsUnbinding(true);
    try {
      await api.unbindTelegram();
      setStatus({ bound: false, notificationsEnabled: false });
      toast.success(t('settings.telegram.unbound'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.telegram.unbindFailed'));
    } finally {
      setIsUnbinding(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!status) return;
    const newEnabled = !status.notificationsEnabled;
    try {
      await api.toggleTelegramNotifications(newEnabled);
      setStatus({ ...status, notificationsEnabled: newEnabled });
      toast.success(newEnabled ? t('settings.telegram.notificationsOn') : t('settings.telegram.notificationsOff'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.telegram.operationFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Send className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.telegram.title')}</h2>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.telegram.desc')}
      </p>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
        {/* Not configured: show token input */}
        {!botConfigured && !status?.bound && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-blue-500" />
              </div>
              <div className="space-y-2 text-sm text-zinc-500">
                <p>{t('settings.telegram.needBot')}</p>
                <a
                  href="https://t.me/BotFather?start=newbot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('settings.telegram.openBotFather')}
                </a>
                <p className="text-xs text-zinc-400">{t('settings.telegram.tokenHint')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                placeholder={t('settings.telegram.pasteToken')}
                className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              <Button
                onClick={handleSaveBot}
                disabled={isSavingBot || !botTokenInput.trim()}
                size="sm"
                className="flex items-center gap-1.5"
              >
                {isSavingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {t('settings.telegram.connect')}
              </Button>
            </div>
          </div>
        )}

        {/* Configured but not bound: show deep link (auto-generated after saving token) */}
        {botConfigured && !status?.bound && !deepLink && !isBinding && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <div className="text-sm font-medium">@{botUsername}</div>
                <div className="text-xs text-zinc-500">{t('settings.telegram.botConnected')}</div>
              </div>
            </div>
            <Button
              onClick={handleBind}
              disabled={isBinding}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" />
              {t('settings.telegram.bindTelegram')}
            </Button>
          </div>
        )}

        {/* Deep link shown: waiting for user to scan */}
        <AnimatePresence>
          {deepLink && !status?.bound && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm space-y-2">
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
                <p className="text-xs opacity-70">{t('settings.telegram.linkExpiry')}</p>
              </div>
              {isBinding && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('settings.telegram.waitingBind')}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bound: show status + controls */}
        {status?.bound ? (
          <>
            {/* Bound state */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <div className="font-medium">{t('settings.telegram.bound')}</div>
                <div className="text-sm text-zinc-500">
                  Chat ID: {status.chatId}
                </div>
              </div>
            </div>

            {/* Global toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium">{t('settings.telegram.receiveNotifications')}</div>
                <div className="text-xs text-zinc-500">{t('settings.telegram.globalToggleDesc')}</div>
              </div>
              <button
                onClick={handleToggleNotifications}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  status.notificationsEnabled ? 'bg-orange-500' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    status.notificationsEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Unbind */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnbind}
                disabled={isUnbinding}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
              >
                {isUnbinding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}
                {t('settings.channels.unbind')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveBot}
                disabled={isRemovingBot}
                className="flex items-center gap-2 text-zinc-500 hover:text-red-600 hover:border-red-300"
              >
                {isRemovingBot ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {t('settings.telegram.deleteBot')}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {t('settings.telegram.desc')}
      </p>
    </div>
  );
}
