import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hwgrswtahduyqxfokbwj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3Z3Jzd3RhaGR1eXF4Zm9rYndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MjU5MjcsImV4cCI6MjA5OTUwMTkyN30.dYGi4p6sugrbGsxWMFFu6_tKp80k-W_370horkfdTpM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'mkuv2-auth',
  },
});
