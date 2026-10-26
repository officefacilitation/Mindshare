-- Migration: Add reminder_at and is_completed to notes table
-- Enables single-user executive task management and phone/desktop notifications

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notes_reminder ON public.notes (user_id, reminder_at) 
WHERE reminder_at IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
