import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "../../../../../lib/supabase";
import { decryptTokens, getDriveClient } from "../../../../../lib/google-drive";

export async function GET(_request, { params }) {
  const { comicId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: comic, error: comicError } = await supabase
    .from("comics")
    .select("id, title, issue_number, drive_file_id")
    .eq("id", comicId)
    .eq("user_id", user.id)
    .single();

  if (comicError || !comic?.drive_file_id) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }

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

  const drive = getDriveClient(decryptTokens(integration.tokens));
  const file = await drive.files.get(
    { fileId: comic.drive_file_id, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const filename = `${comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}.pdf`
    .replace(/[^\w .#-]+/g, "")
    .trim() || "comic.pdf";

  return new Response(Buffer.from(file.data), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
