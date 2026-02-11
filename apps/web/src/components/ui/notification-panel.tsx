'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Sparkles, Zap, Clock, CheckCheck, Trash2 } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import * as api from '@/lib/api';
import { getLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import type { Notification } from '@/lib/api';

// Notification type icons
function getNotificationIcon(type: string) {
  switch (type) {
    case 'ai_action':
      return <Zap className="w-4 h-4 text-yellow-500" />;
    case 'ai_task':
      return <Sparkles className="w-4 h-4 text-purple-500" />;
    default:
      return <Bell className="w-4 h-4 text-blue-500" />;
  }
}

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const res = await api.getNotifications();
        return Array.isArray(res) ? res : [];
      } catch {
        // API may not exist yet - return empty
        return [];
      }
    },
    refetchInterval: 30000, // Poll every 30s
  });

  // Unread count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      try {
        const res = await api.getNotificationCount();
        return res?.count || 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 30000,
  });

  // Mark as read
  const markAsRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read
  const markAllAsRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Delete notification
  const deleteNotification = useMutation({
    mutationFn: (id: string) => api.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Clear all read notifications
  const clearRead = useMutation({
    mutationFn: () => api.clearReadNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    // TODO: Navigate to entry or task result
    if (notification.entryId) {
      // Navigate to entry
    }
  };

  return (
    <div ref={panelRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          isOpen 
            ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]"
            : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
        )}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-orange-500 rounded-full text-[10px] text-white font-medium flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-h-[480px] bg-[rgb(var(--bg-elevated))] border border-default rounded-xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-default">
              <h3 className="font-medium text-[rgb(var(--text-primary))]">{t('notification.title')}</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead.mutate()}
                  disabled={markAllAsRead.isPending}
                  className="text-xs text-muted hover:text-orange-500 flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {t('notification.markAllRead')}
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-center text-muted text-sm">
                  {t('notification.loading')}
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('notification.empty')}</p>
                </div>
              ) : (
                notifications.map((notification: Notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "group flex gap-3 px-4 py-3 transition-colors border-b border-default last:border-b-0",
                      notification.read
                        ? "bg-transparent hover:bg-[rgb(var(--bg-hover))]"
                        : "bg-orange-500/5 hover:bg-orange-500/10"
                    )}
                  >
                    {/* Icon */}
                    <div 
                      className="flex-shrink-0 mt-0.5 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {getNotificationIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div 
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm line-clamp-2",
                          notification.read ? "text-secondary" : "text-[rgb(var(--text-primary))] font-medium"
                        )}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-xs text-muted line-clamp-1 mt-0.5">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-muted mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(notification.createdAt), { 
                          addSuffix: true, 
                          locale: getLocale() === 'zh' ? zhCN : undefined 
                        })}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification.mutate(notification.id);
                      }}
                      className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-default bg-[rgb(var(--bg-base))] flex justify-between">
                <button
                  onClick={() => clearRead.mutate()}
                  disabled={clearRead.isPending || !notifications.some((n: Notification) => n.read)}
                  className="text-xs text-muted hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('notification.clearRead')}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-muted hover:text-orange-500 transition-colors"
                >
                  {t('notification.close')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
