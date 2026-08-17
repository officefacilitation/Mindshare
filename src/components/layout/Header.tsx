import React from 'react';
import { Brain, Menu, LogOut, HelpCircle } from 'lucide-react';

interface HeaderProps {
  noteCount: number;
  tagCount: number;
  contactCount: number;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
  onOpenGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  noteCount,
  tagCount,
  contactCount,
  onToggleMobileSidebar,
  onLogout,
  onOpenGuide,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md hairline-b px-3 sm:px-6 py-2.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white shadow-subtle shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-ink">
              Mindshare
            </h1>
          </div>
        </div>

        {/* Stats & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-3 text-xs text-ink-muted font-medium bg-canvas px-3 py-1.5 rounded-lg hairline-border">
            <span>
              <strong className="text-ink font-semibold">{noteCount}</strong> Thoughts
            </span>
            <span className="text-hairline">•</span>
            <span>
              <strong className="text-ink font-semibold">{tagCount}</strong> Tags
            </span>
            <span className="text-hairline">•</span>
            <span>
              <strong className="text-ink font-semibold">{contactCount}</strong> People
            </span>
          </div>

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-primary bg-primary-light/50 hover:bg-primary-light rounded-lg hairline-border transition-all active-press"
            title="User Guide & Help"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-canvas hover:bg-hairline/50 rounded-lg hairline-border transition-all active-press"
            title="Lock Mindshare"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        </div>
      </div>
    </header>
  );
};
