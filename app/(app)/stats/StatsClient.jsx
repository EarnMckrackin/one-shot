"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

function getMonthKey(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
}

function calcStreak(readDates) {
  if (!readDates.length) return 0;
  const days = [...new Set(readDates.map((d) => new Date(d).toDateString()))].sort((a, b) => new Date(b) - new Date(a));
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    const curr = new Date(days[i]);
    const diff = (prev - curr) / 86400000;
    if (diff <= 1) streak++;
    else break;
  }
  return streak;
}

export default function StatsClient() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: comics }, { data: logs }] = await Promise.all([
        supabase.from("comics").select("id, publisher:publisher_id(name), series:series_id(name), created_at"),
        supabase.from("reading_log").select("comic_id, read_at").order("read_at"),
      ]);

      const totalComics = comics?.length ?? 0;
      const totalRead   = new Set(logs?.map((l) => l.comic_id)).size;

      // Publisher breakdown
      const pubCounts = {};
      for (const c of comics ?? []) {
        const name = c.publisher?.name ?? "Unknown";
        pubCounts[name] = (pubCounts[name] ?? 0) + 1;
      }
      const publishers = Object.entries(pubCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count, pct: Math.round((count / totalComics) * 100) }));

      // Monthly reading
      const monthCounts = {};
      for (const log of logs ?? []) {
        const key = getMonthKey(log.read_at);
        monthCounts[key] = (monthCounts[key] ?? 0) + 1;
      }
      const sortedMonths = Object.keys(monthCounts).sort();
      const last12 = sortedMonths.slice(-12).map((k) => ({ key: k, label: monthLabel(k), count: monthCounts[k] }));
      const maxMonthCount = Math.max(...last12.map((m) => m.count), 1);

      // Streak
      const streak = calcStreak(logs?.map((l) => l.read_at) ?? []);

      // This month vs last month
      const now       = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
      const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

      const readThisMonth = monthCounts[thisMonth]  ?? 0;
      const readLastMonth = monthCounts[lastMonthKey] ?? 0;

      // Top series
      const seriesCounts = {};
      for (const l of logs ?? []) {
        const comic = comics?.find((c) => c.id === l.comic_id);
        const name = comic?.series?.name ?? "Standalone";
        seriesCounts[name] = (seriesCounts[name] ?? 0) + 1;
      }
      const topSeries = Object.entries(seriesCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      setStats({ totalComics, totalRead, publishers, last12, maxMonthCount, streak, readThisMonth, readLastMonth, topSeries, totalLogs: logs?.length ?? 0 });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p style={{ color: "var(--text-faint)", padding: 40, fontFamily: "var(--font-body)" }}>Crunching your collection…</p>;

  const { totalComics, totalRead, publishers, last12, maxMonthCount, streak, readThisMonth, readLastMonth, topSeries, totalLogs } = stats;

  return (
    <div style={s.page}>
      <h1 style={s.title}>Stats</h1>

      {/* Top-line numbers */}
      <div style={s.topStats}>
        <StatTile label="In Library"  val={totalComics} />
        <StatTile label="Unique Read" val={totalRead}      accent="var(--hero-cyan)" />
        <StatTile label="Total Reads" val={totalLogs} />
        <StatTile label="Day Streak"  val={streak}        accent="var(--hero-gold)" suffix="🔥" hot />
        <StatTile label="This Month"  val={readThisMonth} note={readLastMonth ? `${readLastMonth} last mo.` : null} />
      </div>

      {/* Monthly bar chart */}
      {last12.length > 0 && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Reading by Month</h2>
          <div style={s.barChart}>
            {last12.map((m) => (
              <div key={m.key} style={s.barCol}>
                <span style={s.barCount}>{m.count}</span>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, height: `${Math.round((m.count / maxMonthCount) * 100)}%` }} />
                </div>
                <span style={s.barLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={s.twoCol}>
        {/* Publisher breakdown */}
        <section style={s.section}>
          <h2 style={s.sectionTitle}>By Publisher</h2>
          <div style={s.pubList}>
            {publishers.map((p) => (
              <div key={p.name} style={s.pubRow}>
                <span style={s.pubName}>{p.name}</span>
                <div style={s.pubBarTrack}>
                  <div style={{ ...s.pubBarFill, width: `${p.pct}%` }} />
                </div>
                <span style={s.pubCount}>{p.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top series read */}
        {topSeries.length > 0 && (
          <section style={s.section}>
            <h2 style={s.sectionTitle}>Most Read Series</h2>
            <div style={s.seriesList}>
              {topSeries.map((ser, i) => (
                <div key={ser.name} style={seriesRowStyle}>
                  <span style={{ color: "var(--text-faint)", fontSize: 12, width: 20, fontFamily: "var(--font-mono)" }}>{i + 1}</span>
                  <span style={{ color: "var(--text)", fontSize: 14, flex: 1 }}>{ser.name}</span>
                  <span style={{ color: "var(--hero-gold)", fontFamily: "var(--font-burst)", fontSize: 16 }}>{ser.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const seriesRowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" };

function StatTile({ label, val, accent, suffix, note, hot }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "var(--bg-card)",
      backgroundImage: "var(--halftone-dots)", backgroundSize: "var(--halftone-size)",
      border: "2.5px solid var(--ink-000)",
      borderRadius: 10,
      boxShadow: "3px 3px 0 var(--ink-000)",
      padding: "18px 22px", flex: 1, minWidth: 120,
    }}>
      {hot && (
        <span style={{
          position: "absolute", top: 6, right: -4,
          fontFamily: "var(--font-burst)", fontSize: 10, letterSpacing: "0.12em",
          color: "#fff", background: "var(--accent)",
          padding: "2px 8px 1px",
          border: "1.5px solid var(--ink-000)",
          boxShadow: "2px 2px 0 var(--ink-000)",
          transform: "rotate(8deg)",
          whiteSpace: "nowrap",
        }}>HOT</span>
      )}
      <p style={{
        color: accent ?? "var(--text)",
        fontFamily: "var(--font-burst)", fontSize: 38,
        letterSpacing: "0.02em", lineHeight: 1, whiteSpace: "nowrap",
      }}>
        {val}{suffix && <span style={{ fontSize: 22, marginLeft: 4 }}>{suffix}</span>}
      </p>
      <p style={{
        fontFamily: "var(--font-burst)", fontSize: 11,
        letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--text-soft)", marginTop: 8,
      }}>{label}</p>
      {note && <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4 }}>{note}</p>}
    </div>
  );
}

const s = {
  page:        { maxWidth: 900 },
  title:       { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28 },
  topStats:    { display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" },
  section:     { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, flex: 1 },
  sectionTitle:{ color: "var(--text)", fontSize: 16, fontWeight: 700, marginBottom: 20 },
  twoCol:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 },
  barChart:    { display: "flex", gap: 8, alignItems: "flex-end", height: 160 },
  barCol:      { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 },
  barCount:    { color: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono)" },
  barTrack:    { flex: 1, width: "100%", background: "var(--bg-card)", borderRadius: 4, overflow: "hidden", display: "flex", alignItems: "flex-end" },
  barFill:     { width: "100%", background: "var(--accent)", borderRadius: "4px 4px 0 0", transition: "height 0.4s", minHeight: 2 },
  barLabel:    { color: "var(--text-faint)", fontSize: 9, textAlign: "center", lineHeight: 1.2 },
  pubList:     { display: "flex", flexDirection: "column", gap: 10 },
  pubRow:      { display: "flex", alignItems: "center", gap: 10 },
  pubName:     { color: "var(--text-soft)", fontSize: 13, width: 100, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pubBarTrack: { flex: 1, height: 6, background: "var(--bg-card)", borderRadius: 3, overflow: "hidden" },
  pubBarFill:  { height: "100%", background: "var(--hero-cyan)", borderRadius: 3 },
  pubCount:    { color: "var(--text-faint)", fontSize: 12, width: 32, textAlign: "right" },
  seriesList:  { display: "flex", flexDirection: "column" },
};
