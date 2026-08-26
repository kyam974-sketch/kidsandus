import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zuaalqhbesywmfvuvgho.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1YWFscWhiZXN5d21mdnV2Z2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODM1OTksImV4cCI6MjA4OTM1OTU5OX0.9drUMBRWudHc_jh3n0pJaybr2qKZUCQvAezuGzb2pGI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
