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
    field_list: "id,name,issue_number,volume,image,store_date,cover_date,description,person_credits,character_credits",
    limit:      options.limit ?? 10,
  });
  const results = data.results.map(normalizeIssue);

  // ComicVine search doesn't embed publisher in volume; batch-fetch it separately.
  const volumeIds = [...new Set(data.results.map(r => r.volume?.id).filter(Boolean))];
  if (volumeIds.length > 0) {
    try {
      const volData = await cvFetch("/volumes", {
        filter:     `id:${volumeIds.join("|")}`,
        field_list: "id,publisher",
        limit:      Math.min(volumeIds.length, 100),
      });
      const pubMap = {};
      for (const vol of volData.results ?? []) {
        if (vol.publisher?.name) pubMap[String(vol.id)] = vol.publisher.name;
      }
      for (let i = 0; i < results.length; i++) {
        const volId = data.results[i]?.volume?.id;
        if (!results[i].publisher && volId) {
          results[i] = { ...results[i], publisher: pubMap[String(volId)] ?? null };
        }
      }
    } catch { /* best-effort */ }
  }

  return results;
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

  const releases = (data.results ?? []).map(normalizeRelease);

  // The issues endpoint doesn't return publisher inside volume; fetch it via
  // a single batch call to /volumes using all unique volume IDs.
  const volumeIds = [...new Set(releases.map(r => r.volume_cv_id).filter(Boolean))];
  if (volumeIds.length > 0) {
    try {
      const volData = await cvFetch("/volumes", {
        filter:     `id:${volumeIds.join("|")}`,
        field_list: "id,publisher",
        limit:      Math.min(volumeIds.length, 100),
      });
      const pubMap = {};
      for (const vol of volData.results ?? []) {
        if (vol.publisher?.name) pubMap[String(vol.id)] = vol.publisher.name;
      }
      for (const rel of releases) {
        if (!rel.publisher && rel.volume_cv_id) {
          rel.publisher = pubMap[rel.volume_cv_id] ?? null;
        }
      }
    } catch {
      // Publisher enrichment is best-effort; releases still usable without it
    }
  }

  return releases;
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
    release_date: r.store_date ?? r.cover_date ?? null,
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
