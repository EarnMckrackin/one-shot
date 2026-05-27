"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import { readLibraryPrefs, writeLibraryPrefs } from "../../../lib/local-data-store";
import CustomSelect from "../../../components/CustomSelect";
import ComicCover from "../../../components/ComicCover";
import GoogleDriveMark from "../../../components/GoogleDriveMark";
import { useComics } from "../../../hooks/useComics";

const VIEWS = ["All", "Unread", "PDF", "Needs repair", "Publishers", "Series"];
const SORTS = [
  { value: "created_desc", label: "Recently Added" },
  { value: "release_desc", label: "Release Date" },
  { value: "publisher_asc", label: "Publisher" },
  { value: "series_asc", label: "Series" },
];

export default function LibraryClient({ publishers: initialPublishers, allSeries }) {
  const searchParams = useSearchParams();
  const { comics, loading, connectionState, lastSynced, refresh } = useComics();

  const [view, setView]         = useState("All");
  const [search, setSearch]     = useState("");
  const [publishers, setPublishers] = useState(initialPublishers ?? []);
  const [releaseOptions, setReleaseOptions] = useState([]);

  const [pubFilter, setPubFilter]         = useState("");
  const [seriesFilter, setSeriesFilter]   = useState("");
  const [releaseFilter, setReleaseFilter] = useState("");
  const [formatFilter, setFormatFilter]   = useState("Both");
  const [sortBy, setSortBy]               = useState("created_desc");
  const [showFilters, setShowFilters]     = useState(false);

  // Load persisted prefs after hydration (localStorage unavailable on server)
  useEffect(() => {
    const prefs = readLibraryPrefs();
    if (prefs.pubFilter)                          setPubFilter(prefs.pubFilter);
    if (prefs.seriesFilter)                       setSeriesFilter(prefs.seriesFilter);
    if (prefs.releaseFilter)                      setReleaseFilter(prefs.releaseFilter);
    if (prefs.formatFilter && prefs.formatFilter !== "Both") setFormatFilter(prefs.formatFilter);
    if (prefs.sortBy && prefs.sortBy !== "created_desc")     setSortBy(prefs.sortBy);
  }, []);

  useEffect(() => {
    const publisher = searchParams.get("publisher") || "";
    const series = searchParams.get("series") || "";
    const format = searchParams.get("format") || "";
    const nextView = searchParams.get("view") || "";
    if (publisher) setPubFilter(publisher);
    if (["Both", "PDF", "Physical"].includes(format)) setFormatFilter(format);
    if (VIEWS.includes(nextView)) {
      setView(nextView);
      if (nextView === "PDF") setFormatFilter("PDF");
    }
    if (series) {
      const match = allSeries.find((item) => String(item.id) === series);
      setPubFilter(match?.publisher_id ? String(match.publisher_id) : "");
      setSeriesFilter(series);
      setView("All");
    }
  }, [allSeries, searchParams]);

  useEffect(() => {
    async function loadReleaseOptions() {
      const { data } = await supabase
        .from("comics")
        .select("release_date")
        .not("release_date", "is", null)
        .order("release_date", { ascending: false });
      setReleaseOptions(getReleaseMonths(data ?? []));
    }
    loadReleaseOptions();
  }, []);

  useEffect(() => {
    fetch("/api/comics/enrich-missing", { method: "POST" })
      .then(async () => {
        const { data } = await supabase.from("publishers").select("id, name").order("name");
        if (data?.length) setPublishers(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    writeLibraryPrefs({ pubFilter, seriesFilter, releaseFilter, formatFilter, sortBy });
  }, [pubFilter, seriesFilter, releaseFilter, formatFilter, sortBy]);

  const displayed = useMemo(() => {
    const filtered = comics.filter((comic) => {
      if (search && !matchesSearch(comic, search)) return false;
      const comicPubId = comic.publisher?.id ?? comic.series?.publisher?.id;
      if (pubFilter && String(comicPubId) !== String(pubFilter)) return false;
      if (seriesFilter && String(comic.series?.id) !== String(seriesFilter)) return false;
      if (releaseFilter) {
        if (releaseFilter === "unknown" && comic.release_date) return false;
        if (releaseFilter !== "unknown" && comic.release_date?.slice(0, 7) !== releaseFilter) return false;
      }
      if (formatFilter === "PDF") return hasDigitalPdf(comic);
      if (formatFilter === "Physical") return !hasDigitalPdf(comic);
      return true;
    });

    let final = filtered;
    if (view === "Unread") final = final.filter((c) => c.read_count === 0);
    if (view === "PDF") final = final.filter(hasDigitalPdf);
    if (view === "Needs repair") final = final.filter(needsRepairWork);
    return sortComics(final, sortBy);
  }, [comics, search, pubFilter, seriesFilter, releaseFilter, formatFilter, view, sortBy]);

  const filteredSeries = useMemo(() => {
    return pubFilter
      ? allSeries.filter((s) => String(s.publisher_id) === String(pubFilter))
      : allSeries;
  }, [allSeries, pubFilter]);

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>Library</h1>
        <span style={s.count}>{comics.length} ISSUES</span>
        <button onClick={refresh} style={s.refreshBtn} title="Sync Library">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "spin" : ""}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>
        </button>
      </div>
      <p style={s.localStatus}>
        Dense shelf and collection controls.
        {" "}
        {connectionState === "offline" ? "Offline library cache" : "Local cache ready"}
        {lastSynced ? ` · saved ${formatCacheTime(lastSynced)}` : ""}
      </p>

      <input
        style={s.search}
        placeholder="Search comics…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={s.viewBar}>
        {VIEWS.map((v) => (
          <button
            key={v}
            style={{ ...s.chip, ...(view === v ? s.chipActive : {}) }}
            onClick={() => {
              setView(v);
              if (v === "PDF") setFormatFilter("PDF");
              if (v !== "PDF" && formatFilter === "PDF") setFormatFilter("Both");
            }}
          >
            {v}
          </button>
        ))}
        <button
          style={s.filterToggle}
          onClick={() => setShowFilters(true)}
          className="mobile-filter-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          Filters {(pubFilter || seriesFilter || releaseFilter || formatFilter !== "Both") && "•"}
        </button>
      </div>

      <div style={s.sortRow} className={`filter-panel${showFilters ? " filter-panel--open" : ""}`}>
        <div style={s.filterHeader} className="mobile-filter-header">
          <h3 style={s.filterTitle}>Filter & Sort</h3>
          <button style={s.filterClose} onClick={() => setShowFilters(false)}>✕</button>
        </div>

        <div style={s.filterGrid}>
          <div style={s.filterField}>
            <label style={s.sortLabel} htmlFor="publisher-filter">Publisher</label>
            <CustomSelect
              id="publisher-filter"
              value={pubFilter}
              onChange={(e) => { setPubFilter(e.target.value); setSeriesFilter(""); }}
              style={s.filterSelect}
              options={[
                { value: "", label: "All publishers" },
                ...publishers.map(p => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </div>

          <div style={s.filterField}>
            <label style={s.sortLabel} htmlFor="series-filter">Series</label>
            <CustomSelect
              id="series-filter"
              value={seriesFilter}
              onChange={(e) => setSeriesFilter(e.target.value)}
              style={s.filterSelect}
              options={[
                { value: "", label: "All series" },
                ...filteredSeries.map(s => ({ value: String(s.id), label: s.name })),
              ]}
            />
          </div>

          <div style={s.filterField}>
            <label style={s.sortLabel} htmlFor="release-filter">Release</label>
            <CustomSelect
              id="release-filter"
              value={releaseFilter}
              onChange={(e) => setReleaseFilter(e.target.value)}
              style={s.filterSelect}
              options={[
                { value: "", label: "All dates" },
                ...releaseOptions.map(m => ({ value: m.value, label: m.label })),
              ]}
            />
          </div>

          <div style={s.filterField}>
            <label style={s.sortLabel} htmlFor="format-filter">Format</label>
            <CustomSelect
              id="format-filter"
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              style={s.filterSelect}
              options={[
                { value: "Both", label: "Both" },
                { value: "PDF", label: "PDF" },
                { value: "Physical", label: "Physical" },
              ]}
            />
          </div>

          <div style={s.filterField}>
            <label style={s.sortLabel} htmlFor="library-sort">Sort</label>
            <CustomSelect
              id="library-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={s.sortSelect}
              options={SORTS.map(sort => ({ value: sort.value, label: sort.label }))}
            />
          </div>
        </div>

        <div style={s.filterActions}>
          {(pubFilter || seriesFilter || releaseFilter || formatFilter !== "Both") && (
            <button type="button" style={s.clearBtn} onClick={() => { setPubFilter(""); setSeriesFilter(""); setReleaseFilter(""); setFormatFilter("Both"); }}>
              Reset
            </button>
          )}
          <button className="mobile-filter-btn-apply" style={s.applyBtn} onClick={() => setShowFilters(false)}>Done</button>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .filter-panel {
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: var(--bg-surface);
            z-index: 1000;
            flex-direction: column;
            padding: 24px;
            border-top: 3px solid var(--ink-000);
            border-radius: 24px 24px 0 0;
            transform: translateY(100%);
            transition: transform 0.3s var(--ease-out);
            display: flex !important;
            gap: 20px !important;
          }
          .filter-panel.filter-panel--open {
            transform: translateY(0%);
          }
          .mobile-filter-header { display: flex !important; }
          .mobile-filter-btn { display: flex !important; }
          .mobile-filter-btn-apply { display: block !important; }
        }
        @media (min-width: 768px) {
          .mobile-filter-header { display: none !important; }
          .mobile-filter-btn { display: none !important; }
          .mobile-filter-btn-apply { display: none !important; }
          .filter-panel { transform: none !important; position: static !important; display: flex !important; }
        }
      `}</style>

      {view === "Publishers" && (
        <div style={s.grid2}>
          {publishers.map((p) => (
            <button
              key={p.id}
              style={{ ...s.pubCard, ...(String(pubFilter) === String(p.id) ? s.pubCardActive : {}) }}
              onClick={() => {
                const next = String(pubFilter) === String(p.id) ? "" : String(p.id);
                setPubFilter(next);
                setSeriesFilter("");
                setView("All");
              }}
            >
              <span style={s.pubName}>{p.name}</span>
              <span style={s.pubCount}>{p.issue_count ?? ""}</span>
            </button>
          ))}
        </div>
      )}

      {view === "Series" && (
        <div style={s.grid2}>
          {filteredSeries.map((ser) => (
            <button
              key={ser.id}
              style={{ ...s.pubCard, ...(String(seriesFilter) === String(ser.id) ? s.pubCardActive : {}) }}
              onClick={() => {
                setSeriesFilter(String(seriesFilter) === String(ser.id) ? "" : String(ser.id));
                setView("All");
              }}
            >
              <span style={s.pubName}>{ser.name}</span>
            </button>
          ))}
        </div>
      )}

      {["All", "Unread", "PDF", "Needs repair"].includes(view) && (
        <>
          {loading ? (
            <p style={{ color: "var(--text-faint)", padding: 40, textAlign: "center" }}>Loading…</p>
          ) : displayed.length === 0 ? (
            <p style={{ color: "var(--text-soft)", padding: 40, textAlign: "center" }}>
              {search || pubFilter || seriesFilter || releaseFilter || formatFilter !== "Both" || view !== "All" ? "No comics match this shelf view." : "No comics yet - use Add to add one."}
            </p>
          ) : (
            <div style={s.grid3}>
              {displayed.map((comic) => (
                <Link key={comic.id} href={`/comic/${comic.id}`} style={s.card}>
                  <ComicCover src={comic.cover_url} alt={comic.title}>
                    {comic.read_count > 0 && (
                      <span style={s.readBadge}>{comic.read_count > 1 ? `×${comic.read_count}` : "✓"}</span>
                    )}
                    {comic.drive_file_id ? (
                      <span style={{ ...s.coverBadge, ...s.driveBadge }} aria-label="Google Drive PDF" title="Google Drive PDF">
                        <GoogleDriveMark />
                      </span>
                    ) : comic.has_pdf ? (
                      <span style={{ ...s.coverBadge, ...s.pdfBadge }}>PDF</span>
                    ) : null}
                  </ComicCover>
                  <div style={s.info}>
                    <p style={s.series}>{comic.series?.name ?? ""}</p>
                    <p style={s.issueTitle}>{comic.issue_number ? `#${comic.issue_number}` : comic.title}</p>
                    <div style={{ marginTop: "auto", paddingTop: 4 }}>
                      <p style={s.cardMeta}>{[(comic.publisher?.name ?? comic.series?.publisher?.name), formatMonth(comic.release_date)].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sortComics(comics, sortBy) {
  const sorted = [...comics];
  const text = (value) => String(value ?? "").toLowerCase();
  const time = (value) => value ? new Date(value).getTime() : 0;

  if (sortBy === "release_desc") {
    sorted.sort((a, b) => time(b.release_date) - time(a.release_date) || text(a.series?.name).localeCompare(text(b.series?.name)));
  } else if (sortBy === "publisher_asc") {
    sorted.sort((a, b) =>
      text(a.publisher?.name ?? a.series?.publisher?.name).localeCompare(text(b.publisher?.name ?? b.series?.publisher?.name)) ||
      text(a.series?.name).localeCompare(text(b.series?.name)) ||
      compareIssue(a.issue_number, b.issue_number)
    );
  } else if (sortBy === "series_asc") {
    sorted.sort((a, b) =>
      text(a.series?.name).localeCompare(text(b.series?.name)) ||
      compareIssue(a.issue_number, b.issue_number) ||
      text(a.publisher?.name ?? a.series?.publisher?.name).localeCompare(text(b.publisher?.name ?? b.series?.publisher?.name))
    );
  } else {
    sorted.sort((a, b) => time(b.created_at) - time(a.created_at));
  }

  return sorted;
}

function hasDigitalPdf(comic) {
  return Boolean(comic.has_pdf);
}

function needsRepairWork(comic) {
  return !comic.cover_url
    || !comic.series?.name
    || !(comic.publisher?.name || comic.series?.publisher?.name)
    || (comic.has_pdf && !comic.drive_file_id);
}

function matchesSearch(comic, search) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    comic.title,
    comic.issue_number && `#${comic.issue_number}`,
    comic.issue_number,
    comic.series?.name,
    comic.publisher?.name ?? comic.series?.publisher?.name,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
}

function formatCacheTime(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "locally";
  }
}

function getReleaseMonths(comics) {
  const seen = new Set();
  return comics
    .map((comic) => comic.release_date?.slice(0, 7))
    .filter(Boolean)
    .filter((month) => {
      if (seen.has(month)) return false;
      seen.add(month);
      return true;
    })
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({ value: month, label: formatMonth(`${month}-01`) }));
}

function lastDayOfMonth(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex, 0, 12);
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function compareIssue(a, b) {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function formatMonth(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

const s = {
  header:          { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16, flexWrap: "nowrap" },
  title:           { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, whiteSpace: "nowrap" },
  refreshBtn:      { background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" },
  count:           { color: "var(--text-faint)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", whiteSpace: "nowrap" },
  localStatus:     { color: "var(--text-faint)", fontSize: 12, marginTop: -8, marginBottom: 12 },
  search:          { marginBottom: 12, maxWidth: 480 },
  viewBar:         { display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" },
  sortRow:         { display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" },
  filterHeader:    { display: "none", justifyContent: "space-between", alignItems: "center", marginBottom: 8, width: "100%" },
  filterTitle:     { fontFamily: "var(--font-display)", textTransform: "uppercase", fontSize: 20 },
  filterClose:     { background: "none", border: "none", color: "var(--text-faint)", fontSize: 24, cursor: "pointer" },
  filterGrid:      { display: "flex", flexWrap: "wrap", gap: 12, width: "100%" },
  filterField:     { display: "flex", flexDirection: "column", gap: 6 },
  filterActions:   { display: "flex", gap: 12, alignItems: "center", width: "100%", marginTop: 8 },
  filterToggle:    { display: "none", alignItems: "center", gap: 6, padding: "8px 16px 6px", borderRadius: 999, border: "2px solid var(--ink-000)", background: "var(--bg-card)", color: "var(--text)", fontFamily: "var(--font-burst)", textTransform: "uppercase", fontSize: 12, boxShadow: "2px 2px 0 var(--ink-000)" },
  applyBtn:        { flex: 1, padding: "12px", background: "var(--accent)", color: "#fff", border: "2px solid var(--ink-000)", borderRadius: 10, fontFamily: "var(--font-burst)", textTransform: "uppercase", fontSize: 16, boxShadow: "3px 3px 0 var(--ink-000)" },
  sortLabel:       { color: "var(--hero-gold)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-burst)" },
  sortSelect:      { width: 190, minHeight: 40 },
  filterSelect:    { width: 180, minHeight: 40 },
  sortHint:        { color: "var(--text-faint)", fontSize: 12 },
  clearBtn:        { minHeight: 38, padding: "0 12px", border: "2px solid var(--ink-000)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-soft)", fontFamily: "var(--font-burst)", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: "2px 2px 0 var(--ink-000)" },

  chip:            {
    fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase",
    padding: "7px 16px 6px", borderRadius: 999,
    background: "transparent", color: "var(--text-soft)",
    border: "1.5px solid var(--border)",
    boxShadow: "none", transform: "none",
    cursor: "pointer", transition: "all 120ms var(--ease-out)",
  },
  chipActive:      {
    background: "var(--accent)", color: "#fff",
    border: "1.5px solid var(--ink-000)",
    boxShadow: "2px 2px 0 var(--ink-000)",
    transform: "translate(-1px,-1px) rotate(-1.5deg)",
  },

  grid2:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(190px, 100%), 1fr))", gap: 12 },
  grid3:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(172px, 24vw, 260px), 1fr))", gap: "clamp(12px, 1.6vw, 20px)" },

  pubCard:         {
    width: "100%", background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 12, padding: 20, cursor: "pointer", display: "block", textAlign: "left", font: "inherit", position: "relative",
    boxShadow: "2px 2px 0 var(--ink-000), 4px 4px 0 var(--ink-400), 6px 6px 0 var(--ink-000)",
    transition: "transform 150ms var(--ease-out)",
  },
  pubCardActive:   { transform: "translate(-2px, -2px)", borderColor: "var(--accent)" },
  pubName:         { fontWeight: 600, fontSize: 15, color: "var(--text)" },
  pubCount:        { display: "block", marginTop: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" },

  card:            { background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" },
  readBadge:       { position: "absolute", top: 6, right: 6, zIndex: 2, background: "var(--hero-cyan)", color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10 },
  coverBadge:      { position: "absolute", bottom: 6, right: 6, zIndex: 2, minWidth: 24, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--ink-000)", boxShadow: "1px 1px 0 var(--ink-000)" },
  pdfBadge:        { background: "var(--hero-gold)", color: "#000", fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 6, letterSpacing: 0.5 },
  driveBadge:      { background: "#fff", color: "#000", padding: "2px 5px", borderRadius: 6 },
  info:            { padding: "10px", flex: 1, display: "flex", flexDirection: "column" },
  series:          { color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  issueTitle:      { color: "var(--text)", fontSize: 13, fontWeight: 600 },
  cardMeta:        { color: "var(--text-faint)", fontSize: 10, marginTop: 3 },
};
