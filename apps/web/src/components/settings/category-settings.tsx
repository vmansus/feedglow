'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, 
  Plus, 
  Pencil, 
  Trash2, 
  Check, 
  X, 
  Loader2,
  ChevronRight
} from 'lucide-react';
import { cn } from '@feedglow/ui';
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/use-categories';
import { useFeeds, useUpdateFeed } from '@/hooks/use-feeds';
import toast from 'react-hot-toast';
import type { Feed } from '@feedglow/shared';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

// Helper to get category ID from feed (handles both flat and nested formats)
function getFeedCategoryId(feed: Feed & { category?: { id: number } }): number {
  return feed.categoryId ?? feed.category?.id ?? 0;
}

// Build flat list with indentation for <select> options
function buildCategoryOptions(categories: any[]): { id: number; label: string }[] {
  const result: { id: number; label: string }[] = [];
  const childrenMap = new Map<number | null, any[]>();
  for (const cat of categories) {
    const pid = cat.parent_id || null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(cat);
  }
  function walk(parentId: number | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const cat of children) {
      const prefix = depth > 0 ? '　'.repeat(depth) + '↳ ' : '';
      result.push({ id: cat.id, label: prefix + cat.title });
      walk(cat.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export function CategorySettings() {
  const confirmDialog = useConfirm();
  const { categories, isLoading } = useCategories();
  const { feeds } = useFeeds();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const updateFeed = useUpdateFeed();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addingSubTo, setAddingSubTo] = useState<number | null>(null);
  const [subCategoryName, setSubCategoryName] = useState('');

  const handleCreate = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await createCategory.mutateAsync({ title: newCategoryName.trim() });
      setNewCategoryName('');
      toast.success(t('settings.categories.created'));
    } catch {
      toast.error(t('settings.categories.createFailed'));
    }
  };

  const handleCreateSub = async (parentId: number) => {
    if (!subCategoryName.trim()) return;
    try {
      await createCategory.mutateAsync({ title: subCategoryName.trim(), parentId });
      setSubCategoryName('');
      setAddingSubTo(null);
      setExpandedId(parentId);
      toast.success(t('settings.categories.subCreated'));
    } catch {
      toast.error(t('settings.categories.subCreateFailed'));
    }
  };

  const handleUpdate = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id, title: editingName.trim() });
      setEditingId(null);
      setEditingName('');
      toast.success(t('settings.categories.renamed'));
    } catch {
      toast.error(t('settings.categories.renameFailed'));
    }
  };

  const handleDelete = async (id: number, title: string) => {
    const feedsInCategory = feeds?.filter(async f => getFeedCategoryId(f) === id) || [];
    if (feedsInCategory.length > 0) {
      toast.error(t('settings.categories.cannotDelete', { count: feedsInCategory.length }));
      return;
    }
    const ok = await confirmDialog({ message: t('settings.categories.confirmDelete', { title }), variant: 'danger', confirmText: t('common.delete') }); if (!ok) return;
    try {
      await deleteCategory.mutateAsync(id);
      toast.success(t('settings.categories.deleted'));
    } catch {
      toast.error(t('settings.telegram.removeFailed'));
    }
  };

  const handleMoveFeed = async (feedId: number, categoryId: number) => {
    try {
      await updateFeed.mutateAsync({ id: feedId, updates: { categoryId } });
    } catch {
      toast.error(t('settings.categories.moveFailed'));
    }
  };

  const startEditing = (id: number, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Folder className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.categories.title')}</h2>
          <p className="text-sm text-muted">{t('settings.categories.desc')}</p>
        </div>
      </div>

      {/* New Category Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={t('settings.categories.newPlaceholder')}
          className="flex-1 px-3 py-2 rounded-lg bg-[rgb(var(--bg-hover))] border border-default text-sm focus:outline-none focus:border-orange-500 transition-colors"
        />
        <button
          onClick={handleCreate}
          disabled={!newCategoryName.trim() || createCategory.isPending}
          className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 flex-shrink-0"
        >
          {createCategory.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {t('settings.common.create')}
        </button>
      </div>

      {/* Category List - Tree Structure */}
      <div className="space-y-2">
        {categories?.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <Folder className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>{t('settings.export.noCategories')}</p>
            <p className="text-sm">{t('settings.categories.emptyDesc')}</p>
          </div>
        ) : (
          // Only render top-level categories (no parent)
          categories?.filter(c => !c.parent_id).map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              allCategories={categories || []}
              feeds={feeds}
              depth={0}
              editingId={editingId}
              editingName={editingName}
              expandedId={expandedId}
              addingSubTo={addingSubTo}
              subCategoryName={subCategoryName}
              onSetExpandedId={setExpandedId}
              onSetAddingSubTo={setAddingSubTo}
              onSetSubCategoryName={setSubCategoryName}
              onStartEditing={startEditing}
              onCancelEditing={cancelEditing}
              onSetEditingName={setEditingName}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onCreateSub={handleCreateSub}
              onMoveFeed={handleMoveFeed}
              isUpdatePending={updateCategory.isPending}
              isDeletePending={deleteCategory.isPending}
              isCreatePending={createCategory.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Recursive category row component
function CategoryRow({
  category,
  allCategories,
  feeds,
  depth,
  editingId, editingName, expandedId, addingSubTo, subCategoryName,
  onSetExpandedId, onSetAddingSubTo, onSetSubCategoryName,
  onStartEditing, onCancelEditing, onSetEditingName,
  onUpdate, onDelete, onCreateSub, onMoveFeed,
  isUpdatePending, isDeletePending, isCreatePending,
}: {
  category: any;
  allCategories: any[];
  feeds: any;
  depth: number;
  editingId: number | null; editingName: string; expandedId: number | null;
  addingSubTo: number | null; subCategoryName: string;
  onSetExpandedId: (id: number | null) => void;
  onSetAddingSubTo: (id: number | null) => void;
  onSetSubCategoryName: (name: string) => void;
  onStartEditing: (id: number, name: string) => void;
  onCancelEditing: () => void;
  onSetEditingName: (name: string) => void;
  onUpdate: (id: number) => void;
  onDelete: (id: number, title: string) => void;
  onCreateSub: (parentId: number) => void;
  onMoveFeed: (feedId: number, categoryId: number) => void;
  isUpdatePending: boolean; isDeletePending: boolean; isCreatePending: boolean;
}) {
  const feedsInCategory = feeds?.filter((f: any) => getFeedCategoryId(f) === category.id) || [];
  const children = allCategories.filter(c => c.parent_id === category.id);
  const isEditing = editingId === category.id;
  const isExpanded = expandedId === category.id;
  const ml = depth * 24;

  return (
    <motion.div layout className="rounded-lg border border-default overflow-hidden" style={{ marginLeft: ml }}>
      {/* Category Header */}
      <div className="flex items-center gap-2 p-3 bg-[rgb(var(--bg-hover))]">
        <button
          onClick={() => onSetExpandedId(isExpanded ? null : category.id)}
          className="p-1 hover:bg-[rgb(var(--bg-active))] rounded transition-colors"
        >
          <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
        </button>
        
        <Folder className="w-5 h-5 text-orange-500" />
        
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => onSetEditingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onUpdate(category.id); if (e.key === 'Escape') onCancelEditing(); }}
            autoFocus
            className="flex-1 px-2 py-1 rounded bg-[rgb(var(--bg-base))] border border-orange-500 text-sm focus:outline-none"
          />
        ) : (
          <span className="flex-1 font-medium">{category.title}</span>
        )}
        
        <span className="text-xs text-muted px-2 py-0.5 bg-[rgb(var(--bg-base))] rounded">
          {feedsInCategory.length} {t('settings.categories.subscriptions')}
        </span>

        {isEditing ? (
          <>
            <button onClick={() => onUpdate(category.id)} disabled={isUpdatePending} className="p-1.5 text-green-500 hover:bg-green-500/10 rounded transition-colors"><Check className="w-4 h-4" /></button>
            <button onClick={onCancelEditing} className="p-1.5 text-muted hover:bg-[rgb(var(--bg-active))] rounded transition-colors"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <button onClick={() => { onSetAddingSubTo(addingSubTo === category.id ? null : category.id); onSetSubCategoryName(''); }} className="p-1.5 text-muted hover:text-orange-500 hover:bg-orange-500/10 rounded transition-colors" title={t('settings.categories.addSub')}><Plus className="w-4 h-4" /></button>
            <button onClick={() => onStartEditing(category.id, category.title)} className="p-1.5 text-muted hover:text-orange-500 hover:bg-orange-500/10 rounded transition-colors" title={t('settings.categories.rename')}><Pencil className="w-4 h-4" /></button>
            <button onClick={() => onDelete(category.id, category.title)} disabled={isDeletePending} className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors" title={t('settings.common.delete')}><Trash2 className="w-4 h-4" /></button>
          </>
        )}
      </div>

      {/* Inline sub-category creation */}
      <AnimatePresence>
        {addingSubTo === category.id && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-default overflow-hidden">
            <div className="flex items-center gap-2 p-2 bg-[rgb(var(--bg-base))]">
              <span className="text-muted text-sm pl-2">↳</span>
              <input type="text" value={subCategoryName} onChange={(e) => onSetSubCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onCreateSub(category.id); if (e.key === 'Escape') { onSetAddingSubTo(null); onSetSubCategoryName(''); } }}
                placeholder={t('settings.categories.subPlaceholder')} autoFocus
                className="flex-1 px-2 py-1.5 rounded bg-[rgb(var(--bg-hover))] border border-default text-sm focus:outline-none focus:border-orange-500"
              />
              <button onClick={() => onCreateSub(category.id)} disabled={!subCategoryName.trim() || isCreatePending} className="px-3 py-1.5 rounded bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">{t('settings.common.create')}</button>
              <button onClick={() => { onSetAddingSubTo(null); onSetSubCategoryName(''); }} className="p-1.5 text-muted hover:bg-[rgb(var(--bg-hover))] rounded transition-colors"><X className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feeds in Category */}
      <AnimatePresence>
        {isExpanded && feedsInCategory.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-default">
            <div className="p-2 space-y-1">
              {feedsInCategory.map((feed: any) => (
                <div key={feed.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[rgb(var(--bg-hover))] transition-colors">
                  <span className="flex-1 text-sm truncate">{feed.title}</span>
                  <select value={getFeedCategoryId(feed)} onChange={(e) => onMoveFeed(feed.id, parseInt(e.target.value))}
                    className="text-xs px-2 py-1 rounded bg-[rgb(var(--bg-base))] border border-default focus:outline-none focus:border-orange-500">
                    {buildCategoryOptions(allCategories).map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
                  </select>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Child categories rendered below, inside the same visual block */}
      {children.length > 0 && (
        <div className="space-y-2 mt-2">
          {children.map(child => (
            <CategoryRow
              key={child.id}
              category={child}
              allCategories={allCategories}
              feeds={feeds}
              depth={depth + 1}
              editingId={editingId} editingName={editingName} expandedId={expandedId}
              addingSubTo={addingSubTo} subCategoryName={subCategoryName}
              onSetExpandedId={onSetExpandedId} onSetAddingSubTo={onSetAddingSubTo} onSetSubCategoryName={onSetSubCategoryName}
              onStartEditing={onStartEditing} onCancelEditing={onCancelEditing} onSetEditingName={onSetEditingName}
              onUpdate={onUpdate} onDelete={onDelete} onCreateSub={onCreateSub} onMoveFeed={onMoveFeed}
              isUpdatePending={isUpdatePending} isDeletePending={isDeletePending} isCreatePending={isCreatePending}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
