"use client";
import { useState } from "react";
import { supabase } from "../../../lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function SettingsClient({ user, googleConnected, minutesPerDay: initialMinutes, flashMessage }) {
  const router = useRouter();
  const [minutes, setMinutes]   = useState(initialMinutes);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function saveReading() {
    setSaving(true);
    await supabase.from("user_preferences").upsert(
      { user_id: user.id, minutes_per_day: minutes, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const issuesPerDay = Math.max(1, Math.floor(minutes / 15));

  return (
    <div style={s.page}>
      <h1 style={s.title}>Settings</h1>

      {flashMessage && (
        <div style={{ ...s.flash, ...(flashMessage.includes("!") ? s.flashSuccess : s.flashWarn) }}>
          {flashMessage}
        </div>
      )}

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Reading</h2>
        <p style={s.detail}>Set your daily reading budget. The AI scheduler uses this to plan your week.</p>
        <div style={s.sliderRow}>
          <input
            type="range"
            min={15} max={180} step={15}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            style={s.slider}
          />
          <span style={s.sliderVal}>{minutes} min/day</span>
        </div>
        <p style={s.hint}>~{issuesPerDay} issue{issuesPerDay !== 1 ? "s" : ""} per day at 15 min each</p>
        <button style={s.primaryBtn} onClick={saveReading} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Account</h2>
        <p style={s.detail}>{user.email}</p>
        <button style={s.ghostBtn} onClick={signOut}>Sign Out</button>
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Google Drive</h2>
        <p style={s.detail}>
          {googleConnected
            ? "Connected — PDFs are stored in your Google Drive under the One Shot folder."
            : "Connect Google Drive to store and access your comic PDFs from your own account."}
        </p>
        {googleConnected
          ? <span style={s.connected}>● Connected</span>
          : <a href="/api/google/auth" style={s.primaryBtn}>Connect Google Drive</a>
        }
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>About</h2>
        <p style={s.detail}>One Shot — your comic collection, pull list, and reading schedule.</p>
        <p style={s.detail}>Cover scanning powered by Claude AI · Metadata from ComicVine · New releases from League of Comic Geeks</p>
      </section>
    </div>
  );
}

const s = {
  page:         { maxWidth: 560 },
  title:        { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28 },
  flash:        { borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 14, fontWeight: 600 },
  flashSuccess: { background: "rgba(6,214,160,0.12)", color: "var(--hero-cyan)", border: "1px solid var(--hero-cyan)" },
  flashWarn:    { background: "rgba(239,43,61,0.1)", color: "var(--accent)", border: "1px solid var(--accent)" },
  section:      { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 700, marginBottom: 10 },
  detail:       { color: "var(--text-soft)", fontSize: 14, marginBottom: 12, lineHeight: 1.6 },
  sliderRow:    { display: "flex", alignItems: "center", gap: 16, marginBottom: 8 },
  slider:       { flex: 1, accentColor: "var(--accent)", cursor: "pointer" },
  sliderVal:    { fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)", minWidth: 88, textAlign: "right" },
  hint:         { color: "var(--text-faint)", fontSize: 12, marginBottom: 16 },
  primaryBtn:   { display: "inline-block", background: "var(--accent)", color: "#fff", padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", border: "none" },
  ghostBtn:     { background: "none", border: "1px solid var(--border)", color: "var(--text-soft)", padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14 },
  connected:    { color: "var(--hero-cyan)", fontWeight: 600, fontSize: 14 },
};
