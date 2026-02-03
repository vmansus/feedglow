'use client';

import { useState, useEffect } from 'react';
import { Bot, Key, Server, Check, X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import type { AIProvider, AISettingsResponse } from '@/lib/api';

export function AISettings() {
  const [settings, setSettings] = useState<AISettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  
  const [provider, setProvider] = useState<AIProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [enableSummary, setEnableSummary] = useState(true);
  const [enableTranslation, setEnableTranslation] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getAISettings();
      setSettings(data);
      setProvider(data.provider);
      setBaseUrl(data.baseUrl || '');
      setModel(data.model || '');
      setEnableSummary(data.enableSummary);
      setEnableTranslation(data.enableTranslation);
      setApiKey('');
    } catch {
      toast.error('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: api.AISettingsUpdate = {
        provider,
        baseUrl: baseUrl || undefined,
        model: model || undefined,
        enableSummary,
        enableTranslation,
      };
      
      if (apiKey) {
        updates.apiKey = apiKey;
      }
      
      const result = await api.updateAISettings(updates);
      setSettings(result.settings as AISettingsResponse);
      setApiKey('');
      toast.success('AI settings saved!');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await api.testAIConnection({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        model: model || undefined,
      });
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!confirm('Are you sure you want to remove the API key?')) return;
    
    setSaving(true);
    try {
      const result = await api.updateAISettings({ clearApiKey: true });
      setSettings(result.settings as AISettingsResponse);
      toast.success('API key removed');
    } catch {
      toast.error('Failed to remove API key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="surface-elevated rounded-xl border border-default p-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
          <span className="text-secondary">Loading AI settings...</span>
        </div>
      </section>
    );
  }

  const currentProvider = settings?.availableProviders.find(p => p.id === provider);
  const needsApiKey = currentProvider?.needsApiKey ?? true;
  const needsBaseUrl = currentProvider?.needsBaseUrl ?? false;

  return (
    <section className="surface-elevated rounded-xl border border-default p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-[rgb(var(--text-primary))]">AI Configuration</h2>
      </div>

      <div className="space-y-4">
        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">
            AI Provider
          </label>
          <select
            value={provider}
            onChange={(e) => {
              const newProvider = e.target.value as AIProvider;
              setProvider(newProvider);
              setBaseUrl(settings?.defaultBaseUrls[newProvider] || '');
              setModel(settings?.defaultModels[newProvider] || '');
            }}
            className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {settings?.availableProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        {needsApiKey && (
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              <Key className="w-4 h-4 inline mr-1" />
              API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.hasApiKey ? settings.apiKeyMasked : 'Enter API key...'}
                  className="w-full px-3 py-2 pr-10 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-[rgb(var(--text-primary))]"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {settings?.hasApiKey && (
                <button
                  onClick={handleClearApiKey}
                  disabled={saving}
                  className="px-3 py-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove API key"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {settings?.hasApiKey && !apiKey && (
              <p className="mt-1 text-sm text-green-500 flex items-center gap-1">
                <Check className="w-3 h-3" /> API key configured
              </p>
            )}
          </div>
        )}

        {/* Base URL */}
        {(needsBaseUrl || provider === 'custom') && (
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              <Server className="w-4 h-4 inline mr-1" />
              Base URL
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={settings?.defaultBaseUrls[provider] || 'https://api.example.com/v1'}
              className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        )}

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">
            Model (optional)
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={settings?.defaultModels[provider] || 'gpt-4o-mini'}
            className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <p className="mt-1 text-sm text-muted">
            Leave empty to use default: {settings?.defaultModels[provider]}
          </p>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-secondary">
                Enable AI Summaries
              </label>
              <p className="text-sm text-muted">
                Generate summaries for articles
              </p>
            </div>
            <button
              onClick={() => setEnableSummary(!enableSummary)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enableSummary ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableSummary ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-secondary">
                Enable AI Translation
              </label>
              <p className="text-sm text-muted">
                Translate articles to your language
              </p>
            </div>
            <button
              onClick={() => setEnableTranslation(!enableTranslation)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enableTranslation ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableTranslation ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-default">
          <button
            onClick={handleTest}
            disabled={testing || (needsApiKey && !settings?.hasApiKey && !apiKey)}
            className="flex items-center gap-2 px-4 py-2 border border-default rounded-lg text-secondary hover:bg-[rgb(var(--bg-hover))] disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Test Connection
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save AI Settings
          </button>
        </div>
      </div>
    </section>
  );
}
