"use client";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase-browser";
import InkButton from "../../../components/InkButton";
import { useComics } from "../../../hooks/useComics";

const MODES = [
  { id: "catchup",   label: "Catch Up",    desc: "Start from your recent reading logs" },
  { id: "nextreads", label: "Next Reads",   desc: "Pick unread issues with collection context" },
  { id: "fixgaps",   label: "Fix Gaps",     desc: "Prioritize missing issues and repairs" },
  { id: "keyissue",  label: "Key Issues",   desc: "Summarize collection signals already available" },
];

export default function CompassClient() {
  const searchParams = useSearchParams();
  const { comics } = useComics();
  const initialMode = searchParams.get("mode");
  const [mode, setMode]       = useState(MODES.some((m) => m.id === initialMode) ? initialMode : "catchup");
  const [history, setHistory] = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [hasComics, setHasComics] = useState(null);
  const chatBoxRef            = useRef(null);
  const inputRef              = useRef(null);
  const collectionContext     = buildCollectionContext(comics);
  const starters              = buildStarters(mode, collectionContext);
  const hasCollectionSignals  = comics.length > 0 || hasComics === true;

  useEffect(() => {
    if (!chatBoxRef.current) return;
    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
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
      body: JSON.stringify({ mode, message: msg, history, collectionContext }),
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
      <h1 style={s.title}>Resurface your next read</h1>
      <p style={s.sub}>
        Compass with an agenda: unread issues, logged reads, pull-list context, and collection gaps in one guided flow.
      </p>

      <div style={s.contextStrip}>
        <span style={s.contextPill}>{collectionContext.unreadCount} unread</span>
        <span style={s.contextPill}>{collectionContext.pdfReadyCount} PDF-ready</span>
        <span style={s.contextPill}>{collectionContext.gapCount} gaps</span>
        <span style={s.contextPill}>{collectionContext.repairCount} repairs</span>
      </div>

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
      <div style={s.chatBox} ref={chatBoxRef}>
        {history.length === 0 && !hasCollectionSignals && (
          <div style={s.empty}>
            <p style={s.emptyHead}>No reads logged yet</p>
            <p style={s.emptySub}>Resurface can still use unread issues and gaps, but catch-up gets better after you log a few reads.</p>
            <InkButton href="/library" size="lg">Open library</InkButton>
          </div>
        )}

        {history.length === 0 && hasCollectionSignals && (
          <div style={s.empty}>
            <p style={s.emptyHead}>Start from a real collection signal</p>
            <div style={s.starters}>
              {starters.map((q) => (
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
      </div>

      {/* Input */}
      <div style={s.inputRow}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Resurface what to do next..."
          rows={1}
          style={s.textarea}
          className="ink-input"
        />
        <InkButton onClick={() => send()} disabled={!input.trim() || loading} size="lg">
          {loading ? "…" : "Send"}
        </InkButton>
      </div>
      <p style={s.hint}>Enter to send · Shift+Enter for new line · Resurface uses saved library and reading-log signals</p>
    </div>
  );
}

function buildCollectionContext(comics) {
  const unread = comics.filter((comic) => (comic.read_count ?? 0) === 0);
  const pdfReady = unread.filter((comic) => comic.has_pdf);
  const repair = comics.filter((comic) =>
    !comic.cover_url
    || !comic.series?.name
    || !(comic.publisher?.name || comic.series?.publisher?.name)
    || (comic.has_pdf && !comic.drive_file_id)
  );
  const gaps = findSeriesGaps(comics);

  return {
    unreadCount: unread.length,
    pdfReadyCount: pdfReady.length,
    repairCount: repair.length,
    gapCount: gaps.reduce((sum, row) => sum + row.gaps.length, 0),
    topUnread: unread.slice(0, 5).map(compactComic),
    topPdfReady: pdfReady.slice(0, 5).map(compactComic),
    topRepairs: repair.slice(0, 5).map(compactComic),
    topGaps: gaps.slice(0, 5).map((row) => ({ series: row.name, gaps: row.gaps.slice(0, 12) })),
  };
}

function buildStarters(mode, context) {
  const topUnread = context.topUnread[0];
  const topGap = context.topGaps[0];

  if (mode === "catchup") {
    return [
      topUnread ? `Catch me up before I read ${topUnread.label}.` : "Catch me up from my latest logged reads.",
      "Where did I leave off?",
      "Give me a spoiler-safe agenda for tonight.",
    ];
  }

  if (mode === "nextreads") {
    return [
      "Pick my next 3 reads from unread issues.",
      context.topPdfReady[0] ? "Prioritize unread PDF-ready issues." : "Find the cleanest next read from my shelf.",
      "What should I read if I only have 30 minutes?",
    ];
  }

  if (mode === "fixgaps") {
    return [
      topGap ? `Which ${topGap.series} gaps should I fix first?` : "Which collection repairs should I do first?",
      "Show missing issues that block reading order.",
      "Find metadata or PDF repairs worth doing now.",
    ];
  }

  return [
    "Which issues in my collection look most important?",
    "Which series have the strongest reading history?",
    "What collection signals can you summarize without outside lookup?",
  ];
}

function compactComic(comic) {
  return {
    id: comic.id,
    label: `${comic.series?.name ?? comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`,
    series: comic.series?.name ?? comic.title,
    issue: comic.issue_number,
    hasPdf: Boolean(comic.has_pdf),
  };
}

function findSeriesGaps(comics) {
  const bySeries = new Map();
  for (const comic of comics) {
    if (!comic.series?.id || !comic.series?.name) continue;
    if (!bySeries.has(comic.series.id)) bySeries.set(comic.series.id, { name: comic.series.name, issues: [] });
    bySeries.get(comic.series.id).issues.push(comic);
  }

  return [...bySeries.values()]
    .map((row) => ({ ...row, gaps: findGaps(row.issues) }))
    .filter((row) => row.gaps.length > 0)
    .sort((a, b) => b.gaps.length - a.gaps.length);
}

function findGaps(issues) {
  const nums = issues
    .map((comic) => parseFloat(comic.issue_number))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < nums.length - 1; i++) {
    for (let missing = nums[i] + 1; missing < nums[i + 1]; missing++) gaps.push(missing);
  }
  return gaps;
}

const s = {
  page:          { maxWidth: "var(--content-max-md)", display: "flex", flexDirection: "column", height: "calc(100dvh - clamp(88px, 12vh, 124px))" },
  title:         { fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  sub:           { color: "var(--text-faint)", fontSize: 14, marginBottom: 20 },
  contextStrip:  { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  contextPill:   { color: "var(--ink-000)", background: "var(--hero-gold)", border: "1.5px solid var(--ink-000)", borderRadius: 999, padding: "4px 10px 3px", boxShadow: "1px 1px 0 var(--ink-000)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 },

  modeRow:       { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  modeBtn:       { flex: 1, minWidth: 180, background: "var(--bg-card)", border: "2px solid var(--ink-000)", boxShadow: "2px 2px 0 var(--ink-000)", borderRadius: 12, padding: "12px 16px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 },
  modeBtnActive: { borderColor: "var(--ink-000)", background: "var(--accent)", backgroundImage: "var(--hatch-dark)", transform: "rotate(-1deg)" },
  modeLabel:     { color: "var(--text)", fontWeight: 700, fontSize: 13, fontFamily: "var(--font-body)" },
  modeDesc:      { color: "var(--text-faint)", fontSize: 11, lineHeight: 1.4 },

  chatBox:       { flex: 1, overflowY: "auto", background: "var(--bg-surface)", border: "2px solid var(--ink-000)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16, marginBottom: 12, boxShadow: "4px 4px 0 var(--ink-000)" },

  empty:         { margin: "auto", textAlign: "center", maxWidth: "min(620px, 100%)" },
  emptyHead:     { color: "var(--text-soft)", fontSize: 24, marginBottom: 12, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.04em" },
  emptySub:      { color: "var(--text-faint)", fontSize: 13, lineHeight: 1.6, marginBottom: 20 },
  starters:      { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" },
  starterBtn:    { background: "var(--bg-card)", border: "1.5px solid var(--ink-000)", borderRadius: 10, padding: "10px 18px", color: "var(--text-soft)", fontSize: 13, cursor: "pointer", maxWidth: "min(560px, 100%)", width: "100%", textAlign: "left", boxShadow: "2px 2px 0 var(--ink-000)" },

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
  textarea:      { flex: 1, resize: "none", lineHeight: 1.5, fontFamily: "inherit" },
  hint:          { color: "var(--text-faint)", fontSize: 11, textAlign: "center", marginTop: 6 },
};
