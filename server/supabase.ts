import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// MUST run before createClient() — module import order matters (index.ts imports
// supabase.ts before it can call dotenv.config itself).
dotenv.config({ path: ['../.env.local', '../.env', '.env.local', '.env'] });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

// Primary User identity for password auth mode. All notes/tags/contacts are owned by this user.
export const DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';

// Auto-provision demo user record in `users` table on backend server startup
export async function ensureDemoUserExists() {
  if (!supabase) return;
  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('id', DEMO_USER_ID)
      .maybeSingle();

    if (!data) {
      console.log('👤 Provisioning default DEMO_USER_ID record in `users` table...');
      const { error } = await supabase.from('users').upsert({
        id: DEMO_USER_ID,
        full_name: 'Mindshare Primary User',
        email: 'user@mindshare.app',
        username: 'mindshare_user',
        status: 'active',
      }, { onConflict: 'id' });

      if (error) {
        console.error('[Supabase] Failed to provision default user:', error.message);
      } else {
        console.log('✅ Default DEMO_USER_ID provisioned successfully.');
      }
    }
  } catch (err: any) {
    console.warn('[Supabase] Demo user check warning:', err.message);
  }
}
