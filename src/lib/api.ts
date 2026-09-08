import { Note, Tag, User } from './types';
import { supabase } from './supabase';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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

export const api = {
  getBaseUrl: () => API_BASE_URL,

  // Health check
  async getHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      return await res.json();
    } catch (e) {
      return { status: 'offline' };
    }
  },

  // Supabase Authentication Wrappers
  async signInWithGoogle(): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) return { error: error.message };
      return {};
    } catch (e: any) {
      return { error: e.message || 'Failed to initialize Google login' };
    }
  },

  async signInWithPassword(email: string, password: string): Promise<{ user?: any; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: error.message };
      return { user: data.user };
    } catch (e: any) {
      return { error: e.message || 'Login failed' };
    }
  },

  async signUpWithPassword(email: string, password: string, fullName?: string): Promise<{ user?: any; session?: any; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName?.trim() || '',
          },
        },
      });
      if (error) return { error: error.message };
      return { user: data.user, session: data.session };
    } catch (e: any) {
      return { error: e.message || 'Registration failed' };
    }
  },

  async resetPasswordForEmail(email: string): Promise<{ success?: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) return { error: error.message };
      return { success: true };
    } catch (e: any) {
      return { error: e.message || 'Failed to send password reset email' };
    }
  },

  async resendConfirmationEmail(email: string): Promise<{ success?: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) return { error: error.message };
      return { success: true };
    } catch (e: any) {
      return { error: e.message || 'Failed to resend confirmation email' };
    }
  },

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      /* ignore */
    }
  },

  // User Profile & Directory
  async getMe(): Promise<{ user?: User; error?: string }> {
    try {
      const { ok, data } = await request('/users/me');
      if (!ok) return { error: data?.error || 'Failed to load profile' };
      return { user: data.user };
    } catch (e) {
      return { error: 'Network error connecting to backend' };
    }
  },

  async updateProfile(updates: { username?: string; fullName?: string; avatarUrl?: string }): Promise<{ user?: User; error?: string }> {
    try {
      const { ok, data } = await request('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (!ok) return { error: data?.error || 'Failed to update profile' };
      return { user: data.user };
    } catch (e) {
      return { error: 'Network error updating profile' };
    }
  },

  async getTeamDirectory(): Promise<User[]> {
    try {
      const { ok, data } = await request('/users/directory');
      if (!ok) return [];
      return data?.users || [];
    } catch (e) {
      return [];
    }
  },

  // Notes Management (Personal & Tagged Me)
  async getNotes(params: {
    feed?: 'all' | 'tagged_me' | 'untagged';
    tag?: string;
    mention?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ notes: Note[]; total: number }> {
    try {
      const query = new URLSearchParams();
      if (params.feed) query.append('feed', params.feed);
      if (params.tag) query.append('tag', params.tag);
      if (params.mention) query.append('mention', params.mention);
      if (params.search) query.append('q', params.search);
      if (params.limit !== undefined) query.append('limit', String(params.limit));
      if (params.offset !== undefined) query.append('offset', String(params.offset));

      const { ok, data } = await request(`/notes?${query.toString()}`);
      if (!ok) throw new Error(data?.error || 'Failed to fetch notes');
      return {
        notes: data?.notes || [],
        total: data?.total || 0,
      };
    } catch (e) {
      console.warn('[API Client] Failed to fetch notes:', e);
      return { notes: [], total: 0 };
    }
  },

  async getMentionsCount(): Promise<{ count: number; unreadCount: number; hasUnread: boolean }> {
    try {
      const { ok, data } = await request('/notes/mentions-count');
      if (ok && typeof data?.count === 'number') {
        return {
          count: data.count,
          unreadCount: typeof data?.unreadCount === 'number' ? data.unreadCount : 0,
          hasUnread: Boolean(data?.hasUnread),
        };
      }
      return { count: 0, unreadCount: 0, hasUnread: false };
    } catch {
      return { count: 0, unreadCount: 0, hasUnread: false };
    }
  },

  async markMentionsRead(): Promise<{ success: boolean; mentions_last_seen_at?: string }> {
    try {
      const { ok, data } = await request('/notes/mark-mentions-read', { method: 'POST' });
      return { success: Boolean(ok && data?.success), mentions_last_seen_at: data?.mentions_last_seen_at };
    } catch {
      return { success: false };
    }
  },

  async createNote(content: string, manualTags?: string[]): Promise<{ note?: Note; error?: string }> {
    try {
      const { ok, data } = await request('/notes', {
        method: 'POST',
        body: JSON.stringify({ content, manualTags }),
      });
      if (!ok) return { error: data?.error || 'Failed to create note' };
      return { note: data.note };
    } catch (e) {
      return { error: 'Network error connecting to backend API' };
    }
  },

  async updateNote(id: string, content: string, manualTags?: string[]): Promise<{ note?: Note; error?: string }> {
    try {
      const { ok, data } = await request(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content, manualTags }),
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

  // Tags (Scoped strictly to user)
  async getTags(): Promise<Tag[]> {
    try {
      const { ok, data } = await request('/tags');
      if (!ok) return [];
      return data?.tags || [];
    } catch (e) {
      return [];
    }
  },

  // On-Demand AI Tag Suggestions (User has full control)
  async suggestTags(content: string): Promise<{ tags: string[]; summary?: string; error?: string }> {
    try {
      const { ok, data } = await request('/ai/suggest-tags', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (!ok) return { tags: [], error: data?.error || 'Could not generate suggestions' };
      return { tags: data.tags || [], summary: data.summary };
    } catch (e: any) {
      return { tags: [], error: e.message || 'AI service unavailable' };
    }
  },

  // Image Upload
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
