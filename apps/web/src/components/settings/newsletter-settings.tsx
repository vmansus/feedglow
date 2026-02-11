'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Trash2, Copy, Check, Pencil, Loader2 } from 'lucide-react';
import * as api from '@/lib/api';
import { useCategories } from '@/hooks/use-categories';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

export function NewsletterSettings() {
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();
  const { categories } = useCategories();
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ['newsletter-subscriptions'],
    queryFn: api.getNewsletterSubscriptions,
  });

  const createMutation = useMutation({
    mutationFn: api.createNewsletterSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscriptions'] });
      setShowCreate(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteNewsletterSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscriptions'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateNewsletterSubscription>[1] }) =>
      api.updateNewsletterSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscriptions'] });
      setEditingId(null);
    },
  });

  const copyAddress = async (sub: api.NewsletterSubscription) => {
    await navigator.clipboard.writeText(sub.fullAddress);
    setCopiedId(sub.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
            📧 {t('settings.newsletter.title')}
          </h3>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-1">
            {t('settings.newsletter.desc')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('settings.newsletter.newSubscription')}
        </button>
      </div>

      {/* How it works */}
      <div className="p-4 rounded-lg bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-base))]">
        <h4 className="font-medium text-[rgb(var(--text-primary))] mb-2">{t('settings.newsletter.howItWorks')}</h4>
        <ol className="text-sm text-[rgb(var(--text-secondary))] space-y-1.5 list-decimal list-inside">
          <li>{t('settings.newsletter.step1')}</li>
          <li>{t('settings.newsletter.step2')}</li>
          <li>{t('settings.newsletter.step3')}</li>
        </ol>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateForm
          categories={categories || []}
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => setShowCreate(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Subscription list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-[rgb(var(--text-muted))]" />
        </div>
      ) : subscriptions && subscriptions.length > 0 ? (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="p-4 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-primary))]"
            >
              {editingId === sub.id ? (
                <EditForm
                  sub={sub}
                  categories={categories || []}
                  onSubmit={(data) => updateMutation.mutate({ id: sub.id, data })}
                  onCancel={() => setEditingId(null)}
                  isLoading={updateMutation.isPending}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <h4 className="font-medium text-[rgb(var(--text-primary))] truncate">
                        {sub.feedTitle}
                      </h4>
                      {sub.categoryTitle && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[rgb(var(--bg-secondary))] text-[rgb(var(--text-muted))]">
                          {sub.categoryTitle}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-sm px-2 py-1 rounded bg-[rgb(var(--bg-secondary))] text-[rgb(var(--text-secondary))] font-mono select-all">
                        {sub.fullAddress}
                      </code>
                      <button
                        onClick={() => copyAddress(sub)}
                        className="p-1 rounded hover:bg-[rgb(var(--bg-hover))] transition-colors"
                        title={t('settings.newsletter.copyAddress')}
                      >
                        {copiedId === sub.id ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-[rgb(var(--text-muted))]" />
                        )}
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[rgb(var(--text-muted))]">
                      <span>{t('settings.newsletter.emailCount', { count: sub.entryCount })}</span>
                      {sub.senderFilter && (
                        <span>{t('settings.newsletter.filter')} {sub.senderFilter}</span>
                      )}
                      <span>{t('settings.newsletter.createdAt')} {new Date(sub.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingId(sub.id)}
                      className="p-1.5 rounded hover:bg-[rgb(var(--bg-hover))] transition-colors"
                      title={t('settings.common.edit')}
                    >
                      <Pencil className="w-4 h-4 text-[rgb(var(--text-muted))]" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDialog({ message: t('settings.newsletter.confirmDelete', { title: sub.feedTitle }), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
                          deleteMutation.mutate(sub.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                      title={t('settings.common.delete')}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !showCreate ? (
        <div className="text-center py-8 text-[rgb(var(--text-muted))]">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t('settings.newsletter.empty')}</p>
          <p className="text-sm mt-1">{t('settings.newsletter.emptyDesc')}</p>
        </div>
      ) : null}
    </div>
  );
}

// ============ Create Form ============

function CreateForm({
  categories,
  onSubmit,
  onCancel,
  isLoading,
}: {
  categories: any[];
  onSubmit: (data: { name: string; categoryId?: number; senderFilter?: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [senderFilter, setSenderFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="p-4 rounded-lg border-2 border-orange-500/30 bg-[rgb(var(--bg-secondary))]">
      <h4 className="font-medium text-[rgb(var(--text-primary))] mb-3">{t('settings.newsletter.createTitle')}</h4>
      <div className="space-y-3">
        <div>
          <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">
            {t('settings.newsletter.nameRequired')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.newsletter.nameRequired')}
            className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-primary))] text-[rgb(var(--text-primary))] text-sm focus:border-orange-500 focus:outline-none"
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">{t('settings.newsletter.category')}</label>
          <select
            value={categoryId || ''}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-primary))] text-[rgb(var(--text-primary))] text-sm"
          >
            <option value="">{t('settings.newsletter.noCategory')}</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))] transition-colors"
        >
          {showAdvanced ? '▾' : '▸'} {t('settings.newsletter.advancedOptions')}
        </button>

        {showAdvanced && (
          <div>
            <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">
              {t('settings.newsletter.senderFilter')} <span className="text-xs text-[rgb(var(--text-muted))]">{t('settings.feedAdvanced.optional')}</span>
            </label>
            <input
              type="text"
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              placeholder={t('settings.newsletter.senderFilterPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-primary))] text-[rgb(var(--text-primary))] text-sm focus:border-orange-500 focus:outline-none"
            />
            <p className="text-xs text-[rgb(var(--text-muted))] mt-1">
              {t('settings.newsletter.senderFilterDesc')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSubmit({
                name: name.trim(),
                categoryId,
                senderFilter: senderFilter.trim() || undefined,
              });
            }}
            disabled={!name.trim() || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            {isLoading ? t('settings.newsletter.creating') : t('settings.common.create')}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
          >
            {t('settings.common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Edit Form ============

function EditForm({
  sub,
  categories,
  onSubmit,
  onCancel,
  isLoading,
}: {
  sub: api.NewsletterSubscription;
  categories: any[];
  onSubmit: (data: { name?: string; categoryId?: number | null; senderFilter?: string | null }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState(sub.feedTitle);
  const [categoryId, setCategoryId] = useState<number | null>(sub.categoryId);
  const [senderFilter, setSenderFilter] = useState(sub.senderFilter || '');

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">{t('settings.newsletter.nameRequired')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-secondary))] text-[rgb(var(--text-primary))] text-sm focus:border-orange-500 focus:outline-none"
          autoFocus
        />
      </div>
      <div>
        <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">{t('settings.newsletter.category')}</label>
        <select
          value={categoryId || ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-secondary))] text-[rgb(var(--text-primary))] text-sm"
        >
          <option value="">{t('settings.newsletter.noCategory')}</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-[rgb(var(--text-secondary))] mb-1 block">{t('settings.newsletter.senderFilter')}</label>
        <input
          type="text"
          value={senderFilter}
          onChange={(e) => setSenderFilter(e.target.value)}
          placeholder={t('settings.newsletter.senderFilterPlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--bg-secondary))] text-[rgb(var(--text-primary))] text-sm focus:border-orange-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSubmit({
            name: name.trim() || undefined,
            categoryId,
            senderFilter: senderFilter.trim() || null,
          })}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-lg transition-colors"
        >
          {isLoading ? t('settings.newsletter.saving') : t('settings.common.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
        >
          {t('settings.common.cancel')}
        </button>
      </div>
    </div>
  );
}
