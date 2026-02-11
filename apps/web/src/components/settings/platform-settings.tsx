'use client';

import { useState, useEffect } from 'react';
import { Button } from '@feedglow/ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  TestTube,
  Twitter,
  Shield,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Activity,
  History,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '@/lib/api';
import { t, getLocale } from '@/lib/i18n';

// Strip leading emoji from server messages for toast display
function stripEmoji(text: string): string {
  return text.replace(/^[^\w\s\u4e00-\u9fff]{1,3}\s*/, '').trim();
}

export function PlatformSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Current stored state (masked)
  const [storedCreds, setStoredCreds] = useState<api.PlatformCredentialsResponse>({});

  // Form inputs
  const [authToken, setAuthToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [proxy, setProxy] = useState('');

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Test result
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-refresh state
  const [tokenHealth, setTokenHealth] = useState<api.TwitterTokenHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshHistory, setRefreshHistory] = useState<api.TwitterRefreshLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const creds = await api.getPlatformCredentials();
      setStoredCreds(creds);
    } catch (err) {
      console.error('Failed to load platform credentials:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkTokenHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await api.getTwitterTokenHealth();
      setTokenHealth(health);
    } catch (err) {
      console.error('Failed to check token health:', err);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const result = await api.triggerTwitterTokenRefresh();
      if (result.success) {
        toast.success(t('settings.platforms.tokenRefreshed'));
        // Reload credentials and health
        await loadCredentials();
        await checkTokenHealth();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('settings.feedSources.refreshFailed');
      toast.error(msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadRefreshHistory = async () => {
    try {
      const data = await api.getTwitterRefreshHistory();
      setRefreshHistory(data.history);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load refresh history:', err);
    }
  };

  // Client-side validation
  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (username.trim()) {
      // Username should be a Twitter handle, not an email
      if (username.includes('@') && username.includes('.')) {
        errors.username = t('settings.platforms.emailLooksLikeUsername');
      }
      if (username.startsWith('@')) {
        errors.username = t('settings.platforms.noAtSymbol');
      }
    }

    if (authToken.trim()) {
      // Auth token should be 40 char hex
      const cleaned = authToken.trim();
      if (!/^[a-f0-9]{30,50}$/i.test(cleaned)) {
        errors.authToken = t('settings.platforms.invalidAuthToken');
      }
    }

    // If using password method, username is required
    if (password.trim() && !username.trim() && !storedCreds.twitter?.hasUsername) {
      errors.password = t('settings.platforms.passwordNeedsUsername');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    setTestResult(null);

    try {
      const input: api.PlatformCredentialsInput = {
        twitter: {},
      };

      // Only send fields that were filled in
      if (authToken.trim()) input.twitter!.authToken = authToken.trim();
      if (username.trim()) input.twitter!.username = username.trim();
      if (password.trim()) input.twitter!.password = password.trim();
      if (authSecret.trim()) input.twitter!.authSecret = authSecret.trim();
      if (phoneOrEmail.trim()) input.twitter!.phoneOrEmail = phoneOrEmail.trim();
      if (proxy.trim()) input.twitter!.proxy = proxy.trim();

      // If using login credentials (not direct auth token), show extended loading message
      const isLoginMode = !!(input.twitter?.username || input.twitter?.password) && !input.twitter?.authToken;
      if (isLoginMode) {
        toast.loading(t('settings.platforms.autoLoginLoading'), { id: 'platform-save' });
      }

      const result = await api.updatePlatformCredentials(input);
      toast.dismiss('platform-save');

      if (result.success) {
        setStoredCreds(result.credentials);
        // Clear form fields after saving
        setAuthToken('');
        setUsername('');
        setPassword('');
        setAuthSecret('');
        setPhoneOrEmail('');
        setProxy('');

        if (result.rsshub.success) {
          toast.success(t('settings.platforms.savedRsshubRestarted'));
        } else {
          toast.success(t('settings.platforms.saved'));
          toast.error(result.rsshub.message);
        }

        // Show auto-test result
        if (result.test) {
          setTestResult(result.test);
          if (!result.test.success) {
            toast.error(t('settings.platforms.autoVerifyFailed') + stripEmoji(result.test.message));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.common.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await api.testPlatformConnection('twitter');
      setTestResult(result);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(stripEmoji(result.message));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.platform.testFailed');
      setTestResult({ success: false, message });
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  const twitterCreds = storedCreds.twitter;
  const isConnected = twitterCreds && (twitterCreds.hasAuthToken || twitterCreds.hasUsername);

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
        <Key className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold">{t('settings.platforms.title')}</h2>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t('settings.platforms.desc')}
      </p>

      {/* Twitter Card */}
      <motion.div
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden"
        layout
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
              <Twitter className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <div className="font-medium">Twitter / X</div>
              <div className="text-sm text-zinc-500">{t('settings.platforms.twitterDesc')}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConnected && (
              <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <Shield className="w-4 h-4" />
                {t('settings.platforms.configured')}
              </span>
            )}
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-4 space-y-6">
                {/* Priority Notice */}
                <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('settings.platforms.authMethodInfo')}</p>
                    <p className="mt-1 opacity-80">
                      {t('settings.platforms.authMethodDesc')}
                    </p>
                  </div>
                </div>

                {/* Method 1: Auth Token */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {t('settings.platforms.method1')}
                    </h3>
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                      {t('settings.platforms.recommended')}
                    </span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      Auth Token
                    </label>
                    <input
                      type="password"
                      value={authToken}
                      onChange={(e) => { setAuthToken(e.target.value); setValidationErrors(prev => ({ ...prev, authToken: '' })); }}
                      placeholder={twitterCreds?.hasAuthToken ? twitterCreds.authTokenMasked || t('settings.platforms.configured') : t('settings.platforms.invalidAuthToken').split('，')[0]}
                      className={`w-full px-3 py-2 rounded-lg border ${validationErrors.authToken ? 'border-red-400 dark:border-red-600' : 'border-zinc-300 dark:border-zinc-700'} bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent`}
                    />
                    {validationErrors.authToken ? (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {validationErrors.authToken}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        F12 → Application → Cookies → x.com → auth_token
                      </p>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 surface-elevated text-zinc-400">{t('discover.or')}</span>
                  </div>
                </div>

                {/* Method 2: Username & Password */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {t('settings.platforms.method2')}
                  </h3>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      {t('settings.platforms.twitterHandle')}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">@</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => { setUsername(e.target.value.replace(/^@/, '')); setValidationErrors(prev => ({ ...prev, username: '' })); }}
                        placeholder={twitterCreds?.hasUsername ? twitterCreds.usernameMasked || t('settings.platforms.configured') : 'elonmusk'}
                        className={`w-full pl-8 pr-3 py-2 rounded-lg border ${validationErrors.username ? 'border-red-400 dark:border-red-600' : 'border-zinc-300 dark:border-zinc-700'} bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent`}
                      />
                    </div>
                    {validationErrors.username ? (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {validationErrors.username}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {t('settings.platforms.twitterHandleNote')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      {t('settings.feedAdvanced.password')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setValidationErrors(prev => ({ ...prev, password: '' })); }}
                      placeholder={twitterCreds?.hasPassword ? t('settings.platforms.configured') : t('settings.platforms.twoFaSecret')}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    {validationErrors.password && (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {validationErrors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      {t('settings.platforms.phoneOrEmail')}
                      <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-1">({t('settings.platforms.phoneOrEmailNote')})</span>
                    </label>
                    <input
                      type="text"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      placeholder={twitterCreds?.hasPhoneOrEmail ? twitterCreds.phoneOrEmailMasked || t('settings.platforms.configured') : t('settings.platforms.phoneOrEmailDesc').substring(0, 30)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      {t('settings.platforms.phoneOrEmailDesc')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      {t('settings.platforms.twoFaSecret')}
                      <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-1">{t('settings.feedAdvanced.optional')}</span>
                    </label>
                    <input
                      type="password"
                      value={authSecret}
                      onChange={(e) => setAuthSecret(e.target.value)}
                      placeholder={twitterCreds?.hasAuthSecret ? t('settings.platforms.configured') : t('settings.platforms.twoFaSecret')}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-zinc-600 dark:text-zinc-400">
                      {t('settings.platforms.proxyAddress')}
                      <span className="text-zinc-400 dark:text-zinc-500 font-normal ml-1">({t('settings.platforms.proxyNote')})</span>
                    </label>
                    <input
                      type="text"
                      value={proxy}
                      onChange={(e) => setProxy(e.target.value)}
                      placeholder={twitterCreds?.hasProxy ? twitterCreds.proxyMasked || t('settings.platforms.configured') : 'http://user:pass@host:port'}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[rgb(var(--text-primary))] placeholder-zinc-400 dark:placeholder-zinc-600 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      {t('settings.platforms.proxyDesc')}
                    </p>
                  </div>
                </div>

                {/* Current status */}
                {isConnected && (
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-sm text-zinc-600 dark:text-zinc-400">
                    <p className="font-medium mb-1">{t('settings.platforms.currentStatus')}</p>
                    <ul className="space-y-0.5">
                      {twitterCreds?.hasAuthToken && (
                        <li>✓ Auth Token: {twitterCreds.authTokenMasked}</li>
                      )}
                      {twitterCreds?.hasUsername && (
                        <li>✓ {t('settings.platforms.twitterHandle')}: {twitterCreds.usernameMasked}</li>
                      )}
                      {twitterCreds?.hasPassword && (
                        <li>✓ {t('settings.feedAdvanced.password')}: {t('settings.platforms.configured')}</li>
                      )}
                      {twitterCreds?.hasPhoneOrEmail && (
                        <li>✓ {t('settings.platforms.phoneOrEmail')}: {twitterCreds.phoneOrEmailMasked}</li>
                      )}
                      {twitterCreds?.hasAuthSecret && (
                        <li>✓ {t('settings.platforms.twoFaSecret')}: {t('settings.platforms.configured')}</li>
                      )}
                      {twitterCreds?.hasProxy && (
                        <li>✓ {t('settings.platforms.proxyAddress')}: {twitterCreds.proxyMasked}</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Test Result */}
                {testResult && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                      testResult.success
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isSaving ? t('settings.platforms.savingAndVerifying') : t('settings.platforms.saveAndVerify')}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={isTesting || !isConnected}
                    className="flex items-center gap-2"
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4" />
                    )}
                    {t('settings.platforms.testConnection')}
                  </Button>
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-200 dark:border-zinc-700 mt-4" />

                {/* Auto-Refresh Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-orange-500" />
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      {t('settings.platforms.tokenAutoRefresh')}
                    </h3>
                  </div>

                  <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="opacity-80">
                        {t('settings.platforms.autoRefreshDesc')}
                      </p>
                    </div>
                  </div>

                  {/* 2FA Secret field with better description */}
                  <div className="p-3 rounded-lg border border-dashed border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('settings.platforms.twoFaInfo')}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {t('settings.platforms.twoFaInfoDetail')}
                    </p>
                  </div>

                  {/* Health Check */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={checkTokenHealth}
                      disabled={isCheckingHealth}
                      className="flex items-center gap-2"
                    >
                      {isCheckingHealth ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                      {t('settings.platforms.checkTokenStatus')}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleRefreshToken}
                      disabled={isRefreshing || !(twitterCreds?.hasUsername && twitterCreds?.hasPassword)}
                      className="flex items-center gap-2"
                    >
                      {isRefreshing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {isRefreshing ? t('settings.platforms.refreshing') : t('settings.platforms.manualRefresh')}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={loadRefreshHistory}
                      className="flex items-center gap-2"
                    >
                      <History className="w-4 h-4" />
                      {t('settings.platforms.refreshHistory')}
                    </Button>
                  </div>

                  {/* Health Status */}
                  {tokenHealth && (
                    <div
                      className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                        tokenHealth.healthy
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}
                    >
                      {tokenHealth.healthy ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span>{tokenHealth.message}</span>
                        {tokenHealth.stale && twitterCreds?.hasUsername && twitterCreds?.hasPassword && (
                          <span className="block mt-1 text-xs opacity-75">
                            {t('settings.platforms.needCredentials')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Refresh not possible warning */}
                  {!(twitterCreds?.hasUsername && twitterCreds?.hasPassword) && (
                    <div className="flex gap-2 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{t('settings.platforms.needCredentials')}</span>
                    </div>
                  )}

                  {/* Refresh History */}
                  <AnimatePresence>
                    {showHistory && refreshHistory.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t('settings.platforms.refreshHistory')}</span>
                            <button
                              onClick={() => setShowHistory(false)}
                              className="text-xs text-zinc-400 hover:text-zinc-600"
                            >
                              {t('settings.platforms.collapse')}
                            </button>
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {refreshHistory.map((entry, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-2 text-xs py-1 ${
                                  entry.success ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                                }`}
                              >
                                {entry.success ? (
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 shrink-0" />
                                )}
                                <span className="text-zinc-400 shrink-0">
                                  {new Date(entry.createdAt).toLocaleString(getLocale() === 'zh' ? 'zh-CN' : 'en-US')}
                                </span>
                                <span className="truncate">{entry.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {showHistory && refreshHistory.length === 0 && (
                    <div className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-2">
                      {t('settings.platforms.noRefreshHistory')}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
