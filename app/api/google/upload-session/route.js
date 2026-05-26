import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";
import { createPDFUploadSession, decryptTokens } from "../../../../lib/google-drive";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { filename, fileSize } = await request.json();
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: integration, error } = await admin
      .from("user_integrations")
      .select("tokens, drive_folder_id")
      .eq("user_id", user.id)
      .eq("provider", "google_drive")
      .single();

    if (error || !integration) {
      return NextResponse.json(
        { error: "Google Drive not connected", code: "not_connected" },
        { status: 403 }
      );
    }

    const session = await createPDFUploadSession(
      decryptTokens(integration.tokens),
      filename,
      fileSize,
      integration.drive_folder_id ?? null,
    );

    return NextResponse.json(session);
  } catch (error) {
    console.error("[google/upload-session]", error);
    return NextResponse.json(
      {
        error: userFacingGoogleError(error),
        code: googleStatus(error) === 403 ? "drive_rejected" : "upload_session_failed",
      },
      { status: googleStatus(error) }
    );
  }
}

function googleStatus(error) {
  const status = error?.response?.status || error?.code || error?.status;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function userFacingGoogleError(error) {
  const status = googleStatus(error);
  if (status === 401) return "Google Drive authorization expired. Reconnect Google Drive in Settings and try again.";
  if (status === 403) return "Google Drive rejected the upload. Confirm Drive API access and reconnect Google Drive in Settings.";
  return error?.message || "Could not start Google Drive upload.";
}
