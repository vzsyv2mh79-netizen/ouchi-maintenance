import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { browserAttachmentAuth } from "./attachment-auth-lifecycle";

let observing = false;
let client: SupabaseClient | undefined;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key);
  if (!observing && typeof window !== "undefined" && process.env.NEXT_PUBLIC_OUCHI_ATTACHMENTS_ENABLED === "true") {
    observing = true;
    client.auth.onAuthStateChange((_event, session) => {
      browserAttachmentAuth.observe(session?.user.id ?? null);
    });
  }
  return client;
}
