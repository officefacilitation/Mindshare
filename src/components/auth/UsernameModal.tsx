import React, { useState } from 'react';
import { AtSign, Check, Loader2, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface UsernameModalProps {
  isOpen: boolean;
  currentName?: string;
  onSaveUsername: (username: string, fullName?: string) => Promise<{ error?: string; success?: boolean }>;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({
  isOpen,
  currentName = '',
  onSaveUsername,
}) => {
  const [handle, setHandle] = useState('');
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cleanHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanHandle || cleanHandle.length < 2) {
      setError('Handle must be at least 2 characters (letters, numbers, underscores).');
      return;
    }
    if (cleanHandle.length > 24) {
      setError('Handle cannot exceed 24 characters.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    const res = await onSaveUsername(cleanHandle, name.trim());
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title="Welcome to Mindshare"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-primary-light/30 rounded-xl hairline-border text-xs text-ink-muted">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            Choose your personal team handle. Teammates will use <strong>@{cleanHandle || 'yourname'}</strong> to tag and share thoughts with you.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
            Your Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Connor"
            className="w-full px-3 py-2 text-sm rounded-lg hairline-border bg-canvas text-ink placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1.5">
            Team Handle (@username) *
          </label>
          <div className="relative">
            <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
            <input
              type="text"
              required
              autoFocus
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setError('');
              }}
              placeholder="e.g. sarah"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg hairline-border bg-canvas text-ink font-mono placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <p className="text-[11px] text-ink-subtle mt-1">
            Lowercase letters, numbers, and underscores only.
          </p>
        </div>

        {error && (
          <p className="text-xs text-status-error font-medium">{error}</p>
        )}

        <button
          type="submit"
          disabled={!cleanHandle || isSubmitting}
          className="w-full mt-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.99] rounded-lg shadow-subtle transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" /> Claim Handle & Enter Workspace
            </>
          )}
        </button>
      </form>
    </Modal>
  );
};
