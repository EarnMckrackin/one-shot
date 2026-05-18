import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchComics as metronSearch } from "../../../lib/metron";
import { searchComics as cvSearch } from "../../../lib/comicvine";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query: manualQuery, publisher } = await request.json();
  if (!manualQuery) return NextResponse.json({ error: "query required" }, { status: 400 });

  const extracted = extractQueryParts(manualQuery, publisher);
  const [metron, cv] = await Promise.allSettled([metronSearch(manualQuery), cvSearch(manualQuery)]);
  const metronResults = metron.status === "fulfilled" ? metron.value : [];
  const cvResults     = cv.status === "fulfilled"     ? cv.value     : [];
  const results = rankResults(mergeResults(metronResults, cvResults), extracted);
  return NextResponse.json({ extracted, results });
}

function mergeResults(primary, secondary) {
  const normalize = (r) => `${norm(r.series_name ?? r.title)}|${normalizeIssue(r.issue_number)}|${norm(r.publisher)}`;
  const seen = new Set(primary.map(normalize));
  return [...primary, ...secondary.filter((r) => !seen.has(normalize(r)))];
}

function rankResults(results, extracted) {
  const scored = results
    .filter((r) => r.issue_number != null || r.series_name != null)
    .map((result) => ({ ...result, match_score: scoreResult(result, extracted) }))
    .sort((a, b) => b.match_score - a.match_score);

  const exactIssue = extracted.issue
    ? scored.filter((r) => normalizeIssue(r.issue_number) === normalizeIssue(extracted.issue))
    : [];
  const exactPublisher = extracted.publisher
    ? exactIssue.filter((r) => norm(r.publisher) === norm(extracted.publisher))
    : [];
  const strongSeries = extracted.series
    ? (exactPublisher.length ? exactPublisher : exactIssue).filter((r) => seriesMatchStrength(r, extracted) >= 2)
    : [];

  const preferred =
    strongSeries.length >= 1 ? strongSeries :
    exactPublisher.length >= 1 ? exactPublisher :
    exactIssue.length >= 1 ? exactIssue :
    scored;

  return preferred.slice(0, 12);
}

function scoreResult(r, extracted) {
  let score = 0;

  if (extracted.issue && r.issue_number != null) {
    const ext = normalizeIssue(extracted.issue);
    const res = normalizeIssue(r.issue_number);
    if (res === ext) score += 100;
    else if (res.startsWith(ext) || ext.startsWith(res)) score += 18;
    else score -= 20;
  }

  score += seriesMatchStrength(r, extracted) * 24;

  if (r.cover_url) score += 1;

  if (extracted.publisher && r.publisher) {
    const extP = norm(extracted.publisher);
    const resP = norm(r.publisher);
    if (resP === extP) score += 35;
    else if (resP.includes(extP) || extP.includes(resP)) score += 10;
    else score -= 8;
  }

  if (r.source === "Metron") score += 2;

  return score;
}

function seriesMatchStrength(r, extracted) {
  if (!extracted.series || !r.series_name) return 0;

  const extN = norm(extracted.series);
  const resN = norm(r.series_name);
  if (!extN || !resN) return 0;
  if (resN === extN) return 4;
  if (resN.includes(extN) || extN.includes(resN)) return 2;

  const extTokens = tokenSet(extracted.series);
  const resTokens = tokenSet(r.series_name);
  const overlap = [...extTokens].filter((token) => resTokens.has(token)).length;
  if (overlap >= Math.min(2, extTokens.size)) return 1;
  return 0;
}

function extractQueryParts(query, publisher) {
  const issueMatch = String(query).match(/(?:^|\s)#\s*([0-9]+(?:\.[0-9]+)?[a-z]?)/i)
    || String(query).match(/\b(?:issue|no\.?|number)\s*#?\s*([0-9]+(?:\.[0-9]+)?[a-z]?)/i)
    || String(query).match(/\s([0-9]{1,4}[a-z]?)$/i);

  const issue = issueMatch?.[1] ?? null;
  const series = String(query)
    .replace(/(?:^|\s)#\s*[0-9]+(?:\.[0-9]+)?[a-z]?/ig, " ")
    .replace(/\b(?:issue|no\.?|number)\s*#?\s*[0-9]+(?:\.[0-9]+)?[a-z]?/ig, " ")
    .replace(/\s[0-9]{1,4}[a-z]?$/i, " ")
    .trim();

  return {
    series: series || null,
    issue,
    publisher: publisher || null,
  };
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

function tokenSet(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !["the", "and", "comic", "comics"].includes(token))
  );
}
