import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseMissing = !supabaseUrl || !supabaseAnonKey
export const initError = supabaseMissing
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  : null
export const supabase = supabaseMissing
  ? null
  : createClient(supabaseUrl, supabaseAnonKey)
