"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";
import CustomSelect from "../../../components/CustomSelect";
import { addBoughtReleaseKeys, readBoughtReleaseKeys, readCachedReleases, readLocalLibrary, upsertLocalLibraryComic, writeCachedReleases } from "../../../lib/local-data-store";

function getWednesday(offset = 0) {
  const d = new Date();
  const anchor = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const day = anchor.getDay(); // 0=Sun … 3=Wed … 6=Sat
  const daysSinceWed = (day - 3 + 7) % 7; // 0 on Wed, 1 on Thu, etc.
  anchor.setDate(anchor.getDate() - daysSinceWed + offset * 7);
  return formatDate(anchor);
}

const normalize = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const DEFAULT_PRICE = 3.99;

export default function ReleasesClient() {
  const [releases, setReleases]       = useState([]);
  const [pullVolumeSet, setPullSet]   = useState(new Set());
  const [seriesIdMap, setSeriesIdMap] = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [weekOffset, setOffset]       = useState(0);
  const [toggling, setToggling]       = useState(null);
  const [adding, setAdding]           = useState(null);
  const [librarySet, setLibrarySet]   = useState(new Set());
  const [source, setSource]           = useState(null);
  const [warning, setWarning]         = useState(null);
  const [cacheInfo, setCacheInfo]     = useState(null);
  const [pubFilter, setPubFilter]     = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");

  const wednesday = getWednesday(weekOffset);
  const weekLabel = formatWeekLabel(wednesday);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setWarning(null);
    setCacheInfo(null);

    const cached = readCachedReleases(wednesday);
    if (cached?.releases?.length) {
      setReleases(cached.releases);
      setPullSet(new Set(cached.pullKeys ?? []));
      setSeriesIdMap(cached.seriesIdMap ?? {});
      setLibrarySet(buildLibraryKeySet(readLocalLibrary().comics, readBoughtReleaseKeys()));
      setSource(cached.source ?? "local cache");
      setWarning("Showing cached releases while refreshing.");
      setCacheInfo(cached.cachedAt);
    }

    Promise.all([
      fetch(`/api/releases?date=${wednesday}`).then(r => r.json()),
      supabase.from("pull_list")
        .select("series_id, series:series_id(name, comicvine_id, publisher:publisher_id(name))")
        .eq("active", true),
      supabase.from("comics")
        .select("id, title, issue_number, comicvine_id, series:series_id(name)"),
    ]).then(([{ releases: r, pullMatches, source: releaseSource, warning: releaseWarning }, { data: pl }, { data: library }]) => {
      const releaseList = r ?? [];
      setSource(releaseSource ?? null);
      setWarning(releaseWarning ?? null);

      // Build cv_id → series_db_id via name matching (works for LOCG + ComicVine)
      // Also backfill missing publisher names from Supabase series records
      const map = {};
      (pl ?? []).forEach(entry => {
        const sName = entry.series?.name;
        if (!sName) return;
        const publisherName = entry.series?.publisher?.name ?? null;
        // Prefer exact comicvine_id match
        const cvMatch = releaseList.find(rel => rel.volume_cv_id && rel.volume_cv_id === entry.series.comicvine_id);
        if (cvMatch) {
          if (!cvMatch.publisher && publisherName) cvMatch.publisher = publisherName;
          map[cvMatch.cv_id] = entry.series_id;
          return;
        }
        // Fall back to name match
        const nameMatch = releaseList.find(rel => normalize(rel.series_name) === normalize(sName));
        if (nameMatch) {
          if (!nameMatch.publisher && publisherName) nameMatch.publisher = publisherName;
          map[nameMatch.cv_id] = entry.series_id;
        }
      });

      // Set releases AFTER backfill so publisher names are present on first render
      setReleases([...releaseList]);
      setSeriesIdMap(map);
      const pullKeys = [...(pullMatches ?? []), ...Object.keys(map)];
      setPullSet(new Set(pullKeys));
      setLibrarySet(buildLibraryKeySet(library ?? [], readBoughtReleaseKeys()));
      writeCachedReleases(wednesday, {
        releases: releaseList,
        source: releaseSource ?? null,
        warning: releaseWarning ?? null,
        pullKeys,
        seriesIdMap: map,
      });
      setCacheInfo(new Date().toISOString());
    }).catch(e => {
      if (!cached?.releases?.length) setError(e.message);
      else setWarning(`Offline cache in use. ${e.message}`);
    })
      .finally(() => setLoading(false));
  }, [wednesday]);

  async function togglePullList(release) {
    const uid = release.cv_id;
    const { series_name, publisher, cover_url, volume_cv_id } = release;
    setToggling(uid);
    try {
      if (pullVolumeSet.has(uid)) {
        const seriesId = seriesIdMap[uid];
        if (seriesId) {
          await supabase.from("pull_list").update({ active: false }).eq("series_id", seriesId);
        }
        setPullSet(prev => { const s = new Set(prev); s.delete(uid); return s; });
        setSeriesIdMap(prev => { const m = { ...prev }; delete m[uid]; return m; });
      } else {
        const { data: { user } } = await supabase.auth.getUser();

        let publisherId = null;
        if (publisher) {
          const { data: pub } = await supabase.from("publishers")
            .upsert({ user_id: user.id, name: publisher }, { onConflict: "user_id,name" })
            .select("id").single();
          publisherId = pub?.id;
        }

        const { data: ser } = await supabase.from("series")
          .upsert({
            user_id:      user.id,
            publisher_id: publisherId,
            name:         series_name,
            comicvine_id: volume_cv_id || null,
            cover_url,
          }, { onConflict: "user_id,name" })
          .select("id").single();

        await supabase.from("pull_list")
          .upsert({ user_id: user.id, series_id: ser.id, active: true }, { onConflict: "user_id,series_id" });

        setPullSet(prev => new Set([...prev, uid]));
        setSeriesIdMap(prev => ({ ...prev, [uid]: ser.id }));
      }
    } finally {
      setToggling(null);
    }
  }

  async function addToLibrary(release) {
    const key = releaseKey(release);
    setAdding(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in.");
      const { series_name, publisher, cover_url, volume_cv_id } = release;

      let publisherId = null;
      if (publisher) {
        const { data: pub, error: publisherError } = await supabase.from("publishers")
          .upsert({ user_id: user.id, name: publisher }, { onConflict: "user_id,name" })
          .select("id").single();
        if (publisherError) throw publisherError;
        publisherId = pub?.id;
      }

      let seriesId = null;
      if (series_name) {
        const { data: ser, error: seriesError } = await supabase.from("series")
          .upsert({
            user_id:      user.id,
            publisher_id: publisherId,
            name:         series_name,
            comicvine_id: volume_cv_id || null,
            cover_url,
          }, { onConflict: "user_id,name" })
          .select("id").single();
        if (seriesError) throw seriesError;
        seriesId = ser?.id;
      }

      let existingQuery = supabase
        .from("comics")
        .select("id, description")
        .eq("user_id", user.id);

      existingQuery = seriesId
        ? existingQuery.eq("series_id", seriesId)
        : existingQuery.eq("title", release.title || series_name || "Untitled");

      existingQuery = release.issue_number
        ? existingQuery.eq("issue_number", release.issue_number)
        : existingQuery.is("issue_number", null);

      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw existingError;

      let libraryComicId = existing?.id ?? null;

      if (!existing) {
        const details = await enrichRelease(release);
        const { data: inserted, error } = await supabase.from("comics").insert({
          user_id:      user.id,
          series_id:    seriesId,
          publisher_id: publisherId,
          title:        details?.title || release.title || series_name || "Untitled",
          issue_number: details?.issue_number ?? release.issue_number ?? null,
          comicvine_id: details?.comicvine_id ?? release.cv_id ?? release.metron_id ?? null,
          cover_url:    cover_url || details?.cover_url,
          description:  details?.description ?? null,
          release_date: release.store_date ?? wednesday ?? details?.release_date ?? release.cover_date,
          writers:      details?.writers ?? null,
          artists:      details?.artists ?? null,
          characters:   details?.characters ?? null,
        }).select("id").single();
        if (error) throw error;
        libraryComicId = inserted?.id ?? null;
      } else if (!existing.description) {
        await fetch("/api/comics/enrich", {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({ comicId: existing.id }),
        });
      }

      if (libraryComicId) {
        const comic = await fetchLibraryComic(libraryComicId);
        if (comic) upsertLocalLibraryComic(comic);
      }

      const ownershipKey = releaseOwnershipKey(release);
      const boughtKeys = [ownershipKey, releaseKey(release)].filter(Boolean);
      addBoughtReleaseKeys(boughtKeys);
      setLibrarySet(prev => new Set([
        ...prev,
        ...boughtKeys,
      ]));
    } catch (e) {
      alert("Could not add release to library: " + e.message);
    } finally {
      setAdding(null);
    }
  }

  const publishers = [...new Set(releases.map(r => r.publisher).filter(Boolean))].sort();
  const seriesNames = [...new Set(releases.map(r => r.series_name).filter(Boolean))].sort();

  function applyFilters(list) {
    return list.filter(r => {
      if (pubFilter && r.publisher !== pubFilter) return false;
      if (seriesFilter && r.series_name !== seriesFilter) return false;
      return true;
    });
  }

  const pullReleases  = applyFilters(releases.filter(r => pullVolumeSet.has(r.cv_id)));
  const otherReleases = applyFilters(releases.filter(r => !pullVolumeSet.has(r.cv_id)));
  const weeklySpend   = pullReleases.reduce((sum, r) => sum + (r.price ?? DEFAULT_PRICE), 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Releases</h1>
        <span style={s.date}>{weekLabel}</span>
      </div>

      <div style={s.weekNav}>
        <InkButton variant="ghost" size="sm" onClick={() => setOffset(o => o - 1)}>← Prev week</InkButton>
        <InkButton variant="ghost" size="sm" onClick={() => setOffset(0)}>This week</InkButton>
        <InkButton variant="ghost" size="sm" onClick={() => setOffset(o => o + 1)}>Next week →</InkButton>
      </div>

      {!loading && releases.length > 0 && (
        <div style={s.filterRow}>
          <label style={s.filterLabel} htmlFor="rel-pub-filter">Publisher</label>
          <CustomSelect
            id="rel-pub-filter"
            value={pubFilter}
            onChange={e => { setPubFilter(e.target.value); setSeriesFilter(""); }}
            style={s.filterSelect}
            options={[
              { value: "", label: "All publishers" },
              ...publishers.map(p => ({ value: p, label: p })),
            ]}
          />

          <label style={s.filterLabel} htmlFor="rel-series-filter">Series</label>
          <CustomSelect
            id="rel-series-filter"
            value={seriesFilter}
            onChange={e => setSeriesFilter(e.target.value)}
            style={s.filterSelect}
            options={[
              { value: "", label: "All series" },
              ...seriesNames.map(n => ({ value: n, label: n })),
            ]}
          />

          {(pubFilter || seriesFilter) && (
            <button type="button" style={s.clearBtn} onClick={() => { setPubFilter(""); setSeriesFilter(""); }}>
              Clear
            </button>
          )}
        </div>
      )}

      {loading && <p style={s.msg}>Loading releases…</p>}
      {error   && <p style={{ ...s.msg, color: "var(--accent)" }}>{error}</p>}
      {!loading && !error && warning && <p style={s.note}>Fallback source in use. {warning}</p>}
      {!loading && !error && source && <p style={s.source}>Source: {source}</p>}
      {!loading && !error && cacheInfo && <p style={s.source}>Cached: {formatCacheTime(cacheInfo)}</p>}

      {!loading && !error && (
        <>
          {pullReleases.length > 0 && (
            <section>
              <div style={s.sectionHeadRow}>
                <h2 style={s.sectionHead}>Your Pull List ({pullReleases.length})</h2>
                <span style={s.weeklySpend}>~${weeklySpend.toFixed(2)} this week</span>
              </div>
              {pullReleases.map(r => (
                <ReleaseRow key={r.cv_id} release={r} isPulled
                  isToggling={toggling === r.cv_id}
                  isAdding={adding === releaseKey(r)}
                  isInLibrary={isReleaseInLibrary(librarySet, r)}
                  onToggle={() => togglePullList(r)}
                  onAdd={() => addToLibrary(r)} />
              ))}
            </section>
          )}

          {otherReleases.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={s.sectionHead}>All Releases ({otherReleases.length})</h2>
              {otherReleases.map(r => (
                <ReleaseRow key={r.cv_id} release={r}
                  isToggling={toggling === r.cv_id}
                  isAdding={adding === releaseKey(r)}
                  isInLibrary={isReleaseInLibrary(librarySet, r)}
                  onToggle={() => togglePullList(r)}
                  onAdd={() => addToLibrary(r)} />
              ))}
            </section>
          )}

          {releases.length === 0 && (
            <p style={s.msg}>No releases found for this week.</p>
          )}
        </>
      )}
    </div>
  );
}

async function enrichRelease(release) {
  try {
    const res = await fetch("/api/comics/enrich", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ issue: release }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.issue ?? null;
  } catch {
    return null;
  }
}

async function fetchLibraryComic(id) {
  const { data, error } = await supabase
    .from("comics")
    .select("id, title, issue_number, cover_url, has_pdf, drive_file_id, release_date, created_at, comicvine_id, series:series_id(id, name, publisher:publisher_id(id, name)), publisher:publisher_id(id, name), reading_log(id)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data ? { ...data, read_count: data.reading_log?.length ?? 0 } : null;
}

function ReleaseRow({ release, isPulled, isToggling, isAdding, isInLibrary, onToggle, onAdd }) {
  const price = release.price ?? DEFAULT_PRICE;
  return (
    <div style={{ ...s.row, ...(isPulled ? s.rowHighlight : {}) }}>
      {release.cover_url
        ? <img src={release.cover_url} alt={release.title} style={s.cover} loading="lazy" />
        : <div style={{ ...s.cover, background: "var(--bg-card)" }} />
      }
      <div style={{ flex: 1 }}>
        <p style={s.releaseTitle}>{release.title}</p>
        {release.publisher && <p style={s.releaseMeta}>{release.publisher}</p>}
      </div>
      <span style={s.price}>${price.toFixed(2)}</span>
      <button
        style={{ ...s.libraryBtn, ...(isInLibrary ? s.libraryBtnOn : {}) }}
        onClick={onAdd}
        disabled={isAdding || isInLibrary}
        title={isInLibrary ? "Already in library" : "Add bought issue to library"}
      >
        {isAdding ? "Adding…" : isInLibrary ? "In Library" : "Bought"}
      </button>
      <button
        style={{ ...s.toggleBtn, ...(isPulled ? s.toggleBtnOn : {}) }}
        onClick={onToggle}
        disabled={isToggling}
        title={isPulled ? "Remove from pull list" : "Add to pull list"}
      >
        {isToggling ? "…" : isPulled ? "✕" : "+"}
      </button>
    </div>
  );
}

function formatWeekLabel(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const start = new Date(year, month - 1, day, 12);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Week of ${formatter.format(start)}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function releaseKey(release) {
  return `${normalize(release.series_name || release.title)}|${String(release.issue_number ?? "")}`;
}

function releaseOwnershipKey(release) {
  const id = release.cv_id ?? release.metron_id;
  return id ? `issue:${String(id)}` : "";
}

function isReleaseInLibrary(librarySet, release) {
  return librarySet.has(releaseOwnershipKey(release)) || librarySet.has(releaseKey(release));
}

function formatCacheTime(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "local";
  }
}

function buildLibraryKeySet(comics, extraKeys = []) {
  return new Set([
    ...(comics ?? []).flatMap(libraryKeysForComic),
    ...extraKeys,
  ].filter(Boolean));
}

function libraryKeysForComic(comic) {
  return [
    comic.comicvine_id ? `issue:${String(comic.comicvine_id)}` : "",
    releaseKey({
      series_name: comic.series?.name,
      title: comic.title,
      issue_number: comic.issue_number,
    }),
  ];
}

const s = {
  page:           { maxWidth: "var(--content-max-md)" },
  header:         { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 },
  title:          { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" },
  date:           { color: "var(--text-faint)", fontSize: 14, fontFamily: "var(--font-mono)" },
  weekNav:        { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  msg:            { color: "var(--text-soft)", padding: "40px 0", textAlign: "center" },
  note:           { color: "var(--hero-gold)", fontSize: 12, marginBottom: 8 },
  source:         { color: "var(--text-faint)", fontSize: 12, marginBottom: 12 },
  sectionHeadRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  sectionHead:    { color: "var(--text)", fontSize: 22, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "var(--font-display)", paddingBottom: 6, borderBottom: "2px solid var(--ink-000)" },
  weeklySpend:    { color: "var(--ink-000)", background: "var(--hero-gold)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-burst)", padding: "4px 10px", border: "1px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", transform: "rotate(-4deg)" },
  filterRow:      { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  filterLabel:    { color: "var(--hero-gold)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-burst)" },
  filterSelect:   { width: 180, minHeight: 38 },
  clearBtn:       { minHeight: 38, padding: "0 12px", border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-soft)", fontFamily: "var(--font-burst)", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: "2px 2px 0 var(--ink-000)", cursor: "pointer" },
  row:            { display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" },
  rowHighlight:   { background: "var(--bg-surface)", backgroundImage: "var(--halftone-dots-gold)", backgroundSize: "var(--halftone-size)", borderRadius: 10, padding: "10px 12px", marginBottom: 2, borderBottom: "none", border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)" },
  cover:          { width: "clamp(60px, 9vw, 96px)", aspectRatio: "2/3", objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  releaseTitle:   { color: "var(--text)", fontSize: 14, fontWeight: 600 },
  releaseMeta:    { color: "var(--text-faint)", fontSize: 12, marginTop: 2 },
  price:          { color: "var(--text-soft)", fontSize: 12, fontWeight: 600, flexShrink: 0 },
  libraryBtn:     { minWidth: 74, padding: "7px 10px 5px", borderRadius: 8, background: "var(--hero-gold)", border: "2px solid var(--ink-000)", color: "var(--ink-000)", fontSize: 12, fontFamily: "var(--font-burst)", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", boxShadow: "2px 2px 0 var(--ink-000)", flexShrink: 0 },
  libraryBtnOn:   { background: "var(--hero-cyan)", color: "var(--ink-000)", cursor: "default", opacity: 0.85 },
  toggleBtn:      { width: 32, height: 32, borderRadius: "50%", background: "var(--bg-card)", border: "2px solid var(--ink-000)", color: "var(--text-soft)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1, boxShadow: "2px 2px 0 var(--ink-000)" },
  toggleBtnOn:    { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14 },
};
