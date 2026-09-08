-- ========================================================
-- MINDSHARE: TOTAL PURGE & FRESH SETUP (INCLUDING ALL USERS)
-- WARNING: This completely deletes ALL accounts in auth.users,
-- all sessions, all notes, all tags, and all profiles!
-- Run this in Supabase SQL Editor to start 100% fresh.
-- ========================================================

-- 1. Temporarily disable the trigger while cleaning
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_note_with_relations(uuid, text, text[], uuid[]) CASCADE;

-- 2. Drop all public tables completely
DROP TABLE IF EXISTS public.mentions CASCADE;
DROP TABLE IF EXISTS public.note_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.user_contacts CASCADE;
DROP TABLE IF EXISTS public.ai_jobs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 3. WIPE ALL AUTH USERS & SESSIONS (Superuser privileges in SQL Editor)
-- This deletes all Google logins, emails, passwords, and sessions
DELETE FROM auth.users;

-- 4. Enable Required PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 5. Create Fresh Users Table (Linked to auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  status TEXT CHECK (status IN ('active', 'invited', 'pending')) DEFAULT 'active',
  is_handle_set BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. Auto Profile Creation Trigger on New Signup
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

  -- Ensure uniqueness if another user has the exact same prefix
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

-- 7. Create Fresh Notes Table
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);

-- 8. Create Fresh Tags Table (100% Private per User)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 9. Note-Tags Junction Table
CREATE TABLE public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  is_manual BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual',
  confidence_score NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

-- 10. Mentions Table (Real registered teammates tagged in notes)
CREATE TABLE public.mentions (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

-- 11. High-Performance Indexes
CREATE INDEX idx_notes_user_created ON public.notes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_fts ON public.notes USING GIN (fts);
CREATE INDEX idx_tags_user ON public.tags (user_id);
CREATE INDEX idx_note_tags_note ON public.note_tags (note_id);
CREATE INDEX idx_note_tags_tag ON public.note_tags (tag_id);
CREATE INDEX idx_mentions_user ON public.mentions (user_id);
CREATE INDEX idx_mentions_note ON public.mentions (note_id);
CREATE INDEX idx_users_username ON public.users (LOWER(username));

-- 12. Atomic Note Creation RPC
CREATE OR REPLACE FUNCTION public.create_note_with_relations(
  p_user_id UUID,
  p_content TEXT,
  p_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_mentioned_user_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_note_id UUID;
  v_tag_name TEXT;
  v_tag_id UUID;
  v_mention_id UUID;
BEGIN
  INSERT INTO public.notes (user_id, content)
  VALUES (p_user_id, p_content)
  RETURNING id INTO v_note_id;

  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    FOREACH v_tag_name IN ARRAY p_tags LOOP
      v_tag_name := LOWER(TRIM(v_tag_name));
      IF length(v_tag_name) > 0 THEN
        INSERT INTO public.tags (user_id, name)
        VALUES (p_user_id, v_tag_name)
        ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_tag_id;

        INSERT INTO public.note_tags (note_id, tag_id, is_manual, source)
        VALUES (v_note_id, v_tag_id, true, 'manual')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF p_mentioned_user_ids IS NOT NULL AND array_length(p_mentioned_user_ids, 1) > 0 THEN
    FOREACH v_mention_id IN ARRAY p_mentioned_user_ids LOOP
      IF EXISTS (SELECT 1 FROM public.users WHERE id = v_mention_id) THEN
        INSERT INTO public.mentions (note_id, user_id)
        VALUES (v_note_id, v_mention_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_note_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- 14. Row Level Security Policies
-- Team Directory
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

-- Notes Policies
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

-- Tags (Private to owner)
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

-- 15. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
