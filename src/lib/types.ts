export interface Tag {
  id: string;
  user_id?: string;
  name: string;
  count?: number;
  is_manual?: boolean;
  created_at?: string;
}

export interface UserContact {
  id: string;
  owner_user_id?: string;
  contact_email: string;
  display_name: string;
  username: string; // clean name without @ symbol
  is_registered: boolean;
  status: 'active' | 'invited' | 'pending';
  avatar_url?: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  mentions: UserContact[];
  ai_tags?: string[];
  is_processing_ai?: boolean;
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

export interface User {
  id: string;
  full_name: string;
  email: string;
  status: 'active' | 'invited' | 'pending';
  created_at: string;
}

export interface AITagResponse {
  tags: string[];
  success: boolean;
  error?: string;
}
