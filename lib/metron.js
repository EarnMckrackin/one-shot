// Metron Comic Database API — metron.cloud
// Auth: Token header. Register at metron.cloud to get a token.

const BASE = "https://metron.cloud/api";

function metronHeaders() {
  const credentials = Buffer.from(`${process.env.METRON_USERNAME}:${process.env.METRON_PASSWORD}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    "User-Agent":  "OneShot/1.0",
    Accept:        "application/json",
  };
}

async function metronFetch(path, params = {}) {
  const qs  = new URLSearchParams(params);
  const url = `${BASE}${path}/?${qs}`;
  const res = await fetch(url, {
    headers: metronHeaders(),
    next:    { revalidate: 3600 },
  });
  if (res.status === 401) throw new Error("Metron API: invalid or missing token");
  if (!res.ok)           throw new Error(`Metron API ${res.status}`);
  return res.json();
}

export async function searchComics(query, options = {}) {
  const data = await metronFetch("/issue", { name: query, limit: options.limit ?? 10 });
  return (data.results ?? []).map(normalizeIssue);
}

export async function searchSeries(query) {
  const data = await metronFetch("/series", { name: query, limit: 10 });
  return (data.results ?? []).map(normalizeSeries);
}

export async function getWeeklyReleases(dateStr) {
  const data = await metronFetch("/issue", {
    store_date_range_after:  dateStr,
    store_date_range_before: addDays(dateStr, 6),
    limit:                   200,
  });
  return (data.results ?? []).map(normalizeRelease);
}

export async function getIssue(metronId) {
  const data = await metronFetch(`/issue/${metronId}`, {});
  return normalizeIssue(data);
}

export async function getRelatedIssues(characters = [], series = "") {
  if (!characters.length && !series) return [];
  const query = characters.slice(0, 2).join(" ") || series;
  return searchComics(query);
}

function normalizeIssue(r) {
  const seriesName = r.series?.name ?? r.series_name ?? null;
  return {
    metron_id:    r.id ? String(r.id) : null,
    source:       "Metron",
    title:        r.issue_name || seriesName || "Unknown",
    issue_number: r.number ?? r.issue_number ?? null,
    series_name:  seriesName,
    publisher:    r.publisher?.name ?? r.series?.publisher?.name ?? null,
    cover_url:    r.image ?? null,
    release_date: r.cover_date ?? null,
    description:  r.desc ? stripHtml(r.desc) : null,
    writers:      (r.credits ?? []).filter(c => c.role?.name?.toLowerCase().includes("writer")).map(c => c.creator),
    artists:      (r.credits ?? []).filter(c => /pencil|artist|draw/i.test(c.role?.name ?? "")).map(c => c.creator),
    characters:   (r.characters ?? []).map(c => c.name ?? c),
  };
}

function normalizeRelease(r) {
  const seriesName = r.series?.name ?? r.series_name ?? null;
  return {
    cv_id:        r.id ? String(r.id) : null,
    metron_id:    r.id ? String(r.id) : null,
    volume_cv_id: "",
    title:        r.issue || (seriesName ? `${seriesName} #${r.number ?? "?"}` : "Unknown"),
    series_name:  seriesName,
    issue_number: r.number ?? r.issue_number ?? null,
    publisher:    r.publisher?.name ?? r.series?.publisher?.name ?? null,
    cover_url:    r.image ?? null,
    store_date:   r.store_date ?? null,
    price:        null,
  };
}

function normalizeSeries(r) {
  return {
    metron_id:   r.id ? String(r.id) : null,
    name:        r.name,
    publisher:   r.publisher?.name ?? null,
    cover_url:   r.image ?? null,
    start_year:  r.year_began ?? null,
    issue_count: r.issue_count ?? null,
    description: r.desc ? stripHtml(r.desc) : null,
  };
}

function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, "").trim();
}

function addDays(dateStr, days) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}
