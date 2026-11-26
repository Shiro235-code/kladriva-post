import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Client Supabase unique côté navigateur. La sécurité repose sur les règles RLS (supabase/schema.sql). */
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-key",
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  }
  return client;
}
