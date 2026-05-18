"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekMonday(offset = 0) {
  const d   = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff + offset * 7);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export default function ScheduleClient() {
  const [weekOffset, setOffset]     = useState(0);
  const [schedule, setSchedule]     = useState([]);
  const [selectedDay, setDay]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState(null);
  const [genNote, setGenNote]       = useState(null);

  const monday = getWeekMonday(weekOffset);

  const days = DAY_LABELS.map((label, i) => {
    const date  = addDays(monday, i);
    const items = schedule.filter((s) => s.scheduled_for === date);
    return { label, date, items };
  });

  const activeDate  = selectedDay ?? monday;
  const activeItems = schedule.filter((s) => s.scheduled_for === activeDate);

  async function load() {
    setLoading(true);
    setError(null);
    const end = addDays(monday, 6);
    const { data, error } = await supabase
      .from("reading_schedule")
      .select("*, comic:comic_id( id, title, issue_number, cover_url, series:series_id( name ) )")
      .gte("scheduled_for", monday)
      .lte("scheduled_for", end)
      .order("scheduled_for");
    if (error) setError(error.message);
    setSchedule((data ?? []).filter((item) => item.comic));
    setLoading(false);
  }

  useEffect(() => { load(); setDay(null); }, [weekOffset]);

  async function generateSchedule() {
    setGenerating(true);
    setGenError(null);
    setGenNote(null);
    try {
      const res  = await fetch("/api/schedule/suggest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ weekStart: monday }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate schedule");
      setGenNote(`Scheduled ${data.scheduled} issue${data.scheduled !== 1 ? "s" : ""} across the week`);
      await load();
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function markDone(id) {
    await supabase.from("reading_schedule").update({ completed: true }).eq("id", id);
    load();
  }

  async function removeItem(id) {
    if (!confirm("Remove from schedule?")) return;
    await supabase.from("reading_schedule").delete().eq("id", id);
    load();
  }

  const totalThisWeek     = schedule.length;
  const completedThisWeek = schedule.filter((s) => s.completed).length;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Reading Schedule</h1>
          <span style={s.progress}>{completedThisWeek}/{totalThisWeek} this week</span>
        </div>
        <InkButton
          variant="gold"
          style={generating ? s.aiBtnBusy : undefined}
          onClick={generateSchedule}
          disabled={generating}
          title="Plan your week from unread comics in your library"
        >
          {generating ? "Planning..." : "Plan Week"}
        </InkButton>
      </div>

      {genNote  && <p style={s.genNote}>{genNote}</p>}
      {genError && <p style={s.genErr}>{genError} — <Link href="/settings" style={{ color: "var(--accent)" }}>check reading time in Settings</Link></p>}

      <div style={s.weekNav}>
        <InkButton variant="ghost" size="sm" onClick={() => setOffset((o) => o - 1)}>← Prev</InkButton>
        <span style={s.weekLabel}>{monday}</span>
        <InkButton variant="ghost" size="sm" onClick={() => setOffset((o) => o + 1)}>Next →</InkButton>
      </div>

      <div style={s.dayStrip}>
        {days.map(({ label, date, items }) => (
          <button
            key={date}
            style={{ ...s.dayBtn, ...(activeDate === date ? s.dayBtnActive : {}) }}
            onClick={() => setDay(date)}
          >
            <span style={s.dayLabel}>{label}</span>
            {items.length > 0 && (
              <span style={{ ...s.dayCount, ...(items.every((i) => i.completed) ? s.dayCountDone : {}) }}>
                {items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <p style={s.activeDateLabel}>{activeDate}</p>

      {loading && <p style={s.empty}>Loading…</p>}
      {error   && <p style={{ ...s.empty, color: "var(--accent)" }}>Error: {error}</p>}

      {!loading && !error && activeItems.length === 0 ? (
        <p style={s.empty}>Nothing scheduled - generate a local plan, or open a comic and add it manually.</p>
      ) : !loading && !error && (
        <div style={s.list}>
          {activeItems.map((item) => (
            <div key={item.id} style={{ ...s.schedRow, ...(item.completed ? s.schedRowDone : {}) }}>
              {item.comic?.cover_url
                ? <img src={item.comic.cover_url} alt={item.comic.title} style={s.cover} loading="lazy" />
                : <div style={{ ...s.cover, background: "var(--bg-card)" }} />
              }
              <div style={{ flex: 1 }}>
                <p style={s.series}>{item.comic?.series?.name}</p>
                <Link href={`/comic/${item.comic?.id}`} style={s.comicTitle}>
                  {item.comic?.title}{item.comic?.issue_number ? ` #${item.comic.issue_number}` : ""}
                </Link>
              </div>
              <div style={s.actions}>
                {!item.completed && (
                  <button style={s.doneBtn} onClick={() => markDone(item.id)} title="Mark as read">✓</button>
                )}
                {item.completed && <span style={s.doneTag}>Read</span>}
                <button style={s.removeBtn} onClick={() => removeItem(item.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page:          { maxWidth: "var(--content-max-sm)" },
  header:        { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 },
  title:         { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" },
  progress:      { color: "var(--text-faint)", fontSize: 14, fontFamily: "var(--font-mono)", display: "block", marginTop: 2 },

  aiBtnBusy:     { opacity: 0.6, cursor: "wait" },

  genNote: { color: "var(--hero-cyan)", fontSize: 13, marginBottom: 12, fontWeight: 600 },
  genErr:  { color: "var(--accent)",    fontSize: 13, marginBottom: 12 },

  weekNav:       { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  weekLabel:     { color: "var(--text-soft)", fontSize: 13 },
  dayStrip:      { display: "grid", gridTemplateColumns: "repeat(7, minmax(64px, 1fr))", gap: 6, marginBottom: 20, overflowX: "auto", paddingBottom: 2 },
  dayBtn:        { background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 10, padding: "10px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, boxShadow: "2px 2px 0 var(--ink-000)" },
  dayBtnActive:  { background: "var(--accent)", borderColor: "var(--ink-000)", backgroundImage: "var(--hatch-dark)" },
  dayLabel:      { color: "var(--text-soft)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-display)", letterSpacing: "0.04em" },
  dayCount:      { background: "var(--hero-gold)", color: "#000", borderRadius: 10, minWidth: 18, height: 18, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontFamily: "var(--font-burst)", border: "1px solid var(--ink-000)" },
  dayCountDone:  { background: "var(--hero-cyan)" },
  activeDateLabel: { color: "var(--text-faint)", fontSize: 12, marginBottom: 12 },
  empty:         { color: "var(--text-soft)", padding: "40px 0" },
  list:          { display: "flex", flexDirection: "column", gap: 10 },
  schedRow:      { display: "flex", alignItems: "center", gap: 14, background: "var(--bg-card)", borderRadius: 12, padding: "12px 16px 12px 12px", border: "2px solid var(--ink-000)", boxShadow: "3px 3px 0 var(--ink-000)" },
  schedRowDone:  { opacity: 0.5 },
  cover:         { width: 44, height: 66, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  series:        { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  comicTitle:    { color: "var(--text)", fontWeight: 600, fontSize: 14, display: "block", marginTop: 2 },
  actions:       { display: "flex", alignItems: "center", gap: 8 },
  doneBtn:       { background: "var(--hero-cyan)", color: "#000", fontWeight: 700, fontSize: 14, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  doneTag:       { color: "var(--hero-cyan)", fontSize: 11, fontWeight: 700 },
  removeBtn:     { background: "none", color: "var(--text-faint)", fontSize: 14, cursor: "pointer", padding: "4px" },
};
