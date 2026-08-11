import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_KEY en el .env');
}

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
