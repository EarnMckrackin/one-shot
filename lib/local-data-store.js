"use client";

const PREFIX = "oneshot:";
const LIBRARY_KEY = `${PREFIX}library-cache:v4`;
const RELEASES_KEY = `${PREFIX}releases-cache:v3`;
const BOUGHT_RELEASES_KEY = `${PREFIX}bought-releases:v1`;
const READER_KEY = `${PREFIX}reader-progress:v1`;
const LIBRARY_PREFS_KEY = `${PREFIX}library-prefs:v1`;

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

export function readBoughtReleaseKeys() {
  const keys = readEnvelope(BOUGHT_RELEASES_KEY, []);
  return Array.isArray(keys) ? keys : [];
}

export function addBoughtReleaseKeys(keys) {
  const next = new Set(readBoughtReleaseKeys());
  for (const key of keys ?? []) {
    if (key) next.add(String(key));
  }
  writeEnvelope(BOUGHT_RELEASES_KEY, Array.from(next));
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

export function readLibraryPrefs() {
  return readEnvelope(LIBRARY_PREFS_KEY, {
    pubFilter: "",
    seriesFilter: "",
    releaseFilter: "",
    formatFilter: "Both",
    sortBy: "created_desc",
  });
}

export function writeLibraryPrefs(prefs) {
  writeEnvelope(LIBRARY_PREFS_KEY, prefs);
}

export function localConnectionState() {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.onLine ? "online" : "offline";
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
