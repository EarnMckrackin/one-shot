"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

const VIEWS = ["All", "Publishers", "Series", "Unread"];

export default function LibraryClient({ publishers, allSeries }) {
  const [view, setView]         = useState("All");
  const [search, setSearch]     = useState("");
  const [comics, setComics]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [pubFilter, setPubFilter] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      let q = supabase
        .from("comics")
        .select("id, title, issue_number, cover_url, has_pdf, series:series_id(name), publisher:publisher_id(name), reading_log(id)")
        .order("created_at", { ascending: false });

      if (search)    q = q.ilike("title", `%${search}%`);
      if (pubFilter) q = q.eq("publisher_id", pubFilter);

      const { data } = await q;
      setComics((data ?? []).map((c) => ({ ...c, read_count: c.reading_log?.length ?? 0 })));
      setLoading(false);
    }
    load();
  }, [search, pubFilter]);

  const displayed = view === "Unread" ? comics.filter((c) => c.read_count === 0) : comics;

  const filteredSeries = pubFilter
    ? allSeries.filter((s) => s.publisher_id === pubFilter)
    : allSeries;

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.title}>Library</h1>
        <span style={s.count}>{comics.length} issues</span>
      </div>

      <input
        style={s.search}
        placeholder="Search comics…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={s.viewBar}>
        {VIEWS.map((v) => (
          <button key={v} style={{ ...s.chip, ...(view === v ? s.chipActive : {}) }} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>

      {view === "Publishers" && (
        <div style={s.grid2}>
          {publishers.map((p) => (
            <button
              key={p.id}
              style={{ ...s.pubCard, ...(pubFilter === p.id ? { borderColor: C.accent } : {}) }}
              onClick={() => { setPubFilter(pubFilter === p.id ? "" : p.id); setView("All"); }}
            >
              <span style={s.pubName}>{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {view === "Series" && (
        <div style={s.grid2}>
          {filteredSeries.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`} style={s.pubCard}>
              <span style={s.pubName}>{s.name}</span>
            </Link>
          ))}
        </div>
      )}

      {(view === "All" || view === "Unread") && (
        <>
          {loading ? (
            <p style={{ color: C.textFaint, padding: 40, textAlign: "center" }}>Loading…</p>
          ) : displayed.length === 0 ? (
            <p style={{ color: C.textSoft, padding: 40, textAlign: "center" }}>
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

const s = {
  header:          { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 },
  title:           { fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 700 },
  count:           { color: C.textFaint, fontSize: 14 },
  search:          { marginBottom: 12, maxWidth: 480 },
  viewBar:         { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  chip:            { padding: "6px 16px", borderRadius: 20, background: C.card, border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  chipActive:      { background: C.accent, borderColor: C.accent, color: "#fff", fontWeight: 700 },
  grid2:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 },
  grid3:           { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 },
  pubCard:         { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, cursor: "pointer", display: "block" },
  pubName:         { fontWeight: 600, fontSize: 15 },
  card:            { background: C.card, borderRadius: 12, overflow: "hidden", display: "block" },
  coverWrap:       { position: "relative", paddingTop: "150%" },
  cover:           { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  coverPlaceholder:{ background: C.surface, color: C.textFaint, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" },
  readBadge:       { position: "absolute", top: 6, right: 6, background: C.cyan, color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10 },
  pdfBadge:        { position: "absolute", bottom: 6, right: 6, background: C.gold, color: "#000", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 6, letterSpacing: 0.5 },
  info:            { padding: "8px 10px" },
  series:          { color: C.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  issueTitle:      { color: C.text, fontSize: 13, fontWeight: 600 },
};
