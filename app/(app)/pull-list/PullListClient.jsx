"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

export default function PullListClient() {
  const [items, setItems]         = useState([]);
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding]       = useState(null);

  async function loadList() {
    const { data } = await supabase
      .from("pull_list")
      .select("id, series_id, series:series_id( id, name, cover_url, publisher:publisher_id( name ) )")
      .eq("active", true)
      .order("created_at", { ascending: false });
    setItems(data ?? []);
  }

  useEffect(() => { loadList(); }, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    const res  = await fetch(`/api/search-series?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data.results ?? []);
    setSearching(false);
  }

  async function handleAdd(series) {
    setAdding(series.comicvine_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let publisherId = null;
      if (series.publisher) {
        const { data: pub } = await supabase
          .from("publishers")
          .upsert({ user_id: user.id, name: series.publisher }, { onConflict: "user_id,name" })
          .select("id").single();
        publisherId = pub?.id;
      }

      const { data: ser } = await supabase
        .from("series")
        .upsert({
          user_id:      user.id,
          publisher_id: publisherId,
          name:         series.name,
          comicvine_id: series.comicvine_id,
          cover_url:    series.cover_url,
          start_year:   series.start_year,
          issue_count:  series.issue_count,
        }, { onConflict: "user_id,name" })
        .select("id").single();

      await supabase.from("pull_list")
        .upsert({ user_id: user.id, series_id: ser.id, active: true }, { onConflict: "user_id,series_id" });

      setResults([]);
      setQuery("");
      loadList();
    } finally {
      setAdding(null);
    }
  }

  async function handleRemove(seriesId) {
    if (!confirm("Remove from pull list?")) return;
    await supabase.from("pull_list").update({ active: false }).eq("series_id", seriesId);
    loadList();
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Pull List</h1>
      <p style={s.sub}>{items.length} series — you'll be notified when new issues release</p>

      <form onSubmit={handleSearch} style={s.searchRow}>
        <input
          placeholder="Search series to add (e.g. Saga, X-Men)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" style={s.searchBtn} disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </form>

      {results.length > 0 && (
        <div style={s.resultsPanel}>
          <p style={s.resultsLabel}>Add to pull list</p>
          {results.map((r) => (
            <div key={r.comicvine_id} style={s.resultRow}>
              {r.cover_url && <img src={r.cover_url} alt={r.name} style={s.resultCover} loading="lazy" />}
              <div style={{ flex: 1 }}>
                <p style={s.resultName}>{r.name}</p>
                <p style={s.resultMeta}>{r.publisher}  ·  {r.start_year}</p>
              </div>
              <button style={s.addBtn} onClick={() => handleAdd(r)} disabled={adding === r.comicvine_id}>
                {adding === r.comicvine_id ? "…" : "+"}
              </button>
            </div>
          ))}
          <button style={s.clearBtn} onClick={() => setResults([])}>Clear results</button>
        </div>
      )}

      <div style={s.list}>
        {items.map((item) => (
          <div key={item.id} style={s.pullRow}>
            {item.series?.cover_url
              ? <img src={item.series.cover_url} alt={item.series.name} style={s.seriesCover} loading="lazy" />
              : <div style={{ ...s.seriesCover, background: C.card }} />
            }
            <div style={{ flex: 1 }}>
              <p style={s.seriesName}>{item.series?.name}</p>
              <p style={s.publisherName}>{item.series?.publisher?.name}</p>
            </div>
            <button style={s.removeBtn} onClick={() => handleRemove(item.series_id)}>✕</button>
          </div>
        ))}
        {items.length === 0 && (
          <p style={{ color: C.textSoft, padding: "40px 0", textAlign: "center" }}>
            Search for a series above to start your pull list
          </p>
        )}
      </div>
    </div>
  );
}

const s = {
  page:        { maxWidth: 640 },
  title:       { fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 700, marginBottom: 4 },
  sub:         { color: C.textFaint, fontSize: 14, marginBottom: 24 },
  searchRow:   { display: "flex", gap: 10, marginBottom: 20 },
  searchBtn:   { background: C.accent, color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  resultsPanel:{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 20, overflow: "hidden" },
  resultsLabel:{ color: C.textSoft, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, padding: "12px 16px", borderBottom: `1px solid ${C.border}` },
  resultRow:   { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}` },
  resultCover: { width: 36, height: 54, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  resultName:  { color: C.text, fontWeight: 600, fontSize: 14 },
  resultMeta:  { color: C.textFaint, fontSize: 12 },
  addBtn:      { background: "none", color: C.accent, fontSize: 24, fontWeight: 300, cursor: "pointer", lineHeight: 1, padding: "4px 8px" },
  clearBtn:    { display: "block", width: "100%", background: "none", color: C.textFaint, padding: "10px", fontSize: 13, cursor: "pointer", borderTop: `1px solid ${C.border}` },
  list:        { display: "flex", flexDirection: "column" },
  pullRow:     { display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${C.border}` },
  seriesCover: { width: 44, height: 66, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  seriesName:  { color: C.text, fontWeight: 600, fontSize: 15 },
  publisherName: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  removeBtn:   { background: "none", color: C.textFaint, fontSize: 16, cursor: "pointer", padding: "4px 8px" },
};
