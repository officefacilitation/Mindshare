import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note, ToastMessage } from './lib/types';
import {
  getNotes,
  getContacts,
  getTagsWithCounts,
  createNote,
  deleteNote,
  updateNote,
  addContact,
  subscribeToStorage,
  syncFromServer,
} from './lib/storage';
import { api, setAuthToken, getAuthToken } from './lib/api';
import { parseSearchQuery, filterNotes } from './lib/search';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DetailPanel } from './components/layout/DetailPanel';
import { InputBox } from './components/feed/InputBox';
import { FeedList } from './components/feed/FeedList';
import { ToastContainer } from './components/ui/Toast';
import { Login } from './components/auth/Login';

export function App() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<Note[]>(() => getNotes());
  const [contacts, setContacts] = useState(() => getContacts());

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<{
    type: 'all' | 'untagged' | 'tag' | 'mention';
    value?: string;
  }>({ type: 'all' });

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const refresh = useCallback(async () => {
    await syncFromServer();
    setNotes(getNotes());
    setContacts(getContacts());
  }, []);

  // Check stored session token on mount
  useEffect(() => {
    if (!getAuthToken()) {
      setIsAuthed(false);
      return;
    }
    api.me().then((ok) => {
      setIsAuthed(ok);
      if (ok) refresh();
    });
  }, [refresh]);

  // Subscribe to storage changes for reactive state
  useEffect(() => {
    const unsubscribe = subscribeToStorage(() => {
      const updatedNotes = getNotes();
      setNotes(updatedNotes);
      setContacts(getContacts());

      if (selectedNote) {
        const found = updatedNotes.find((n) => n.id === selectedNote.id);
        setSelectedNote(found || null);
      }
    });
    return () => unsubscribe();
  }, [selectedNote]);

  // Re-sync from server on window focus + light polling (single-user consistency)
  useEffect(() => {
    if (!isAuthed) return;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(refresh, 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isAuthed, refresh]);

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

  const handleLogin = async (password: string) => {
    const res = await api.login(password);
    if (res.token) {
      setAuthToken(res.token);
      setIsAuthed(true);
      await refresh();
    }
    return res;
  };

  const handleLogout = async () => {
    await api.logout();
    setAuthToken(null);
    setIsAuthed(false);
    setSelectedNote(null);
  };

  const handleSaveNote = async (content: string) => {
    return createNote(content);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
  };

  const handleUpdateNote = (id: string, newContent: string) => {
    return updateNote(id, newContent);
  };

  const handleSelectFilter = (
    type: 'all' | 'untagged' | 'tag' | 'mention',
    value?: string
  ) => {
    setActiveFilter({ type, value });
    setSearchQuery('');
    setIsMobileSidebarOpen(false);
  };

  const handleTagClickFromCard = (tagName: string) => {
    setSearchQuery(`#${tagName}`);
    setActiveFilter({ type: 'all' });
  };

  const handleMentionClickFromCard = (username: string) => {
    setSearchQuery(`@${username}`);
    setActiveFilter({ type: 'all' });
  };

  // Compute tag counts dynamically
  const tags = useMemo(() => getTagsWithCounts(), [notes]);

  // Compute counts for Inbox nav
  const untaggedCount = useMemo(
    () => notes.filter((n) => n.tags.length === 0).length,
    [notes]
  );

  // Filter notes based on search query AND active sidebar filter
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
    if (searchQuery.trim()) return `Search query: "${searchQuery}"`;
    if (activeFilter.type === 'untagged') return 'Untagged thoughts';
    if (activeFilter.type === 'tag') return `#${activeFilter.value}`;
    if (activeFilter.type === 'mention') return `@${activeFilter.value}`;
    return undefined;
  }, [searchQuery, activeFilter]);

  if (isAuthed === false) {
    return <Login onLogin={handleLogin} />;
  }

  if (isAuthed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink font-sans">
        <p className="text-sm text-ink-muted">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
      <Header
        noteCount={notes.length}
        tagCount={tags.length}
        contactCount={contacts.length}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onLogout={handleLogout}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto flex items-start">
        {/* Left Sidebar (240px) */}
        <Sidebar
          tags={tags}
          contacts={contacts}
          activeFilter={activeFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectFilter={handleSelectFilter}
          onAddContact={addContact}
          onAddToast={addToast}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          allNotesCount={notes.length}
          untaggedCount={untaggedCount}
        />

        {/* Center Main Feed (600px max) */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 max-w-2xl mx-auto">
          <InputBox
            onSaveNote={handleSaveNote}
            allTags={tags}
            allContacts={contacts}
            onAddToast={addToast}
          />

          <FeedList
            notes={filteredNotes}
            selectedNoteId={selectedNote?.id}
            onSelectNote={setSelectedNote}
            onDeleteNote={handleDeleteNote}
            onTagClick={handleTagClickFromCard}
            onMentionClick={handleMentionClickFromCard}
            activeFilterTitle={activeFilterTitle}
            onClearFilter={() => {
              setSearchQuery('');
              setActiveFilter({ type: 'all' });
            }}
          />
        </main>

        {/* Right Inspector Detail Panel (300px) */}
        <DetailPanel
          note={selectedNote}
          onClose={() => setSelectedNote(null)}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={handleUpdateNote}
          allContacts={contacts}
          onAddToast={addToast}
        />
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
