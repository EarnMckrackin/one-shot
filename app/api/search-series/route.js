import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchSeries as metronSearch } from "../../../lib/metron";
import { searchSeries as cvSearch } from "../../../lib/comicvine";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q");
  if (!q) return NextResponse.json({ results: [] });

  const [metron, cv] = await Promise.allSettled([metronSearch(q), cvSearch(q)]);

  const metronResults = metron.status === "fulfilled" ? metron.value : [];
  const cvResults     = cv.status === "fulfilled"     ? cv.value     : [];

  const normalize = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Set(metronResults.map((r) => normalize(r.name)));
  const unique = cvResults.filter((r) => !seen.has(normalize(r.name)));

  const yearSuffix = /\.\d{4}$/;
  const merged = [...metronResults, ...unique].filter(
    (r) => r.name && !yearSuffix.test(r.name) && (r.issue_count == null || r.issue_count > 0)
  );

  console.log("[search-series]", {
    q, metron: metron.status, metronLen: metronResults.length,
    cv: cv.status, cvLen: cvResults.length, mergedLen: merged.length,
    sample: merged.slice(0, 2).map(r => ({ name: r.name, publisher: r.publisher, start_year: r.start_year })),
  });

  return NextResponse.json({ results: merged });
}
