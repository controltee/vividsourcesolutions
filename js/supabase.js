// supabase.js — the single Supabase client for the whole site.
//
// Loaded from esm.sh as an ES module: this is the ONE piece of third-party
// runtime code the site allows (see CLAUDE.md). The version is pinned so the
// bytes are reproducible; esm.sh is whitelisted in the CSP's script-src, and
// the Supabase project host in connect-src.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
