import { Note, UserContact } from './types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

let authToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('mindshare_token') : null;

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('mindshare_token', token);
  } else {
    localStorage.removeItem('mindshare_token');
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  let data: any = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
  } as unknown as T;
}

/**
 * Frontend API Client for the Mindshare backend.
 * The backend owns Supabase + Groq, so no secrets are ever shipped to the browser.
 */
export const api = {
  getBaseUrl: () => API_BASE_URL,

  async getHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return await res.json();
    } catch (e) {
      return { status: 'offline' };
    }
  },

  async login(password: string): Promise<{ token?: string; error?: string }> {
    try {
      const { ok, status, data } = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (!ok) return { error: data?.error || 'Invalid password' };
      return { token: data.token };
    } catch (e) {
      return { error: 'Cannot reach the Mindshare server. Make sure it is running (npm run dev --prefix server).' };
    }
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {
      /* ignore */
    }
  },

  async me(): Promise<boolean> {
    try {
      const { ok } = await request('/auth/me');
      return ok;
    } catch (e) {
      return false;
    }
  },

  async getNotes(tag?: string, mention?: string, search?: string, limit?: number, offset?: number): Promise<Note[]> {
    try {
      const query = new URLSearchParams();
      if (tag) query.append('tag', tag);
      if (mention) query.append('mention', mention);
      if (search) query.append('q', search);
      if (limit !== undefined) query.append('limit', String(limit));
      if (offset !== undefined) query.append('offset', String(offset));
      const { ok, data } = await request(`/notes?${query.toString()}`);
      if (!ok) throw new Error(data?.error || 'Failed to fetch notes');
      return data?.notes || [];
    } catch (e) {
      console.warn('[API Client] Failed to fetch notes:', e);
      return [];
    }
  },

  async createNote(content: string): Promise<{ note?: Note; error?: string }> {
    try {
      const { ok, data } = await request('/notes', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (!ok) return { error: data?.error || 'Failed to create note' };
      return { note: data.note };
    } catch (e) {
      return { error: 'Network error connecting to backend API' };
    }
  },

  async updateNote(id: string, content: string): Promise<{ note?: Note; error?: string }> {
    try {
      const { ok, data } = await request(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      if (!ok) return { error: data?.error || 'Failed to update note' };
      return { note: data.note };
    } catch (e) {
      return { error: 'Network error connecting to backend API' };
    }
  },

  async deleteNote(id: string): Promise<boolean> {
    try {
      const { ok } = await request(`/notes/${id}`, { method: 'DELETE' });
      return ok;
    } catch (e) {
      return false;
    }
  },

  async getContacts(): Promise<UserContact[]> {
    try {
      const { ok, data } = await request('/contacts');
      if (!ok) throw new Error(data?.error || 'Failed to fetch contacts');
      return data?.contacts || [];
    } catch (e) {
      console.warn('[API Client] Failed to fetch contacts:', e);
      return [];
    }
  },

  async createContact(displayName: string, email?: string): Promise<{ contact?: UserContact; error?: string }> {
    try {
      const { ok, data } = await request('/contacts', {
        method: 'POST',
        body: JSON.stringify({ displayName, email }),
      });
      if (!ok) return { error: data?.error || 'Failed to add contact' };
      return { contact: data.contact };
    } catch (e) {
      return { error: 'Network error connecting to backend API' };
    }
  },

  async uploadImage(base64Image: string): Promise<{ url?: string; error?: string }> {
    try {
      const { ok, data } = await request('/upload', {
        method: 'POST',
        body: JSON.stringify({ image: base64Image }),
      });
      if (!ok) return { error: data?.error || 'Failed to upload image' };
      return { url: data.url };
    } catch (e) {
      return { error: 'Network error uploading image' };
    }
  },
};
