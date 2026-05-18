import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchComics as metronSearch } from "../../../lib/metron";
import { searchComics as cvSearch } from "../../../lib/comicvine";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seriesName = searchParams.get("series")?.trim();
  const seriesId = searchParams.get("seriesId")?.trim();
  const issueNumber = searchParams.get("issue")?.trim();
  const publisher = searchParams.get("publisher")?.trim();

  if (!seriesName) {
    return NextResponse.json({ error: "series is required" }, { status: 400 });
  }

  const [metron, cv] = await Promise.allSettled([
    metronSearch(seriesName, { limit: 30 }),
    cvSearch(seriesName, { limit: 30 }),
  ]);

  const providerResults = [
    ...(metron.status === "fulfilled" ? metron.value : []),
    ...(cv.status === "fulfilled" ? cv.value : []),
  ];

  let ownedQuery = supabase
    .from("comics")
    .select("id, comicvine_id, title, issue_number, series_id, series:series_id(name)")
    .eq("user_id", user.id);

  if (seriesId) ownedQuery = ownedQuery.eq("series_id", seriesId);
  const { data: ownedComics } = await ownedQuery;

  const ownedByIssue = new Map(
    (ownedComics ?? [])
      .filter((comic) => sameSeries(comic.series?.name, seriesName) || comic.series_id === seriesId)
      .map((comic) => [normalizeIssue(comic.issue_number), comic])
  );

  const currentIssue = issueValue(issueNumber);
  const issues = dedupeIssues(providerResults)
    .filter((issue) => sameSeries(issue.series_name, seriesName))
    .filter((issue) => {
      const value = issueValue(issue.issue_number);
      if (!Number.isFinite(value)) return false;
      return Number.isFinite(currentIssue) ? value !== currentIssue : true;
    })
    .filter((issue) => {
      if (!publisher || !issue.publisher) return true;
      return norm(issue.publisher) === norm(publisher) || norm(issue.publisher).includes(norm(publisher)) || norm(publisher).includes(norm(issue.publisher));
    })
    .sort((a, b) => issueValue(a.issue_number) - issueValue(b.issue_number))
    .slice(0, 30)
    .map((issue) => {
      const owned = ownedByIssue.get(normalizeIssue(issue.issue_number));
      return {
        ...issue,
        is_owned: Boolean(owned),
        library_id: owned?.id ?? null,
      };
    });

  return NextResponse.json({ issues });
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${norm(issue.series_name)}|${normalizeIssue(issue.issue_number)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameSeries(value, target) {
  const a = norm(value);
  const b = norm(target);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function issueValue(value) {
  const numeric = parseFloat(String(value ?? "").replace(/^#/, ""));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeIssue(value) {
  return String(value ?? "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase()
    .replace(/^0+(\d)/, "$1");
}

function norm(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
