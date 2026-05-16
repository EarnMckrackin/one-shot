import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { getWeeklyReleases } from "../../../lib/comicvine";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  let releases = [];
  try {
    releases = await getWeeklyReleases(date);
  } catch (e) {
    return NextResponse.json({ releases: [], pullMatches: [], warning: e.message });
  }

  const { data: pullList } = await supabase
    .from("pull_list")
    .select("series:series_id ( name )")
    .eq("active", true);

  const normalize = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedPull = (pullList ?? []).map((i) => normalize(i.series?.name));

  const pullMatches = releases
    .filter((r) => normalizedPull.some((n) => n && normalize(r.series_name || r.title).includes(n)))
    .map((r) => r.cv_id);

  return NextResponse.json({ releases, pullMatches });
}
