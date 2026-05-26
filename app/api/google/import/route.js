import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileId, filename } = await request.json();
  if (!fileId || !filename) return NextResponse.json({ error: "fileId and filename required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("comics")
    .select("id")
    .eq("user_id", user.id)
    .eq("drive_file_id", fileId)
    .maybeSingle();

  if (existing) return NextResponse.json({ comicId: existing.id, existing: true });

  const title = filename.replace(/\.pdf$/i, "").trim();

  const { data: comic, error } = await supabase
    .from("comics")
    .insert({ user_id: user.id, title, has_pdf: true, drive_file_id: fileId })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comicId: comic.id, existing: false });
}
