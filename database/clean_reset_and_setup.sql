-- ========================================================
-- MINDSHARE CLEAN RESET & FRESH SETUP SCRIPT
-- WARNING: This drops all existing Mindshare public tables
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

-- 3. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 4. Users Table (Directly linked to Supabase Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  status TEXT CHECK (status IN ('active', 'invited', 'pending')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Auto User Profile Trigger on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, username, avatar_url, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    LOWER(REGEXP_REPLACE(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')),
    NEW.raw_user_meta_data->>'avatar_url',
    'active'
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

-- Auto backfill any users already in auth.users
INSERT INTO public.users (id, email, full_name, username, avatar_url, status)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  LOWER(REGEXP_REPLACE(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')),
  raw_user_meta_data->>'avatar_url',
  'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 6. Notes Table with Full-Text Search (FTS)
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 10000),
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- 7. Tags Table (100% Private to each user)
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 2 AND length(name) <= 30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_user_tag UNIQUE (user_id, name)
);

CREATE UNIQUE INDEX idx_tags_user_lower_name ON public.tags (user_id, LOWER(name));

-- 8. Note-Tags Junction
CREATE TABLE public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  is_manual BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual',
  confidence_score NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

-- 9. Mentions Table (Links Notes directly to real registered teammates)
CREATE TABLE public.mentions (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

-- 10. High-Performance Indexes for 10,000+ Notes
CREATE INDEX idx_notes_user_created ON public.notes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_fts ON public.notes USING GIN (fts);
CREATE INDEX idx_tags_user ON public.tags (user_id);
CREATE INDEX idx_note_tags_note ON public.note_tags (note_id);
CREATE INDEX idx_note_tags_tag ON public.note_tags (tag_id);
CREATE INDEX idx_mentions_user ON public.mentions (user_id);
CREATE INDEX idx_mentions_note ON public.mentions (note_id);
CREATE INDEX idx_users_username ON public.users (LOWER(username));

-- 11. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- 12. Row Level Security Policies
-- Users Directory (Read-only for team autocomplete)
CREATE POLICY "Users directory view" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Notes (Author sees own notes, teammates see notes where tagged)
CREATE POLICY "Notes view own or mentioned" ON public.notes
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND deleted_at IS NULL)
    OR
    (EXISTS (
      SELECT 1 FROM public.mentions m 
      WHERE m.note_id = notes.id AND m.user_id = auth.uid()
    ) AND deleted_at IS NULL)
  );

CREATE POLICY "Notes insert own" ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Notes update own" ON public.notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Notes delete own" ON public.notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Tags (100% Private to author)
CREATE POLICY "Tags own only" ON public.tags
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Note Tags Junction
CREATE POLICY "Note tags view accessible" ON public.note_tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_tags.note_id
      AND (n.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.mentions m WHERE m.note_id = n.id AND m.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Note tags mutate own notes" ON public.note_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_tags.note_id AND n.user_id = auth.uid()
    )
  );

-- Mentions Table
CREATE POLICY "Mentions view accessible" ON public.mentions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = mentions.note_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "Mentions insert author only" ON public.mentions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = mentions.note_id AND n.user_id = auth.uid()
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
