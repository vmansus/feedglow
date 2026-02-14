'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, Trash2, Download, ExternalLink, StickyNote, Search, Pencil } from 'lucide-react';
import { cn } from '@feedglow/ui';
// import { useRouter } from 'next/navigation';
import { getAuthHeader } from '@/lib/auth';
import { t, getLocale } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// ============ API Functions (inline to avoid modifying api.ts) ============

interface Highlight {
  id: number;
  userId: number;
  user_id: number;
  entryId: number;
  entry_id: number;
  text: string;
  note: string | null;
  color: string;
  positionStart: number | null;
  position_start: number | null;
  positionEnd: number | null;
  position_end: number | null;
  xpath: string | null;
  createdAt: string;
  created_at: string;
  updatedAt: string;
  updated_at: string;
  entryTitle: string | null;
  entry_title: string | null;
  entryUrl: string | null;
  entry_url: string | null;
  entryUuid: string | null;
  entry_uuid: string | null;
  feedTitle: string | null;
  feed_title: string | null;
}

async function fetchHighlights(entryId?: number): Promise<Highlight[]> {
  const params = entryId ? `?entryId=${entryId}` : '';
  const res = await fetch(`${API_BASE}/api/highlights${params}`, {
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error('Failed to fetch highlights');
  const data = await res.json();
  return data.highlights;
}

async function deleteHighlight(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/highlights/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error('Failed to delete highlight');
}

async function updateHighlight(id: number, data: { note?: string; color?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/highlights/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update highlight');
}

// ============ Color config ============

const COLOR_MAP: Record<string, { bg: string; border: string; dot: string; text: string }> = {
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', dot: 'bg-yellow-400', text: 'text-yellow-800 dark:text-yellow-200' },
  green: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-400', text: 'text-green-800 dark:text-green-200' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-400', text: 'text-blue-800 dark:text-blue-200' },
  red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-400', text: 'text-red-800 dark:text-red-200' },
};

// ============ Component ============

export default function HighlightsPage() {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ['highlights'],
    queryFn: () => fetchHighlights(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHighlight,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['highlights'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { note?: string; color?: string } }) =>
      updateHighlight(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      setEditingNote(null);
    },
  });

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return highlights;
    const q = searchQuery.toLowerCase();
    return highlights.filter(
      (h) =>
        h.text.toLowerCase().includes(q) ||
        (h.note && h.note.toLowerCase().includes(q)) ||
        (h.entry_title && h.entry_title.toLowerCase().includes(q))
    );
  }, [highlights, searchQuery]);

  // Group by article
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { title: string; url: string | null; feedTitle: string | null; entryId: number; entryUuid: string | null; highlights: Highlight[] }
    >();

    for (const h of filtered) {
      const key = String(h.entry_id);
      if (!map.has(key)) {
        map.set(key, {
          title: h.entry_title || t('page.highlights.untitled'),
          url: h.entry_url,
          feedTitle: h.feed_title,
          entryId: h.entry_id,
          entryUuid: h.entry_uuid,
          highlights: [],
        });
      }
      map.get(key)!.highlights.push(h);
    }

    return Array.from(map.values());
  }, [filtered]);

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/highlights/export`, {
        headers: { ...getAuthHeader() },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'highlights.md';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-none border-b border-[rgb(var(--border-default))] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Highlighter className="w-5 h-5 text-[rgb(var(--accent))]" />
            <h1 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
              {t('page.highlights.title')}
            </h1>
            <span className="text-sm text-[rgb(var(--text-muted))]">
              {t('page.highlights.count', { count: highlights.length })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--text-muted))]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('page.highlights.searchPlaceholder')}
                className="pl-8 pr-3 py-1.5 text-sm bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-default))] rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--accent))] text-[rgb(var(--text-primary))] placeholder:text-[rgb(var(--text-muted))]"
              />
            </div>

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={highlights.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[rgb(var(--border-default))] hover:bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-secondary))] disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              {t('page.highlights.exportMarkdown')}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[rgb(var(--accent))] border-t-transparent" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[rgb(var(--text-muted))]">
            <Highlighter className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg">{t('page.highlights.empty')}</p>
            <p className="text-sm mt-1">
              {t('page.highlights.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl mx-auto">
            <AnimatePresence>
              {grouped.map((group) => (
                <motion.div
                  key={group.entryId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  {/* Article header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h2
                        className="text-base font-medium text-[rgb(var(--text-primary))] hover:text-[rgb(var(--accent))] cursor-pointer transition-colors"
                        onClick={() => { window.location.href = `/all?entry=${group.entryUuid || group.entryId}`; }}
                      >
                        {group.title}
                      </h2>
                      {group.feedTitle && (
                        <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">
                          {group.feedTitle}
                        </p>
                      )}
                    </div>
                    {group.url && (
                      <a
                        href={group.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[rgb(var(--text-muted))] hover:text-[rgb(var(--accent))] transition-colors flex-none"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* Highlights */}
                  <div className="space-y-2 pl-3">
                    {group.highlights.map((h) => {
                      const colors = COLOR_MAP[h.color] || COLOR_MAP.yellow;
                      return (
                        <motion.div
                          key={h.id}
                          layout
                          className={cn(
                            'border-l-3 rounded-r-lg p-3 pr-12 group relative',
                            colors.bg,
                            colors.border,
                            'border-l-[3px]'
                          )}
                        >
                          {/* Highlight text */}
                          <p className={cn('text-sm leading-relaxed', colors.text)}>
                            "{h.text}"
                          </p>

                          {/* Note */}
                          {editingNote === h.id ? (
                            <div className="mt-2">
                              <textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                className="w-full p-2 text-sm bg-[rgb(var(--bg-base))] border border-[rgb(var(--border-default))] rounded resize-none focus:outline-none focus:ring-1 focus:ring-[rgb(var(--accent))] text-[rgb(var(--text-primary))]"
                                rows={2}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    updateMutation.mutate({
                                      id: h.id,
                                      data: { note: noteText },
                                    });
                                  }
                                  if (e.key === 'Escape') setEditingNote(null);
                                }}
                              />
                              <div className="flex justify-end gap-1 mt-1">
                                <button
                                  onClick={() => setEditingNote(null)}
                                  className="px-2 py-0.5 text-xs rounded text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--bg-hover))]"
                                >
                                  {t('settings.common.cancel')}
                                </button>
                                <button
                                  onClick={() =>
                                    updateMutation.mutate({
                                      id: h.id,
                                      data: { note: noteText },
                                    })
                                  }
                                  className="px-2 py-0.5 text-xs rounded bg-[rgb(var(--accent))] text-white hover:opacity-90"
                                >
                                  {t('settings.common.save')}
                                </button>
                              </div>
                            </div>
                          ) : h.note ? (
                            <p
                              className="mt-1.5 text-xs text-[rgb(var(--text-muted))] flex items-start gap-1 cursor-pointer hover:text-[rgb(var(--text-secondary))]"
                              onClick={() => {
                                setEditingNote(h.id);
                                setNoteText(h.note || '');
                              }}
                            >
                              <StickyNote className="w-3 h-3 mt-0.5 flex-none" />
                              {h.note}
                            </p>
                          ) : null}

                          {/* Actions (shown on hover) */}
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingNote(h.id);
                                setNoteText(h.note || '');
                              }}
                              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[rgb(var(--text-muted))]"
                              title={t('entry.highlight.editNote')}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await confirmDialog({ message: t('page.highlights.deleteConfirm'), variant: 'danger', confirmText: t('common.delete') });
                                if (ok) deleteMutation.mutate(h.id);
                              }}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[rgb(var(--text-muted))] hover:text-red-500"
                              title={t('settings.common.delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Timestamp */}
                          <p className="mt-2 text-[10px] text-[rgb(var(--text-muted))] opacity-60">
                            {new Date(h.created_at).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US')}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
