import { searchComics as metronSearch } from "./metron";
import { searchComics as cvSearch } from "./comicvine";

export async function enrichComicIssue(input = {}) {
  const query = buildIssueQuery(input);
  if (!query) return null;

  const [metron, cv] = await Promise.allSettled([
    metronSearch(query, { limit: 12 }),
    cvSearch(query, { limit: 12 }),
  ]);

  const results = [
    ...(metron.status === "fulfilled" ? metron.value : []),
    ...(cv.status === "fulfilled" ? cv.value : []),
  ];

  return rankIssueResults(results, input)[0] ?? null;
}

function buildIssueQuery(input) {
  const series = input.series_name || input.series?.name || input.title;
  return [series, input.issue_number && `#${input.issue_number}`].filter(Boolean).join(" ").trim();
}

function rankIssueResults(results, input) {
  return results
    .filter((result) => result.issue_number != null || result.series_name)
    .map((result) => ({ ...result, enrichment_score: scoreIssueResult(result, input) }))
    .sort((a, b) => b.enrichment_score - a.enrichment_score);
}

function scoreIssueResult(result, input) {
  let score = 0;

  if (input.issue_number && result.issue_number != null) {
    score += normalizeIssue(input.issue_number) === normalizeIssue(result.issue_number) ? 100 : -30;
  }

  const inputSeries = input.series_name || input.series?.name || input.title;
  if (inputSeries && result.series_name) {
    const source = norm(inputSeries);
    const target = norm(result.series_name);
    if (source === target) score += 80;
    else if (source.includes(target) || target.includes(source)) score += 35;
    else score -= 20;
  }

  const inputPublisher = input.publisher || input.publisher_name || input.publisher?.name;
  if (inputPublisher && result.publisher) {
    const source = norm(inputPublisher);
    const target = norm(result.publisher);
    if (source === target) score += 30;
    else if (source.includes(target) || target.includes(source)) score += 10;
  }

  if (result.description) score += 20;
  if (result.cover_url) score += 3;
  if (result.source === "Metron") score += 2;

  return score;
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
