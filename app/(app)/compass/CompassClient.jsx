"use client";
import { useState, useRef, useEffect } from "react";
import { C } from "../../../lib/theme";
import { supabase } from "../../../lib/supabase-browser";

const MODES = [
  { id: "catchup",     label: "Catch Me Up",   desc: "Recap story so far — no spoilers beyond what you've read" },
  { id: "keyissue",    label: "Key Issues",     desc: "Find historically significant issues in your collection" },
  { id: "connections", label: "How It Connects", desc: "Map crossovers, shared characters, and reading order" },
];

const STARTERS = {
  catchup:     ["What happened in the last arc of X-Men I read?", "Recap Daredevil for me — I just finished Born Again.", "Where did I leave off in Hickman's Avengers?"],
  keyissue:    ["Which issues in my collection are key issues?", "Do I own any first appearances?", "What are the most valuable comics in my library?"],
  connections: ["How does House of M connect to what I've read?", "What should I read after Secret Invasion?", "Which series in my library share characters?"],
};

export default function CompassClient() {
  const [mode, setMode]       = useState("connections");
  const [history, setHistory] = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [hasComics, setHasComics] = useState(null);
  const bottomRef             = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  useEffect(() => {
    supabase
      .from("reading_log")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setHasComics((count ?? 0) > 0));
  }, []);

  async function send(text) {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { role: "user", content: msg };
    setHistory((h) => [...h, userMsg, { role: "assistant", content: "" }]);

    const res = await fetch("/api/compass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, message: msg, history }),
    });

    if (!res.ok || !res.body) {
      setHistory((h) => [...h.slice(0, -1), { role: "assistant", content: "Something went wrong. Try again." }]);
      setLoading(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      setHistory((h) => [...h.slice(0, -1), { role: "assistant", content: full }]);
    }

    setLoading(false);
    inputRef.current?.focus();
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function switchMode(id) {
    setMode(id);
    setHistory([]);
  }

  return (
    <div style={s.page}>
      <h1 style={s.title}>Continuity Compass</h1>
      <p style={s.sub}>Your spoiler-safe AI reading companion. It knows exactly what you've read.</p>

      {/* Mode selector */}
      <div style={s.modeRow}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => switchMode(m.id)} style={{ ...s.modeBtn, ...(mode === m.id ? s.modeBtnActive : {}) }}>
            <span style={s.modeLabel}>{m.label}</span>
            <span style={s.modeDesc}>{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div style={s.chatBox}>
        {history.length === 0 && hasComics === false && (
          <div style={s.empty}>
            <p style={s.emptyHead}>No reads logged yet</p>
            <p style={s.emptySub}>Log some comics first — Compass learns from your reading history and can only give spoiler-safe answers once it knows what you've read.</p>
            <a href="/library" style={s.onboardingBtn}>Go add comics →</a>
          </div>
        )}

        {history.length === 0 && hasComics === true && (
          <div style={s.empty}>
            <p style={s.emptyHead}>Ask anything about your collection</p>
            <div style={s.starters}>
              {STARTERS[mode].map((q) => (
                <button key={q} style={s.starterBtn} onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} style={{ ...s.bubble, ...(msg.role === "user" ? s.bubbleUser : s.bubbleAI) }}>
            {msg.role === "assistant" && <span style={s.aiTag}>Compass</span>}
            <p style={s.bubbleText}>{msg.content || (loading && i === history.length - 1 ? <span style={s.cursor}>▌</span> : "")}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your comics…"
          rows={1}
          style={s.textarea}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading} style={{ ...s.sendBtn, ...((!input.trim() || loading) ? s.sendBtnDisabled : {}) }}>
          {loading ? "…" : "Send"}
        </button>
      </div>
      <p style={s.hint}>Enter to send · Shift+Enter for new line · Compass never spoils unread issues</p>
    </div>
  );
}

const s = {
  page:          { maxWidth: 760, display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" },
  title:         { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  sub:           { color: "var(--text-faint)", fontSize: 14, marginBottom: 20 },

  modeRow:       { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  modeBtn:       { flex: 1, minWidth: 180, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 },
  modeBtnActive: { borderColor: "var(--accent)", background: "#1c1018" },
  modeLabel:     { color: "var(--text)", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-body)" },
  modeDesc:      { color: "var(--text-faint)", fontSize: 11, lineHeight: 1.4 },

  chatBox:       { flex: 1, overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16, marginBottom: 12 },

  empty:         { margin: "auto", textAlign: "center", maxWidth: 420 },
  emptyHead:     { color: "var(--text-soft)", fontSize: 15, marginBottom: 12 },
  emptySub:      { color: "var(--text-faint)", fontSize: 13, lineHeight: 1.6, marginBottom: 20 },
  onboardingBtn: { display: "inline-block", background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 20px", borderRadius: 10, cursor: "pointer" },
  starters:      { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  starterBtn:    { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 18px", color: "var(--text-soft)", fontSize: 13, cursor: "pointer", maxWidth: 400, width: "100%", textAlign: "left" },

  bubble:        { display: "flex", flexDirection: "column", gap: 6, maxWidth: "85%" },
  bubbleUser:    { alignSelf: "flex-end", background: "var(--accent)", border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", borderRadius: "14px 14px 4px 14px", padding: "12px 16px" },
  bubbleAI:      { alignSelf: "flex-start", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "14px 14px 14px 4px", padding: "12px 16px" },
  aiTag:         {
    alignSelf: "flex-start",
    fontFamily: "var(--font-burst)", fontSize: 12, letterSpacing: "0.1em",
    color: "var(--ink-000)", background: "var(--hero-gold)",
    padding: "1px 8px", border: "1.5px solid var(--ink-000)",
    boxShadow: "1px 1px 0 var(--ink-000)",
    transform: "rotate(-4deg)", display: "inline-block",
    textTransform: "uppercase",
  },
  bubbleText:    { color: "var(--text)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 },
  cursor:        { color: "var(--hero-red)", animation: "blink 1s step-end infinite" },

  inputRow:      { display: "flex", gap: 10, alignItems: "flex-end" },
  textarea:      { flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 14, padding: "12px 16px", resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" },
  sendBtn:       { background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 22px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap" },
  sendBtnDisabled: { opacity: 0.4, cursor: "default" },
  hint:          { color: "var(--text-faint)", fontSize: 11, textAlign: "center", marginTop: 6 },
};
