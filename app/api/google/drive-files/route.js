import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";
import { getDriveClient, listPDFsInFolder, decryptTokens } from "../../../../lib/google-drive";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("user_integrations")
    .select("tokens, drive_folder_id")
    .eq("user_id", user.id)
    .eq("provider", "google_drive")
    .single();

  if (!integration) return NextResponse.json({ error: "Google Drive not connected" }, { status: 403 });
  if (!integration.drive_folder_id) {
    return NextResponse.json({ error: "No folder configured", code: "no_folder" }, { status: 400 });
  }

  const drive = getDriveClient(decryptTokens(integration.tokens));

  let files;
  try {
    files = await listPDFsInFolder(drive, integration.drive_folder_id);
  } catch (e) {
    const status = e?.response?.status;
    const googleMessage = e?.response?.data?.error?.message ?? e?.message ?? "Unknown error";
    console.error("[google/drive-files] list error", status, googleMessage);
    if (status === 401 || status === 403) {
      return NextResponse.json({
        error: `Drive access denied: ${googleMessage}`,
        code: "reauth",
      }, { status: 403 });
    }
    return NextResponse.json({ error: googleMessage }, { status: status ?? 500 });
  }

  const fileIds = files.map(f => f.id);
  const { data: existing } = fileIds.length
    ? await supabase.from("comics").select("id, drive_file_id").eq("user_id", user.id).in("drive_file_id", fileIds)
    : { data: [] };

  const importedMap = Object.fromEntries((existing ?? []).map(c => [c.drive_file_id, c.id]));

  return NextResponse.json({
    files: files.map(f => ({
      id:           f.id,
      name:         f.name,
      size:         f.size ? Number(f.size) : null,
      modifiedTime: f.modifiedTime,
      imported:     Boolean(importedMap[f.id]),
      comicId:      importedMap[f.id] ?? null,
    })),
  });
}
