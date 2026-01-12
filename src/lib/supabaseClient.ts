
import { createClient } from '@supabase/supabase-js';

// Configuration - User to fill these in via .env or directly here if local
const PROJECT_URL = import.meta.env.VITE_SUPABASE_URL || "https://ymtbyohlbuyflokcdpkl.supabase.co";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Q2g7A9zWZe_Lckjvwh3l3Q_PveJ8MHp";

export const supabase = createClient(PROJECT_URL, ANON_KEY);

export const checkSupabaseConnection = async () => {
    try {
        const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
        if (error) throw error;
        return { success: true, count };
    } catch (e) {
        return { success: false, error: e };
    }
};
