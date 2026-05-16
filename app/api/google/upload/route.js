import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";
import { getDriveClient, uploadPDFToDrive, decryptTokens } from "../../../../lib/google-drive";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file     = formData.get("file");
  const comicId  = formData.get("comicId");

  if (!file || !comicId) {
    return NextResponse.json({ error: "file and comicId required" }, { status: 400 });
  }

  // Retrieve stored Google tokens
  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("user_integrations")
    .select("tokens")
    .eq("user_id", user.id)
    .eq("provider", "google_drive")
    .single();

  if (!integration) {
    return NextResponse.json({ error: "Google Drive not connected" }, { status: 403 });
  }

  const tokens = decryptTokens(integration.tokens);
  const drive  = getDriveClient(tokens);

  const buffer   = Buffer.from(await file.arrayBuffer());
  const driveInfo = await uploadPDFToDrive(drive, buffer, file.name);

  // Update comic record
  await supabase
    .from("comics")
    .update({
      has_pdf:       true,
      drive_file_id: driveInfo.drive_file_id,
      drive_view_url: driveInfo.drive_view_url,
    })
    .eq("id", comicId)
    .eq("user_id", user.id);

  return NextResponse.json(driveInfo);
}
