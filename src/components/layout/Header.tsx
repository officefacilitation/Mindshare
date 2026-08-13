import React from 'react';
import { Brain, Menu, LogOut } from 'lucide-react';

interface HeaderProps {
  noteCount: number;
  tagCount: number;
  contactCount: number;
  onToggleMobileSidebar: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  noteCount,
  tagCount,
  contactCount,
  onToggleMobileSidebar,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md hairline-b px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="lg:hidden p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-subtle">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-ink flex items-center gap-2">
                Mindshare
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-light text-primary uppercase tracking-wider">
                  v1.1
                </span>
              </h1>
              <p className="text-xs text-ink-muted hidden sm:block">
                Instant Thought Capture & Precision Search
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-canvas hover:bg-hairline/50 rounded-lg hairline-border transition-all active-press"
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
