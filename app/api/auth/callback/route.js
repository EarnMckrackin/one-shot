import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const next  = searchParams.get("next") ?? "/";

  // Validate redirect target stays on our origin
  const redirectTo = next.startsWith("/") ? `${origin}${next}` : origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
