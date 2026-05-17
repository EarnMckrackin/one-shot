"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase-browser";

function parseIssueNum(n) {
  if (!n) return null;
  const num = parseFloat(n);
  return isNaN(num) ? null : num;
}

function findGaps(issues) {
  const nums = issues
    .map((i) => parseIssueNum(i.issue_number))
    .filter((n) => n !== null && Number.isInteger(n))
    .sort((a, b) => a - b);

  if (nums.length < 2) return [];
  const gaps = [];
  for (let i = 0; i < nums.length - 1; i++) {
    for (let missing = nums[i] + 1; missing < nums[i + 1]; missing++) {
      gaps.push(missing);
    }
  }
  return gaps;
}

export default function GapsClient() {
  const [seriesData, setSeriesData] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(null);
  const [filter, setFilter]         = useState("gaps");

  useEffect(() => {
    async function load() {
      const { data: comics } = await supabase
        .from("comics")
        .select("id, title, issue_number, series:series_id(id, name), publisher:publisher_id(name)");

      // Group by series
      const bySeriesMap = {};
      for (const comic of comics ?? []) {
        const key = comic.series?.id ?? `__noseries__${comic.publisher?.name}`;
        const name = comic.series?.name ?? "No Series";
        if (!bySeriesMap[key]) bySeriesMap[key] = { name, publisher: comic.publisher?.name, issues: [] };
        bySeriesMap[key].issues.push(comic);
      }

      const rows = Object.values(bySeriesMap).map((s) => {
        const nums   = s.issues.map((i) => parseIssueNum(i.issue_number)).filter((n) => n !== null && Number.isInteger(n)).sort((a, b) => a - b);
        const gaps   = findGaps(s.issues);
        const minNum = nums[0] ?? null;
        const maxNum = nums[nums.length - 1] ?? null;
        return { ...s, gaps, minNum, maxNum, total: nums.length };
      }).sort((a, b) => b.gaps.length - a.gaps.length);

      setSeriesData(rows);
      setLoading(false);
    }
    load();
  }, []);

  const displayed = filter === "gaps"
    ? seriesData.filter((s) => s.gaps.length > 0)
    : seriesData;

  const totalGaps   = seriesData.reduce((sum, s) => sum + s.gaps.length, 0);
  const totalSeries = seriesData.filter((s) => s.gaps.length > 0).length;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Collection Gaps</h1>
        {!loading && (
          <span style={s.sub}>{totalGaps} missing issues across {totalSeries} series</span>
        )}
      </div>

      <div style={s.filterBar}>
        {["gaps", "all"].map((f) => (
          <button key={f} style={{ ...s.chip, ...(filter === f ? s.chipActive : {}) }} onClick={() => setFilter(f)}>
            {f === "gaps" ? "Missing Issues Only" : "All Series"}
          </button>
        ))}
      </div>

      {loading && <p style={s.msg}>Analysing your collection…</p>}

      {!loading && displayed.length === 0 && (
        <p style={s.msg}>Your collection has no gaps — impressive run!</p>
      )}

      <div style={s.list}>
        {displayed.map((series) => {
          const isOpen = expanded === series.name;
          const pct    = series.total && series.maxNum
            ? Math.round((series.total / (series.maxNum - series.minNum + 1)) * 100)
            : 100;

          return (
            <div key={series.name} style={s.card}>
              <button style={s.cardHeader} onClick={() => setExpanded(isOpen ? null : series.name)}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <p style={s.seriesName}>{series.name}</p>
                  <p style={s.seriesMeta}>
                    {series.publisher && <span>{series.publisher}  ·  </span>}
                    Issues #{series.minNum}–#{series.maxNum}  ·  {series.total} owned
                    {series.gaps.length > 0 && <span style={s.gapCount}>  ·  {series.gaps.length} missing</span>}
                  </p>
                </div>

                <div style={s.progressWrap}>
                  <div style={s.progressBar}>
                    <div style={{ ...s.progressFill, width: `${pct}%` }} />
                  </div>
                  <span style={s.pct}>{pct}%</span>
                </div>
              </button>

              {isOpen && series.gaps.length > 0 && (
                <div style={s.gapList}>
                  <p style={s.gapLabel}>Missing issues — add to your want list:</p>
                  <div style={s.gapNums}>
                    {series.gaps.map((n) => (
                      <span key={n} style={s.gapBadge}>#{n}</span>
                    ))}
                  </div>
                </div>
              )}

              {isOpen && series.gaps.length === 0 && (
                <div style={s.gapList}>
                  <p style={{ color: "var(--hero-cyan)", fontSize: 14 }}>✓ Complete run — no gaps</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page:        { maxWidth: 760 },
  header:      { marginBottom: 20 },
  title:       { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  sub:         { color: "var(--text-faint)", fontSize: 14 },
  filterBar:   { display: "flex", gap: 8, marginBottom: 24 },
  chip:        { fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", padding: "7px 16px 6px", borderRadius: 999, background: "transparent", color: "var(--text-soft)", border: "1.5px solid var(--border)", cursor: "pointer", transition: "all 120ms" },
  chipActive:  { background: "var(--accent)", color: "#fff", border: "1.5px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", transform: "translate(-1px,-1px) rotate(-1.5deg)" },
  msg:         { color: "var(--text-soft)", padding: "40px 0" },
  list:        { display: "flex", flexDirection: "column", gap: 8 },
  card:        { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" },
  cardHeader:  { display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", cursor: "pointer", background: "none", width: "100%", border: "none", textAlign: "left" },
  seriesName:  { color: "var(--text)", fontWeight: 600, fontSize: 15, marginBottom: 3 },
  seriesMeta:  { color: "var(--text-faint)", fontSize: 12 },
  gapCount:    { color: "var(--accent)", fontWeight: 600 },
  progressWrap:{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  progressBar: { width: 80, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" },
  progressFill:{ height: "100%", background: "var(--hero-cyan)", borderRadius: 3, transition: "width 0.3s" },
  pct:         { color: "var(--text-faint)", fontSize: 11, width: 32, textAlign: "right" },
  gapList:     { padding: "12px 18px 16px", borderTop: "1px solid var(--border)" },
  gapLabel:    { color: "var(--text-soft)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 },
  gapNums:     { display: "flex", flexWrap: "wrap", gap: 6 },
  gapBadge:    { background: "var(--bg-surface)", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 },
};
