"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import { C } from "../../../lib/theme";

export default function ArcsClient() {
  const [arcs, setArcs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data } = await supabase
      .from("story_arcs")
      .select("*, arc_issues(id, order_index, series_name, issue_number, comic_id)")
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

  const systemArcs = arcs.filter((a) => a.is_system);
  const myArcs     = arcs.filter((a) => !a.is_system);

  return (
    <div style={s.page}>
      <h1 style={s.title}>Reading Order</h1>
      <p style={s.sub}>Follow story arcs and crossovers in the correct reading order</p>

      <form onSubmit={createArc} style={s.createRow}>
        <input
          placeholder="Create a new reading order (e.g. Hickman's Avengers saga)…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" style={s.createBtn} disabled={creating}>
          {creating ? "…" : "Create"}
        </button>
      </form>

      {loading && <p style={s.msg}>Loading…</p>}

      {myArcs.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={s.sectionHead}>My Reading Orders</h2>
          <ArcGrid arcs={myArcs} />
        </section>
      )}

      <section>
        <h2 style={s.sectionHead}>Classic Story Arcs</h2>
        <ArcGrid arcs={systemArcs} />
      </section>
    </div>
  );
}

function ArcGrid({ arcs }) {
  return (
    <div style={s.grid}>
      {arcs.map((arc) => {
        const total   = arc.arc_issues?.length ?? 0;
        const owned   = arc.arc_issues?.filter((i) => i.comic_id).length ?? 0;
        const pct     = total ? Math.round((owned / total) * 100) : 0;

        return (
          <Link key={arc.id} href={`/arcs/${arc.id}`} style={s.arcCard}>
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
  createBtn:   { background: "var(--accent)", color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  msg:         { color: "var(--text-soft)", padding: "40px 0" },
  sectionHead: { color: "var(--text-faint)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  arcCard:     { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", gap: 8 },
  arcTop:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  arcName:     { color: "var(--text)", fontWeight: 700, fontSize: 15, lineHeight: 1.3 },
  systemTag:   { background: "var(--bg-surface)", color: "var(--hero-gold)", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, letterSpacing: 0.5, flexShrink: 0 },
  arcDesc:     { color: "var(--text-faint)", fontSize: 12, lineHeight: 1.5, flex: 1 },
  arcBottom:   { display: "flex", alignItems: "center", gap: 10, marginTop: 4 },
  progressBar: { flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" },
  progressFill:{ height: "100%", background: "var(--hero-cyan)", borderRadius: 2 },
  arcMeta:     { color: "var(--text-faint)", fontSize: 11, flexShrink: 0 },
};
