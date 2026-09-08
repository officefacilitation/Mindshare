import React, { useState } from 'react';
import { Brain, Lock, Mail, User as UserIcon, Eye, EyeOff, Loader2, ArrowRight, ArrowLeft, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';

interface LoginProps {
  onSuccess: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'confirm_email';

function formatAuthError(err: string): string {
  if (!err) return '';
  const lower = err.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect password or email. If you do not have an account yet, please click "Create an account" below, or reset your password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email has not been confirmed yet. Please check your inbox for the activation link.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'An account with this email already exists. Please sign in instead, or click "Forgot password?".';
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters long.';
  }
  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (lower.includes('valid email')) {
    return 'Please enter a valid email address.';
  }
  return err;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError('');
    const res = await api.signInWithGoogle();
    if (res.error) {
      if (
        res.error.includes('provider is not enabled') ||
        res.error.includes('validation_failed') ||
        res.error.includes('Unsupported provider')
      ) {
        setError(
          'Google login is not enabled in your Supabase project yet. You can sign in or register with Email/Password below right now, or enable Google in your Supabase Dashboard.'
        );
      } else {
        setError(formatAuthError(res.error));
      }
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    setInfoMessage('');

    if (mode === 'signup') {
      if (!password) {
        setIsSubmitting(false);
        return;
      }
      const res = await api.signUpWithPassword(email, password, fullName);
      setIsSubmitting(false);

      if (res.error) {
        setError(formatAuthError(res.error));
      } else if (res.session) {
        // Immediate login if email confirmation is disabled in Supabase
        onSuccess();
      } else {
        // Email confirmation enabled: stay in confirmation screen!
        setMode('confirm_email');
      }
    } else if (mode === 'signin') {
      if (!password) {
        setIsSubmitting(false);
        return;
      }
      const res = await api.signInWithPassword(email, password);
      setIsSubmitting(false);

      if (res.error) {
        setError(formatAuthError(res.error));
      } else {
        onSuccess();
      }
    } else if (mode === 'forgot_password') {
      const res = await api.resetPasswordForEmail(email);
      setIsSubmitting(false);

      if (res.error) {
        setError(formatAuthError(res.error));
      } else {
        setInfoMessage(`Password reset link sent to ${email.trim()}. Please check your inbox.`);
      }
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim() || isResending) return;
    setIsResending(true);
    setError('');
    setInfoMessage('');

    const res = await api.resendConfirmationEmail(email);
    setIsResending(false);

    if (res.error) {
      setError(formatAuthError(res.error));
    } else {
      setInfoMessage('A fresh confirmation link has been sent to your email!');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas text-ink font-sans px-4 py-8 select-none">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-subtle mb-3.5 transition-transform hover:scale-105">
            <Brain className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Mindshare</h1>
          <p className="text-xs text-ink-muted mt-1 max-w-[260px] leading-relaxed">
            Private internal thought space with team mentions and smart tagging
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-surface rounded-2xl hairline-border shadow-subtle p-6 sm:p-7">
          {/* VIEW: Confirm Email Screen */}
          {mode === 'confirm_email' ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-primary-light flex items-center justify-center mx-auto text-primary shadow-subtle">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Confirm Your Email</h2>
                <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                  We have sent an activation link to:
                </p>
                <div className="mt-2 py-1 px-3 bg-canvas rounded-lg hairline-border text-xs font-mono font-semibold text-primary inline-block max-w-full truncate">
                  {email}
                </div>
                <p className="text-xs text-ink-muted mt-2 leading-relaxed">
                  Please click the link in your email to activate your account, then sign in below.
                </p>
              </div>

              {infoMessage && (
                <div className="flex items-center justify-center gap-1.5 p-2.5 bg-status-success/10 text-status-success rounded-xl text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{infoMessage}</span>
                </div>
              )}

              {error && (
                <p className="text-xs text-status-error font-medium">{error}</p>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                    setInfoMessage('');
                  }}
                  className="w-full py-2.5 min-h-[42px] px-4 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] rounded-xl shadow-subtle transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Go to Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={isResending}
                  className="w-full py-2 px-3 text-xs font-semibold text-ink-muted hover:text-ink active:scale-[0.98] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isResending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Resend Confirmation Email</span>
                </button>
              </div>
            </div>
          ) : mode === 'forgot_password' ? (
            /* VIEW: Forgot / Reset Password */
            <div className="space-y-4 animate-fade-in">
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold text-ink">Reset Password</h2>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Enter your work email address and we will send you a password reset link.
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-ink uppercase tracking-wider mb-1">
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@company.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2.5 text-base sm:text-xs rounded-xl hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-status-error font-medium pt-1">{error}</p>
                )}

                {infoMessage && (
                  <div className="flex items-center gap-1.5 p-2.5 bg-status-success/10 text-status-success rounded-xl text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{infoMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="mt-2 w-full py-2.5 min-h-[42px] px-4 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] rounded-xl shadow-subtle transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>
              </form>

              <div className="pt-3 hairline-t text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                    setInfoMessage('');
                  }}
                  className="text-xs text-ink-muted hover:text-ink font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </button>
              </div>
            </div>
          ) : (
            /* VIEW: Sign In or Sign Up Form */
            <>
              {/* Google One-Click Button */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl hairline-border bg-canvas hover:bg-hairline/30 active:scale-[0.99] text-xs font-semibold text-ink flex items-center justify-center gap-2.5 transition-all shadow-subtle cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full hairline-t" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-semibold text-ink-subtle">
                  <span className="bg-surface px-2">or email</span>
                </div>
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-ink uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Sarah Connor"
                        className="w-full pl-9 pr-3 py-2.5 text-base sm:text-xs rounded-xl hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-ink uppercase tracking-wider mb-1">
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@company.com"
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2.5 text-base sm:text-xs rounded-xl hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-ink uppercase tracking-wider">
                      Password
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot_password');
                          setError('');
                          setInfoMessage('');
                        }}
                        className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full pl-9 pr-10 py-2.5 text-base sm:text-xs rounded-xl hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-subtle hover:text-ink rounded-lg cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-status-error font-medium pt-1 leading-relaxed">{error}</p>
                )}

                {infoMessage && (
                  <p className="text-xs text-primary font-medium pt-1 leading-relaxed">{infoMessage}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim() || !password}
                  className="mt-2 w-full py-2.5 min-h-[42px] px-4 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] rounded-xl shadow-subtle transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle Sign Up / Sign In */}
              <div className="mt-4 pt-3.5 hairline-t text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'signin' : 'signup');
                    setError('');
                    setInfoMessage('');
                  }}
                  className="text-xs text-ink-muted hover:text-primary transition-colors font-medium cursor-pointer"
                >
                  {mode === 'signup' ? (
                    <span>Already have an account? <strong>Sign In</strong></span>
                  ) : (
                    <span>New to the team? <strong>Create an account</strong></span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Security & Free Tier Notice */}
        <p className="text-center text-[11px] text-ink-subtle mt-4">
          Strictly private data • No unauthorized tag sharing
        </p>
      </div>
    </div>
  );
};

export default Login;
