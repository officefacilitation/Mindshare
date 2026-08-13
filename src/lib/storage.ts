import { Note, Tag, UserContact } from './types';
import { api } from './api';

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

// In-Memory UI cache — the Express server + Supabase are the source of truth.
let memoryNotes: Note[] = [];
let memoryContacts: UserContact[] = [];

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

export function getContacts(): UserContact[] {
  return memoryContacts;
}

/**
 * Full refresh from the backend (notes + contacts). The server owns Supabase.
 */
export async function syncFromServer(): Promise<void> {
  const [notes, contacts] = await Promise.all([api.getNotes(), api.getContacts()]);
  memoryNotes = notes;
  memoryContacts = contacts;
  notifyListeners();
}

/**
 * Create note via the backend. The backend persists to Supabase and runs
 * Groq AI auto-tagging server-side.
 */
export async function createNote(content: string): Promise<{ note?: Note; error?: string }> {
  const res = await api.createNote(content);
  if (res.error || !res.note) return res;

  memoryNotes = [res.note, ...memoryNotes];
  notifyListeners();

  // AI tags are written by the server; fetch again shortly so they appear.
  setTimeout(() => syncFromServer(), 3000);

  return res;
}

/**
 * Delete note via the backend.
 */
export async function deleteNote(id: string): Promise<boolean> {
  const ok = await api.deleteNote(id);
  if (ok) {
    memoryNotes = memoryNotes.filter((n) => n.id !== id);
    notifyListeners();
  }
  return ok;
}

/**
 * Update note content via the backend (tags/mentions are re-parsed & re-synced).
 */
export async function updateNote(
  id: string,
  newContent: string
): Promise<{ note?: Note; error?: string }> {
  const res = await api.updateNote(id, newContent);
  if (res.error || !res.note) return res;

  const idx = memoryNotes.findIndex((n) => n.id === id);
  if (idx !== -1) {
    memoryNotes[idx] = res.note;
  } else {
    memoryNotes = [res.note, ...memoryNotes];
  }
  notifyListeners();
  return res;
}

/**
 * Add contact via the backend.
 */
export async function addContact(
  displayName: string,
  email: string
): Promise<{ contact?: UserContact; error?: string }> {
  const res = await api.createContact(displayName, email);
  if (res.contact) {
    memoryContacts = [res.contact, ...memoryContacts];
    notifyListeners();
  }
  return res;
}

export function getTagsWithCounts(): Tag[] {
  const tagCounts: Record<string, number> = {};

  memoryNotes.forEach((note) => {
    note.tags.forEach((t) => {
      const name = t.name.toLowerCase();
      tagCounts[name] = (tagCounts[name] || 0) + 1;
    });
  });

  return Object.keys(tagCounts)
    .sort()
    .map((name) => ({
      id: `t-${name}`,
      name,
      count: tagCounts[name],
    }));
}
