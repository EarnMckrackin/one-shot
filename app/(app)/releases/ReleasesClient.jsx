"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase-browser";

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
  const [source, setSource]           = useState(null);
  const [warning, setWarning]         = useState(null);

  const wednesday = getWednesday(weekOffset);
  const weekLabel = formatWeekLabel(wednesday);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setWarning(null);

    Promise.all([
      fetch(`/api/releases?date=${wednesday}`).then(r => r.json()),
      supabase.from("pull_list")
        .select("series_id, series:series_id(name, comicvine_id)")
        .eq("active", true),
    ]).then(([{ releases: r, pullMatches, source: releaseSource, warning: releaseWarning }, { data: pl }]) => {
      const releaseList = r ?? [];
      setReleases(releaseList);
      setSource(releaseSource ?? null);
      setWarning(releaseWarning ?? null);

      // Build cv_id → series_db_id via name matching (works for LOCG + ComicVine)
      const map = {};
      (pl ?? []).forEach(entry => {
        const sName = entry.series?.name;
        if (!sName) return;
        // Prefer exact comicvine_id match
        const cvMatch = releaseList.find(rel => rel.volume_cv_id && rel.volume_cv_id === entry.series.comicvine_id);
        if (cvMatch) { map[cvMatch.cv_id] = entry.series_id; return; }
        // Fall back to name match
        const nameMatch = releaseList.find(rel => normalize(rel.series_name) === normalize(sName));
        if (nameMatch) map[nameMatch.cv_id] = entry.series_id;
      });

      setSeriesIdMap(map);
      setPullSet(new Set([...(pullMatches ?? []), ...Object.keys(map)]));
    }).catch(e => setError(e.message))
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

  const pullReleases  = releases.filter(r => pullVolumeSet.has(r.cv_id));
  const otherReleases = releases.filter(r => !pullVolumeSet.has(r.cv_id));
  const weeklySpend   = pullReleases.reduce((sum, r) => sum + (r.price ?? DEFAULT_PRICE), 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Releases</h1>
        <span style={s.date}>{weekLabel}</span>
      </div>

      <div style={s.weekNav}>
        <button style={s.navBtn} onClick={() => setOffset(o => o - 1)}>← Prev week</button>
        <button style={s.navBtn} onClick={() => setOffset(0)}>This week</button>
        <button style={s.navBtn} onClick={() => setOffset(o => o + 1)}>Next week →</button>
      </div>

      {loading && <p style={s.msg}>Loading releases…</p>}
      {error   && <p style={{ ...s.msg, color: "var(--accent)" }}>{error}</p>}
      {!loading && !error && warning && <p style={s.note}>Fallback source in use. {warning}</p>}
      {!loading && !error && source && <p style={s.source}>Source: {source}</p>}

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
                  onToggle={() => togglePullList(r)} />
              ))}
            </section>
          )}

          {otherReleases.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={s.sectionHead}>All Releases ({otherReleases.length})</h2>
              {otherReleases.map(r => (
                <ReleaseRow key={r.cv_id} release={r}
                  isToggling={toggling === r.cv_id}
                  onToggle={() => togglePullList(r)} />
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

function ReleaseRow({ release, isPulled, isToggling, onToggle }) {
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

const s = {
  page:           { maxWidth: 720 },
  header:         { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 },
  title:          { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" },
  date:           { color: "var(--text-faint)", fontSize: 14, fontFamily: "var(--font-mono)" },
  weekNav:        { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  navBtn:         { padding: "8px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-soft)", cursor: "pointer", fontSize: 13 },
  msg:            { color: "var(--text-soft)", padding: "40px 0", textAlign: "center" },
  note:           { color: "var(--hero-gold)", fontSize: 12, marginBottom: 8 },
  source:         { color: "var(--text-faint)", fontSize: 12, marginBottom: 12 },
  sectionHeadRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  sectionHead:    { color: "var(--text-faint)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" },
  weeklySpend:    { color: "var(--hero-gold)", fontSize: 12, fontWeight: 700 },
  row:            { display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--border)" },
  rowHighlight:   { background: "var(--bg-surface)", borderRadius: 10, padding: "10px 12px", marginBottom: 2, borderBottom: "none" },
  cover:          { width: 44, height: 66, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  releaseTitle:   { color: "var(--text)", fontSize: 14, fontWeight: 600 },
  releaseMeta:    { color: "var(--text-faint)", fontSize: 12, marginTop: 2 },
  price:          { color: "var(--text-soft)", fontSize: 12, fontWeight: 600, flexShrink: 0 },
  toggleBtn:      { width: 32, height: 32, borderRadius: "50%", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-soft)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1 },
  toggleBtnOn:    { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14 },
};
