import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false }, { status: 401 });

  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("user_integrations")
    .select("connected, drive_folder_id")
    .eq("user_id", user.id)
    .eq("provider", "google_drive")
    .maybeSingle();

  return NextResponse.json({
    connected:      Boolean(integration?.connected),
    drive_folder_id: integration?.drive_folder_id ?? null,
  });
}
