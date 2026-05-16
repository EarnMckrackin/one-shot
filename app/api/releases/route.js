import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { fetchWeeklyReleases } from "../../../lib/league";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? getCurrentReleaseDate();

  let releases = [];
  let source = null;
  let warning = null;
  try {
    const result = await fetchWeeklyReleases(date);
    releases = result.releases ?? [];
    source = result.source ?? null;
    warning = result.warning ?? null;
  } catch (e) {
    return NextResponse.json({ releases: [], pullMatches: [], warning: e.message, source: null });
  }

  const { data: pullList } = await supabase
    .from("pull_list")
    .select("series:series_id ( name, comicvine_id )")
    .eq("active", true);

  const normalize = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedPull = (pullList ?? []).map((i) => normalize(i.series?.name));

  const pullMatches = releases
    .filter((r) => normalizedPull.some((n) => n && normalize(r.series_name || r.title).includes(n)))
    .map((r) => r.cv_id);

  return NextResponse.json({ releases, pullMatches, source, warning });
}

function getCurrentReleaseDate() {
  const today = new Date();
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const day = anchor.getDay();
  const daysSinceWed = (day - 3 + 7) % 7;
  anchor.setDate(anchor.getDate() - daysSinceWed);
  const year = anchor.getFullYear();
  const month = String(anchor.getMonth() + 1).padStart(2, "0");
  const date = String(anchor.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}
