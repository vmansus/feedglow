'use client';

import { useState, useEffect } from 'react';
import { Filter, Plus, Pencil, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t } from '@/lib/i18n';
import { useConfirm } from '@/components/ui/confirm-dialog';

const MATCH_TARGETS = [
  { value: 'title', label: t('settings.filterRules.targetTitle') },
  { value: 'content', label: t('settings.filterRules.targetContent') },
  { value: 'author', label: t('settings.filterRules.targetAuthor') },
  { value: 'all', label: t('settings.filterRules.targetAll') },
];

const MATCH_TYPES = [
  { value: 'contains', label: t('settings.notifications.triggerKeyword') },
  { value: 'regex', label: t('settings.filterRules.typeRegex') },
];

const ACTIONS = [
  { value: 'mark_read', label: t('settings.filterRules.actionMarkRead') },
  { value: 'hide', label: t('settings.filterRules.actionHide') },
  { value: 'tag', label: t('settings.filterRules.actionTag') },
];

const SCOPES = [
  { value: 'global', label: t('settings.filterRules.scopeGlobal') },
  { value: 'feed', label: t('settings.filterRules.scopeFeed') },
  { value: 'category', label: t('settings.filterRules.scopeCategory') },
];

interface FormData {
  name: string;
  matchTarget: string;
  matchType: string;
  pattern: string;
  action: string;
  actionValue: string;
  scope: string;
  scopeId: string;
  enabled: boolean;
}

const defaultForm: FormData = {
  name: '', matchTarget: 'title', matchType: 'contains', pattern: '',
  action: 'mark_read', actionValue: '', scope: 'global', scopeId: '', enabled: true,
};

export function FilterRulesSettings() {
  const confirmDialog = useConfirm();
  const [rules, setRules] = useState<api.FilterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [regexError, setRegexError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await api.getFilterRules();
      setRules(data.filters || []);
    } catch { toast.error(t('settings.filterRules.loadFailed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const validateRegex = (pattern: string) => {
    if (form.matchType !== 'regex') { setRegexError(''); return; }
    try { new RegExp(pattern); setRegexError(''); } catch (e: any) { setRegexError(e.message); }
  };

  const openCreate = () => {
    setForm(defaultForm);
    setEditingId(null);
    setRegexError('');
    setShowDialog(true);
  };

  const openEdit = (rule: api.FilterRule) => {
    setForm({
      name: rule.name || '',
      matchTarget: rule.match_target,
      matchType: rule.match_type,
      pattern: rule.pattern,
      action: rule.action,
      actionValue: rule.action_value || '',
      scope: rule.scope,
      scopeId: rule.scope_id?.toString() || '',
      enabled: rule.enabled,
    });
    setEditingId(rule.id);
    setRegexError('');
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.pattern.trim()) { toast.error(t('settings.filterRules.enterPattern')); return; }
    if (regexError) { toast.error(t('settings.filterRules.invalidRegex')); return; }

    setSaving(true);
    try {
      const payload: any = {
        name: form.name || undefined,
        matchTarget: form.matchTarget,
        matchType: form.matchType,
        pattern: form.pattern,
        action: form.action,
        actionValue: form.action === 'tag' ? form.actionValue : undefined,
        scope: form.scope,
        scopeId: form.scope !== 'global' && form.scopeId ? parseInt(form.scopeId) : undefined,
        enabled: form.enabled,
      };

      if (editingId) {
        await api.updateFilterRule(editingId, payload);
        toast.success(t('settings.filterRules.ruleUpdated'));
      } else {
        await api.createFilterRule(payload);
        toast.success(t('settings.filterRules.ruleCreated'));
      }
      setShowDialog(false);
      load();
    } catch { toast.error(t('settings.common.saveFailed')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirmDialog({ message: t('settings.filterRules.confirmDelete'), variant: 'danger', confirmText: t('common.delete') }); if (!ok) return;
    try {
      await api.deleteFilterRule(id);
      toast.success(t('settings.filterRules.deleted'));
      load();
    } catch { toast.error(t('settings.telegram.removeFailed')); }
  };

  const handleToggle = async (rule: api.FilterRule) => {
    try {
      await api.updateFilterRule(rule.id, { enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch { toast.error(t('settings.filterRules.updateFailed')); }
  };

  const targetLabel = (v: string) => MATCH_TARGETS.find(t => t.value === v)?.label || v;
  const actionLabel = (v: string) => ACTIONS.find(a => a.value === v)?.label || v;
  const scopeLabel = (v: string) => SCOPES.find(s => s.value === v)?.label || v;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{t('settings.filterRules.title')}</h2>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
          <Plus className="w-4 h-4" /> {t('settings.notifications.addRule')}
        </button>
      </div>
      <p className="text-sm text-muted mb-4">{t('settings.filterRules.desc')}</p>

      {loading ? (
        <p className="text-sm text-muted">{t('settings.common.loading')}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.filterRules.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted">
                <th className="pb-2 font-medium">{t('settings.newsletter.nameRequired')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thTarget')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thPattern')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thAction')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thScope')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thToggle')}</th>
                <th className="pb-2 font-medium">{t('settings.filterRules.thOps')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-default/50">
                  <td className="py-2 text-[rgb(var(--text-primary))]">{rule.name || '-'}</td>
                  <td className="py-2 text-secondary">{targetLabel(rule.match_target)}</td>
                  <td className="py-2">
                    <code className="text-xs bg-[rgb(var(--bg-active))] px-1.5 py-0.5 rounded">{rule.pattern}</code>
                    <span className="text-xs text-muted ml-1">({rule.match_type === 'regex' ? t('settings.filterRules.regex') : t('settings.filterRules.keyword')})</span>
                  </td>
                  <td className="py-2 text-secondary">{actionLabel(rule.action)}{rule.action === 'tag' && rule.action_value ? `: ${rule.action_value}` : ''}</td>
                  <td className="py-2 text-secondary">{scopeLabel(rule.scope)}{rule.scope_id ? ` #${rule.scope_id}` : ''}</td>
                  <td className="py-2">
                    <button onClick={() => handleToggle(rule)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.enabled ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'}`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(rule)} className="p-1 hover:bg-[rgb(var(--bg-active))] rounded"><Pencil className="w-3.5 h-3.5 text-muted" /></button>
                      <button onClick={() => handleDelete(rule.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="surface-elevated rounded-xl border border-default p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{editingId ? t('settings.filterRules.editRule') : t('settings.notifications.addRule')}</h3>
              <button onClick={() => setShowDialog(false)} className="p-1 hover:bg-[rgb(var(--bg-active))] rounded"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.nameOptional')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm" placeholder={t('settings.filterRules.nameOptional')} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.thTarget')}</label>
                  <select value={form.matchTarget} onChange={e => setForm(f => ({ ...f, matchTarget: e.target.value }))}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm">
                    {MATCH_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.matchType')}</label>
                  <select value={form.matchType} onChange={e => { setForm(f => ({ ...f, matchType: e.target.value })); validateRegex(form.pattern); }}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm">
                    {MATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.matchPattern')}</label>
                <input value={form.pattern} onChange={e => { setForm(f => ({ ...f, pattern: e.target.value })); validateRegex(e.target.value); }}
                  className={`w-full px-3 py-2 border rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm ${regexError ? 'border-red-500' : 'border-default'}`}
                  placeholder={t('settings.filterRules.matchPattern')} />
                {regexError && <p className="text-xs text-red-500 mt-1">{regexError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.thAction')}</label>
                  <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm">
                    {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.thScope')}</label>
                  <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm">
                    {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {form.action === 'tag' && (
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{t('settings.filterRules.tagName')}</label>
                  <input value={form.actionValue} onChange={e => setForm(f => ({ ...f, actionValue: e.target.value }))}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm" placeholder={t('settings.filterRules.tagName')} />
                </div>
              )}

              {form.scope !== 'global' && (
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{form.scope === 'feed' ? 'Feed ID' : t('settings.filterRules.scopeCategory') + ' ID'}</label>
                  <input type="number" value={form.scopeId} onChange={e => setForm(f => ({ ...f, scopeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] text-sm" placeholder="ID" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-sm text-secondary hover:bg-[rgb(var(--bg-active))] rounded-lg transition-colors">{t('settings.common.cancel')}</button>
              <button onClick={handleSave} disabled={saving || !!regexError}
                className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {saving ? t('settings.newsletter.saving') : t('settings.common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
