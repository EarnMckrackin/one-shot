"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";

export default function ArcsClient() {
  const [arcs, setArcs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data } = await supabase
      .from("story_arcs")
      .select("*, arc_issues(id, order_index, series_name, issue_number, comic_id, comic:comic_id(id))")
      .order("is_system", { ascending: false })
      .order("name");
    setArcs(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createArc(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("story_arcs").insert({ user_id: user.id, name: newName.trim() });
    setNewName("");
    setCreating(false);
    load();
  }

  async function deleteArc(arc) {
    if (arc.is_system) return;
    if (!confirm(`Delete "${arc.name}" and its reading order?`)) return;

    const { error } = await supabase
      .from("story_arcs")
      .delete()
      .eq("id", arc.id)
      .eq("is_system", false);

    if (error) {
      alert("Could not delete reading order: " + error.message);
      return;
    }

    load();
  }

  const systemArcs = arcs.filter((a) => a.is_system);
  const myArcs     = arcs.filter((a) => !a.is_system);

  return (
    <div style={s.page}>
      <h1 style={s.title}>Reading Order</h1>
      <p style={s.sub}>Follow story arcs and crossovers in the correct reading order</p>

      <form onSubmit={createArc} style={s.createRow}>
        <input
          className="ink-input"
          placeholder="Create a new reading order (e.g. Hickman's Avengers saga)…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: 1 }}
        />
        <InkButton type="submit" disabled={creating}>
          {creating ? "…" : "Create"}
        </InkButton>
      </form>

      {loading && <p style={s.msg}>Loading…</p>}

      {myArcs.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={s.sectionHead}>My Reading Orders</h2>
          <ArcGrid arcs={myArcs} onDelete={deleteArc} />
        </section>
      )}

      <section>
        <h2 style={s.sectionHead}>Classic Story Arcs</h2>
        <ArcGrid arcs={systemArcs} />
      </section>
    </div>
  );
}

function ArcGrid({ arcs, onDelete }) {
  return (
    <div style={s.grid}>
      {arcs.map((arc) => {
        const total   = arc.arc_issues?.length ?? 0;
        const owned   = arc.arc_issues?.filter((i) => i.comic).length ?? 0;
        const pct     = total ? Math.round((owned / total) * 100) : 0;

        return (
          <div key={arc.id} style={s.arcCard}>
            <Link href={`/arcs/${arc.id}`} style={s.arcLink}>
              <div style={s.arcTop}>
                <p style={s.arcName}>{arc.name}</p>
                {arc.is_system && <span style={s.systemTag}>Classic</span>}
              </div>
              {arc.description && <p style={s.arcDesc}>{arc.description}</p>}
              <div style={s.arcBottom}>
                <div style={s.progressBar}>
                  <div style={{ ...s.progressFill, width: `${pct}%` }} />
                </div>
                <span style={s.arcMeta}>{owned}/{total} owned</span>
              </div>
            </Link>
            {!arc.is_system && onDelete && (
              <button type="button" style={s.deleteBtn} onClick={() => onDelete(arc)}>
                Delete
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  page:        { maxWidth: 800 },
  title:       { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  sub:         { color: "var(--text-faint)", fontSize: 14, marginBottom: 24 },
  createRow:   { display: "flex", gap: 10, marginBottom: 32 },
  msg:         { color: "var(--text-soft)", padding: "40px 0" },
  sectionHead: { color: "var(--text-faint)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  arcCard:     { background: "var(--bg-card)", backgroundImage: "var(--hatch-dark)", border: "2px solid var(--ink-000)", boxShadow: "3px 3px 0 var(--ink-000)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 10 },
  arcLink:     { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  arcTop:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  arcName:     { color: "var(--text)", fontWeight: 700, fontSize: 18, lineHeight: 1.1, fontFamily: "var(--font-display)", letterSpacing: "0.02em", textTransform: "uppercase" },
  systemTag:   { background: "var(--hero-gold)", color: "var(--ink-000)", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, letterSpacing: 0.5, flexShrink: 0, fontFamily: "var(--font-burst)", transform: "rotate(-5deg)", border: "1px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)" },
  arcDesc:     { color: "var(--text-faint)", fontSize: 12, lineHeight: 1.5, flex: 1 },
  arcBottom:   { display: "flex", alignItems: "center", gap: 10, marginTop: 4 },
  progressBar: { flex: 1, height: 10, background: "var(--border)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--ink-000)" },
  progressFill:{ height: "100%", background: "var(--hero-cyan)", backgroundImage: "var(--halftone-dots)", backgroundSize: "var(--halftone-size)", borderRadius: 999 },
  arcMeta:     { color: "var(--hero-gold)", fontSize: 16, flexShrink: 0, fontFamily: "var(--font-burst)", letterSpacing: "0.05em" },
  deleteBtn:   { alignSelf: "flex-start", color: "var(--text-faint)", border: "1.5px solid var(--ink-000)", borderRadius: 8, padding: "5px 10px 3px", background: "var(--bg-surface)", fontFamily: "var(--font-burst)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11, boxShadow: "2px 2px 0 var(--ink-000)" },
};
