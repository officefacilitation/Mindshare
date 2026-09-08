import React, { useState } from 'react';
import { Brain, Menu, LogOut, HelpCircle, Copy, Check, Edit3, X, ShieldCheck } from 'lucide-react';
import { User } from '../../lib/types';

interface HeaderProps {
  currentUser: User | null;
  noteCount: number;
  tagCount: number;
  teamCount: number;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
  onOpenGuide: () => void;
  onOpenEditProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  noteCount,
  tagCount,
  teamCount,
  onToggleMobileSidebar,
  onLogout,
  onOpenGuide,
  onOpenEditProfile,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [hasCopiedId, setHasCopiedId] = useState(false);

  const initials = (currentUser?.full_name || currentUser?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleCopyUserId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser?.id) {
      navigator.clipboard.writeText(currentUser.id);
      setHasCopiedId(true);
      setTimeout(() => setHasCopiedId(false), 2000);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md hairline-b px-3 sm:px-6 py-2.5 transition-colors select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors cursor-pointer"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white shadow-subtle shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-ink leading-none">
                Mindshare
              </h1>
              <span className="text-[10px] text-ink-subtle font-medium hidden sm:inline">
                Internal Team Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Stats & Current User Account */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-3 text-xs text-ink-muted font-medium bg-canvas px-3 py-1.5 rounded-xl hairline-border">
            <span>
              <strong className="text-ink font-semibold">{noteCount}</strong> Thoughts
            </span>
            <span className="text-hairline">•</span>
            <span>
              <strong className="text-ink font-semibold">{tagCount}</strong> Private Tags
            </span>
            <span className="text-hairline">•</span>
            <span>
              <strong className="text-ink font-semibold">{teamCount}</strong> Teammates
            </span>
          </div>

          {/* Current User Badge (Clickable for full profile & ID card) */}
          {currentUser && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-canvas hover:bg-primary-light/40 hairline-border text-xs transition-colors cursor-pointer"
                title="View your Profile & ID"
              >
                {currentUser.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.username || 'User'}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                    {initials}
                  </div>
                )}
                <span className="font-mono text-primary font-semibold hidden sm:inline">
                  @{currentUser.username || 'set_username'}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" title="Online" />
              </button>

              {/* Profile Details Popover Card */}
              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 z-50 w-72 bg-surface rounded-2xl hairline-border shadow-modal p-4 animate-slide-up text-ink">
                    <div className="flex items-start justify-between pb-3 hairline-b">
                      <div className="flex items-center gap-2.5">
                        {currentUser.avatar_url ? (
                          <img
                            src={currentUser.avatar_url}
                            alt="avatar"
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-ink truncate">
                            {currentUser.full_name || 'Team Member'}
                          </p>
                          <p className="font-mono text-xs text-primary font-bold">
                            @{currentUser.username || 'none'}
                          </p>
                          <p className="text-[10px] text-ink-subtle truncate">
                            {currentUser.email}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsProfileOpen(false)}
                        className="p-1 text-ink-subtle hover:text-ink cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* User ID Section */}
                    <div className="py-2.5 hairline-b text-xs space-y-1">
                      <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider block">
                        Account User ID:
                      </span>
                      <div className="flex items-center justify-between p-1.5 bg-canvas rounded-lg hairline-border">
                        <code className="text-[10px] font-mono text-ink-muted truncate max-w-[180px]">
                          {currentUser.id}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyUserId}
                          className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline cursor-pointer shrink-0"
                        >
                          {hasCopiedId ? (
                            <>
                              <Check className="w-3 h-3 text-status-success" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2.5 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onOpenEditProfile();
                        }}
                        className="w-full py-1.5 px-3 text-xs font-semibold text-primary bg-primary-light/50 hover:bg-primary-light rounded-xl hairline-border flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Profile & Handle
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileOpen(false);
                          onLogout();
                        }}
                        className="w-full py-1.5 px-3 text-xs font-semibold text-status-error hover:bg-status-error/10 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-canvas hover:bg-hairline/40 rounded-xl hairline-border transition-all cursor-pointer"
            title="User Guide & Help"
          >
            <HelpCircle className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-status-error bg-canvas hover:bg-hairline/40 rounded-xl hairline-border transition-all cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
