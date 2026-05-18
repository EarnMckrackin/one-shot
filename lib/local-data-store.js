"use client";

const PREFIX = "oneshot:";
const LIBRARY_KEY = `${PREFIX}library-cache:v2`;
const RELEASES_KEY = `${PREFIX}releases-cache:v1`;
const READER_KEY = `${PREFIX}reader-progress:v1`;
const PRICE_KEY = `${PREFIX}price-cache:v1`;

export function readLocalLibrary() {
  const current = readEnvelope(LIBRARY_KEY, { comics: [], savedAt: null });
  return {
    comics: Array.isArray(current.comics) ? current.comics : [],
    savedAt: current.savedAt ?? null,
  };
}

export function writeLocalLibrary(comics) {
  writeEnvelope(LIBRARY_KEY, {
    comics: Array.isArray(comics) ? comics : [],
    savedAt: new Date().toISOString(),
  });
}

export function upsertLocalLibraryComic(comic) {
  if (!comic?.id) return;
  const library = readLocalLibrary();
  const normalized = {
    ...comic,
    read_count: comic.read_count ?? comic.reading_log?.length ?? 0,
  };
  writeLocalLibrary([
    normalized,
    ...library.comics.filter((item) => String(item.id) !== String(comic.id)),
  ]);
}

export function removeLocalLibraryComic(comicId) {
  const library = readLocalLibrary();
  writeLocalLibrary(library.comics.filter((comic) => String(comic.id) !== String(comicId)));
}

export function readCachedReleases(date) {
  const cache = readEnvelope(RELEASES_KEY, {});
  return cache[date] ?? null;
}

export function writeCachedReleases(date, payload) {
  const cache = readEnvelope(RELEASES_KEY, {});
  cache[date] = {
    ...payload,
    cachedAt: new Date().toISOString(),
  };
  writeEnvelope(RELEASES_KEY, cache);
}

export function readReaderProgress(comicId) {
  const cache = readEnvelope(READER_KEY, {});
  return cache[comicId] ?? null;
}

export function writeReaderProgress(comicId, progress) {
  const cache = readEnvelope(READER_KEY, {});
  cache[comicId] = {
    ...cache[comicId],
    ...progress,
    updatedAt: new Date().toISOString(),
  };
  writeEnvelope(READER_KEY, cache);
}

export function readPriceCache() {
  return readEnvelope(PRICE_KEY, {});
}

export function writePriceCacheFromReleases(releases) {
  const cache = readPriceCache();
  for (const release of releases ?? []) {
    const key = priceKey(release);
    if (!key || !Number.isFinite(release.price)) continue;
    const previous = cache[key]?.latest ?? null;
    cache[key] = {
      latest: release.price,
      previous,
      title: release.title,
      series_name: release.series_name,
      issue_number: release.issue_number,
      updatedAt: new Date().toISOString(),
    };
  }
  writeEnvelope(PRICE_KEY, cache);
}

export function getLocalPriceForComic(comic) {
  const key = priceKey({
    title: comic.title,
    series_name: comic.series?.name,
    issue_number: comic.issue_number,
  });
  return key ? readPriceCache()[key] ?? null : null;
}

export function localConnectionState() {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.onLine ? "online" : "offline";
}

function priceKey(item) {
  const source = `${item?.series_name || item?.title || ""}|${item?.issue_number ?? ""}`;
  const key = source.toLowerCase().replace(/[^a-z0-9|]/g, "");
  return key === "|" ? "" : key;
}

function readEnvelope(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeEnvelope(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
