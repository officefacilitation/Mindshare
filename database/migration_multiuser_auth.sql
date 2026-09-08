-- ========================================================
-- MINDSHARE MULTI-USER PRIVACY & AUTH MIGRATION SCRIPT (FIXED)
-- Run this in your Supabase Project SQL Editor
-- ========================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Users Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  status TEXT CHECK (status IN ('active', 'invited', 'pending')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Safely add any columns if users table pre-existed
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 3. Automatic User Profile Creation Trigger on Auth Signup
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing auth.users into public.users
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

-- 4. Notes Table with Full-Text Search (FTS)
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 10000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Safely add FTS vector column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'fts'
  ) THEN
    ALTER TABLE public.notes ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
  END IF;
END $$;

-- 5. Tags Table (Strictly Private per User)
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 2 AND length(name) <= 30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS user_id UUID;

DROP INDEX IF EXISTS idx_tags_lower_name;
DROP INDEX IF EXISTS idx_tags_user_lower_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_lower_name ON public.tags (user_id, LOWER(name));

-- 6. Note-Tags Junction
CREATE TABLE IF NOT EXISTS public.note_tags (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  is_manual BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual',
  confidence_score NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

ALTER TABLE public.note_tags ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT TRUE;
ALTER TABLE public.note_tags ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 7. Mentions Table (Migration from old contact_id to real registered user_id)
-- Safe migration: Check if old mentions table used contact_id or mentioned_user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mentions' AND column_name = 'contact_id'
  ) THEN
    -- Drop old mock contacts foreign key and table structure
    DROP TABLE IF EXISTS public.mentions CASCADE;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'mentions' AND column_name = 'mentioned_user_id'
  ) THEN
    DROP TABLE IF EXISTS public.mentions CASCADE;
  END IF;
END $$;

-- Clean creation of real multi-user mentions table
CREATE TABLE IF NOT EXISTS public.mentions (
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);

-- Ensure user_id column exists if table wasn't dropped
ALTER TABLE public.mentions ADD COLUMN IF NOT EXISTS user_id UUID;

-- 8. High-Performance Indexes for 10,000+ Notes Scale
DROP INDEX IF EXISTS idx_mentions_contact;
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON public.notes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_fts ON public.notes USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_tags_user ON public.tags (user_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON public.note_tags (note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON public.note_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON public.mentions (user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_note ON public.mentions (note_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (LOWER(username));

-- 9. Row Level Security (RLS) Configuration
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- Clean existing policies safely
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'notes', 'tags', 'note_tags', 'mentions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public all on %s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users directory view" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users update own profile" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Notes view own or mentioned" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Notes insert own" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Notes update own" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Notes delete own" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tags own only" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Note tags view accessible" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Note tags mutate own notes" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Mentions view accessible" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Mentions insert author only" ON %I', t);
  END LOOP;
END $$;

-- Policy: Users table
CREATE POLICY "Users directory view" ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy: Notes table (Personal notes + notes where tagged)
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

-- Policy: Tags table (100% Private to each user)
CREATE POLICY "Tags own only" ON public.tags
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Note Tags Junction
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

-- Policy: Mentions Table
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
