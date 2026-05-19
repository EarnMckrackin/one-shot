import { getWeeklyReleases as getComicVineWeeklyReleases } from "./comicvine";
import { getWeeklyReleases as getMetronWeeklyReleases } from "./metron";

const LEAGUE_BASE = "https://leagueofcomicgeeks.com";
const PREVIEWS_BASE = "https://previewsworld.com";
const GENERIC_HEADERS = new Set([
  "PREMIER PUBLISHERS",
  "COMICS & GRAPHIC NOVELS",
  "TRADE PAPERBACKS/MANGA",
  "TRADE PAPERBACKS",
  "MAGAZINES",
  "BOOKS",
  "MERCHANDISE",
  "TOYS",
  "TOYS / STATUES / MODELS",
  "GAMES",
  "APPAREL",
  "NEW RELEASES",
  "DOWNLOAD RELEASE LIST",
  "ORDER",
  "WISH LIST",
]);

export async function fetchWeeklyReleases(dateStr) {
  const providers = [
    { name: "Previews World", load: () => fetchPreviewsWorldReleases(dateStr) },
    { name: "Metron", load: () => getMetronWeeklyReleases(dateStr) },
    { name: "ComicVine", load: () => getComicVineWeeklyReleases(dateStr) },
    { name: "League of Comic Geeks", load: () => fetchLeagueReleases(dateStr) },
  ];

  const failures = [];

  for (const provider of providers) {
    try {
      const releases = await provider.load();
      if (Array.isArray(releases) && releases.length > 0) {
        return {
          releases,
          source: provider.name,
          warning: failures.length > 0 ? failures.join(" | ") : null,
        };
      }
      failures.push(`${provider.name}: no releases returned`);
    } catch (error) {
      failures.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(failures.join(" | ") || "No release provider succeeded");
}

async function fetchPreviewsWorldReleases(dateStr) {
  const releaseDate = formatPreviewsDate(dateStr);
  const url = `${PREVIEWS_BASE}/NewReleases/Export?format=txt&releaseDate=${encodeURIComponent(releaseDate)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:       "text/plain,text/html;q=0.9,*/*;q=0.8",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`Previews ${res.status}`);
  const text = await res.text();
  return parsePreviewsWorldText(text, dateStr);
}

async function fetchLeagueReleases(dateStr) {
  const url = dateStr
    ? `${LEAGUE_BASE}/comics/new-releases/${dateStr}`
    : `${LEAGUE_BASE}/comics/new-releases`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:       "text/html",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`LOCG ${res.status}`);
  const html = await res.text();
  return parseLeagueReleases(html);
}

function parseLeagueReleases(html) {
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

function parsePreviewsWorldText(rawText, dateStr) {
  const text = String(rawText ?? "").replace(/\s+/g, " ").trim();
  if (!text || /\bNo Items Found\b/i.test(text)) return [];

  // Build an ordered list of publisher section headers with their text positions.
  // Previews groups items under ALL-CAPS publisher headings; we detect them by
  // looking for an uppercase phrase immediately followed by an item code.
  const publisherSections = [];
  const headerPattern = /\b([A-Z][A-Z0-9!&.'\/\- ]{3,})\b(?=\s+[A-Z]{3}\d{6,})/g;
  let hm;
  while ((hm = headerPattern.exec(text)) !== null) {
    let name = hm[1].replace(/\s+/g, " ").trim();
    // The greedy regex can fuse a generic section label with the publisher name
    // (e.g. "PREMIER PUBLISHERS MARVEL COMICS"). Strip any leading generic labels.
    let stripped = true;
    while (stripped) {
      stripped = false;
      for (const header of GENERIC_HEADERS) {
        if (name.startsWith(header + " ")) {
          name = name.slice(header.length).trim();
          stripped = true;
          break;
        }
      }
    }
    if (!name || GENERIC_HEADERS.has(name) || /\$\d/.test(name)) continue;
    if (name.split(" ").length <= 6) {
      publisherSections.push({ name, index: hm.index });
    }
  }

  const releases = [];
  const itemPattern = /\b([A-Z]{3}\d{6,})\b\s+(.+?)\s+\$(\d+\.\d{2})/g;
  let match;

  while ((match = itemPattern.exec(text)) !== null) {
    const [, itemCode, rawTitle, rawPrice] = match;
    const title = cleanTitle(rawTitle);

    if (!looksLikeComicRelease(title)) continue;

    // Find the closest publisher section header that appears before this item
    let publisher = null;
    for (let i = publisherSections.length - 1; i >= 0; i--) {
      if (publisherSections[i].index < match.index) {
        publisher = publisherSections[i].name;
        break;
      }
    }

    const issueNumber = extractIssueNumber(title);
    const seriesName = extractSeriesName(title, issueNumber);

    releases.push({
      cv_id:        itemCode,
      league_id:    itemCode,
      volume_cv_id: "",
      title,
      series_name:  seriesName,
      issue_number: issueNumber,
      publisher,
      cover_url:    null,
      price:        Number(rawPrice),
      store_date:   dateStr,
    });
  }

  return dedupeReleases(releases);
}

function dedupeReleases(releases) {
  const bestByKey = new Map();

  for (const release of releases) {
    const key = makeReleaseKey(release);
    const current = bestByKey.get(key);
    if (!current || scoreRelease(release) > scoreRelease(current)) {
      bestByKey.set(key, release);
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    const byPublisher = (a.publisher ?? "").localeCompare(b.publisher ?? "");
    if (byPublisher !== 0) return byPublisher;
    return a.title.localeCompare(b.title);
  });
}

function makeReleaseKey(release) {
  if (release.series_name && release.issue_number) {
    return `${normalizeToken(release.series_name)}#${release.issue_number}`;
  }
  return normalizeToken(release.title);
}

function scoreRelease(release) {
  let score = 0;
  if (/\bCVR A\b/i.test(release.title)) score += 4;
  if (!/\b(CVR|VARIANT|VIRGIN|FOIL|BLANK|SKETCH|INCENTIVE|B&W)\b/i.test(release.title)) score += 3;
  if (!/\b(2ND PTG|3RD PTG|4TH PTG|PRINTING)\b/i.test(release.title)) score += 2;
  score -= release.price ?? 0;
  return score;
}

function cleanTitle(title) {
  return title
    .replace(/\s+/g, " ")
    .replace(/\s+\(\s*POLYBAGGED.*?\)/gi, "")
    .trim();
}


function extractIssueNumber(title) {
  const match = title.match(/#\s?([0-9][0-9A-Z.\-]*)\b/i);
  return match ? match[1] : null;
}

function extractSeriesName(title, issueNumber) {
  if (issueNumber) {
    const markerIndex = title.toUpperCase().indexOf(`#${String(issueNumber).toUpperCase()}`);
    if (markerIndex >= 0) return title.slice(0, markerIndex).trim();
  }
  return title.replace(/\s+\b(TP|HC|GN|SC)\b.*$/i, "").trim();
}

function looksLikeComicRelease(title) {
  if (!title) return false;
  if (/\b(STATUE|BUST|FIGURE|BANK|PLUSH|PROP|PUZZLE|T-SHIRT|HOODIE|MUG|POSTER|CALENDAR|MODEL KIT|ACTION FIGURE)\b/i.test(title)) {
    return false;
  }
  return true;
}

function formatPreviewsDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-");
  return `${month}/${day}/${year}`;
}

function normalizeToken(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchReleasesToPullList(releases, pullListSeriesNames) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalized = pullListSeriesNames.map(normalize);
  return releases.filter((r) =>
    normalized.some((n) => normalize(r.series_name || r.title).includes(n))
  );
}
