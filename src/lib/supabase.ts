import { createClient } from '@supabase/supabase-js'
// Browser uses the project URL and publishable/anon key only.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string)
