// Metron Comic Database API — metron.cloud
// Auth: Token header. Register at metron.cloud to get a token.

const BASE = "https://metron.cloud/api";

function metronHeaders() {
  return {
    Authorization: `Token ${process.env.METRON_API_TOKEN}`,
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

export async function searchComics(query) {
  const data = await metronFetch("/issue", { name: query, limit: 10 });
  return (data.results ?? []).map(normalizeIssue);
}

export async function searchSeries(query) {
  const data = await metronFetch("/series", { name: query, limit: 10 });
  return (data.results ?? []).map(normalizeSeries);
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
    title:        r.issue_name || seriesName || "Unknown",
    issue_number: r.number ?? r.issue_number ?? null,
    series_name:  seriesName,
    publisher:    r.publisher?.name ?? null,
    cover_url:    r.image ?? null,
    release_date: r.cover_date ?? null,
    description:  r.desc ? stripHtml(r.desc) : null,
    writers:      (r.credits ?? []).filter(c => c.role?.name?.toLowerCase().includes("writer")).map(c => c.creator),
    artists:      (r.credits ?? []).filter(c => /pencil|artist|draw/i.test(c.role?.name ?? "")).map(c => c.creator),
    characters:   (r.characters ?? []).map(c => c.name ?? c),
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
