'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Zap, X, FileText, Languages, FileDown, Star, Check, Ban, Link2, Bell } from 'lucide-react';
import { cn } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import type { AIAction, AIActionCondition, AIActionType } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

// Field options for conditions
const CONDITION_FIELDS = [
  { value: 'feed_title', label: t('settings.actions.fieldFeedTitle') },
  { value: 'feed_url', label: t('settings.actions.fieldFeedUrl') },
  { value: 'feed_category', label: t('settings.actions.fieldFeedCategory') },
  { value: 'entry_title', label: t('settings.actions.fieldEntryTitle') },
  { value: 'entry_content', label: t('settings.actions.fieldEntryContent') },
  { value: 'entry_url', label: t('settings.actions.fieldEntryUrl') },
  { value: 'entry_author', label: t('settings.filterRules.targetAuthor') },
  { value: 'entry_media_length', label: t('settings.actions.fieldMediaLength') },
];

// Operator options
const CONDITION_OPERATORS = [
  { value: 'contains', label: t('settings.actions.opContains') },
  { value: 'not_contains', label: t('settings.actions.opNotContains') },
  { value: 'eq', label: t('settings.actions.opEquals') },
  { value: 'not_eq', label: t('settings.actions.opNotEquals') },
  { value: 'gt', label: t('settings.actions.opGt') },
  { value: 'lt', label: t('settings.actions.opLt') },
  { value: 'regex', label: t('settings.actions.opRegex') },
];

// Action type options
const ACTION_TYPES = [
  { type: 'summarize', label: t('settings.actions.actionSummarize'), Icon: FileText },
  { type: 'translate', label: t('settings.actions.actionTranslate'), Icon: Languages, needsLanguage: true },
  { type: 'fetch_full', label: t('settings.feedAdvanced.fullContent'), Icon: FileDown },
  { type: 'star', label: t('settings.actions.actionStar'), Icon: Star },
  { type: 'mark_read', label: t('settings.actions.actionMarkRead'), Icon: Check },
  { type: 'block', label: t('settings.actions.actionBlock'), Icon: Ban },
  { type: 'webhook', label: 'Webhook', Icon: Link2, needsUrl: true },
  { type: 'notify', label: t('settings.actions.actionNotify'), Icon: Bell },
];

const LANGUAGES = [
  { value: 'zh-CN', label: t('settings.general.langZhCN') },
  { value: 'zh-TW', label: t('settings.general.langZhTW') },
  { value: 'en', label: 'English' },
  { value: 'ja', label: t('settings.general.langJa') },
  { value: 'ko', label: '한국어' },
];

interface ActionEditorProps {
  action?: AIAction;
  onSave: (action: Omit<AIAction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function ActionEditor({ action, onSave, onCancel }: ActionEditorProps) {
  const [name, setName] = useState(action?.name || '');
  const [conditions, setConditions] = useState<AIActionCondition[]>(
    action?.conditions || [{ field: 'entry_title', operator: 'contains', value: '' }]
  );
  const [selectedActions, setSelectedActions] = useState<AIActionType[]>(
    action?.actions || []
  );
  const [enabled, setEnabled] = useState(action?.enabled ?? true);

  const addCondition = () => {
    setConditions([...conditions, { field: 'entry_title', operator: 'contains', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: keyof AIActionCondition, value: string) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const toggleAction = (type: string) => {
    const exists = selectedActions.find(a => a.type === type);
    if (exists) {
      setSelectedActions(selectedActions.filter(a => a.type !== type));
    } else {
      const actionDef = ACTION_TYPES.find(a => a.type === type);
      if (actionDef?.needsLanguage) {
        setSelectedActions([...selectedActions, { type: 'translate', language: 'zh-CN' } as AIActionType]);
      } else if (actionDef?.needsUrl) {
        setSelectedActions([...selectedActions, { type: 'webhook', url: '' } as AIActionType]);
      } else {
        setSelectedActions([...selectedActions, { type } as AIActionType]);
      }
    }
  };

  const updateActionParam = (type: string, param: string, value: string) => {
    setSelectedActions(selectedActions.map(a => 
      a.type === type ? { ...a, [param]: value } : a
    ));
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error(t('settings.actions.enterRuleName'));
      return;
    }
    if (conditions.some(c => !c.value.trim())) {
      toast.error(t('settings.actions.fillConditionValues'));
      return;
    }
    if (selectedActions.length === 0) {
      toast.error(t('settings.actions.selectOneAction'));
      return;
    }

    onSave({
      name: name.trim(),
      conditions,
      actions: selectedActions,
      enabled,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[rgb(var(--bg-elevated))] rounded-xl border border-default max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default">
          <h2 className="text-lg font-semibold">
            {action ? t('settings.filterRules.editRule') : t('settings.actions.createRule')}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-[rgb(var(--bg-hover))] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.notifications.ruleName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.actions.ruleNamePlaceholder')}
              className="w-full px-4 py-2.5 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Conditions */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.actions.triggerConditions')}</label>
            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, 'field', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  >
                    {CONDITION_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                    className="px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  >
                    {CONDITION_OPERATORS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={condition.value}
                    onChange={(e) => updateCondition(index, 'value', e.target.value)}
                    placeholder={t('settings.actions.conditionValue')}
                    className="flex-1 px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default focus:border-orange-500 focus:outline-none text-sm"
                  />
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(index)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addCondition}
              className="mt-2 text-sm text-orange-500 hover:text-orange-400 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> {t('settings.actions.addCondition')}
            </button>
          </div>

          {/* Actions */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('settings.actions.executeActions')}</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map(actionType => {
                const isSelected = selectedActions.some(a => a.type === actionType.type);
                const selectedAction = selectedActions.find(a => a.type === actionType.type);
                
                return (
                  <div key={actionType.type}>
                    <button
                      onClick={() => toggleAction(actionType.type)}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-lg border text-left flex items-center gap-2 transition-colors",
                        isSelected
                          ? "border-orange-500 bg-orange-500/10"
                          : "border-default hover:border-[rgb(var(--text-muted))]"
                      )}
                    >
                      <actionType.Icon className="w-4 h-4" />
                      <span className="text-sm">{actionType.label}</span>
                    </button>
                    
                    {/* Language selector for translate */}
                    {isSelected && actionType.needsLanguage && (
                      <select
                        value={(selectedAction as any)?.language || 'zh-CN'}
                        onChange={(e) => updateActionParam(actionType.type, 'language', e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-sm"
                      >
                        {LANGUAGES.map(l => (
                          <option key={l.value} value={l.value}>{l.label}</option>
                        ))}
                      </select>
                    )}
                    
                    {/* URL input for webhook */}
                    {isSelected && actionType.needsUrl && (
                      <input
                        type="url"
                        value={(selectedAction as any)?.url || ''}
                        onChange={(e) => updateActionParam(actionType.type, 'url', e.target.value)}
                        placeholder="https://..."
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgb(var(--bg-base))] border border-default text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('settings.actions.enableRule')}</span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                enabled ? "bg-orange-500" : "bg-[rgb(var(--bg-active))]"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
                enabled ? "translate-x-6" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-default">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-default rounded-lg hover:bg-[rgb(var(--bg-hover))]"
          >
            {t('settings.common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            {t('settings.common.save')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Action card component
function ActionCard({ 
  action, 
  onEdit, 
  onDelete, 
  onToggle 
}: { 
  action: AIAction; 
  onEdit: () => void; 
  onDelete: () => void;
  onToggle: () => void;
}) {
  const conditionSummary = action.conditions
    .map(c => `${CONDITION_FIELDS.find(f => f.value === c.field)?.label || c.field} ${CONDITION_OPERATORS.find(o => o.value === c.operator)?.label || c.operator} "${c.value}"`)
    .join(' AND ');

  const actionIconComponents = action.actions
    .map(a => ACTION_TYPES.find(t => t.type === a.type))
    .filter(Boolean);

  return (
    <div className={cn(
      "p-4 rounded-lg border transition-colors",
      action.enabled ? "border-default bg-[rgb(var(--bg-base))]" : "border-default bg-[rgb(var(--bg-base))] opacity-60"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-[rgb(var(--text-primary))] truncate">{action.name}</h3>
            <div className="flex items-center gap-1">
              {actionIconComponents.map((at, i) => at && <at.Icon key={i} className="w-4 h-4 text-muted" />)}
            </div>
          </div>
          <p className="text-xs text-muted line-clamp-2">{conditionSummary}</p>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle */}
          <button
            onClick={onToggle}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              action.enabled ? "bg-orange-500" : "bg-[rgb(var(--bg-active))]"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
              action.enabled ? "translate-x-5" : "translate-x-0.5"
            )} />
          </button>
          
          {/* Edit */}
          <button
            onClick={onEdit}
            className="p-1.5 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg"
          >
            <Pencil className="w-4 h-4" />
          </button>
          
          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionSettings() {
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();
  const [editingAction, setEditingAction] = useState<AIAction | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch actions
  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['ai-actions'],
    queryFn: api.getAIActions,
  });

  // Create action
  const createAction = useMutation({
    mutationFn: api.createAIAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
      setIsCreating(false);
      toast.success(t('settings.filterRules.ruleCreated'));
    },
    onError: () => toast.error(t('settings.sharedFeeds.createFailed')),
  });

  // Update action
  const updateAction = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<AIAction>) => 
      api.updateAIAction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
      setEditingAction(null);
      toast.success(t('settings.filterRules.ruleUpdated'));
    },
    onError: () => toast.error(t('settings.filterRules.updateFailed')),
  });

  // Delete action
  const deleteAction = useMutation({
    mutationFn: api.deleteAIAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-actions'] });
      toast.success(t('settings.actions.ruleDeleted'));
    },
    onError: () => toast.error(t('settings.telegram.removeFailed')),
  });

  const handleSave = (data: Omit<AIAction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingAction) {
      updateAction.mutate({ id: editingAction.id, ...data });
    } else {
      createAction.mutate(data);
    }
  };

  const handleToggle = (action: AIAction) => {
    updateAction.mutate({ id: action.id, enabled: !action.enabled });
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t('settings.actions.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (ok) {
      deleteAction.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-[rgb(var(--text-primary))]">{t('settings.actions.title')}</h3>
          <p className="text-sm text-muted mt-0.5">
            {t('settings.actions.desc')}
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('settings.actions.createRule')}
        </button>
      </div>

      {/* Action List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted">{t('settings.common.loading')}</div>
      ) : actions.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{t('settings.actions.empty')}</p>
          <p className="text-sm mt-1">{t('settings.actions.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action: AIAction) => (
            <ActionCard
              key={action.id}
              action={action}
              onEdit={() => setEditingAction(action)}
              onDelete={() => handleDelete(action.id)}
              onToggle={() => handleToggle(action)}
            />
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {(isCreating || editingAction) && (
          <ActionEditor
            action={editingAction || undefined}
            onSave={handleSave}
            onCancel={() => {
              setIsCreating(false);
              setEditingAction(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
