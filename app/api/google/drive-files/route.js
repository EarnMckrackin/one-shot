import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";
import { getDriveClient, listPDFsInFolder, decryptTokens, encryptTokens, getOAuthClient } from "../../../../lib/google-drive";

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

  let tokens;
  try {
    tokens = decryptTokens(integration.tokens);
  } catch (e) {
    console.error("drive-files: token decryption failed:", e.message);
    return NextResponse.json({ error: "Drive credentials corrupted. Reconnect Google Drive.", code: "reauth" }, { status: 403 });
  }

  if (!tokens.refresh_token) {
    console.error("drive-files: no refresh_token in stored credentials — user must reconnect");
    return NextResponse.json({ error: "Drive access expired. Reconnect Google Drive.", code: "reauth" }, { status: 403 });
  }

  // Explicitly refresh the access token so it's valid for this request.
  // Googleapis auto-refreshes but only pre-call; saving the result avoids
  // hitting Google's refresh endpoint on every request after expiry.
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  try {
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Empty token returned from getAccessToken");
    const fresh = auth.credentials;
    if (fresh.access_token !== tokens.access_token) {
      const { error: saveErr } = await admin
        .from("user_integrations")
        .update({ tokens: encryptTokens({ ...tokens, ...fresh }) })
        .eq("user_id", user.id)
        .eq("provider", "google_drive");
      if (saveErr) console.error("drive-files: failed to save refreshed token:", saveErr.message);
      tokens = { ...tokens, ...fresh };
    }
  } catch (e) {
    console.error("drive-files: token refresh failed:", e?.response?.status, e?.response?.data ?? e.message);
    return NextResponse.json({ error: "Drive authorization expired. Reconnect Google Drive.", code: "reauth" }, { status: 403 });
  }

  const grantedScope = tokens.scope ?? "";
  if (!grantedScope.includes("drive.readonly") && !grantedScope.includes("drive ")) {
    console.error("drive-files: token missing drive.readonly scope. Granted scopes:", grantedScope);
    return NextResponse.json({
      error: "Drive read permission not granted. In Google Cloud Console add the drive.readonly scope to your OAuth consent screen, then Reconnect.",
      code: "reauth",
    }, { status: 403 });
  }

  const drive = getDriveClient(tokens);

  let files;
  try {
    files = await listPDFsInFolder(drive, integration.drive_folder_id);
  } catch (e) {
    const status = e?.response?.status;
    console.error("drive-files: listPDFsInFolder failed:", status, e?.response?.data ?? e.message);
    if (status === 401 || status === 403) {
      const googleMsg = e?.response?.data?.error?.message ?? e?.response?.data?.error?.status ?? "no detail";
      return NextResponse.json({ error: `Drive API ${status}: ${googleMsg}`, code: "reauth" }, { status: 403 });
    }
    throw e;
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
