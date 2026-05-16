"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase-browser";
import { C } from "../../../../lib/theme";

export default function ArcDetailClient({ params }) {
  const { id }       = use(params);
  const [arc, setArc]           = useState(null);
  const [issues, setIssues]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);
  const [newIssue, setNewIssue] = useState({ series_name: "", issue_number: "", title: "" });

  async function load() {
    const [{ data: arcData }, { data: issueData }] = await Promise.all([
      supabase.from("story_arcs").select("*").eq("id", id).single(),
      supabase
        .from("arc_issues")
        .select("*, comic:comic_id( id, title, cover_url, reading_log(id) )")
        .eq("arc_id", id)
        .order("order_index"),
    ]);
    setArc(arcData);
    setIssues(issueData ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function linkComic(arcIssueId, seriesName, issueNumber) {
    // Try to find a matching comic in the user's library
    const { data } = await supabase
      .from("comics")
      .select("id, title, cover_url")
      .ilike("issue_number", issueNumber)
      .limit(5);

    // Try to match by series name too
    const match = data?.find((c) =>
      c.title?.toLowerCase().includes(seriesName.toLowerCase().split(" ")[0])
    ) ?? data?.[0];

    if (!match) { alert("No matching comic found in your library for this issue."); return; }

    await supabase.from("arc_issues").update({ comic_id: match.id }).eq("id", arcIssueId);
    load();
  }

  async function addIssue(e) {
    e.preventDefault();
    if (!newIssue.series_name) return;
    setAdding(true);
    const maxOrder = issues.length ? Math.max(...issues.map((i) => i.order_index)) : 0;
    await supabase.from("arc_issues").insert({
      arc_id:       id,
      order_index:  maxOrder + 1,
      series_name:  newIssue.series_name,
      issue_number: newIssue.issue_number || null,
      title:        newIssue.title || null,
    });
    setNewIssue({ series_name: "", issue_number: "", title: "" });
    setAdding(false);
    load();
  }

  async function removeIssue(arcIssueId) {
    await supabase.from("arc_issues").delete().eq("id", arcIssueId);
    load();
  }

  if (loading) return <div style={{ color: C.textFaint, padding: 40 }}>Loading…</div>;
  if (!arc)    return <div style={{ color: C.accent, padding: 40 }}>Arc not found</div>;

  const owned   = issues.filter((i) => i.comic_id).length;
  const read    = issues.filter((i) => i.comic?.reading_log?.length > 0).length;
  const nextUp  = issues.find((i) => i.comic_id && !(i.comic?.reading_log?.length > 0));

  return (
    <div style={s.page}>
      <Link href="/arcs" style={s.back}>← Reading Order</Link>

      <h1 style={s.title}>{arc.name}</h1>
      {arc.description && <p style={s.desc}>{arc.description}</p>}

      <div style={s.stats}>
        <Stat label="Issues" val={issues.length} />
        <Stat label="Owned"  val={owned} accent={C.cyan} />
        <Stat label="Read"   val={read}  accent={C.gold} />
        <Stat label="Left"   val={owned - read} />
      </div>

      {nextUp && (
        <div style={s.nextUp}>
          <span style={s.nextLabel}>Up next</span>
          <Link href={`/comic/${nextUp.comic_id}`} style={s.nextTitle}>
            {nextUp.series_name} #{nextUp.issue_number} — {nextUp.title}
          </Link>
        </div>
      )}

      <div style={s.issueList}>
        {issues.map((issue, idx) => {
          const isRead  = (issue.comic?.reading_log?.length ?? 0) > 0;
          const isOwned = !!issue.comic_id;

          return (
            <div key={issue.id} style={s.issueRow}>
              <span style={s.orderNum}>{idx + 1}</span>

              {issue.comic?.cover_url
                ? <img src={issue.comic.cover_url} alt={issue.series_name} style={s.cover} loading="lazy" />
                : <div style={{ ...s.cover, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: C.textFaint, fontSize: 10 }}>?</span>
                  </div>
              }

              <div style={{ flex: 1 }}>
                <p style={s.issueSeries}>{issue.series_name}</p>
                <p style={s.issueTitle}>
                  {issue.issue_number ? `#${issue.issue_number}` : ""}
                  {issue.title ? `  ${issue.title}` : ""}
                </p>
                {isOwned && (
                  <Link href={`/comic/${issue.comic_id}`} style={s.libraryLink}>
                    In your library →
                  </Link>
                )}
              </div>

              <div style={s.statusCol}>
                {isRead  && <span style={{ ...s.badge, background: C.cyan,  color: "#000" }}>Read</span>}
                {!isRead && isOwned && <span style={{ ...s.badge, background: C.surface, color: C.textSoft, border: `1px solid ${C.border}` }}>Owned</span>}
                {!isOwned && (
                  <button style={s.linkBtn} onClick={() => linkComic(issue.id, issue.series_name, issue.issue_number)}>
                    Link
                  </button>
                )}
                {!arc.is_system && (
                  <button style={s.removeBtn} onClick={() => removeIssue(issue.id)}>✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!arc.is_system && (
        <form onSubmit={addIssue} style={s.addForm}>
          <h3 style={s.addHead}>Add Issue to Arc</h3>
          <div style={s.addRow}>
            <input placeholder="Series name *" value={newIssue.series_name} onChange={(e) => setNewIssue({ ...newIssue, series_name: e.target.value })} style={{ flex: 2 }} required />
            <input placeholder="Issue #" value={newIssue.issue_number} onChange={(e) => setNewIssue({ ...newIssue, issue_number: e.target.value })} style={{ flex: 1 }} />
            <input placeholder="Title" value={newIssue.title} onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })} style={{ flex: 2 }} />
            <button type="submit" style={s.addBtn} disabled={adding}>{adding ? "…" : "Add"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Stat({ label, val, accent }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
      <p style={{ color: accent ?? C.text, fontSize: 22, fontWeight: 700 }}>{val}</p>
      <p style={{ color: C.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{label}</p>
    </div>
  );
}

const s = {
  page:      { maxWidth: 760 },
  back:      { color: C.textFaint, fontSize: 14, display: "inline-block", marginBottom: 20 },
  title:     { fontSize: 30, fontFamily: "Georgia, serif", fontWeight: 700, marginBottom: 6 },
  desc:      { color: C.textSoft, fontSize: 14, marginBottom: 20, lineHeight: 1.6 },
  stats:     { display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" },
  nextUp:    { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 },
  nextLabel: { color: C.gold, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 },
  nextTitle: { color: C.text, fontWeight: 600, fontSize: 14 },
  issueList: { display: "flex", flexDirection: "column" },
  issueRow:  { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` },
  orderNum:  { color: C.textFaint, fontSize: 12, width: 24, textAlign: "right", flexShrink: 0 },
  cover:     { width: 40, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 },
  issueSeries: { color: C.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  issueTitle:  { color: C.text, fontWeight: 600, fontSize: 14, marginTop: 2 },
  libraryLink: { color: C.accent, fontSize: 11, marginTop: 4, display: "block" },
  statusCol:   { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },
  badge:       { fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 10 },
  linkBtn:     { background: C.surface, border: `1px solid ${C.border}`, color: C.textSoft, fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer" },
  removeBtn:   { background: "none", color: C.textFaint, fontSize: 13, cursor: "pointer", padding: "4px" },
  addForm:     { marginTop: 28, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 },
  addHead:     { color: C.textSoft, fontSize: 13, fontWeight: 700, marginBottom: 12 },
  addRow:      { display: "flex", gap: 8, flexWrap: "wrap" },
  addBtn:      { background: C.accent, color: "#fff", padding: "10px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
};
