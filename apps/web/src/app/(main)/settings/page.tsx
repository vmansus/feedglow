'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/theme-context';
import { Sun, Moon, Monitor, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { AISettings } from '@/components/settings/ai-settings';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [apiUrl, setApiUrl] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState('25');
  const [autoMarkRead, setAutoMarkRead] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const savedApiUrl = localStorage.getItem('apiUrl') || '';
    const savedEntriesPerPage = localStorage.getItem('entriesPerPage') || '25';
    const savedAutoMarkRead = localStorage.getItem('autoMarkRead') !== 'false';
    
    setApiUrl(savedApiUrl);
    setEntriesPerPage(savedEntriesPerPage);
    setAutoMarkRead(savedAutoMarkRead);
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('apiUrl', apiUrl);
      localStorage.setItem('entriesPerPage', entriesPerPage);
      localStorage.setItem('autoMarkRead', String(autoMarkRead));
      toast.success('Settings saved!');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="h-full overflow-y-auto surface-base">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6 text-[rgb(var(--text-primary))]">Settings</h1>

        <div className="space-y-6">
          {/* Appearance */}
          <section className="surface-elevated rounded-xl border border-default p-6">
            <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">Appearance</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Theme
                </label>
                <div className="flex gap-2">
                  {themeOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setTheme(option.value)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                          theme === option.value
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'surface-elevated text-secondary border-default hover:border-orange-500/50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Reading */}
          <section className="surface-elevated rounded-xl border border-default p-6">
            <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">Reading</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Entries per page
                </label>
                <select
                  value={entriesPerPage}
                  onChange={(e) => setEntriesPerPage(e.target.value)}
                  className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-secondary">
                    Auto-mark as read
                  </label>
                  <p className="text-sm text-muted">
                    Mark articles as read when opened
                  </p>
                </div>
                <button
                  onClick={() => setAutoMarkRead(!autoMarkRead)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoMarkRead ? 'bg-orange-500' : 'bg-[rgb(var(--bg-active))]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoMarkRead ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <AISettings />

          {/* API Configuration */}
          <section className="surface-elevated rounded-xl border border-default p-6">
            <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">API Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Custom API URL (optional)
                </label>
                <input
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full px-3 py-2 border border-default rounded-lg surface-elevated text-[rgb(var(--text-primary))] placeholder-[rgb(var(--text-muted))] focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <p className="mt-1 text-sm text-muted">
                  Leave empty to use the default API endpoint
                </p>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Settings
            </button>
          </div>

          {/* About */}
          <section className="surface-elevated rounded-xl border border-default p-6">
            <h2 className="text-lg font-semibold mb-4 text-[rgb(var(--text-primary))]">About</h2>
            <div className="space-y-2 text-sm text-secondary">
              <p><strong className="text-[rgb(var(--text-primary))]">FeedGlow</strong> — Lightweight AI-powered RSS reader</p>
              <p>Version: 0.1.0</p>
              <p>
                <a
                  href="https://github.com/vmansus/feedglow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-500 hover:underline"
                >
                  GitHub Repository
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
