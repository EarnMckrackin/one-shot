"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
import { C } from "../../lib/theme";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = isSignup
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/api/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/library");
    router.refresh();
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.logo}>One<span style={{ color: C.accent }}>Shot</span></h1>
        <p style={s.tagline}>Your complete comic collection.</p>

        <form onSubmit={handleSubmit} style={s.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {error && <p style={s.error}>{error}</p>}
          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? "…" : isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button onClick={() => setIsSignup(!isSignup)} style={s.toggle}>
          {isSignup ? "Already have an account? Sign in" : "New here? Create account"}
        </button>
      </div>
    </div>
  );
}

const s = {
  page:    { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: C.bg },
  card:    { width: "100%", maxWidth: 400, background: C.surface, borderRadius: 16, padding: 40, border: `1px solid ${C.border}` },
  logo:    { fontSize: 48, fontFamily: "Georgia, serif", fontWeight: 700, letterSpacing: -1, marginBottom: 8 },
  tagline: { color: C.textSoft, marginBottom: 32 },
  form:    { display: "flex", flexDirection: "column", gap: 12 },
  error:   { color: C.accent, fontSize: 14 },
  btn:     { background: C.accent, color: "#fff", padding: "13px 24px", borderRadius: 10, fontWeight: 700, fontSize: 15, marginTop: 4, cursor: "pointer" },
  toggle:  { display: "block", color: C.textSoft, fontSize: 14, marginTop: 16, textAlign: "center", cursor: "pointer", background: "none", border: "none", width: "100%" },
};
