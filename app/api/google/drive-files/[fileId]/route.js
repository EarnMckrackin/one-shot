import { createClient, createAdminClient } from "../../../../../lib/supabase";
import { getDriveClient, streamDriveFile, decryptTokens } from "../../../../../lib/google-drive";

export async function GET(request, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await params;

  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("user_integrations")
    .select("tokens")
    .eq("user_id", user.id)
    .eq("provider", "google_drive")
    .single();

  if (!integration) return new Response("Google Drive not connected", { status: 403 });

  const drive = getDriveClient(decryptTokens(integration.tokens));

  const meta = await drive.files.get({ fileId, fields: "name, size" });
  const nodeStream = await streamDriveFile(drive, fileId);

  const readable = new ReadableStream({
    start(controller) {
      nodeStream.on("data", chunk => controller.enqueue(chunk));
      nodeStream.on("end",  ()    => controller.close());
      nodeStream.on("error", err  => controller.error(err));
    },
  });

  return new Response(readable, {
    headers: {
      "content-type":        "application/pdf",
      "content-disposition": `attachment; filename="${meta.data.name}"`,
      ...(meta.data.size ? { "content-length": String(meta.data.size) } : {}),
    },
  });
}
