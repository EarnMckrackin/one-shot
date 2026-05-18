import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { getAuthUrl } from "../../../../lib/google-drive";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = getAuthUrl(new URL("/api/google/callback", request.url).toString());
  return NextResponse.redirect(url);
}
