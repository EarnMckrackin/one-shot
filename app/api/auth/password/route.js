import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

export async function POST(request) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = String(form.get("mode") || "signin");
  const origin = new URL(request.url).origin;

  if (!email || !password) {
    if (mode !== "magic") {
      return errorResponse("Email and password are required.");
    }
  }

  if (!email) {
    return errorResponse("Email is required.");
  }

  const supabase = await createClient();
  const redirectTo = `${origin}/api/auth/confirm?next=/home`;
  const { error } = mode === "signup"
    ? await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      })
    : mode === "magic"
    ? await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      })
    : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return errorResponse(error.message);
  }

  if (mode === "signup") {
    return successResponse("Check your email", "Confirm your account from the email we sent, then return to OneShot and sign in.");
  }

  if (mode === "magic") {
    return successResponse("Magic link sent", "Check your email and use the link to finish signing in.");
  }

  return NextResponse.redirect(new URL("/home", request.url), 303);
}

function errorResponse(message) {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign in failed</title>
        <style>
          body { margin: 0; padding: 24px; background: #101014; color: #f5f5f5; font: 16px -apple-system, BlinkMacSystemFont, sans-serif; }
          main { max-width: 420px; margin: 20vh auto 0; }
          a { color: #ffcc33; }
        </style>
      </head>
      <body>
        <main>
          <h1>Sign in failed</h1>
          <p>${escapeHtml(message)}</p>
          <p><a href="/login">Back to login</a></p>
        </main>
      </body>
    </html>`,
    {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  );
}

function successResponse(title, message) {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; padding: 24px; background: #101014; color: #f5f5f5; font: 16px -apple-system, BlinkMacSystemFont, sans-serif; }
          main { max-width: 420px; margin: 20vh auto 0; }
          a { color: #ffcc33; }
        </style>
      </head>
      <body>
        <main>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
          <p><a href="/login">Back to login</a></p>
        </main>
      </body>
    </html>`,
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
