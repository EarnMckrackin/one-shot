import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { enrichComicIssue } from "../../../../lib/comic-enrichment";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: comics, error } = await supabase
    .from("comics")
    .select("id, title, issue_number, description, cover_url, release_date, writers, artists, characters, series:series_id(name), publisher:publisher_id(name)")
    .eq("user_id", user.id)
    .or("description.is.null,description.eq.");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;

  for (const comic of comics ?? []) {
    const enriched = await enrichComicIssue({
      ...comic,
      series_name: comic.series?.name,
      publisher: comic.publisher?.name,
    });
    if (!enriched?.description) continue;

    const patch = buildPatch(comic, enriched);
    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase
      .from("comics")
      .update(patch)
      .eq("id", comic.id)
      .eq("user_id", user.id);

    if (!updateError) updated += 1;
  }

  return NextResponse.json({ checked: comics?.length ?? 0, updated });
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
