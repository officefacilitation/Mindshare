-- ========================================================
-- FIX: Prior Tags & Shared Note Tags Visibility (Non-Destructive)
-- Mindshare Team Workspace
-- ========================================================

-- 1. Ensure tags table permits SELECT across workspace members
-- This allows teammates tagged in notes to see the tags attached to those notes,
-- while keeping tag INSERT, UPDATE, and DELETE strictly restricted to the tag's owner.

DO $$
BEGIN
  -- Drop existing restrictive SELECT policy if present
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' AND policyname = 'Tags own only'
  ) THEN
    DROP POLICY "Tags own only" ON public.tags;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' AND policyname = 'Tags view directory'
  ) THEN
    DROP POLICY "Tags view directory" ON public.tags;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tags' AND policyname = 'Tags mutate own only'
  ) THEN
    DROP POLICY "Tags mutate own only" ON public.tags;
  END IF;
END $$;

-- Policy 1: Authenticated/anon can read tags (e.g. #design, #bug) on notes they view
CREATE POLICY "Tags view directory" ON public.tags
  FOR SELECT TO authenticated, anon
  USING (true);

-- Policy 2: Users can mutate (INSERT, UPDATE, DELETE) only their own tags
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

-- Ensure lowercase unique index exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_lower_name ON public.tags (user_id, LOWER(name));

NOTIFY pgrst, 'reload schema';
