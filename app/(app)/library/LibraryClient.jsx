"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";

const VIEWS = ["All", "Publishers", "Series", "Unread"];
const SORTS = [
  { value: "created_desc", label: "Recently Added" },
  { value: "release_desc", label: "Release Date" },
  { value: "publisher_asc", label: "Publisher" },
  { value: "series_asc", label: "Series" },
  { value: "value_desc", label: "Value" },
];

export default function LibraryClient({ publishers, allSeries }) {
  const [view, setView]         = useState("All");
  const [search, setSearch]     = useState("");
  const [comics, setComics]     = useState([]);
  const [releaseOptions, setReleaseOptions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [pubFilter, setPubFilter] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [releaseFilter, setReleaseFilter] = useState("");
  const [sortBy, setSortBy]     = useState("created_desc");

  useEffect(() => {
    async function load() {
      setLoading(true);
      let q = supabase
        .from("comics")
        .select("id, title, issue_number, cover_url, has_pdf, release_date, created_at, series:series_id(name), publisher:publisher_id(name), reading_log(id)")
        .order("created_at", { ascending: false });

      if (search)    q = q.ilike("title", `%${search}%`);
      if (pubFilter) q = q.eq("publisher_id", pubFilter);
      if (seriesFilter) q = q.eq("series_id", seriesFilter);
      if (releaseFilter) q = releaseFilter === "unknown"
        ? q.is("release_date", null)
        : q.gte("release_date", `${releaseFilter}-01`).lte("release_date", lastDayOfMonth(releaseFilter));

      const { data } = await q;
      setComics((data ?? []).map((c) => ({ ...c, read_count: c.reading_log?.length ?? 0 })));
      setLoading(false);
    }
	    load();
	  }, [search, pubFilter, seriesFilter, releaseFilter]);

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

  const displayed = sortComics(
    view === "Unread" ? comics.filter((c) => c.read_count === 0) : comics,
    sortBy
  );

  const filteredSeries = pubFilter
    ? allSeries.filter((s) => s.publisher_id === pubFilter)
    : allSeries;

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>Library</h1>
        <span style={s.count}>{comics.length} ISSUES</span>
      </div>

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
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </div>

      <div style={s.sortRow}>
        <label style={s.sortLabel} htmlFor="publisher-filter">Publisher</label>
        <select
          id="publisher-filter"
          className="ink-input"
          value={pubFilter}
          onChange={(e) => { setPubFilter(e.target.value); setSeriesFilter(""); }}
          style={s.filterSelect}
        >
          <option value="">All publishers</option>
          {publishers.map((publisher) => (
            <option key={publisher.id} value={publisher.id}>{publisher.name}</option>
          ))}
        </select>

        <label style={s.sortLabel} htmlFor="series-filter">Series</label>
        <select
          id="series-filter"
          className="ink-input"
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          style={s.filterSelect}
        >
          <option value="">All series</option>
          {filteredSeries.map((series) => (
            <option key={series.id} value={series.id}>{series.name}</option>
          ))}
        </select>

        <label style={s.sortLabel} htmlFor="release-filter">Release</label>
        <select
          id="release-filter"
          className="ink-input"
          value={releaseFilter}
          onChange={(e) => setReleaseFilter(e.target.value)}
          style={s.filterSelect}
        >
          <option value="">All dates</option>
          {releaseOptions.map((month) => (
            <option key={month.value} value={month.value}>{month.label}</option>
          ))}
        </select>

        <label style={s.sortLabel} htmlFor="library-sort">Sort</label>
        <select
          id="library-sort"
          className="ink-input"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={s.sortSelect}
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>{sort.label}</option>
          ))}
        </select>
        {(pubFilter || seriesFilter || releaseFilter) && (
          <button type="button" style={s.clearBtn} onClick={() => { setPubFilter(""); setSeriesFilter(""); setReleaseFilter(""); }}>
            Clear
          </button>
        )}
        {sortBy === "value_desc" && (
          <span style={s.sortHint}>Values appear after eBay estimates are enabled.</span>
        )}
      </div>

      {view === "Publishers" && (
        <div style={s.grid2}>
          {publishers.map((p) => (
            <button
              key={p.id}
              style={{ ...s.pubCard, ...(pubFilter === p.id ? s.pubCardActive : {}) }}
              onClick={() => { setPubFilter(pubFilter === p.id ? "" : p.id); setView("All"); }}
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
            <Link key={ser.id} href={`/series/${ser.id}`} style={s.pubCard}>
              <span style={s.pubName}>{ser.name}</span>
            </Link>
          ))}
        </div>
      )}

      {(view === "All" || view === "Unread") && (
        <>
          {loading ? (
            <p style={{ color: "var(--text-faint)", padding: 40, textAlign: "center" }}>Loading…</p>
          ) : displayed.length === 0 ? (
            <p style={{ color: "var(--text-soft)", padding: 40, textAlign: "center" }}>
              {search ? "No comics match your search." : "No comics yet — use Scan to add one."}
            </p>
          ) : (
            <div style={s.grid3}>
              {displayed.map((comic) => (
                <Link key={comic.id} href={`/comic/${comic.id}`} style={s.card}>
                  <div style={s.coverWrap}>
                    {comic.cover_url ? (
                      <img src={comic.cover_url} alt={comic.title} style={s.cover} loading="lazy" />
                    ) : (
                      <div style={{ ...s.cover, ...s.coverPlaceholder }}>No cover</div>
                    )}
                    {comic.read_count > 0 && (
                      <span style={s.readBadge}>{comic.read_count > 1 ? `×${comic.read_count}` : "✓"}</span>
                    )}
                    {comic.has_pdf && <span style={s.pdfBadge}>PDF</span>}
                  </div>
	                  <div style={s.info}>
	                    <p style={s.series}>{comic.series?.name ?? ""}</p>
	                    <p style={s.issueTitle}>{comic.issue_number ? `#${comic.issue_number}` : comic.title}</p>
	                    <p style={s.cardMeta}>{[comic.publisher?.name, formatMonth(comic.release_date)].filter(Boolean).join(" · ")}</p>
	                    {Number.isFinite(comic.estimated_value) && (
	                      <p style={s.value}>~${comic.estimated_value.toFixed(2)}</p>
	                    )}
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
      text(a.publisher?.name).localeCompare(text(b.publisher?.name)) ||
      text(a.series?.name).localeCompare(text(b.series?.name)) ||
      compareIssue(a.issue_number, b.issue_number)
    );
  } else if (sortBy === "series_asc") {
    sorted.sort((a, b) =>
      text(a.series?.name).localeCompare(text(b.series?.name)) ||
      compareIssue(a.issue_number, b.issue_number) ||
      text(a.publisher?.name).localeCompare(text(b.publisher?.name))
    );
  } else if (sortBy === "value_desc") {
    sorted.sort((a, b) => (b.estimated_value ?? -1) - (a.estimated_value ?? -1));
  } else {
    sorted.sort((a, b) => time(b.created_at) - time(a.created_at));
  }

  return sorted;
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
  count:           { color: "var(--text-faint)", fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", whiteSpace: "nowrap" },
  search:          { marginBottom: 12, maxWidth: 480 },
  viewBar:         { display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" },
  sortRow:         { display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" },
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

  grid2:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 },
  grid3:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },

  pubCard:         { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, cursor: "pointer", display: "block", textAlign: "left" },
  pubCardActive:   { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" },
  pubName:         { fontWeight: 600, fontSize: 15, color: "var(--text)" },
  pubCount:        { display: "block", marginTop: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" },

  card:            { background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", display: "block" },
  coverWrap:       { position: "relative", paddingTop: "150%" },
  cover:           { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  coverPlaceholder:{ background: "var(--bg-surface)", color: "var(--text-faint)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" },
  readBadge:       { position: "absolute", top: 6, right: 6, background: "var(--hero-cyan)", color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10 },
  pdfBadge:        { position: "absolute", bottom: 6, right: 6, background: "var(--hero-gold)", color: "#000", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 6, letterSpacing: 0.5 },
  info:            { padding: "8px 10px 10px" },
  series:          { color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  issueTitle:      { color: "var(--text)", fontSize: 13, fontWeight: 600 },
  cardMeta:        { color: "var(--text-faint)", fontSize: 10, marginTop: 3 },
  value:           { color: "var(--hero-gold)", fontSize: 12, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-mono)" },
};
