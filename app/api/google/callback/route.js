import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { getTokensFromCode, encryptTokens } from "../../../../lib/google-drive";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/settings?google=denied", request.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const tokens    = await getTokensFromCode(code, new URL("/api/google/callback", request.url).toString());

  if (!tokens.refresh_token) {
    console.error("Google OAuth callback: no refresh_token returned. Scopes granted:", tokens.scope);
  }

  const encrypted = encryptTokens(tokens);

  const { error: upsertError } = await supabase.from("user_integrations").upsert({
    user_id:   user.id,
    provider:  "google_drive",
    tokens:    encrypted,
    connected: true,
  }, { onConflict: "user_id,provider" });

  if (upsertError) {
    console.error("Google Drive token upsert failed:", upsertError.message);
    return NextResponse.redirect(new URL("/settings?google=error", request.url));
  }

  return NextResponse.redirect(new URL("/settings?google=connected", request.url));
}
