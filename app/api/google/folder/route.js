import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { folderId } = await request.json();
  if (!folderId || typeof folderId !== "string") {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_integrations")
    .update({ drive_folder_id: folderId })
    .eq("user_id", user.id)
    .eq("provider", "google_drive");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
