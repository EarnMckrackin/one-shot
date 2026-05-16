import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { fetchWeeklyReleases, matchReleasesToPullList } from "../../../lib/league";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? null;

  let releases = [];
  try {
    releases = await fetchWeeklyReleases(date);
  } catch {
    return NextResponse.json({ releases: [], pullMatches: [], warning: "Weekly releases unavailable" });
  }

  // Get user's pull list series names for matching
  const { data: pullList } = await supabase
    .from("pull_list")
    .select("series:series_id ( name )")
    .eq("active", true);

  const seriesNames = (pullList ?? []).map((i) => i.series?.name).filter(Boolean);
  const pullMatches = matchReleasesToPullList(releases, seriesNames).map((r) => r.league_id);

  return NextResponse.json({ releases, pullMatches });
}
