import { Note, Tag, User } from './types';
import { api } from './api';

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

// Dedicated in-memory caches per feed to enable 0ms instant tab switching
const feedCaches: {
  all: Note[];
  tagged_me: Note[];
} = {
  all: [],
  tagged_me: [],
};

const feedLoaded: {
  all: boolean;
  tagged_me: boolean;
} = {
  all: false,
  tagged_me: false,
};

let memoryTags: Tag[] = [];
let memoryTeammates: User[] = [];
let memoryMentionsCount = 0;
let currentFeed: 'all' | 'tagged_me' | 'untagged' = 'all';
let isFeedLoading = false;

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeToStorage(callback: StorageListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Returns notes for the active feed directly from RAM in 0ms
 */
export function getNotes(feed?: 'all' | 'tagged_me' | 'untagged'): Note[] {
  const target = feed || currentFeed;
  if (target === 'tagged_me') {
    return feedCaches.tagged_me;
  }
  return feedCaches.all;
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

/**
 * Accurately returns the author's total personal thoughts count.
 * This is NEVER corrupted when viewing the Tagged Me tab.
 */
export function getMyNotesCount(): number {
  return feedCaches.all.length;
}

/**
 * Accurately returns the author's untagged thoughts count.
 * This is NEVER corrupted when viewing the Tagged Me tab.
 */
export function getUntaggedCount(): number {
  return feedCaches.all.filter((n) => !n.tags || n.tags.length === 0).length;
}

export function getCurrentFeed(): 'all' | 'tagged_me' | 'untagged' {
  return currentFeed;
}

export function getIsFeedLoading(): boolean {
  return isFeedLoading;
}

/**
 * Switches the active feed in 0ms without waiting for network.
 * If cache exists, screen updates instantly. In background, revalidates cache.
 */
export function switchFeed(feed: 'all' | 'tagged_me' | 'untagged') {
  currentFeed = feed;
  const targetKey = feed === 'tagged_me' ? 'tagged_me' : 'all';

  // If feed is already cached, show it instantly in 0ms
  if (feedLoaded[targetKey]) {
    isFeedLoading = false;
    notifyListeners();
  } else {
    isFeedLoading = true;
    notifyListeners();
  }

  // Silent background revalidation
  revalidateFeed(targetKey);
}

/**
 * Background revalidation of a specific feed
 */
async function revalidateFeed(feedKey: 'all' | 'tagged_me') {
  try {
    const notesRes = await api.getNotes({ feed: feedKey });
    feedCaches[feedKey] = notesRes.notes;
    feedLoaded[feedKey] = true;
    isFeedLoading = false;

    if (feedKey === 'tagged_me') {
      memoryMentionsCount = notesRes.notes.length;
    }

    notifyListeners();
  } catch (err) {
    console.warn(`[Storage] Failed to revalidate feed ${feedKey}:`, err);
    isFeedLoading = false;
    notifyListeners();
  }
}

/**
 * Full initial sync on login / refresh:
 * - Loads personal notes ('all')
 * - Loads tags, team directory, and mentions count
 * - Immediately warms up 'tagged_me' cache in parallel for 0ms future switches
 */
export async function syncFromServer(feed?: 'all' | 'tagged_me' | 'untagged'): Promise<void> {
  const targetFeed = feed || currentFeed;
  currentFeed = targetFeed;
  const targetKey = targetFeed === 'tagged_me' ? 'tagged_me' : 'all';

  if (!feedLoaded[targetKey]) {
    isFeedLoading = true;
    notifyListeners();
  }

  try {
    const [notesRes, tags, teammates, mentionsCount] = await Promise.all([
      api.getNotes({ feed: targetKey }),
      api.getTags(),
      api.getTeamDirectory(),
      api.getMentionsCount(),
    ]);

    feedCaches[targetKey] = notesRes.notes;
    feedLoaded[targetKey] = true;
    memoryTags = tags;
    memoryTeammates = teammates;
    memoryMentionsCount = mentionsCount;
    isFeedLoading = false;
    notifyListeners();

    // Warm up the other feed quietly in the background so switching is always 0ms
    const otherKey: 'all' | 'tagged_me' = targetKey === 'all' ? 'tagged_me' : 'all';
    if (!feedLoaded[otherKey]) {
      api.getNotes({ feed: otherKey }).then((res) => {
        feedCaches[otherKey] = res.notes;
        feedLoaded[otherKey] = true;
        if (otherKey === 'tagged_me') {
          memoryMentionsCount = res.notes.length;
        }
        notifyListeners();
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[Storage] Sync error:', err);
    isFeedLoading = false;
    notifyListeners();
  }
}

/**
 * Create a new thought with author-defined manual tags
 */
export async function createNote(content: string, manualTags?: string[]): Promise<{ note?: Note; error?: string }> {
  const res = await api.createNote(content, manualTags);
  if (res.error || !res.note) return res;

  // Optimistically prepend to personal thoughts cache
  feedCaches.all = [res.note, ...feedCaches.all];
  feedLoaded.all = true;

  // Refresh tags and directory quietly in background
  api.getTags().then((tags) => {
    memoryTags = tags;
    notifyListeners();
  }).catch(() => {});

  notifyListeners();
  return res;
}

/**
 * Delete thought
 */
export async function deleteNote(id: string): Promise<boolean> {
  // Optimistically remove from both caches
  feedCaches.all = feedCaches.all.filter((n) => n.id !== id);
  feedCaches.tagged_me = feedCaches.tagged_me.filter((n) => n.id !== id);
  notifyListeners();

  const ok = await api.deleteNote(id);
  if (ok) {
    api.getTags().then((tags) => {
      memoryTags = tags;
      notifyListeners();
    }).catch(() => {});
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

  const idxAll = feedCaches.all.findIndex((n) => n.id === id);
  if (idxAll !== -1) {
    feedCaches.all[idxAll] = res.note;
  }

  const idxTagged = feedCaches.tagged_me.findIndex((n) => n.id === id);
  if (idxTagged !== -1) {
    feedCaches.tagged_me[idxTagged] = res.note;
  }

  api.getTags().then((tags) => {
    memoryTags = tags;
    notifyListeners();
  }).catch(() => {});

  notifyListeners();
  return res;
}
