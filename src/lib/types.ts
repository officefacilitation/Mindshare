export interface User {
  id: string;
  email: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  status?: 'active' | 'invited' | 'pending';
  is_handle_set?: boolean;
}

export interface MentionUser {
  id?: string;
  username: string;
  display_name?: string;
  contact_email?: string;
  email?: string;
  avatar_url?: string;
  is_registered?: boolean;
  status?: string;
}

export type UserContact = MentionUser;

export interface Tag {
  id: string;
  user_id?: string;
  name: string;
  count?: number;
  is_manual?: boolean;
  source?: 'manual' | 'ai_suggested';
  created_at?: string;
}

export interface NoteAuthor {
  id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Note {
  id: string;
  user_id: string;
  author?: NoteAuthor;
  content: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  mentions: MentionUser[];
}

export interface ParsedNote {
  content: string;
  tags: string[];
  mentions: string[];
  isValid: boolean;
  errors: string[];
}

export interface SearchQuery {
  raw: string;
  tags: string[];
  mentions: string[];
  operator: 'AND' | 'OR';
  freetext: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

export interface AITagResponse {
  tags: string[];
  summary?: string;
  success: boolean;
  error?: string;
}
