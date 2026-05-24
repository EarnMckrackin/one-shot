"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [status, setStatus]     = useState("Ready");
  const [focused, setFocused]   = useState(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const message = searchParams.get("message");
    if (!message) return;

    setStatus("Sign in link failed");
    setError(message);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    const mode = e.nativeEvent.submitter?.value || (isSignup ? "signup" : "signin");
    const trimmedEmail = email.trim();
    setLoading(true);
    setError(null);
    setStatus("Submitting credentials...");

    try {
      if (!trimmedEmail) {
        setStatus("Email required");
        setError("Enter your email address first.");
        return;
      }

      if (mode !== "magic" && !password) {
        setStatus("Password required");
        setError("Enter your password first.");
        return;
      }

      setStatus("Contacting Supabase...");
      const redirectTo = `${location.origin}/api/auth/confirm?next=/home`;
      const authRequest = mode === "signup"
        ? supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: { emailRedirectTo: redirectTo },
          })
        : mode === "magic"
          ? supabase.auth.signInWithOtp({
              email: trimmedEmail,
              options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
            })
          : supabase.auth.signInWithPassword({ email: trimmedEmail, password });

      const { error } = await withTimeout(authRequest, 15000);

      if (error) {
        setStatus("Sign in failed");
        setError(error.message);
        return;
      }

      if (mode === "signup") {
        setStatus("Check your email to confirm your account, then sign in.");
        setPassword("");
        setIsSignup(false);
        return;
      }

      if (mode === "magic") {
        setStatus("Magic link sent. Check your email to finish signing in.");
        return;
      }

      setStatus("Signed in. Opening home...");
      window.location.assign("/home");
    } catch (err) {
      setStatus("Sign in failed");
      setError(err?.message || "Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const inkInput = (isFocused) => ({
    fontFamily: "var(--font-body)", fontSize: 14,
    background: "var(--bg-card)", color: "var(--text)",
    border: `2px solid ${isFocused ? "var(--accent)" : "var(--ink-000)"}`,
    borderRadius: 8, padding: "9px 12px", outline: "none", width: "100%",
    boxShadow: `2px 2px 0 ${isFocused ? "var(--accent)" : "var(--ink-000)"}`,
    transition: "border-color 120ms, box-shadow 120ms",
  });

  return (
    <div style={s.page}>
      <div style={{ position: "relative", padding: "22px 40px 22px 18px" }}>
        <span style={s.stamp}>ISSUE Nº 1</span>

        <div style={s.card}>
          <div style={s.title}>
            ONE
            <span style={s.titleShot}>SHOT!</span>
          </div>

          <div style={s.rule} />
          <p style={s.tagline}>YOUR COMPLETE COMIC COLLECTION.</p>

          <form action="/api/auth/password" method="post" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ ...s.tag, color: "var(--ink-000)", background: "var(--hero-gold)" }}>EMAIL</span>
              <input
                type="email"
                placeholder="reader@example.com"
                value={email}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inkInput(focused === "email")}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ ...s.tag, color: "#fff", background: "var(--hero-red)" }}>PASSWORD</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignup ? "new-password" : "current-password"}
                style={inkInput(focused === "password")}
              />
            </div>
            {error && <p style={s.error}>{error}</p>}
            <p style={s.status}>{status}</p>
            <button type="submit" name="mode" value="signin" style={s.btn} disabled={loading}>
              {loading ? "…" : "SIGN IN!"}
            </button>
            <button type="submit" name="mode" value="magic" style={s.magicBtn} disabled={loading} formNoValidate>
              SEND MAGIC LINK
            </button>
            <button type="submit" name="mode" value="signup" style={s.secondaryBtn} disabled={loading}>
              CREATE ACCOUNT!
            </button>
          </form>

          <button onClick={() => setIsSignup(!isSignup)} style={s.toggleWrap}>
            <span style={s.toggleEyebrow}>{isSignup ? "ALREADY A READER?" : "NEW HERE?"}</span>
            <span style={{ fontSize: 12, marginLeft: 8 }}>
              {isSignup ? "Sign in instead" : "Create an account"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Sign in timed out. Check that your iPhone has internet access and try again.")), ms);
    }),
  ]);
}

const s = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    padding: 40, background: "var(--bg)",
    backgroundImage: "var(--halftone-dots)", backgroundSize: "var(--halftone-size)",
  },
  stamp: {
    position: "absolute", top: 4, right: 4, zIndex: 2,
    fontFamily: "var(--font-burst)", fontSize: 18, letterSpacing: "0.12em",
    color: "var(--ink-000)", background: "var(--hero-gold)",
    padding: "5px 14px 3px",
    border: "2.5px solid var(--ink-000)",
    boxShadow: "3px 3px 0 var(--ink-000)",
    transform: "rotate(6deg)",
    whiteSpace: "nowrap",
  },
  card: {
    width: 420, maxWidth: "calc(100vw - 80px)",
    background: "var(--bg-surface)",
    backgroundImage: "repeating-linear-gradient(135deg, transparent 0 10px, rgba(255,255,255,0.025) 10px 11px)",
    border: "2.5px solid var(--ink-000)",
    boxShadow: "5px 5px 0 var(--ink-000)",
    borderRadius: 8, padding: "30px 30px 24px",
  },
  title: {
    fontFamily: "var(--font-display)", fontSize: 80, lineHeight: 0.82,
    letterSpacing: "-0.04em", textTransform: "uppercase",
    color: "var(--text)", textShadow: "4px 4px 0 var(--ink-000)",
  },
  titleShot: {
    color: "var(--accent)", display: "block",
    transform: "translateX(24px)",
  },
  rule:    { height: 4, background: "var(--ink-000)", margin: "14px 0 8px" },
  tagline: {
    fontFamily: "var(--font-burst)", fontSize: 12, letterSpacing: "0.2em",
    color: "var(--hero-gold)", marginBottom: 22,
  },
  tag: {
    alignSelf: "flex-start",
    fontFamily: "var(--font-burst)", fontSize: 11, letterSpacing: "0.1em",
    textTransform: "uppercase",
    padding: "2px 10px 1px",
    border: "1.5px solid var(--ink-000)", borderBottom: "none",
    borderRadius: "4px 4px 0 0",
    marginLeft: 12, position: "relative", zIndex: 1,
  },
  error: { color: "var(--accent)", fontSize: 13 },
  status: { color: "var(--text-soft)", fontSize: 12, margin: 0 },
  btn: {
    marginTop: 10, padding: "11px 20px 9px", width: "100%",
    background: "var(--accent)", color: "#fff",
    fontFamily: "var(--font-burst)", fontSize: 20, letterSpacing: "0.14em",
    border: "2.5px solid var(--ink-000)", borderRadius: 8,
    boxShadow: "4px 4px 0 var(--ink-000)", cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 18px 8px", width: "100%",
    background: "var(--hero-gold)", color: "var(--ink-000)",
    fontFamily: "var(--font-burst)", fontSize: 15, letterSpacing: "0.12em",
    border: "2.5px solid var(--ink-000)", borderRadius: 8,
    boxShadow: "3px 3px 0 var(--ink-000)", cursor: "pointer",
  },
  magicBtn: {
    padding: "10px 18px 8px", width: "100%",
    background: "var(--hero-cyan)", color: "var(--ink-000)",
    fontFamily: "var(--font-burst)", fontSize: 15, letterSpacing: "0.12em",
    border: "2.5px solid var(--ink-000)", borderRadius: 8,
    boxShadow: "3px 3px 0 var(--ink-000)", cursor: "pointer",
  },
  toggleWrap: {
    display: "block", color: "var(--text-soft)",
    marginTop: 18, textAlign: "center", background: "none", border: "none",
    width: "100%", cursor: "pointer", fontFamily: "var(--font-body)",
    borderTop: "1.5px solid var(--ink-000)", paddingTop: 12,
  },
  toggleEyebrow: {
    fontFamily: "var(--font-burst)", fontSize: 11, letterSpacing: "0.14em",
    color: "var(--hero-cyan)",
  },
};
