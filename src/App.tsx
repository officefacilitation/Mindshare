import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note, ToastMessage, User, Tag } from './lib/types';
import {
  getNotes,
  getTags,
  getTeammates,
  getMentionsCount,
  createNote,
  deleteNote,
  updateNote,
  subscribeToStorage,
  syncFromServer,
  setCurrentFeed,
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

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);

  const [notes, setNotes] = useState<Note[]>(() => getNotes());
  const [tags, setTags] = useState<Tag[]>(() => getTags());
  const [teammates, setTeammates] = useState<User[]>(() => getTeammates());
  const [mentionsCount, setMentionsCount] = useState<number>(() => getMentionsCount());

  const [searchQuery, setSearchQuery] = useState('');
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
    setCurrentFeed(feed);
    await syncFromServer(feed);
    setNotes(getNotes());
    setTags(getTags());
    setTeammates(getTeammates());
    setMentionsCount(getMentionsCount());
  }, [activeFilter.type]);

  // Load User Profile
  const loadProfile = useCallback(async () => {
    const res = await api.getMe();
    if (res.user) {
      setCurrentUser(res.user);
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

      if (selectedNote) {
        const found = updatedNotes.find((n) => n.id === selectedNote.id);
        setSelectedNote(found || null);
      }
    });
    return () => unsubscribe();
  }, [selectedNote]);

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

    if (type === 'tagged_me') {
      refresh('tagged_me');
    } else if (type === 'all' || type === 'untagged' || type === 'tag' || type === 'mention') {
      refresh('all');
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

  const untaggedCount = useMemo(
    () => notes.filter((n) => n.tags.length === 0).length,
    [notes]
  );

  // Filter notes based on active filter and search query
  const filteredNotes = useMemo(() => {
    let result = [...notes];

    if (activeFilter.type === 'untagged') {
      result = result.filter((n) => n.tags.length === 0);
    } else if (activeFilter.type === 'tag' && activeFilter.value) {
      const valLower = activeFilter.value.toLowerCase();
      result = result.filter((n) =>
        n.tags.some((t) => t.name.toLowerCase() === valLower)
      );
    } else if (activeFilter.type === 'mention' && activeFilter.value) {
      const valLower = activeFilter.value.toLowerCase();
      result = result.filter((n) =>
        n.mentions.some((m) => m.username.toLowerCase() === valLower)
      );
    }

    if (searchQuery.trim()) {
      const parsedSearch = parseSearchQuery(searchQuery);
      result = filterNotes(result, parsedSearch);
    }

    return result;
  }, [notes, activeFilter, searchQuery]);

  const activeFilterTitle = useMemo(() => {
    if (searchQuery.trim()) return `Search: "${searchQuery}"`;
    if (activeFilter.type === 'tagged_me') return 'Thoughts where you were tagged';
    if (activeFilter.type === 'untagged') return 'Untagged thoughts';
    if (activeFilter.type === 'tag') return `#${activeFilter.value}`;
    if (activeFilter.type === 'mention') return `@${activeFilter.value}`;
    return undefined;
  }, [searchQuery, activeFilter]);

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
        noteCount={notes.length}
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
          onSearchChange={setSearchQuery}
          onSelectFilter={handleSelectFilter}
          onOpenEditProfile={() => setIsUsernameModalOpen(true)}
          mentionsCount={mentionsCount}
          allNotesCount={notes.length}
          untaggedCount={untaggedCount}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Center Main Feed (600px max) */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-2xl mx-auto">
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
            onSelectNote={setSelectedNote}
            onDeleteNote={handleDeleteNote}
            onTagClick={handleTagClickFromCard}
            onMentionClick={handleMentionClickFromCard}
            activeFilterTitle={activeFilterTitle}
            onClearFilter={() => {
              setSearchQuery('');
              setActiveFilter({ type: 'all' });
              refresh('all');
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
