import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { enrichComicIssue } from "../../../../lib/comic-enrichment";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const issueInput = body.issue ?? {};
  let comic = null;

  if (body.comicId) {
    const { data, error } = await supabase
      .from("comics")
      .select("id, title, issue_number, description, cover_url, release_date, writers, artists, characters, series:series_id(name), publisher:publisher_id(name)")
      .eq("id", body.comicId)
      .eq("user_id", user.id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    comic = data;
  }

  const enriched = await enrichComicIssue({
    ...(comic ?? {}),
    ...issueInput,
    series_name: issueInput.series_name || comic?.series?.name,
    publisher: issueInput.publisher || comic?.publisher?.name,
  });

  if (comic && enriched) {
    const patch = buildPatch(comic, enriched);
    if (Object.keys(patch).length > 0) {
      await supabase.from("comics").update(patch).eq("id", comic.id).eq("user_id", user.id);
    }
  }

  return NextResponse.json({ issue: enriched });
}

function buildPatch(comic, enriched) {
  const patch = {};
  if (!comic.description && enriched.description) patch.description = enriched.description;
  if (!comic.cover_url && enriched.cover_url) patch.cover_url = enriched.cover_url;
  if (!comic.release_date && enriched.release_date) patch.release_date = enriched.release_date;
  if (!comic.writers?.length && enriched.writers?.length) patch.writers = enriched.writers;
  if (!comic.artists?.length && enriched.artists?.length) patch.artists = enriched.artists;
  if (!comic.characters?.length && enriched.characters?.length) patch.characters = enriched.characters;
  return patch;
}

