import { createClient } from '@supabase/supabase-js';

// Pastikan untuk mengganti URL dan ANON KEY dengan miliki proyek Supabase Anda
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL atau Anon Key belum disetel di .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
