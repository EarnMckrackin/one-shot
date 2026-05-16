const BASE = "https://leagueofcomicgeeks.com";

export async function fetchWeeklyReleases(dateStr) {
  const url = dateStr
    ? `${BASE}/comics/new-releases/${dateStr}`
    : `${BASE}/comics/new-releases`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:       "text/html",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`LOCG ${res.status}`);
  const html = await res.text();
  return parseReleases(html);
}

function parseReleases(html) {
  const releases = [];
  const itemPattern      = /<li[^>]+class="[^"]*comic-item[^"]*"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
  const titlePattern     = /class="[^"]*comic-title[^"]*"[^>]*>([^<]+)<\/[a-z]+>/i;
  const issuePattern     = /#(\d+)/;
  const publisherPattern = /class="[^"]*publisher[^"]*"[^>]*>([^<]+)<\/[a-z]+>/i;
  const coverPattern     = /<img[^>]+src="([^"]+)"[^>]*class="[^"]*cover[^"]*"/i;

  let match;
  while ((match = itemPattern.exec(html)) !== null) {
    const [, leagueId, block] = match;
    const titleMatch      = titlePattern.exec(block);
    const publisherMatch  = publisherPattern.exec(block);
    const coverMatch      = coverPattern.exec(block);
    if (!titleMatch) continue;

    const rawTitle   = titleMatch[1].trim();
    const issueMatch = issuePattern.exec(rawTitle);

    releases.push({
      cv_id:        leagueId,
      league_id:    leagueId,
      volume_cv_id: "",
      title:        rawTitle,
      series_name:  issueMatch ? rawTitle.replace(/#\d+/, "").trim() : rawTitle,
      issue_number: issueMatch ? issueMatch[1] : null,
      publisher:    publisherMatch ? publisherMatch[1].trim() : null,
      cover_url:    coverMatch ? coverMatch[1] : null,
      price:        null,
    });
  }

  return releases;
}

export function matchReleasesToPullList(releases, pullListSeriesNames) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalized = pullListSeriesNames.map(normalize);
  return releases.filter((r) =>
    normalized.some((n) => normalize(r.series_name || r.title).includes(n))
  );
}
