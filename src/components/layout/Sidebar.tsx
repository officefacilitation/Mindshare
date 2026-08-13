import React, { useState } from 'react';
import { Tag, UserContact } from '../../lib/types';
import {
  Search,
  Inbox,
  Tag as TagIcon,
  Users,
  Plus,
  Hash,
  AtSign,
  X,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../ui/Modal';

interface SidebarProps {
  tags: Tag[];
  contacts: UserContact[];
  activeFilter: { type: 'all' | 'untagged' | 'tag' | 'mention'; value?: string };
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectFilter: (type: 'all' | 'untagged' | 'tag' | 'mention', value?: string) => void;
  onAddContact: (name: string, email: string) => Promise<{ contact?: UserContact; error?: string }>;
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  allNotesCount: number;
  untaggedCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  tags,
  contacts,
  activeFilter,
  searchQuery,
  onSearchChange,
  onSelectFilter,
  onAddContact,
  onAddToast,
  isOpenMobile,
  onCloseMobile,
  allNotesCount,
  untaggedCount,
}) => {
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    const email = emailInput.trim() || `${nameInput.toLowerCase().replace(/\s+/g, '')}@company.com`;
    const res = await onAddContact(nameInput.trim(), email);

    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Added @${res.contact?.username} to contacts!`, 'success');
      setNameInput('');
      setEmailInput('');
      setIsAddContactOpen(false);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full py-4 px-3.5 select-none">
      {/* Mobile Close Button */}
      {isOpenMobile && (
        <div className="flex items-center justify-between pb-3 mb-2 hairline-b lg:hidden">
          <span className="font-semibold text-sm text-ink">Navigation</span>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-hairline/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Search Bar */}
      <div className="relative mb-5">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search #tag, @person, logic..."
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface text-ink hairline-border placeholder:text-ink-subtle focus:outline-none focus:border-primary transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* Inbox Filters */}
        <div>
          <h3 className="px-2 text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
            Inbox
          </h3>
          <nav className="space-y-0.5">
            <button
              onClick={() => onSelectFilter('all')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter.type === 'all' && !searchQuery
                  ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Inbox className="w-3.5 h-3.5" /> All Thoughts
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted">
                {allNotesCount}
              </span>
            </button>

            <button
              onClick={() => onSelectFilter('untagged')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter.type === 'untagged'
                  ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                  : 'text-ink-muted hover:text-ink hover:bg-surface/60'
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

        {/* Tags Section */}
        <div>
          <div className="px-2 flex items-center justify-between mb-1.5">
            <h3 className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Topics & Tags
            </h3>
            <span className="text-[10px] text-ink-subtle">{tags.length}</span>
          </div>

          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            {tags.length === 0 ? (
              <p className="px-2 text-xs text-ink-subtle italic py-1">No tags created yet</p>
            ) : (
              tags.map((t) => {
                const isActive = activeFilter.type === 'tag' && activeFilter.value === t.name;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSelectFilter('tag', t.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? 'bg-surface text-primary font-semibold shadow-subtle hairline-border'
                        : 'text-ink-muted hover:text-ink hover:bg-surface/60'
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

        {/* Contacts / People Section */}
        <div>
          <div className="px-2 flex items-center justify-between mb-1.5">
            <h3 className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3 h-3" /> People & Contacts
            </h3>
            <button
              onClick={() => setIsAddContactOpen(true)}
              className="p-1 rounded text-primary hover:bg-primary-light transition-colors"
              title="Add Contact"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            {contacts.map((c) => {
              const isActive = activeFilter.type === 'mention' && activeFilter.value === c.username;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectFilter('mention', c.username)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? 'bg-surface text-mention-text font-semibold shadow-subtle hairline-border'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/60'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt={c.display_name}
                        className="w-4 h-4 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <AtSign className="w-3 h-3 text-mention-text shrink-0" />
                    )}
                    <span className="truncate">@{c.username}</span>
                  </span>
                  <span className="text-[10px] text-ink-subtle truncate max-w-[70px]">
                    {c.display_name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        title="Add New Contact"
      >
        <form onSubmit={handleCreateContact} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
              Display Name *
            </label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Sarah Connor"
              className="w-full px-3 py-2 text-sm rounded-lg hairline-border bg-canvas text-ink focus:outline-none focus:border-primary"
            />
            {nameInput.trim() && (
              <p className="text-xs text-primary mt-1 font-mono">
                Will create mention handle: @{nameInput.toLowerCase().replace(/[^a-z0-9]/g, '')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider mb-1">
              Email Address (Optional)
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="sarah@company.com"
              className="w-full px-3 py-2 text-sm rounded-lg hairline-border bg-canvas text-ink focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddContactOpen(false)}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors"
            >
              Save Contact
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-60 h-[calc(100vh-57px)] sticky top-[57px] bg-canvas hairline-r shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[80vw] bg-canvas h-full shadow-2xl z-50 animate-slide-right">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
