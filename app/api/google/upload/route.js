import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../lib/supabase";
import { getDriveClient, uploadPDFToDrive, decryptTokens } from "../../../../lib/google-drive";

export async function POST(request) {
  try {
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
    const { data: integration, error: integrationError } = await admin
      .from("user_integrations")
      .select("tokens")
      .eq("user_id", user.id)
      .eq("provider", "google_drive")
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: "Google Drive not connected" }, { status: 403 });
    }

    const tokens = decryptTokens(integration.tokens);
    const drive  = getDriveClient(tokens);

    const buffer   = Buffer.from(await file.arrayBuffer());
    const driveInfo = await uploadPDFToDrive(drive, buffer, file.name);

    // Update comic record
    const { error: updateError } = await supabase
      .from("comics")
      .update({
        has_pdf:       true,
        drive_file_id: driveInfo.drive_file_id,
        drive_view_url: driveInfo.drive_view_url,
      })
      .eq("id", comicId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return NextResponse.json(driveInfo);
  } catch (error) {
    console.error("[google/upload]", error);
    return NextResponse.json(
      { error: userFacingUploadError(error) },
      { status: googleStatus(error) }
    );
  }
}

function googleStatus(error) {
  const status = error?.response?.status || error?.code || error?.status;
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}

function userFacingUploadError(error) {
  const status = googleStatus(error);
  const message = error?.response?.data?.error_description ||
    error?.response?.data?.error?.message ||
    error?.message ||
    "Could not upload PDF.";

  if (status === 401) return "Google Drive authorization expired. Reconnect Google Drive in Settings and try again.";
  if (status === 403) return "Google Drive rejected the upload. Confirm Drive API access and reconnect Google Drive in Settings.";
  if (status === 413) return "This PDF is too large for the current upload path.";
  return message;
}
