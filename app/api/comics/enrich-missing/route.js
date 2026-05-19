import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { enrichComicIssue } from "../../../../lib/comic-enrichment";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Step 1: copy publisher_id from series onto comics that are missing it
  const { data: missingPub } = await supabase
    .from("comics")
    .select("id, series:series_id(publisher_id)")
    .eq("user_id", user.id)
    .is("publisher_id", null)
    .not("series_id", "is", null);

  const pubBackfills = (missingPub ?? [])
    .filter(c => c.series?.publisher_id)
    .map(c => supabase.from("comics").update({ publisher_id: c.series.publisher_id }).eq("id", c.id).eq("user_id", user.id));
  await Promise.allSettled(pubBackfills);

  // Step 2: enrich comics missing description, release_date, or with a future (cover) date
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: comics, error } = await supabase
    .from("comics")
    .select("id, series_id, publisher_id, title, issue_number, description, cover_url, release_date, writers, artists, characters, series:series_id(id, name, publisher_id), publisher:publisher_id(name)")
    .eq("user_id", user.id)
    .or(`description.is.null,description.eq.,release_date.is.null,release_date.gt.${futureDate}`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;

  for (const comic of comics ?? []) {
    const enriched = await enrichComicIssue({
      ...comic,
      series_name: comic.series?.name,
      publisher: comic.publisher?.name,
    });
    if (!enriched) continue;

    const patch = buildPatch(comic, enriched);

    // Publisher upsert: find or create publisher record, then link to comic and series
    if (enriched.publisher && !comic.publisher_id) {
      const publisherId = await upsertPublisher(supabase, enriched.publisher);
      if (publisherId) {
        patch.publisher_id = publisherId;
        if (comic.series_id && !comic.series?.publisher_id) {
          await supabase.from("series").update({ publisher_id: publisherId }).eq("id", comic.series_id);
        }
      }
    }

    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase
      .from("comics")
      .update(patch)
      .eq("id", comic.id)
      .eq("user_id", user.id);

    if (!updateError) updated += 1;
  }

  return NextResponse.json({ checked: comics?.length ?? 0, updated, pubBackfilled: pubBackfills.length });
}

async function upsertPublisher(supabase, name) {
  const { data: existing } = await supabase
    .from("publishers")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: inserted } = await supabase
    .from("publishers")
    .insert({ name })
    .select("id")
    .single();
  return inserted?.id ?? null;
}

function buildPatch(comic, enriched) {
  const patch = {};
  if (!comic.description && enriched.description) patch.description = enriched.description;
  if (!comic.cover_url && enriched.cover_url) patch.cover_url = enriched.cover_url;
  if (looksLikeCoverDate(comic.release_date) && enriched.release_date) patch.release_date = enriched.release_date;
  if (!comic.writers?.length && enriched.writers?.length) patch.writers = enriched.writers;
  if (!comic.artists?.length && enriched.artists?.length) patch.artists = enriched.artists;
  if (!comic.characters?.length && enriched.characters?.length) patch.characters = enriched.characters;
  return patch;
}

function looksLikeCoverDate(dateStr) {
  if (!dateStr) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 7);
  return new Date(dateStr) > cutoff;
}
