"use client";
import { createBrowserClient } from "@supabase/ssr";

// Lazily initialized so SSR/build never hits this with missing env vars
let _client;
function getClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _client;
}

export const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; },
});
