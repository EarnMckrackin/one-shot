import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

export async function POST(request) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const mode = String(form.get("mode") || "signin");
  const origin = new URL(request.url).origin;

  if (!email || !password) {
    return errorResponse("Email and password are required.");
  }

  const supabase = await createClient();
  const { error } = mode === "signup"
    ? await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${origin}/api/auth/callback?next=/home` },
      })
    : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return errorResponse(error.message);
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
