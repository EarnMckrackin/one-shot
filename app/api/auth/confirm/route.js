import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

const EMAIL_OTP_TYPES = new Set(["email", "recovery", "invite", "email_change"]);

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") || "email";
  const next = safeNext(url.searchParams.get("next"));

  const supabase = await createClient();
  let error = null;

  if (tokenHash) {
    if (!EMAIL_OTP_TYPES.has(type)) {
      error = new Error("Unsupported email link type.");
    } else {
      ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
    }
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = new Error("Missing auth token.");
  }

  if (error) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "auth");
    loginUrl.searchParams.set("message", "Email link is invalid or has expired. Request a fresh link and try again.");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(next) {
  return next?.startsWith("/") ? next : "/home";
}
