-- Migration: Add mentions_last_seen_at to public.users for real-time cross-device mention tracking
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS mentions_last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Ensure index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_users_mentions_last_seen ON public.users (id, mentions_last_seen_at);
