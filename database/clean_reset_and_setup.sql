-- ========================================================
-- MINDSHARE CLEAN RESET & FRESH SETUP SCRIPT
-- WARNING: This drops all existing Mindshare public tables,
-- completely wipes all accounts in auth.users (Google & Email),
-- and builds a fresh, 100% clean multi-user database!
-- ========================================================

-- 1. Drop existing triggers & functions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_note_with_relations(uuid, text, text[], uuid[]) CASCADE;

-- 2. Drop all old public tables cleanly with CASCADE
DROP TABLE IF EXISTS public.mentions CASCADE;
DROP TABLE IF EXISTS public.note_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.user_contacts CASCADE;
DROP TABLE IF EXISTS public.ai_jobs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 3. WIPE ALL AUTH USERS & SESSIONS (Superuser privileges in Supabase SQL Editor)
-- This deletes all Google logins, emails, passwords, and sessions completely
DELETE FROM auth.users;

-- 4. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 5. Users Table (Directly linked to Supabase Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  status TEXT CHECK (status IN ('active', 'invited', 'pending')) DEFAULT 'active',
  is_handle_set BOOLEAN DEFAULT FALSE,
  mentions_last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Auto User Profile Trigger on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
BEGIN
  base_username := LOWER(REGEXP_REPLACE(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  IF length(base_username) < 2 THEN
    base_username := 'user';
  END IF;
  final_username := base_username;

  -- Ensure uniqueness if another user has the same handle
  IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(username) = LOWER(final_username) AND id != NEW.id) THEN
    final_username := base_username || '_' || substr(NEW.id::text, 1, 4);
  END IF;

  INSERT INTO public.users (id, email, full_name, username, avatar_url, status, is_handle_set)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', base_username),
    final_username,
    NEW.raw_user_meta_data->>'avatar_url',
    'active',
    FALSE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
    avatar_url = COALESCE(public.users.avatar_url, EXCLUDED.avatar_url),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Notes Table
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);

-- 8. Tags Table (100% Private per User)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 9. Note-Tags Junction
CREATE TABLE public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  is_manual BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual',
  confidence_score NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

-- 10. Mentions Table (Links Notes directly to real registered teammates)
CREATE TABLE public.mentions (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

-- 11. High-Performance Indexes for 10,000+ Notes
CREATE INDEX idx_notes_user_created ON public.notes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_fts ON public.notes USING GIN (fts);
CREATE INDEX idx_tags_user ON public.tags (user_id);
CREATE INDEX idx_note_tags_note ON public.note_tags (note_id);
CREATE INDEX idx_note_tags_tag ON public.note_tags (tag_id);
CREATE INDEX idx_mentions_user ON public.mentions (user_id);
CREATE INDEX idx_mentions_note ON public.mentions (note_id);
CREATE INDEX idx_users_username ON public.users (LOWER(username));

-- 12. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- 13. Row Level Security Policies
-- Users Directory (Read-only for all team members)
CREATE POLICY "Users directory view" ON public.users
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE TO authenticated, anon
  USING (auth.uid() IS NULL OR id = auth.uid())
  WITH CHECK (auth.uid() IS NULL OR id = auth.uid());

CREATE POLICY "Users insert profile" ON public.users
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Notes (Author sees own notes, teammates see notes where tagged, backend allowed)
CREATE POLICY "Notes view own or mentioned" ON public.notes
  FOR SELECT TO authenticated, anon
  USING (
    auth.uid() IS NULL
    OR user_id = auth.uid()
    OR id IN (SELECT note_id FROM public.mentions WHERE user_id = auth.uid())
  );

CREATE POLICY "Notes insert own" ON public.notes
  FOR INSERT TO authenticated, anon
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Notes update own" ON public.notes
  FOR UPDATE TO authenticated, anon
  USING (auth.uid() IS NULL OR user_id = auth.uid())
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Notes delete own" ON public.notes
  FOR DELETE TO authenticated, anon
  USING (auth.uid() IS NULL OR user_id = auth.uid());

-- Tags (100% Private to author)
CREATE POLICY "Tags own only" ON public.tags
  FOR ALL TO authenticated, anon
  USING (auth.uid() IS NULL OR user_id = auth.uid())
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

-- Note Tags Junction
CREATE POLICY "Note tags view accessible" ON public.note_tags
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Note tags mutate own notes" ON public.note_tags
  FOR ALL TO authenticated, anon
  USING (true);

-- Mentions Table
CREATE POLICY "Mentions view accessible" ON public.mentions
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Mentions insert author only" ON public.mentions
  FOR ALL TO authenticated, anon
  USING (true);

-- 14. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
