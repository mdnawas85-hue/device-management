import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// If Supabase env vars are missing, create a dummy client that won't crash the app.
// Auth will be bypassed and the dashboard shown directly.
export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON);

export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL!, SUPABASE_ANON!)
  : createClient('https://placeholder.supabase.co', 'placeholder-anon-key');
