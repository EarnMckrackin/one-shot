"use client";
import { useState, useEffect } from "react";
import { C } from "../../../lib/theme";

function getWednesday(offset = 0) {
  const d   = new Date();
  const day = d.getDay();
  const diff = day <= 3 ? 3 - day : 10 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  return d.toISOString().split("T")[0];
}

export default function ReleasesClient() {
  const [releases, setReleases]   = useState([]);
  const [pullMatches, setPullMatches] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [weekOffset, setOffset]   = useState(0);

  const wednesday = getWednesday(weekOffset);
  const pullSet   = new Set(pullMatches);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/releases?date=${wednesday}`)
      .then((r) => r.json())
      .then(({ releases, pullMatches }) => {
        setReleases(releases ?? []);
        setPullMatches(pullMatches ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wednesday]);

  const pullReleases  = releases.filter((r) => pullSet.has(r.league_id));
  const otherReleases = releases.filter((r) => !pullSet.has(r.league_id));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Releases</h1>
        <span style={s.date}>Wed {wednesday}</span>
      </div>

      <div style={s.weekNav}>
        <button style={s.navBtn} onClick={() => setOffset((o) => o - 1)}>← Prev week</button>
        <button style={s.navBtn} onClick={() => setOffset(0)}>This week</button>
        <button style={s.navBtn} onClick={() => setOffset((o) => o + 1)}>Next week →</button>
      </div>

      {loading && <p style={s.msg}>Loading releases…</p>}
      {error   && <p style={{ ...s.msg, color: C.accent }}>{error}</p>}

      {!loading && !error && (
        <>
          {pullReleases.length > 0 && (
            <section>
              <h2 style={s.sectionHead}>Your Pull List ({pullReleases.length})</h2>
              {pullReleases.map((r) => <ReleaseRow key={r.league_id} release={r} highlight />)}
            </section>
          )}

          {otherReleases.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={s.sectionHead}>All Releases ({otherReleases.length})</h2>
              {otherReleases.map((r) => <ReleaseRow key={r.league_id} release={r} />)}
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

function ReleaseRow({ release, highlight }) {
  return (
    <div style={{ ...s.row, ...(highlight ? s.rowHighlight : {}) }}>
      {release.cover_url
        ? <img src={release.cover_url} alt={release.title} style={s.cover} loading="lazy" />
        : <div style={{ ...s.cover, background: C.card }} />
      }
      <div style={{ flex: 1 }}>
        <p style={s.releaseTitle}>{release.title}</p>
        {release.publisher && <p style={s.releaseMeta}>{release.publisher}</p>}
      </div>
      {highlight && <span style={s.pullDot} title="On your pull list" />}
    </div>
  );
}

const s = {
  page:        { maxWidth: 720 },
  header:      { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 },
  title:       { fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 700 },
  date:        { color: C.textFaint, fontSize: 14 },
  weekNav:     { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  navBtn:      { padding: "8px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.textSoft, cursor: "pointer", fontSize: 13 },
  msg:         { color: C.textSoft, padding: "40px 0", textAlign: "center" },
  sectionHead: { color: C.textSoft, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  row:         { display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: `1px solid ${C.border}` },
  rowHighlight:{ background: C.surface, borderRadius: 10, padding: "10px 12px", marginBottom: 2, borderBottom: "none" },
  cover:       { width: 44, height: 66, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  releaseTitle:{ color: C.text, fontSize: 14, fontWeight: 600 },
  releaseMeta: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  pullDot:     { width: 8, height: 8, borderRadius: "50%", background: C.accent, flexShrink: 0 },
};
