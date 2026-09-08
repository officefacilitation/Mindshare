import React from 'react';
import { Tag, User } from '../../lib/types';
import {
  Search,
  Inbox,
  Bell,
  Sparkles,
  Hash,
  AtSign,
  Users,
  X,
  Edit3,
} from 'lucide-react';

interface SidebarProps {
  tags: Tag[];
  teammates: User[];
  currentUser?: User | null;
  activeFilter: {
    type: 'all' | 'tagged_me' | 'untagged' | 'tag' | 'mention';
    value?: string;
  };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectFilter: (type: 'all' | 'tagged_me' | 'untagged' | 'tag' | 'mention', value?: string) => void;
  onOpenEditProfile?: () => void;
  mentionsCount: number;
  allNotesCount: number;
  untaggedCount: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tags,
  teammates,
  currentUser,
  activeFilter,
  searchQuery,
  onSearchChange,
  onSelectFilter,
  onOpenEditProfile,
  mentionsCount,
  allNotesCount,
  untaggedCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  // Separate current user from other colleagues in the directory
  const currentUserId = currentUser?.id;
  const otherTeammates = teammates.filter((u) => u.id !== currentUserId);

  const sidebarContent = (
    <div className="flex flex-col h-full py-4 px-3 select-none">
      {/* Mobile Drawer Header */}
      {isOpenMobile && (
        <div className="flex items-center justify-between pb-3 mb-2 hairline-b lg:hidden">
          <span className="font-semibold text-xs uppercase tracking-wider text-ink">Navigation</span>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-hairline/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Search Bar */}
      <div className="relative mb-4">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search thoughts, #tags, @people..."
          className="w-full pl-8 pr-7 py-2 text-xs rounded-xl bg-surface text-ink hairline-border placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-all shadow-subtle"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs cursor-pointer"
          >
            ×
          </button>
        )}
      </div>

      {/* Scrollable Navigation Sections */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* Inbox Section */}
        <div>
          <h3 className="px-2 text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-1.5">
            Inbox
          </h3>
          <nav className="space-y-0.5">
            {/* My Thoughts */}
            <button
              onClick={() => onSelectFilter('all')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter.type === 'all' && !searchQuery
                  ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <Inbox className="w-3.5 h-3.5" /> My Thoughts
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">
                {allNotesCount}
              </span>
            </button>

            {/* Tagged Me Feed */}
            <button
              onClick={() => onSelectFilter('tagged_me')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter.type === 'tagged_me'
                  ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <Bell className={`w-3.5 h-3.5 ${mentionsCount > 0 ? 'text-primary' : ''}`} />
                <span>Tagged Me</span>
              </span>
              {mentionsCount > 0 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white font-bold animate-pulse">
                  {mentionsCount}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">
                  0
                </span>
              )}
            </button>

            {/* Untagged */}
            <button
              onClick={() => onSelectFilter('untagged')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                activeFilter.type === 'untagged'
                  ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary/70" /> Untagged
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">
                {untaggedCount}
              </span>
            </button>
          </nav>
        </div>

        {/* Private Tags Section */}
        <div>
          <div className="px-2 flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
              <Hash className="w-3 h-3 text-primary" /> My Private Tags
            </h3>
            <span className="text-[10px] text-ink-subtle">{tags.length}</span>
          </div>

          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            {tags.length === 0 ? (
              <p className="px-2 text-xs text-ink-subtle italic py-1">No tags yet. Type #tag in note.</p>
            ) : (
              tags.map((t) => {
                const isActive = activeFilter.type === 'tag' && activeFilter.value === t.name;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectFilter('tag', t.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                        : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Hash className="w-3 h-3 text-primary/70 shrink-0" />
                      <span className="truncate">{t.name}</span>
                    </span>
                    {t.count !== undefined && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted shrink-0">
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Teammates Directory Section */}
        <div>
          <div className="px-2 flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3 text-mention-text" /> Team Directory ({teammates.length})
            </h3>
          </div>

          {/* Current User Card (You) */}
          {currentUser && (
            <div className="mb-2 p-2 rounded-xl bg-primary-light/40 hairline-border border-primary/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(currentUser.full_name || currentUser.username || 'Y')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs font-bold text-primary truncate">
                        @{currentUser.username || 'user'}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 bg-primary text-white rounded-full font-bold">
                        YOU
                      </span>
                    </div>
                    <p className="text-[10px] text-ink-subtle truncate max-w-[130px]">
                      {currentUser.email}
                    </p>
                  </div>
                </div>
                {onOpenEditProfile && (
                  <button
                    type="button"
                    onClick={onOpenEditProfile}
                    className="p-1 text-primary hover:bg-surface rounded-md transition-colors cursor-pointer"
                    title="Edit your username handle"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Other Teammates in the Workspace */}
          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            {otherTeammates.length === 0 ? (
              <p className="px-2 text-xs text-ink-subtle italic py-1">
                No other teammates yet. Invite colleagues with your app link!
              </p>
            ) : (
              otherTeammates.map((u) => {
                const isActive = activeFilter.type === 'mention' && activeFilter.value === u.username;
                return (
                  <button
                    key={u.id}
                    onClick={() => onSelectFilter('mention', u.username)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-surface text-mention-text font-semibold shadow-subtle hairline-border'
                        : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.username || 'user'}
                          className="w-4 h-4 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <AtSign className="w-3 h-3 text-mention-text shrink-0" />
                      )}
                      <span className="truncate font-mono">@{u.username}</span>
                    </span>
                    <span className="text-[10px] text-ink-subtle truncate max-w-[70px]">
                      {u.full_name?.split(' ')[0] || u.email?.split('@')[0] || ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed Left) */}
      <aside className="hidden lg:block w-60 h-[calc(100vh-57px)] sticky top-[57px] bg-canvas hairline-r shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-surface shadow-modal z-10 flex flex-col">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
