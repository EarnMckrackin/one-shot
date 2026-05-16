"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase-browser";
import { C } from "../../../../lib/theme";

export default function ComicDetailClient({ comic: initial }) {
  const router = useRouter();
  const [comic, setComic]           = useState(initial);
  const [logOpen, setLogOpen]       = useState(false);
  const [schedOpen, setSchedOpen]   = useState(false);
  const [notes, setNotes]           = useState("");
  const [schedDate, setSchedDate]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [altCovers, setAltCovers]   = useState([]);
  const [fetchingCovers, setFetchingCovers] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [savingCover, setSavingCover] = useState(false);

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

  async function openCoverPicker() {
    setCoverPickerOpen(true);
    setAltCovers([]);
    setCustomCoverUrl("");
    setFetchingCovers(true);
    const query = [comic.series?.name ?? comic.title, comic.issue_number && `#${comic.issue_number}`]
      .filter(Boolean).join(" ");
    try {
      const res  = await fetch("/api/scan", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ query }),
      });
      const data = await res.json();
      const covers = (data.results ?? [])
        .filter(r => r.cover_url)
        .map(r => ({ url: r.cover_url, label: `${r.series_name ?? r.title}${r.issue_number ? ` #${r.issue_number}` : ""}` }));
      // Dedupe by URL
      const seen = new Set();
      setAltCovers(covers.filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; }));
    } catch {}
    setFetchingCovers(false);
  }

  async function saveCover(url) {
    if (!url?.trim()) return;
    setSavingCover(true);
    await supabase.from("comics").update({ cover_url: url }).eq("id", comic.id);
    setComic(c => ({ ...c, cover_url: url }));
    setCoverPickerOpen(false);
    setSavingCover(false);
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
          <button style={s.changeCoverBtn} onClick={openCoverPicker}>Change Cover</button>
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
            <Link href={`/scan?replace=${comic.id}`} style={s.rescanBtn}>Re-identify</Link>
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

      {coverPickerOpen && (
        <div style={s.pickerPanel}>
          <div style={s.pickerHeader}>
            <h2 style={s.pickerTitle}>Choose a Cover</h2>
            <button style={s.pickerClose} onClick={() => setCoverPickerOpen(false)}>✕</button>
          </div>

          {fetchingCovers && <p style={s.pickerHint}>Searching for covers…</p>}

          {!fetchingCovers && altCovers.length > 0 && (
            <div style={s.coverGrid}>
              {altCovers.map((c, i) => (
                <button key={i} style={s.coverGridItem} onClick={() => saveCover(c.url)} disabled={savingCover} title={c.label}>
                  <img src={c.url} alt={c.label} style={s.coverGridImg} loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {!fetchingCovers && altCovers.length === 0 && (
            <p style={s.pickerHint}>No alternative covers found — paste a URL below.</p>
          )}

          <div style={s.customUrlRow}>
            <input
              value={customCoverUrl}
              onChange={e => setCustomCoverUrl(e.target.value)}
              placeholder="Or paste an image URL…"
              style={s.customUrlInput}
            />
            <button
              style={s.customUrlBtn}
              onClick={() => saveCover(customCoverUrl)}
              disabled={savingCover || !customCoverUrl.trim()}
            >
              {savingCover ? "Saving…" : "Use"}
            </button>
          </div>
        </div>
      )}

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
  back:          { color: "var(--text-faint)", fontSize: 13, display: "inline-block", marginBottom: 22 },
  hero:          { display: "flex", gap: 28, marginBottom: 32, flexWrap: "wrap" },
  coverWrap:     { flexShrink: 0, width: 180 },
  cover:         { width: "100%", aspectRatio: "2/3", objectFit: "cover", borderRadius: 12, display: "block" },
  coverPlaceholder: { background: "var(--bg-card)", color: "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, borderRadius: 12 },
  meta:          { flex: 1, minWidth: 240 },
  seriesLink:    { color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6, fontWeight: 600 },
  title:         { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4, lineHeight: 1.2 },
  publisher:     { color: "var(--text-soft)", fontSize: 14, marginBottom: 4 },
  date:          { color: "var(--text-faint)", fontSize: 13, marginBottom: 20 },
  stats:         { display: "flex", gap: 12, marginBottom: 20 },
  stat:          { background: "var(--bg-card)", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 100 },
  statVal:       { color: "var(--text)", fontFamily: "var(--font-display)", fontSize: 24 },
  statLabel:     { color: "var(--text-faint)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 },
  actions:       { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 },
  primaryBtn:    { background: "var(--accent)", color: "#fff", padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  secondaryBtn:  { background: "var(--bg-surface)", color: "var(--text)", padding: "11px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer", border: "1px solid var(--border)" },
  pdfBtn:        { background: "var(--bg-card)", color: "var(--hero-gold)", padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "1px solid var(--border)" },
  inlineForm:    { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 },
  formLabel:     { color: "var(--text-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 600 },
  section:       { marginBottom: 28 },
  sectionTitle:  { color: "var(--text)", fontSize: 16, fontWeight: 700, marginBottom: 10 },
  description:   { color: "var(--text-soft)", fontSize: 14, lineHeight: 1.7 },
  credit:        { color: "var(--text-soft)", fontSize: 14, marginBottom: 6, display: "flex", gap: 12 },
  creditKey:     { color: "var(--text-faint)", width: 84, flexShrink: 0, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", paddingTop: 2 },
  logEntry:      { display: "flex", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--border)" },
  logDate:       { color: "var(--text-soft)", fontSize: 13, flexShrink: 0 },
  logNotes:      { color: "var(--text-faint)", fontSize: 13 },
  deleteBtn:     { background: "none", color: "var(--text-faint)", fontSize: 13, cursor: "pointer", marginTop: 32, padding: "10px 0", display: "block" },
  rescanBtn:     { background: "var(--bg-surface)", color: "var(--text-soft)", padding: "11px 20px", borderRadius: 10, fontWeight: 600, fontSize: 14, border: "1px solid var(--border)", display: "inline-block" },

  changeCoverBtn: { display: "block", width: "100%", marginTop: 8, background: "none", border: "1px solid var(--border)", color: "var(--text-faint)", fontSize: 12, padding: "6px 0", borderRadius: 8, cursor: "pointer" },

  pickerPanel:   { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 28 },
  pickerHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  pickerTitle:   { fontSize: 16, fontWeight: 700 },
  pickerClose:   { background: "none", border: "none", color: "var(--text-faint)", fontSize: 18, cursor: "pointer", padding: "0 4px" },
  pickerHint:    { color: "var(--text-faint)", fontSize: 13, marginBottom: 16 },

  coverGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 10, marginBottom: 16 },
  coverGridItem: { background: "none", border: "2px solid transparent", borderRadius: 8, padding: 0, cursor: "pointer", overflow: "hidden", transition: "border-color 120ms" },
  coverGridImg:  { width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block", borderRadius: 6 },

  customUrlRow:  { display: "flex", gap: 8, marginTop: 8 },
  customUrlInput:{ flex: 1, fontSize: 13, padding: "9px 12px", borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" },
  customUrlBtn:  { background: "var(--accent)", color: "#fff", padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none", whiteSpace: "nowrap" },
};
