const BASE = "https://comicvine.gamespot.com/api";

async function cvFetch(endpoint, params = {}) {
  const qs = new URLSearchParams({
    api_key: process.env.COMICVINE_API_KEY,
    format:  "json",
    ...params,
  });
  const res = await fetch(`${BASE}${endpoint}/?${qs}`, {
    headers: { "User-Agent": "OneShot/1.0" },
    next:    { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`ComicVine ${res.status}`);
  const data = await res.json();
  if (data.status_code !== 1) throw new Error(data.error);
  return data;
}

export async function searchComics(query, options = {}) {
  const data = await cvFetch("/search", {
    query,
    resources:  "issue",
    field_list: "id,name,issue_number,volume,image,cover_date,description,person_credits,character_credits",
    limit:      options.limit ?? 10,
  });
  return data.results.map(normalizeIssue);
}

export async function searchSeries(query) {
  const data = await cvFetch("/search", {
    query,
    resources:  "volume",
    field_list: "id,name,publisher,image,start_year,count_of_issues,description",
    limit:      10,
  });
  return data.results.map(normalizeSeries);
}

export async function getWeeklyReleases(dateStr) {
  const data = await cvFetch("/issues", {
    filter:     `store_date:${dateStr}|${dateStr}`,
    field_list: "id,name,issue_number,volume,image,store_date,cover_date",
    sort:       "volume:asc",
    limit:      100,
  });
  return (data.results ?? []).map(normalizeRelease);
}

function normalizeRelease(r) {
  const series = r.volume?.name ?? null;
  return {
    cv_id:        String(r.id),
    volume_cv_id: String(r.volume?.id ?? ""),
    title:        series ? `${series} #${r.issue_number ?? "?"}` : (r.name || "Unknown"),
    series_name:  series,
    issue_number: r.issue_number ?? null,
    publisher:    r.volume?.publisher?.name ?? null,
    cover_url:    r.image?.medium_url || r.image?.original_url || null,
    store_date:   r.store_date ?? null,
    price:        null,
  };
}

export async function getRelatedIssues(characters = [], writers = []) {
  if (!characters.length && !writers.length) return [];
  const query = [...characters, ...writers].slice(0, 3).join(" ");
  return searchComics(query);
}

function normalizeIssue(r) {
  return {
    comicvine_id: String(r.id),
    source:       "ComicVine",
    title:        r.name || r.volume?.name || "Unknown",
    issue_number: r.issue_number,
    series_name:  r.volume?.name,
    publisher:    r.volume?.publisher?.name ?? null,
    cover_url:    r.image?.medium_url || r.image?.original_url,
    release_date: r.cover_date,
    description:  r.description ? stripHtml(r.description) : null,
    writers:      (r.person_credits || []).filter(p => p.role?.includes("writer")).map(p => p.name),
    artists:      (r.person_credits || []).filter(p => p.role?.includes("artist") || p.role?.includes("penciler")).map(p => p.name),
    characters:   (r.character_credits || []).map(c => c.name),
  };
}

function normalizeSeries(r) {
  return {
    comicvine_id: String(r.id),
    name:         r.name,
    publisher:    r.publisher?.name,
    cover_url:    r.image?.medium_url || r.image?.original_url,
    start_year:   r.start_year,
    issue_count:  r.count_of_issues,
    description:  r.description ? stripHtml(r.description) : null,
  };
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}
