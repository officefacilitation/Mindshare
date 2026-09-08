import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note, ToastMessage, User, Tag } from './lib/types';
import {
  getNotes,
  getTags,
  getTeammates,
  getMentionsCount,
  getMyNotesCount,
  getUntaggedCount,
  getIsFeedLoading,
  getHasUnreadMentions,
  markMentionsAsRead,
  createNote,
  deleteNote,
  updateNote,
  subscribeToStorage,
  syncFromServer,
  switchFeed,
} from './lib/storage';
import { api } from './lib/api';
import { supabase } from './lib/supabase';
import { parseSearchQuery, filterNotes } from './lib/search';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DetailPanel } from './components/layout/DetailPanel';
import { InputBox } from './components/feed/InputBox';
import { FeedList } from './components/feed/FeedList';
import { ToastContainer } from './components/ui/Toast';
import { Login } from './components/auth/Login';
import { UsernameModal } from './components/auth/UsernameModal';
import { GuideModal } from './components/ui/GuideModal';
import { Inbox, Bell, Sparkles } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);

  const [notes, setNotes] = useState<Note[]>(() => getNotes());
  const [tags, setTags] = useState<Tag[]>(() => getTags());
  const [teammates, setTeammates] = useState<User[]>(() => getTeammates());
  const [mentionsCount, setMentionsCount] = useState<number>(() => getMentionsCount());
  const [myNotesCount, setMyNotesCount] = useState<number>(() => getMyNotesCount());
  const [untaggedCount, setUntaggedCount] = useState<number>(() => getUntaggedCount());
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(() => getIsFeedLoading());
  const [hasUnreadMentions, setHasUnreadMentions] = useState<boolean>(() => getHasUnreadMentions());

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOperator, setSearchOperator] = useState<'AND' | 'OR'>('AND');
  const [activeFilter, setActiveFilter] = useState<{
    type: 'all' | 'tagged_me' | 'untagged' | 'tag' | 'mention';
    value?: string;
  }>({ type: 'all' });

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Full Refresh handler
  const refresh = useCallback(async (feedType?: 'all' | 'tagged_me' | 'untagged') => {
    const feed = feedType || (activeFilter.type === 'tagged_me' ? 'tagged_me' : 'all');
    await syncFromServer(feed);
    setNotes(getNotes());
    setTags(getTags());
    setTeammates(getTeammates());
    setMentionsCount(getMentionsCount());
    setMyNotesCount(getMyNotesCount());
    setUntaggedCount(getUntaggedCount());
    setIsFeedLoading(getIsFeedLoading());
  }, [activeFilter.type]);

  // Load User Profile
  const loadProfile = useCallback(async () => {
    const res = await api.getMe();
    if (res.user) {
      setCurrentUser(res.user);
      setHasUnreadMentions(getHasUnreadMentions());
      // Prompt user to choose their handle if:
      // 1) is_handle_set is explicitly false (newly created account from Google/Email)
      // 2) OR user has no username set
      if (res.user.is_handle_set === false || !res.user.username || res.user.username.trim() === '') {
        setIsUsernameModalOpen(true);
      }
    }
  }, []);

  // Monitor Supabase Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthed(true);
        loadProfile();
        refresh();
      } else {
        setIsAuthed(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setIsAuthed(true);
        loadProfile();
        refresh();
      } else {
        setIsAuthed(false);
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile, refresh]);

  // Reactive state from local storage engine
  useEffect(() => {
    const unsubscribe = subscribeToStorage(() => {
      const updatedNotes = getNotes();
      setNotes(updatedNotes);
      setTags(getTags());
      setTeammates(getTeammates());
      setMentionsCount(getMentionsCount());
      setMyNotesCount(getMyNotesCount());
      setUntaggedCount(getUntaggedCount());
      setIsFeedLoading(getIsFeedLoading());
      setHasUnreadMentions(getHasUnreadMentions());

      if (selectedNote) {
        const found = updatedNotes.find((n) => n.id === selectedNote.id);
        setSelectedNote(found || null);
      }
    });
    return () => unsubscribe();
  }, [selectedNote, currentUser?.id]);

  // Periodic poll & focus re-sync (every 15 seconds)
  useEffect(() => {
    if (!isAuthed) return;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => refresh(), 15000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isAuthed, refresh]);

  const handleLogout = async () => {
    await api.signOut();
    setIsAuthed(false);
    setCurrentUser(null);
    setSelectedNote(null);
  };

  const handleSaveUsername = async (username: string, fullName?: string) => {
    const res = await api.updateProfile({ username, fullName });
    if (res.user) {
      setCurrentUser(res.user);
      setIsUsernameModalOpen(false);
      addToast(`Profile updated (@${res.user.username})`, 'success');
      await refresh();
      return { success: true };
    }
    return { error: res.error || 'Failed to update username' };
  };

  const handleSaveNote = async (content: string, manualTags?: string[]) => {
    return createNote(content, manualTags);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
    addToast('Thought deleted.', 'info');
  };

  const handleUpdateNote = (id: string, newContent: string, manualTags?: string[]) => {
    return updateNote(id, newContent, manualTags);
  };

  const handleSelectFilter = (
    type: 'all' | 'tagged_me' | 'untagged' | 'tag' | 'mention',
    value?: string
  ) => {
    setActiveFilter({ type, value });
    setSearchQuery('');
    setIsMobileSidebarOpen(false);

    // Instant 0ms feed switch from local RAM cache
    if (type === 'tagged_me') {
      switchFeed('tagged_me');
      setHasUnreadMentions(false);
    } else {
      switchFeed('all');
    }
  };

  const handleTagClickFromCard = (tagName: string) => {
    setSearchQuery(`#${tagName}`);
    setActiveFilter({ type: 'all' });
  };

  const handleMentionClickFromCard = (username: string) => {
    setSearchQuery(`@${username}`);
    setActiveFilter({ type: 'all' });
  };

  // Filter notes based on active filter, boolean search query & operator
  const filteredNotes = useMemo(() => {
    let result = [...notes];

    if (activeFilter.type === 'untagged') {
      result = result.filter((n) => !n.tags || n.tags.length === 0);
    } else if (activeFilter.type === 'tag' && activeFilter.value) {
      const valLower = activeFilter.value.toLowerCase();
      result = result.filter((n) =>
        (n.tags || []).some((t) => t.name.toLowerCase() === valLower)
      );
    } else if (activeFilter.type === 'mention' && activeFilter.value) {
      const valLower = activeFilter.value.toLowerCase();
      result = result.filter((n) =>
        (n.mentions || []).some((m) => m.username.toLowerCase() === valLower)
      );
    }

    if (searchQuery.trim()) {
      const parsedSearch = parseSearchQuery(searchQuery);
      // Respect UI operator unless user typed explicit boolean operators in the query
      if (!/\b(AND|OR)\b/i.test(searchQuery)) {
        parsedSearch.operator = searchOperator;
      }
      result = filterNotes(result, parsedSearch);
    }

    return result;
  }, [notes, activeFilter, searchQuery, searchOperator]);

  const activeFilterTitle = useMemo(() => {
    if (searchQuery.trim()) return `Search: "${searchQuery}" (${searchOperator})`;
    if (activeFilter.type === 'tagged_me') return 'Thoughts where you were tagged';
    if (activeFilter.type === 'untagged') return 'Untagged thoughts';
    if (activeFilter.type === 'tag') return `#${activeFilter.value}`;
    if (activeFilter.type === 'mention') return `@${activeFilter.value}`;
    return undefined;
  }, [searchQuery, activeFilter, searchOperator]);

  if (isAuthed === false) {
    return <Login onSuccess={() => { setIsAuthed(true); loadProfile(); refresh(); }} />;
  }

  if (isAuthed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink font-sans select-none">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-ink-muted">Initializing Mindshare...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
      <Header
        currentUser={currentUser}
        noteCount={myNotesCount}
        tagCount={tags.length}
        teamCount={teammates.length}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onLogout={handleLogout}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenEditProfile={() => setIsUsernameModalOpen(true)}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto flex items-start">
        {/* Left Sidebar (240px) */}
        <Sidebar
          tags={tags}
          teammates={teammates}
          currentUser={currentUser}
          activeFilter={activeFilter}
          searchQuery={searchQuery}
          searchOperator={searchOperator}
          hasUnreadMentions={hasUnreadMentions}
          onSearchChange={setSearchQuery}
          onOperatorChange={setSearchOperator}
          onSelectFilter={handleSelectFilter}
          onOpenEditProfile={() => setIsUsernameModalOpen(true)}
          mentionsCount={mentionsCount}
          allNotesCount={myNotesCount}
          untaggedCount={untaggedCount}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Center Main Feed (600px max) */}
        <main className="flex-1 min-w-0 px-3.5 sm:px-6 py-4 sm:py-6 max-w-2xl mx-auto">
          {/* Mobile Quick Feed Switcher Tabs (Visible only on mobile/tablet < lg) */}
          <div className="lg:hidden mb-4 grid grid-cols-3 gap-1.5 p-1 bg-surface rounded-2xl hairline-border shadow-subtle select-none">
            <button
              type="button"
              onClick={() => handleSelectFilter('all')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer ${
                activeFilter.type === 'all' && !searchQuery
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">My ({myNotesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter('tagged_me')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer relative ${
                activeFilter.type === 'tagged_me'
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Tagged</span>
              {mentionsCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none shrink-0 ${
                    activeFilter.type === 'tagged_me'
                      ? 'bg-white text-primary'
                      : hasUnreadMentions
                      ? 'bg-primary text-white animate-pulse'
                      : 'bg-canvas text-ink-muted hairline-border'
                  }`}
                >
                  {mentionsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter('untagged')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer ${
                activeFilter.type === 'untagged'
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Untagged ({untaggedCount})</span>
            </button>
          </div>

          {activeFilter.type !== 'tagged_me' && (
            <InputBox
              onSaveNote={handleSaveNote}
              allTags={tags}
              allTeammates={teammates}
              onAddToast={addToast}
            />
          )}

          <FeedList
            notes={filteredNotes}
            currentUserId={currentUser?.id}
            selectedNoteId={selectedNote?.id}
            isLoading={isFeedLoading}
            onSelectNote={setSelectedNote}
            onDeleteNote={handleDeleteNote}
            onTagClick={handleTagClickFromCard}
            onMentionClick={handleMentionClickFromCard}
            activeFilterTitle={activeFilterTitle}
            onClearFilter={() => {
              setSearchQuery('');
              setActiveFilter({ type: 'all' });
              switchFeed('all');
            }}
          />
        </main>

        {/* Right Inspector Detail Panel (280px) */}
        <DetailPanel
          note={selectedNote}
          currentUserId={currentUser?.id}
          onClose={() => setSelectedNote(null)}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={handleUpdateNote}
          teammates={teammates}
          onAddToast={addToast}
        />
      </div>

      {/* Onboarding & Edit Handle Modal */}
      <UsernameModal
        isOpen={isUsernameModalOpen}
        currentUserId={currentUser?.id}
        currentName={currentUser?.full_name || ''}
        currentUsername={currentUser?.username || ''}
        isInitialSetup={currentUser?.is_handle_set === false}
        teammates={teammates}
        onClose={() => setIsUsernameModalOpen(false)}
        onSaveUsername={handleSaveUsername}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}

export default App;
