"use client";
import { supabase } from "../../../lib/supabase-browser";
import { useRouter } from "next/navigation";
import { C } from "../../../lib/theme";

export default function SettingsClient({ user, googleConnected, flashMessage }) {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Settings</h1>

      {flashMessage && (
        <div style={{ ...s.flash, ...(flashMessage.includes("!") ? s.flashSuccess : s.flashWarn) }}>
          {flashMessage}
        </div>
      )}

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
  page:        { maxWidth: 560 },
  title:       { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28 },
  flash:       { borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 14, fontWeight: 600 },
  flashSuccess:{ background: "rgba(6,214,160,0.12)", color: "var(--hero-cyan)", border: "1px solid var(--hero-cyan)" },
  flashWarn:   { background: "rgba(239,43,61,0.1)", color: "var(--accent)", border: "1px solid var(--accent)" },
  section:     { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, marginBottom: 16 },
  sectionTitle:{ fontSize: 16, fontWeight: 700, marginBottom: 10 },
  detail:      { color: "var(--text-soft)", fontSize: 14, marginBottom: 12, lineHeight: 1.6 },
  primaryBtn:  { display: "inline-block", background: "var(--accent)", color: "#fff", padding: "11px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14 },
  ghostBtn:    { background: "none", border: "1px solid var(--border)", color: "var(--text-soft)", padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14 },
  connected:   { color: "var(--hero-cyan)", fontWeight: 600, fontSize: 14 },
};
