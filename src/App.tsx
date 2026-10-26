import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note, ToastMessage, User, Tag } from './lib/types';
import {
  getNotes,
  getTags,
  getTeammates,
  getMentionsCount,
  getMyNotesCount,
  getUntaggedCount,
  getRemindersCount,
  toggleCompleteNote,
  getIsFeedLoading,
  getHasUnreadMentions,
  createNote,
  deleteNote,
  deleteTag,
  updateNote,
  subscribeToStorage,
  syncFromServer,
  switchFeed,
} from './lib/storage';
import { initNotifications } from './lib/notifications';
import { exportNotesToExcel } from './lib/excelExport';
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
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Inbox, Bell, Sparkles, Clock } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);

  const [notes, setNotes] = useState<Note[]>(() => getNotes());
  const [tags, setTags] = useState<Tag[]>(() => getTags());
  const [teammates, setTeammates] = useState<User[]>(() => getTeammates());
  const [mentionsCount, setMentionsCount] = useState<number>(() => getMentionsCount());
  const [myNotesCount, setMyNotesCount] = useState<number>(() => getMyNotesCount());
  const [untaggedCount, setUntaggedCount] = useState<number>(() => getUntaggedCount());
  const [remindersCount, setRemindersCount] = useState<number>(() => getRemindersCount());
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(() => getIsFeedLoading());
  const [hasUnreadMentions, setHasUnreadMentions] = useState<boolean>(() => getHasUnreadMentions());

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOperator, setSearchOperator] = useState<'AND' | 'OR'>('AND');
  const [activeFilter, setActiveFilter] = useState<{
    type: 'all' | 'tagged_me' | 'untagged' | 'reminders' | 'tag' | 'mention';
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
    setRemindersCount(getRemindersCount());
    setIsFeedLoading(getIsFeedLoading());
  }, [activeFilter.type]);

  // Initialize Native Web Push & Service Worker on startup
  useEffect(() => {
    initNotifications();
  }, []);

  // Load User Profile
  const loadProfile = useCallback(async () => {
    // Check Supabase session metadata for Google profile picture
    const { data: { session } } = await supabase.auth.getSession();
    const meta = session?.user?.user_metadata || {};
    const sessionAvatar =
      meta.avatar_url ||
      meta.picture ||
      session?.user?.identities?.[0]?.identity_data?.avatar_url ||
      session?.user?.identities?.[0]?.identity_data?.picture ||
      null;

    const res = await api.getMe();
    if (res.user) {
      if (!res.user.avatar_url && sessionAvatar) {
        res.user.avatar_url = sessionAvatar;
        api.updateProfile({ avatarUrl: sessionAvatar }).catch(() => {});
      }
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
      setRemindersCount(getRemindersCount());
      setIsFeedLoading(getIsFeedLoading());
      setHasUnreadMentions(getHasUnreadMentions());

      if (selectedNote) {
        const allCached = [...getNotes('all'), ...getNotes('tagged_me')];
        const found = allCached.find((n) => n.id === selectedNote.id);
        if (found) {
          setSelectedNote(found);
        }
      }
    });
    return () => unsubscribe();
  }, [selectedNote, currentUser?.id]);

  // Periodic poll, focus re-sync, and visibilitychange (for mobile foreground return)
  useEffect(() => {
    if (!isAuthed) return;
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const interval = setInterval(() => refresh(), 15000);
    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
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

  const handleSaveNote = async (
    content: string,
    manualTags?: string[],
    reminderAt?: string | null,
    isCompleted?: boolean
  ) => {
    return createNote(content, manualTags, reminderAt, isCompleted);
  };

  const handleToggleCompleteNote = async (id: string, isCompleted: boolean, targetUsername?: string): Promise<boolean> => {
    const u = targetUsername || currentUser?.username;
    const ok = await toggleCompleteNote(id, isCompleted, u);
    addToast(isCompleted ? `Task completed for @${u || 'you'}! ✓` : `Task marked active for @${u || 'you'}.`, 'info');
    return ok;
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
    addToast('Thought deleted.', 'info');
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    const ok = await deleteTag(tagId);
    if (ok) {
      addToast(`Tag #${tagName} deleted.`, 'info');
      if (activeFilter.type === 'tag' && activeFilter.value?.toLowerCase() === tagName.toLowerCase()) {
        setActiveFilter({ type: 'all' });
      }
    } else {
      addToast(`Failed to delete tag #${tagName}.`, 'error');
    }
  };

  const handleExportExcel = () => {
    const userNotes = getNotes('all');
    if (!userNotes || userNotes.length === 0) {
      addToast('No thoughts to export yet. Capture a thought first!', 'info');
      return;
    }
    addToast('Generating Excel backup...', 'info');
    const success = exportNotesToExcel(userNotes, {
      userHandle: currentUser?.username,
    });
    if (success) {
      addToast(`Downloaded Excel backup (${userNotes.length} thoughts)!`, 'success');
    } else {
      addToast('Failed to generate Excel backup.', 'error');
    }
  };

  const handleSyncGoogleDrive = async () => {
    if (isSyncingDrive) return;
    setIsSyncingDrive(true);
    addToast('Syncing all team thoughts to Google Drive sheets...', 'info');
    try {
      const res = await api.syncGoogleDriveBackup();
      if (res.success) {
        addToast(res.message || 'Successfully synced all team members to Google Drive!', 'success');
      } else {
        addToast(res.message || 'Google Drive sync failed. Please check webhook configuration.', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Network error syncing to Google Drive.', 'error');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleUpdateNote = async (
    id: string,
    newContent: string,
    manualTags?: string[],
    reminderAt?: string | null,
    isCompleted?: boolean
  ) => {
    const res = await updateNote(id, newContent, manualTags, reminderAt, isCompleted);
    if (res.note && selectedNote?.id === id) {
      setSelectedNote(res.note);
    }
    return res;
  };

  const handleSelectFilter = (
    type: 'all' | 'tagged_me' | 'untagged' | 'reminders' | 'tag' | 'mention',
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
    setActiveFilter({ type: 'tag', value: tagName });
    setSearchQuery('');
  };

  const handleMentionClickFromCard = (username: string) => {
    setActiveFilter({ type: 'mention', value: username });
    setSearchQuery('');
  };

  // Filter notes based on active filter, boolean search query & operator
  const filteredNotes = useMemo(() => {
    let result: Note[] = [];

    if (activeFilter.type === 'tagged_me') {
      // Use real API response directly from tagged_me feed cache
      result = getNotes('tagged_me');
    } else if (activeFilter.type === 'reminders') {
      // Deadlines tab: all notes with reminder_at from personal and tagged notes
      const allNotes = getNotes('all');
      const taggedNotes = getNotes('tagged_me');
      const map = new Map<string, Note>();
      allNotes.forEach((n) => map.set(n.id, n));
      taggedNotes.forEach((n) => map.set(n.id, n));
      result = Array.from(map.values())
        .filter((n) => Boolean(n.reminder_at))
        .sort((a, b) => {
          if (a.is_completed !== b.is_completed) {
            return a.is_completed ? 1 : -1;
          }
          const tA = new Date(a.reminder_at!).getTime();
          const tB = new Date(b.reminder_at!).getTime();
          return tA - tB;
        });
    } else if (activeFilter.type === 'tag' || activeFilter.type === 'mention' || searchQuery.trim()) {
      // Tags, mentions, and search queries span across both personal notes and tagged notes
      const allNotes = getNotes('all');
      const taggedNotes = getNotes('tagged_me');
      const map = new Map<string, Note>();
      allNotes.forEach((n) => map.set(n.id, n));
      taggedNotes.forEach((n) => map.set(n.id, n));
      result = Array.from(map.values());
    } else {
      // "My Thoughts": Pure thoughts only (hide notes that have a deadline)
      result = notes.filter((n) => !n.reminder_at);
    }

    if (activeFilter.type === 'untagged') {
      result = result.filter((n) => !n.reminder_at && (!n.tags || n.tags.length === 0));
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
    if (activeFilter.type === 'reminders') return 'Deadlines & Tasks';
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
        onExportExcel={handleExportExcel}
        onSyncGoogleDrive={handleSyncGoogleDrive}
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
          onDeleteTag={handleDeleteTag}
          mentionsCount={mentionsCount}
          allNotesCount={myNotesCount}
          untaggedCount={untaggedCount}
          remindersCount={remindersCount}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Center Main Feed (600px max) */}
        <main className="flex-1 min-w-0 px-3.5 sm:px-6 py-4 sm:py-6 max-w-2xl mx-auto">
          {/* Mobile Quick Feed Switcher Tabs (Visible only on mobile/tablet < lg) */}
          <div className="lg:hidden mb-4 grid grid-cols-4 gap-1 p-1 bg-surface rounded-2xl hairline-border shadow-subtle select-none">
            <button
              type="button"
              onClick={() => handleSelectFilter('all')}
              className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer ${
                activeFilter.type === 'all' && !searchQuery
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">My</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter('reminders')}
              className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer ${
                activeFilter.type === 'reminders'
                  ? 'bg-rose-600 text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              <span className="truncate">Due ({remindersCount})</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectFilter('tagged_me')}
              className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer relative ${
                activeFilter.type === 'tagged_me'
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Tagged Me</span>
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
              className={`flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-xs font-medium transition-all min-h-[38px] cursor-pointer ${
                activeFilter.type === 'untagged'
                  ? 'bg-primary text-white font-semibold shadow-subtle'
                  : 'text-ink-muted hover:text-ink active:bg-hairline/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Untagged</span>
            </button>
          </div>

          {activeFilter.type === 'all' && (
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
            currentUsername={currentUser?.username}
            selectedNoteId={selectedNote?.id}
            isLoading={isFeedLoading}
            onSelectNote={setSelectedNote}
            onDeleteNote={handleDeleteNote}
            onToggleComplete={handleToggleCompleteNote}
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
        <ErrorBoundary
          fallbackTitle="Could not load Thought Inspector"
          onReset={() => setSelectedNote(null)}
        >
          <DetailPanel
            note={selectedNote}
            currentUserId={currentUser?.id}
            currentUsername={currentUser?.username}
            onClose={() => setSelectedNote(null)}
            onDeleteNote={handleDeleteNote}
            onToggleComplete={handleToggleCompleteNote}
            onUpdateNote={handleUpdateNote}
            teammates={teammates}
            allTags={tags}
            onAddToast={addToast}
          />
        </ErrorBoundary>
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
