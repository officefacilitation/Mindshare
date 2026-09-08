import { Note, Tag, User } from './types';
import { api } from './api';

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

let memoryNotes: Note[] = [];
let memoryTags: Tag[] = [];
let memoryTeammates: User[] = [];
let memoryMentionsCount = 0;
let currentFeed: 'all' | 'tagged_me' | 'untagged' = 'all';

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeToStorage(callback: StorageListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getNotes(): Note[] {
  return memoryNotes;
}

export function getTags(): Tag[] {
  return memoryTags;
}

export function getTeammates(): User[] {
  return memoryTeammates;
}

export function getMentionsCount(): number {
  return memoryMentionsCount;
}

export function getCurrentFeed(): 'all' | 'tagged_me' | 'untagged' {
  return currentFeed;
}

export function setCurrentFeed(feed: 'all' | 'tagged_me' | 'untagged') {
  currentFeed = feed;
}

/**
 * Full refresh from backend:
 * - Scoped notes for the active feed
 * - User's private tags
 * - Team directory for @mentions
 * - Mentions count for sidebar notification badge
 */
export async function syncFromServer(feed?: 'all' | 'tagged_me' | 'untagged'): Promise<void> {
  const targetFeed = feed || currentFeed;
  currentFeed = targetFeed;

  try {
    const [notesRes, tags, teammates, mentionsCount] = await Promise.all([
      api.getNotes({ feed: targetFeed }),
      api.getTags(),
      api.getTeamDirectory(),
      api.getMentionsCount(),
    ]);

    memoryNotes = notesRes.notes;
    memoryTags = tags;
    memoryTeammates = teammates;
    memoryMentionsCount = mentionsCount;
    notifyListeners();
  } catch (err) {
    console.warn('[Storage] Sync error:', err);
  }
}

/**
 * Create a new thought with author-defined manual tags
 */
export async function createNote(content: string, manualTags?: string[]): Promise<{ note?: Note; error?: string }> {
  const res = await api.createNote(content, manualTags);
  if (res.error || !res.note) return res;

  if (currentFeed !== 'tagged_me') {
    memoryNotes = [res.note, ...memoryNotes];
  }

  // Refresh tags and directory quietly
  api.getTags().then((tags) => {
    memoryTags = tags;
    notifyListeners();
  });

  notifyListeners();
  return res;
}

/**
 * Delete thought
 */
export async function deleteNote(id: string): Promise<boolean> {
  const ok = await api.deleteNote(id);
  if (ok) {
    memoryNotes = memoryNotes.filter((n) => n.id !== id);
    // Refresh tags quietly
    api.getTags().then((tags) => {
      memoryTags = tags;
      notifyListeners();
    });
    notifyListeners();
  }
  return ok;
}

/**
 * Update note content and tags
 */
export async function updateNote(
  id: string,
  newContent: string,
  manualTags?: string[]
): Promise<{ note?: Note; error?: string }> {
  const res = await api.updateNote(id, newContent, manualTags);
  if (res.error || !res.note) return res;

  const idx = memoryNotes.findIndex((n) => n.id === id);
  if (idx !== -1) {
    memoryNotes[idx] = res.note;
  } else {
    memoryNotes = [res.note, ...memoryNotes];
  }

  api.getTags().then((tags) => {
    memoryTags = tags;
    notifyListeners();
  });

  notifyListeners();
  return res;
}
