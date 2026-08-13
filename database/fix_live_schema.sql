-- ========================================================
-- MINDSHARE - LIVE DATABASE FIX SCRIPT
-- --------------------------------------------------------
-- Run this in your Supabase dashboard:
--   supabase.com/dashboard -> SQL Editor -> New query -> Paste -> Run
--
-- It fixes two live-DB problems that silently break note saving:
--   1. RLS is ENABLED on notes/tags/note_tags/mentions but NO policies
--      exist, so the browser anon key cannot INSERT (error 42501).
--   2. The live `mentions` table uses `mentioned_user_id` (FK -> users)
--      instead of `contact_id` (FK -> user_contacts), so the app's
--      insert and join queries fail (PGRST204 / PGRST200).
-- ========================================================

-- 1) Create permissive RLS policies for the browser anon key (and
--    authenticated role). The app is designed for permissive access.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'notes', 'tags', 'note_tags', 'user_contacts', 'mentions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public all on %s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow public all on %s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- 2) Align the `mentions` table with the app schema:
--    rename mentioned_user_id -> contact_id and point the FK at
--    user_contacts(id) instead of users(id). Safe on an empty table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentions' AND column_name = 'mentioned_user_id'
  ) THEN
    ALTER TABLE mentions DROP CONSTRAINT IF EXISTS mentions_mentioned_user_id_fkey;
    ALTER TABLE mentions RENAME COLUMN mentioned_user_id TO contact_id;
  END IF;
END $$;

ALTER TABLE mentions DROP CONSTRAINT IF EXISTS mentions_contact_id_fkey;
ALTER TABLE mentions ADD CONSTRAINT mentions_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES user_contacts(id) ON DELETE CASCADE;

-- 3) Make sure supporting indexes exist
CREATE INDEX IF NOT EXISTS idx_mentions_contact ON mentions(contact_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

-- 4) Backfill owner user_id on any existing rows created before the app
--    started sending it (single-user demo identity).
UPDATE notes SET user_id = '11111111-1111-1111-1111-111111111111' WHERE user_id IS NULL;
UPDATE tags  SET user_id = '11111111-1111-1111-1111-111111111111' WHERE user_id IS NULL;

-- 5) Force PostgREST to reload its schema cache so the new column shows up
NOTIFY pgrst, 'reload schema';
