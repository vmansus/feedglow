'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Key } from 'lucide-react';
import toast from 'react-hot-toast';
import { changePassword } from '@/lib/api';
import { setStoredAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

export function ChangePasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error(t('settings.password.minLength'));
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('settings.password.mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      const result = await changePassword({ currentPassword, newPassword });
      // Save new tokens issued after password change
      if (result && (result as any).accessToken) {
        setStoredAuth(result as any);
      }
      toast.success(t('settings.password.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.toLowerCase().includes('incorrect')) {
        toast.error(t('settings.password.wrongCurrent'));
      } else {
        toast.error(msg || t('settings.password.failed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-primary mb-1 flex items-center gap-2">
        <Key className="w-5 h-5" />
        {t('settings.password.title')}
      </h3>
      <p className="text-sm text-muted mb-4">{t('settings.password.description')}</p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        {/* Current Password */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">
            {t('settings.password.current')}
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-2 pr-10 rounded-lg border border-default bg-[rgb(var(--surface-elevated))] text-primary focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">
            {t('settings.password.new')}
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 pr-10 rounded-lg border border-default bg-[rgb(var(--surface-elevated))] text-primary focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">{t('settings.password.minLength')}</p>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">
            {t('settings.password.confirm')}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-lg border border-default bg-[rgb(var(--surface-elevated))] text-primary focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-red-500">{t('settings.password.mismatch')}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
          className="px-4 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('settings.password.submit')
          )}
        </button>
      </form>
    </div>
  );
}
