"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekMonday(offset = 0) {
  const d   = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff + offset * 7);
  return d.toISOString().split("T")[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

export default function ScheduleClient() {
  const [weekOffset, setOffset]   = useState(0);
  const [schedule, setSchedule]   = useState([]);
  const [selectedDay, setDay]     = useState(null);

  const monday = getWeekMonday(weekOffset);

  const days = DAY_LABELS.map((label, i) => {
    const date  = addDays(monday, i);
    const items = schedule.filter((s) => s.scheduled_for === date);
    return { label, date, items };
  });

  const activeDate  = selectedDay ?? monday;
  const activeItems = schedule.filter((s) => s.scheduled_for === activeDate);

  async function load() {
    const end = addDays(monday, 6);
    const { data } = await supabase
      .from("reading_schedule")
      .select("*, comic:comic_id( id, title, issue_number, cover_url, series:series_id( name ) )")
      .gte("scheduled_for", monday)
      .lte("scheduled_for", end)
      .order("scheduled_for");
    setSchedule(data ?? []);
  }

  useEffect(() => { load(); setDay(null); }, [weekOffset]);

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
        <h1 style={s.title}>Reading Schedule</h1>
        <span style={s.progress}>{completedThisWeek}/{totalThisWeek} this week</span>
      </div>

      <div style={s.weekNav}>
        <button style={s.navBtn} onClick={() => setOffset((o) => o - 1)}>← Prev</button>
        <span style={s.weekLabel}>{monday}</span>
        <button style={s.navBtn} onClick={() => setOffset((o) => o + 1)}>Next →</button>
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

      {activeItems.length === 0 ? (
        <p style={s.empty}>Nothing scheduled — open a comic and add it to your schedule.</p>
      ) : (
        <div style={s.list}>
          {activeItems.map((item) => (
            <div key={item.id} style={{ ...s.schedRow, ...(item.completed ? s.schedRowDone : {}) }}>
              {item.comic?.cover_url
                ? <img src={item.comic.cover_url} alt={item.comic.title} style={s.cover} loading="lazy" />
                : <div style={{ ...s.cover, background: C.card }} />
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
  page:         { maxWidth: 680 },
  header:       { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 },
  title:        { fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 700 },
  progress:     { color: C.textFaint, fontSize: 14 },
  weekNav:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  navBtn:       { background: "none", color: C.accent, fontWeight: 600, fontSize: 14, cursor: "pointer" },
  weekLabel:    { color: C.textSoft, fontSize: 13 },
  dayStrip:     { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 20 },
  dayBtn:       { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  dayBtnActive: { background: C.accent, borderColor: C.accent },
  dayLabel:     { color: C.textSoft, fontSize: 12, fontWeight: 600 },
  dayCount:     { background: C.gold, color: "#000", borderRadius: 10, minWidth: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" },
  dayCountDone: { background: C.cyan },
  activeDateLabel: { color: C.textFaint, fontSize: 12, marginBottom: 12 },
  empty:        { color: C.textSoft, padding: "40px 0" },
  list:         { display: "flex", flexDirection: "column", gap: 10 },
  schedRow:     { display: "flex", alignItems: "center", gap: 14, background: C.card, borderRadius: 12, padding: "12px 16px 12px 12px", border: `1px solid ${C.border}` },
  schedRowDone: { opacity: 0.5 },
  cover:        { width: 44, height: 66, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  series:       { color: C.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  comicTitle:   { color: C.text, fontWeight: 600, fontSize: 14, display: "block", marginTop: 2 },
  actions:      { display: "flex", alignItems: "center", gap: 8 },
  doneBtn:      { background: C.cyan, color: "#000", fontWeight: 700, fontSize: 14, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  doneTag:      { color: C.cyan, fontSize: 11, fontWeight: 700 },
  removeBtn:    { background: "none", color: C.textFaint, fontSize: 14, cursor: "pointer", padding: "4px" },
};
