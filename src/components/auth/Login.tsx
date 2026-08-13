import React, { useState } from 'react';
import { Brain, Lock, LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => Promise<{ token?: string; error?: string }>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    const res = await onLogin(password.trim());
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas text-ink font-sans px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-subtle mb-4">
            <Brain className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Mindshare</h1>
          <p className="text-sm text-ink-muted mt-1">Your private thought space</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-xl hairline-border shadow-subtle p-6"
        >
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
            Enter password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-status-error font-medium mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password.trim() || isSubmitting}
            className="mt-4 w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-subtle transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span>Unlocking...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Unlock Mindshare
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
