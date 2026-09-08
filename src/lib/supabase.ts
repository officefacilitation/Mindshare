import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  'https://pyhsxxmrlbrwnklafyee.supabase.co';

const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5aHN4eG1ybGJyd25rbGFmeWVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MjAxNzksImV4cCI6MjEwMTk5NjE3OX0.YzKek43c8cSG6QHshoss9c6cJ2eCU17ZL8goEcdgvQo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
