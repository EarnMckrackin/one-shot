"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase-browser";
import { C } from "../../../../lib/theme";

export default function ComicDetailClient({ comic: initial }) {
  const router = useRouter();
  const [comic, setComic]       = useState(initial);
  const [logOpen, setLogOpen]   = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [notes, setNotes]       = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [saving, setSaving]     = useState(false);

  const readLog   = comic.reading_log ?? [];
  const readCount = readLog.length;
  const lastRead  = readLog.sort((a, b) => new Date(b.read_at) - new Date(a.read_at))[0]?.read_at;

  async function reload() {
    const { data } = await supabase
      .from("comics")
      .select("*, series:series_id( id, name ), publisher:publisher_id( id, name ), reading_log( id, read_at, notes )")
      .eq("id", comic.id)
      .single();
    if (data) setComic(data);
  }

  async function logReading() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reading_log").insert({ user_id: user.id, comic_id: comic.id, notes: notes || null });
    setNotes("");
    setLogOpen(false);
    setSaving(false);
    reload();
  }

  async function addToSchedule() {
    if (!schedDate) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("reading_schedule").upsert(
      { user_id: user.id, comic_id: comic.id, scheduled_for: schedDate },
      { onConflict: "user_id,comic_id,scheduled_for" }
    );
    setSchedDate("");
    setSchedOpen(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Remove this comic from your library?")) return;
    await supabase.from("comics").delete().eq("id", comic.id);
    router.push("/library");
  }

  return (
    <div style={s.page}>
      <Link href="/library" style={s.back}>← Library</Link>

      <div style={s.hero}>
        <div style={s.coverWrap}>
          {comic.cover_url
            ? <img src={comic.cover_url} alt={comic.title} style={s.cover} />
            : <div style={{ ...s.cover, ...s.coverPlaceholder }}>No cover</div>
          }
        </div>

        <div style={s.meta}>
          {comic.series && <Link href={`/series/${comic.series.id}`} style={s.seriesLink}>{comic.series.name}</Link>}
          <h1 style={s.title}>{comic.title}{comic.issue_number ? ` #${comic.issue_number}` : ""}</h1>
          {comic.publisher && <p style={s.publisher}>{comic.publisher.name}</p>}
          {comic.release_date && <p style={s.date}>{comic.release_date.slice(0, 7)}</p>}

          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statVal}>{readCount}</span>
              <span style={s.statLabel}>Times Read</span>
            </div>
            <div style={s.stat}>
              <span style={s.statVal}>{lastRead ? new Date(lastRead).toLocaleDateString() : "—"}</span>
              <span style={s.statLabel}>Last Read</span>
            </div>
          </div>

          <div style={s.actions}>
            <button style={s.primaryBtn} onClick={() => setLogOpen(!logOpen)}>Log Reading</button>
            <button style={s.secondaryBtn} onClick={() => setSchedOpen(!schedOpen)}>+ Schedule</button>
            {comic.has_pdf && comic.drive_view_url && (
              <a href={comic.drive_view_url} target="_blank" rel="noopener noreferrer" style={s.pdfBtn}>Open PDF</a>
            )}
          </div>

          {logOpen && (
            <div style={s.inlineForm}>
              <p style={s.formLabel}>Notes (optional)</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="How was it?" style={{ marginBottom: 10 }} />
              <button style={s.primaryBtn} onClick={logReading} disabled={saving}>
                {saving ? "Saving…" : "Mark as Read"}
              </button>
            </div>
          )}

          {schedOpen && (
            <div style={s.inlineForm}>
              <p style={s.formLabel}>Date</p>
              <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} style={{ marginBottom: 10 }} />
              <button style={s.primaryBtn} onClick={addToSchedule} disabled={saving || !schedDate}>
                {saving ? "Saving…" : "Add to Schedule"}
              </button>
            </div>
          )}
        </div>
      </div>

      {comic.description && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Description</h2>
          <p style={s.description}>{comic.description}</p>
        </div>
      )}

      {(comic.writers?.length || comic.artists?.length || comic.characters?.length) && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Credits</h2>
          {comic.writers?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Writers</span>{comic.writers.join(", ")}</p>}
          {comic.artists?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Artists</span>{comic.artists.join(", ")}</p>}
          {comic.characters?.length > 0 && <p style={s.credit}><span style={s.creditKey}>Characters</span>{comic.characters.slice(0, 10).join(", ")}</p>}
        </div>
      )}

      {readLog.length > 0 && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Reading History</h2>
          {readLog.map((entry) => (
            <div key={entry.id} style={s.logEntry}>
              <span style={s.logDate}>{new Date(entry.read_at).toLocaleDateString()}</span>
              {entry.notes && <span style={s.logNotes}>{entry.notes}</span>}
            </div>
          ))}
        </div>
      )}

      <button style={s.deleteBtn} onClick={handleDelete}>Remove from Library</button>
    </div>
  );
}

const s = {
  page:          { maxWidth: 800 },
  back:          { color: C.textFaint, fontSize: 14, display: "inline-block", marginBottom: 24 },
  hero:          { display: "flex", gap: 32, marginBottom: 32, flexWrap: "wrap" },
  coverWrap:     { flexShrink: 0, width: 200 },
  cover:         { width: "100%", aspectRatio: "2/3", objectFit: "cover", borderRadius: 12, display: "block" },
  coverPlaceholder: { background: C.card, color: C.textFaint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, borderRadius: 12 },
  meta:          { flex: 1, minWidth: 240 },
  seriesLink:    { color: C.textFaint, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 },
  title:         { fontSize: 28, fontFamily: "Georgia, serif", fontWeight: 700, marginBottom: 4, lineHeight: 1.2 },
  publisher:     { color: C.textSoft, fontSize: 14, marginBottom: 4 },
  date:          { color: C.textFaint, fontSize: 13, marginBottom: 20 },
  stats:         { display: "flex", gap: 16, marginBottom: 20 },
  stat:          { background: C.card, borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 100 },
  statVal:       { color: C.text, fontWeight: 700, fontSize: 18 },
  statLabel:     { color: C.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  actions:       { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  primaryBtn:    { background: C.accent, color: "#fff", padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn:  { background: C.surface, color: C.text, padding: "11px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer", border: `1px solid ${C.border}` },
  pdfBtn:        { background: C.card, color: C.gold, padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, border: `1px solid ${C.border}` },
  inlineForm:    { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 },
  formLabel:     { color: C.textSoft, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  section:       { marginBottom: 28 },
  sectionTitle:  { color: C.text, fontSize: 16, fontWeight: 700, marginBottom: 10 },
  description:   { color: C.textSoft, fontSize: 14, lineHeight: 1.7 },
  credit:        { color: C.textSoft, fontSize: 14, marginBottom: 6, display: "flex", gap: 12 },
  creditKey:     { color: C.textFaint, width: 80, flexShrink: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, paddingTop: 2 },
  logEntry:      { display: "flex", gap: 16, padding: "8px 0", borderBottom: `1px solid ${C.border}` },
  logDate:       { color: C.textSoft, fontSize: 13, flexShrink: 0 },
  logNotes:      { color: C.textFaint, fontSize: 13 },
  deleteBtn:     { background: "none", color: C.textFaint, fontSize: 13, cursor: "pointer", marginTop: 32, padding: "10px 0", display: "block" },
};
