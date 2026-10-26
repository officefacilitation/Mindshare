import { Note, Tag, User } from './types';
import { api } from './api';
import { playNotificationChime } from './sound';
import { scheduleNoteReminder, syncAllNoteReminders } from './notifications';
import { parseNoteContent } from './parser';

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
let memoryUnreadMentionsCount = 0;
let memoryHasUnreadMentions = false;
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

export function getHasUnreadMentions(): boolean {
  return memoryHasUnreadMentions;
}

/**
 * Accurately returns the author's total personal thoughts count.
 * This is NEVER corrupted when viewing the Tagged Me tab.
 */
export function getMyNotesCount(): number {
  // Pure thoughts count (thoughts without active deadline)
  return feedCaches.all.filter((n) => !n.reminder_at).length;
}

/**
 * Accurately returns the author's untagged thoughts count (excluding deadlines).
 */
export function getUntaggedCount(): number {
  return feedCaches.all.filter((n) => !n.reminder_at && (!n.tags || n.tags.length === 0)).length;
}

export function getRemindersCount(): number {
  // Actionable deadlines across personal and colleague mentions
  const combined = [...feedCaches.all, ...feedCaches.tagged_me];
  const seen = new Set<string>();
  let count = 0;
  for (const n of combined) {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      if (n.reminder_at && !n.is_completed) count++;
    }
  }
  return count;
}

export function getCurrentFeed(): 'all' | 'tagged_me' | 'untagged' {
  return currentFeed;
}

export function getIsFeedLoading(): boolean {
  return isFeedLoading;
}

/**
 * Marks tagged thoughts as seen/read across ALL user devices (updates DB checkpoint).
 */
export function markMentionsAsRead() {
  memoryHasUnreadMentions = false;
  notifyListeners();
  api.markMentionsRead().catch((err) => {
    console.warn('[Storage] markMentionsRead failed:', err);
  });
}

/**
 * Switches the active feed in 0ms without waiting for network.
 * If cache exists, screen updates instantly. In background, revalidates cache.
 */
export function switchFeed(feed: 'all' | 'tagged_me' | 'untagged') {
  currentFeed = feed;
  const targetKey = feed === 'tagged_me' ? 'tagged_me' : 'all';

  if (feed === 'tagged_me') {
    markMentionsAsRead();
  }

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
    const prevHasUnread = memoryHasUnreadMentions;
    const prevUnreadCount = memoryUnreadMentionsCount;

    const [notesRes, tags, teammates, mentionsData] = await Promise.all([
      api.getNotes({ feed: targetKey }),
      api.getTags(),
      api.getTeamDirectory(),
      api.getMentionsCount(),
    ]);

    feedCaches[targetKey] = notesRes.notes;
    feedLoaded[targetKey] = true;
    memoryTags = tags;
    memoryTeammates = teammates;
    memoryMentionsCount = mentionsData.count;
    memoryUnreadMentionsCount = mentionsData.unreadCount;
    memoryHasUnreadMentions = mentionsData.hasUnread;
    isFeedLoading = false;

    // Sync active reminder timers on phone/desktop across personal & shared tagged notes
    syncAllNoteReminders([...feedCaches.all, ...feedCaches.tagged_me]);

    // Play notification sound when a new mention arrives!
    if (mentionsData.hasUnread && (!prevHasUnread || mentionsData.unreadCount > prevUnreadCount)) {
      playNotificationChime();
    }

    notifyListeners();

    // If hasUnread is true OR the other feed is not yet loaded, warm/refresh it quietly in background
    const otherKey: 'all' | 'tagged_me' = targetKey === 'all' ? 'tagged_me' : 'all';
    if (!feedLoaded[otherKey] || (otherKey === 'tagged_me' && mentionsData.hasUnread)) {
      api.getNotes({ feed: otherKey }).then((res) => {
        feedCaches[otherKey] = res.notes;
        feedLoaded[otherKey] = true;
        if (otherKey === 'tagged_me') {
          memoryMentionsCount = res.notes.length;
          // Sync team-wide mention reminders so colleague deadlines also notify user
          syncAllNoteReminders([...feedCaches.all, ...feedCaches.tagged_me]);
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
 * Create a new thought with 0ms instant optimistic UI response
 */
export async function createNote(
  content: string,
  manualTags?: string[],
  reminderAt?: string | null,
  isCompleted?: boolean
): Promise<{ note?: Note; error?: string }> {
  // Generate optimistic note with temporary ID for instant 0ms response
  const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();

  // Extract preliminary tags from text & manualTags
  const quickTags = (manualTags || []).map((t) => ({ id: `t-${t}`, name: t, is_manual: true }));
  const hashMatches = content.match(/(?:^|\s)#([a-zA-Z0-9_-]{2,30})/g) || [];
  hashMatches.forEach((m) => {
    const name = m.trim().replace(/^#/, '').toLowerCase();
    if (!quickTags.some((qt) => qt.name.toLowerCase() === name)) {
      quickTags.push({ id: `t-${name}`, name, is_manual: true });
    }
  });

  // Extract preliminary mentions from text
  const mentionMatches = content.match(/(?:^|\s)@([a-zA-Z0-9_]{2,30})/g) || [];
  const quickMentions = mentionMatches.map((m) => {
    const u = m.trim().replace(/^@/, '');
    const foundUser = memoryTeammates.find((tm) => tm.username?.toLowerCase() === u.toLowerCase());
    return {
      id: foundUser?.id || `m-${u}`,
      username: u,
      display_name: foundUser?.full_name || u,
      avatar_url: foundUser?.avatar_url,
    };
  });

  const optimisticNote: Note = {
    id: tempId,
    user_id: feedCaches.all[0]?.user_id || '',
    content,
    tags: quickTags,
    mentions: quickMentions,
    reminder_at: reminderAt || null,
    is_completed: Boolean(isCompleted),
    created_at: now,
    updated_at: now,
  };

  // Instant 0ms injection:
  feedCaches.all = [optimisticNote, ...feedCaches.all];
  feedLoaded.all = true;
  notifyListeners();

  try {
    const res = await api.createNote(content, manualTags, reminderAt, isCompleted);
    if (res.error || !res.note) {
      // Rollback optimistic placeholder on failure
      feedCaches.all = feedCaches.all.filter((n) => n.id !== tempId);
      notifyListeners();
      return res;
    }

    // Replace optimistic placeholder with confirmed server note
    const idx = feedCaches.all.findIndex((n) => n.id === tempId);
    if (idx !== -1) {
      feedCaches.all[idx] = res.note;
    } else {
      feedCaches.all = [res.note, ...feedCaches.all.filter((n) => n.id !== tempId)];
    }

    if (res.note.reminder_at) {
      scheduleNoteReminder(res.note);
    }

    api.getTags().then((tags) => {
      memoryTags = tags;
      notifyListeners();
    }).catch(() => {});

    notifyListeners();
    return res;
  } catch (err: any) {
    feedCaches.all = feedCaches.all.filter((n) => n.id !== tempId);
    notifyListeners();
    return { error: err.message || 'Failed to create note' };
  }
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
 * Update note content, tags, and reminder deadline (0ms optimistic latency)
 */
export async function updateNote(
  id: string,
  newContent: string,
  manualTags?: string[],
  reminderAt?: string | null,
  isCompleted?: boolean
): Promise<{ note?: Note; error?: string }> {
  // 1. Instant optimistic update in RAM
  const existing = feedCaches.all.find((n) => n.id === id) || feedCaches.tagged_me.find((n) => n.id === id);
  if (existing) {
    const parsed = parseNoteContent(newContent);
    const combinedTagNames = Array.from(new Set([...(parsed.tags || []), ...(manualTags || [])]));
    const optimisticTags: Tag[] = combinedTagNames.map((name) => {
      const found = (existing.tags || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
      return found || { id: `opt-tag-${name}`, name, is_manual: true, count: 1 };
    });

    const optimisticNote: Note = {
      ...existing,
      content: newContent,
      tags: optimisticTags,
      reminder_at: reminderAt !== undefined ? reminderAt : existing.reminder_at,
      is_completed: isCompleted !== undefined ? isCompleted : existing.is_completed,
      updated_at: new Date().toISOString(),
    };

    const updateCache = (list: Note[]) => list.map((n) => (n.id === id ? optimisticNote : n));
    feedCaches.all = updateCache(feedCaches.all);
    feedCaches.tagged_me = updateCache(feedCaches.tagged_me);
    notifyListeners();
  }

  // 2. Perform authoritative API request
  const res = await api.updateNote(id, newContent, manualTags, reminderAt, isCompleted);
  if (res.error || !res.note) {
    if (existing) {
      const rollback = (list: Note[]) => list.map((n) => (n.id === id ? existing : n));
      feedCaches.all = rollback(feedCaches.all);
      feedCaches.tagged_me = rollback(feedCaches.tagged_me);
      notifyListeners();
    }
    return res;
  }

  const idxAll = feedCaches.all.findIndex((n) => n.id === id);
  if (idxAll !== -1) {
    feedCaches.all[idxAll] = res.note;
  }

  const idxTagged = feedCaches.tagged_me.findIndex((n) => n.id === id);
  if (idxTagged !== -1) {
    feedCaches.tagged_me[idxTagged] = res.note;
  }

  if (res.note.reminder_at) {
    scheduleNoteReminder(res.note);
  }

  api.getTags().then((tags) => {
    memoryTags = tags;
    notifyListeners();
  }).catch(() => {});

  notifyListeners();
  return res;
}

/**
 * Fast 1-click collaborative task completion toggle (0ms latency)
 */
export async function toggleCompleteNote(
  id: string,
  isCompleted: boolean,
  username?: string
): Promise<boolean> {
  // Optimistically update in RAM immediately
  const updateList = (list: Note[]) =>
    list.map((n) => {
      if (n.id !== id) return n;
      let completedBy = Array.isArray(n.completed_by) ? [...n.completed_by] : [];
      if (username) {
        const u = username.toLowerCase();
        if (isCompleted) {
          if (!completedBy.includes(u)) completedBy.push(u);
        } else {
          completedBy = completedBy.filter((x) => x !== u);
        }
      }
      return {
        ...n,
        is_completed: isCompleted,
        completed_by: completedBy,
      };
    });

  feedCaches.all = updateList(feedCaches.all);
  feedCaches.tagged_me = updateList(feedCaches.tagged_me);
  notifyListeners();

  const res = await api.toggleComplete(id, isCompleted, username);
  if (res.note) {
    const syncExact = (list: Note[]) =>
      list.map((n) => (n.id === id ? { ...n, ...res.note } : n));
    feedCaches.all = syncExact(feedCaches.all);
    feedCaches.tagged_me = syncExact(feedCaches.tagged_me);
    notifyListeners();
  }
  return res.success;
}

/**
 * Delete a private tag permanently
 */
export async function deleteTag(idOrName: string): Promise<boolean> {
  const clean = idOrName.toLowerCase().trim().replace(/^#/, '');
  // Optimistically remove from memoryTags
  memoryTags = memoryTags.filter((t) => t.id !== idOrName && t.name.toLowerCase() !== clean);

  // Optimistically remove tag from cached notes in RAM
  feedCaches.all = feedCaches.all.map((note) => ({
    ...note,
    tags: (note.tags || []).filter((t) => t.id !== idOrName && t.name.toLowerCase() !== clean),
  }));
  feedCaches.tagged_me = feedCaches.tagged_me.map((note) => ({
    ...note,
    tags: (note.tags || []).filter((t) => t.id !== idOrName && t.name.toLowerCase() !== clean),
  }));
  notifyListeners();

  const ok = await api.deleteTag(idOrName);
  if (ok) {
    api.getTags().then((tags) => {
      memoryTags = tags;
      notifyListeners();
    }).catch(() => {});
  }
  return ok;
}
