'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Eye, EyeOff, Key, User, Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { t } from '@/lib/i18n';
import { register as apiRegister, getRegistrationMode } from '@/lib/auth';

type AuthMode = 'login' | 'register';

// Component to handle search params (needs Suspense)
function ExpiredTokenHandler() {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      toast.error(t('auth.sessionExpired'));
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);
  
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [registrationMode, setRegistrationMode] = useState<string>('closed');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getRegistrationMode().then(setRegistrationMode);
  }, []);

  if (isAuthenticated) {
    router.push('/unread');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login({ username, password });
      toast.success('Welcome to FeedGlow!');
      router.push('/unread');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);

    try {
      await apiRegister({ username, password, email: email || undefined, inviteCode: inviteCode || undefined });
      toast.success('Account created! Welcome to FeedGlow!');
      router.push('/unread');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center surface-base px-4">
      {/* Handle expired token redirect */}
      <Suspense fallback={null}>
        <ExpiredTokenHandler />
      </Suspense>
      
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Feed<span className="text-orange-500">Glow</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Mode toggle — hide register tab when registration is closed */}
        {registrationMode !== 'closed' ? (
          <div className="flex rounded-lg border border-default overflow-hidden mb-6">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-secondary hover:bg-[rgb(var(--bg-hover))]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'bg-orange-500 text-white'
                  : 'bg-[rgb(var(--bg-elevated))] text-secondary hover:bg-[rgb(var(--bg-hover))]'
              }`}
            >
              Register
            </button>
          </div>
        ) : (
          <div className="mb-6" />
        )}

        {/* Form */}
        <form
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
          className="surface-elevated rounded-lg shadow-lg p-6 space-y-5"
        >
          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                required
                minLength={3}
                className="w-full pl-10 pr-4 py-2 border border-default rounded-lg bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-muted"
              />
            </div>
          </div>

          {/* Email (register only) */}
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email <span className="text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2 border border-default rounded-lg bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-muted"
                />
              </div>
            </div>
          )}

          {/* Invite code (register + invite mode only) */}
          {mode === 'register' && registrationMode === 'invite' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Invite Code
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Enter your invite code"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-default rounded-lg bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-muted"
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={mode === 'register' ? 8 : 1}
                className="w-full pl-10 pr-12 py-2 border border-default rounded-lg bg-[rgb(var(--bg-elevated))] text-[rgb(var(--text-primary))] focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {mode === 'register' && (
              <p className="mt-1 text-xs text-gray-500">At least 8 characters</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
