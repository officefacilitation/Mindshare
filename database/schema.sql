-- ========================================================
-- MINDSHARE MULTI-USER SAAS DATABASE SCHEMA (Supabase PostgreSQL)
-- Target Scale: 10,000+ Notes with Multi-Tenancy, FTS, & AI Job Queue
-- ========================================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('active', 'invited', 'pending')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Seed Default Primary User (Prevents FK violation when inserting notes in single-user mode)
INSERT INTO users (id, full_name, email, username, status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Mindshare Primary User',
  'user@mindshare.app',
  'mindshare_user',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Notes Table (Core Thoughts) with Generated FTS Vector
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 10000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

-- Migration Alters for Pre-Existing Live Database Tables
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Safely add FTS vector column to existing table if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'fts'
  ) THEN
    ALTER TABLE notes ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
  END IF;
END $$;

-- 3. Tags Table (Topics & Hashtags)
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 2 AND length(name) <= 30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Drop deprecated global unique index and create multi-tenant unique index per user
DROP INDEX IF EXISTS idx_tags_lower_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_lower_name ON tags (user_id, LOWER(name));

-- 4. Note-Tags Junction (Many-to-Many with AI Metadata)
CREATE TABLE IF NOT EXISTS note_tags (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  is_manual BOOLEAN DEFAULT TRUE,
  source TEXT DEFAULT 'manual',
  confidence_score NUMERIC(3,2) DEFAULT 1.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, tag_id)
);

ALTER TABLE note_tags ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE note_tags ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) DEFAULT 1.00;

-- 5. User Contacts (Team / Person Directory)
CREATE TABLE IF NOT EXISTS user_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL,
  is_registered BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE user_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_owner_username ON user_contacts (owner_user_id, LOWER(username)) WHERE deleted_at IS NULL;

-- 6. Mentions Table (Links Notes to Contacts)
CREATE TABLE IF NOT EXISTS mentions (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES user_contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (note_id, contact_id)
);

-- 7. AI Queue Job Table (Async Processing & Retries)
CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_error TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- High-Performance Production Indexes
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notes_fts ON notes USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_note ON note_tags (tag_id, note_id);
CREATE INDEX IF NOT EXISTS idx_mentions_note ON mentions(note_id);
CREATE INDEX IF NOT EXISTS idx_mentions_contact ON mentions(contact_id);
CREATE INDEX IF NOT EXISTS idx_mentions_contact_note ON mentions (contact_id, note_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue ON ai_jobs (status, scheduled_at) WHERE status IN ('pending', 'processing');

-- Enable Row Level Security (RLS) & Public Access Policies for API Client
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies for Anon Client Keys & API
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'notes', 'tags', 'note_tags', 'user_contacts', 'mentions', 'ai_jobs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow public all on %s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "Allow public all on %s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- Atomic Stored Procedure: Create Note with Tags and Mentions
CREATE OR REPLACE FUNCTION create_note_with_relations(
  p_user_id UUID,
  p_content TEXT,
  p_tags TEXT[],
  p_contact_ids UUID[]
) RETURNS UUID AS $$
DECLARE
  v_note_id UUID;
  v_tag_name TEXT;
  v_tag_id UUID;
  v_contact_id UUID;
BEGIN
  -- Insert Note
  INSERT INTO notes (user_id, content)
  VALUES (p_user_id, p_content)
  RETURNING id INTO v_note_id;

  -- Process Tags
  IF p_tags IS NOT NULL AND array_length(p_tags, 1) > 0 THEN
    FOREACH v_tag_name IN ARRAY p_tags LOOP
      v_tag_name := LOWER(TRIM(v_tag_name));
      IF length(v_tag_name) >= 2 THEN
        INSERT INTO tags (user_id, name)
        VALUES (p_user_id, v_tag_name)
        ON CONFLICT (user_id, LOWER(name)) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_tag_id;

        INSERT INTO note_tags (note_id, tag_id, is_manual, source)
        VALUES (v_note_id, v_tag_id, TRUE, 'manual')
        ON CONFLICT (note_id, tag_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Process Mentions
  IF p_contact_ids IS NOT NULL AND array_length(p_contact_ids, 1) > 0 THEN
    FOREACH v_contact_id IN ARRAY p_contact_ids LOOP
      INSERT INTO mentions (note_id, contact_id)
      VALUES (v_note_id, v_contact_id)
      ON CONFLICT (note_id, contact_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Enqueue AI Job
  INSERT INTO ai_jobs (note_id, user_id, status, payload)
  VALUES (v_note_id, p_user_id, 'pending', jsonb_build_object('content', p_content));

  RETURN v_note_id;
END;
$$ LANGUAGE plpgsql;
