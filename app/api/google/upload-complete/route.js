import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { comicId, drive_file_id, drive_view_url } = await request.json();
  if (!comicId || !drive_file_id) {
    return NextResponse.json({ error: "comicId and drive_file_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("comics")
    .update({
      has_pdf: true,
      drive_file_id,
      drive_view_url: drive_view_url ?? null,
    })
    .eq("id", comicId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message || "Could not save PDF to comic." }, { status: 500 });
  }

  return NextResponse.json({ drive_file_id, drive_view_url });
}
