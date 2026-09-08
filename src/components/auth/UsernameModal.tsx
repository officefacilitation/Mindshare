import React, { useState, useEffect } from 'react';
import { AtSign, Check, Loader2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { User } from '../../lib/types';

interface UsernameModalProps {
  isOpen: boolean;
  currentUserId?: string;
  currentName?: string;
  currentUsername?: string;
  teammates?: User[];
  onClose: () => void;
  onSaveUsername: (username: string, fullName?: string) => Promise<{ error?: string; success?: boolean }>;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({
  isOpen,
  currentUserId,
  currentName = '',
  currentUsername = '',
  teammates = [],
  onClose,
  onSaveUsername,
}) => {
  const [handle, setHandle] = useState(currentUsername);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state whenever the modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setHandle(currentUsername || '');
      setName(currentName || '');
      setError('');
    }
  }, [isOpen, currentUsername, currentName]);

  const isEditing = Boolean(currentUsername && currentUsername.trim().length > 0);
  const cleanHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, '');

  // Check if handle is taken by any other teammate in workspace
  const isTakenLocally =
    Boolean(cleanHandle) &&
    cleanHandle !== (currentUsername || '').toLowerCase() &&
    teammates.some(
      (t) => t.id !== currentUserId && (t.username || '').toLowerCase() === cleanHandle
    );

  const isValidFormat = cleanHandle.length >= 2 && cleanHandle.length <= 24;
  const isAvailable = isValidFormat && !isTakenLocally;

  const handleInputChange = (val: string) => {
    // Sanitize in real-time: lowercase, no spaces, only a-z, 0-9, and _
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(sanitized);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidFormat) {
      setError('Handle must be between 2 and 24 characters (letters, numbers, underscores).');
      return;
    }

    if (isTakenLocally) {
      setError(`@${cleanHandle} is already taken by a teammate. Please choose a different handle.`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    const res = await onSaveUsername(cleanHandle, name.trim());
    setIsSubmitting(false);

    if (res.error) {
      setError(res.error);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Profile & Handle' : 'Welcome to Mindshare'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-primary-light/30 rounded-xl hairline-border text-xs text-ink-muted">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>
            {isEditing ? (
              <>
                Update your name or team handle. Your team tags you using{' '}
                <strong className="text-ink">@{cleanHandle || 'username'}</strong>.
              </>
            ) : (
              <>
                Choose your personal team handle. Teammates will use{' '}
                <strong className="text-ink">@{cleanHandle || 'yourname'}</strong> to tag and share thoughts with you.
              </>
            )}
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
              Team Handle (@username) *
            </label>
            {cleanHandle.length >= 2 && (
              <span className="text-[11px] font-medium flex items-center gap-1">
                {isTakenLocally ? (
                  <span className="text-status-error flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" /> Taken
                  </span>
                ) : (
                  <span className="text-status-success flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Available
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="relative">
            <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
            <input
              type="text"
              required
              autoFocus
              value={handle}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="e.g. sarah"
              className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg hairline-border bg-canvas text-ink font-mono placeholder:text-ink-subtle focus:outline-none transition-colors ${
                isTakenLocally
                  ? 'border-status-error focus:border-status-error'
                  : 'focus:border-primary'
              }`}
            />
          </div>
          <p className="text-[11px] text-ink-subtle mt-1">
            Lowercase letters, numbers, and underscores only. No spaces.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 p-2 bg-status-error/10 text-status-error rounded-lg text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 hairline-t">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-ink-muted hover:text-ink hover:bg-canvas rounded-lg hairline-border transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValidFormat || isTakenLocally || isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.99] rounded-lg shadow-subtle transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {isEditing ? 'Save Changes' : 'Claim Handle & Enter'}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
