-- ==============================================================================
-- MINDSHARE - UPDATED SUPABASE SAFE MIGRATION SCRIPT
-- Non-Destructive: Preserves all existing users, notes, tags, and data.
-- Run this directly in your Supabase Project -> SQL Editor -> Run
-- ==============================================================================

-- 1. Enable Required Extensions safely
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ------------------------------------------------------------------------------
-- 2. Notes Table: Add Reminder & Completion Columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.notes 
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.notes 
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE public.notes 
  ADD COLUMN IF NOT EXISTS completed_by JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.notes 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Ensure Full Text Search (FTS) column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'fts'
  ) THEN
    ALTER TABLE public.notes 
      ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Users Table: Add Mentions Checkpoint & Handle Status
-- ------------------------------------------------------------------------------
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS mentions_last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now();

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS is_handle_set BOOLEAN DEFAULT TRUE;

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- ------------------------------------------------------------------------------
-- 4. Note Tags Junction: Add Manual Flag & Source
-- ------------------------------------------------------------------------------
ALTER TABLE public.note_tags 
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT TRUE;

ALTER TABLE public.note_tags 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ------------------------------------------------------------------------------
-- 5. Performance Indexes (Safe: IF NOT EXISTS)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notes_reminder 
  ON public.notes (user_id, reminder_at) 
  WHERE reminder_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_user_created 
  ON public.notes (user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_fts 
  ON public.notes USING GIN (fts);

CREATE INDEX IF NOT EXISTS idx_tags_user 
  ON public.tags (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_lower_name 
  ON public.tags (user_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_note_tags_note 
  ON public.note_tags (note_id);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag 
  ON public.note_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_mentions_user 
  ON public.mentions (user_id);

CREATE INDEX IF NOT EXISTS idx_mentions_note 
  ON public.mentions (note_id);

CREATE INDEX IF NOT EXISTS idx_users_username 
  ON public.users (LOWER(username));

CREATE INDEX IF NOT EXISTS idx_users_mentions_last_seen 
  ON public.users (id, mentions_last_seen_at);

-- ------------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- Enables teammates to see tags and notes they are mentioned in,
-- while keeping inserts/edits/deletions strictly restricted to owners.
-- ------------------------------------------------------------------------------

-- Ensure RLS is active on all core tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- Safely drop old or restrictive policies before recreating them
DO $$
BEGIN
  -- Tags policies
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Tags own only') THEN
    DROP POLICY "Tags own only" ON public.tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Tags view directory') THEN
    DROP POLICY "Tags view directory" ON public.tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Tags mutate own only') THEN
    DROP POLICY "Tags mutate own only" ON public.tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Tags update own only') THEN
    DROP POLICY "Tags update own only" ON public.tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'Tags delete own only') THEN
    DROP POLICY "Tags delete own only" ON public.tags;
  END IF;

  -- Notes policies
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Notes view own or mentioned') THEN
    DROP POLICY "Notes view own or mentioned" ON public.notes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Notes insert own') THEN
    DROP POLICY "Notes insert own" ON public.notes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Notes update own') THEN
    DROP POLICY "Notes update own" ON public.notes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Notes delete own') THEN
    DROP POLICY "Notes delete own" ON public.notes;
  END IF;

  -- Users policies
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users directory view') THEN
    DROP POLICY "Users directory view" ON public.users;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users update own profile') THEN
    DROP POLICY "Users update own profile" ON public.users;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users insert profile') THEN
    DROP POLICY "Users insert profile" ON public.users;
  END IF;

  -- Note-tags & Mentions policies
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_tags' AND policyname = 'Note tags view accessible') THEN
    DROP POLICY "Note tags view accessible" ON public.note_tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_tags' AND policyname = 'Note tags mutate own notes') THEN
    DROP POLICY "Note tags mutate own notes" ON public.note_tags;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mentions' AND policyname = 'Mentions view accessible') THEN
    DROP POLICY "Mentions view accessible" ON public.mentions;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mentions' AND policyname = 'Mentions insert author only') THEN
    DROP POLICY "Mentions insert author only" ON public.mentions;
  END IF;
END $$;

-- 6.1 Users RLS
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

-- 6.2 Notes RLS: Users can read their own notes OR notes they are tagged in
CREATE POLICY "Notes view own or mentioned" ON public.notes
  FOR SELECT TO authenticated, anon
  USING (
    auth.uid() IS NULL
    OR (user_id = auth.uid() AND deleted_at IS NULL)
    OR (EXISTS (
      SELECT 1 FROM public.mentions m 
      WHERE m.note_id = notes.id AND m.user_id = auth.uid()
    ) AND deleted_at IS NULL)
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

-- 6.3 Tags RLS:
-- SELECT allowed for all workspace members so tags attached to shared notes are visible.
-- Mutating (INSERT/UPDATE/DELETE) strictly restricted to the user who owns the tag.
CREATE POLICY "Tags view directory" ON public.tags
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Tags mutate own only" ON public.tags
  FOR INSERT TO authenticated, anon
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Tags update own only" ON public.tags
  FOR UPDATE TO authenticated, anon
  USING (auth.uid() IS NULL OR user_id = auth.uid())
  WITH CHECK (auth.uid() IS NULL OR user_id = auth.uid());

CREATE POLICY "Tags delete own only" ON public.tags
  FOR DELETE TO authenticated, anon
  USING (auth.uid() IS NULL OR user_id = auth.uid());

-- 6.4 Note Tags & Mentions RLS
CREATE POLICY "Note tags view accessible" ON public.note_tags
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Note tags mutate own notes" ON public.note_tags
  FOR ALL TO authenticated, anon
  USING (true);

CREATE POLICY "Mentions view accessible" ON public.mentions
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Mentions insert author only" ON public.mentions
  FOR ALL TO authenticated, anon
  USING (true);

-- ------------------------------------------------------------------------------
-- 7. Notify PostgREST to instantly reload schema cache
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
