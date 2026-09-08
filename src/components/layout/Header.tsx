import React from 'react';
import { Brain, Menu, LogOut, HelpCircle, User as UserIcon } from 'lucide-react';
import { User } from '../../lib/types';

interface HeaderProps {
  currentUser: User | null;
  noteCount: number;
  tagCount: number;
  teamCount: number;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
  onOpenGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  noteCount,
  tagCount,
  teamCount,
  onToggleMobileSidebar,
  onLogout,
  onOpenGuide,
}) => {
  const initials = (currentUser?.full_name || currentUser?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

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

          {/* Current User Badge */}
          {currentUser && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-canvas hairline-border text-xs">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.username || 'User'}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                  {initials}
                </div>
              )}
              <span className="font-mono text-primary font-semibold hidden sm:inline">
                @{currentUser.username || 'user'}
              </span>
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
