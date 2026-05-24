"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase-browser";
import { useComics } from "../../../hooks/useComics";
import ComicCover from "../../../components/ComicCover";
import InkButton from "../../../components/InkButton";

export default function HomeClient() {
  const { comics, loading, connectionState, lastSynced, refresh } = useComics();
  const [pullCount, setPullCount] = useState(null);
  const [spotlightFact, setSpotlightFact] = useState(COMIC_FACTS[0]);

  useEffect(() => {
    supabase
      .from("pull_list")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .then(({ count }) => setPullCount(count ?? 0))
      .catch(() => setPullCount(null));
  }, []);

  useEffect(() => {
    setSpotlightFact(COMIC_FACTS[Math.floor(Math.random() * COMIC_FACTS.length)]);
  }, []);

  const summary = useMemo(() => buildSummary(comics), [comics]);
  const next = summary.nextAction;

  return (
    <div style={s.page}>
      <style>{`
        @media (max-width: 760px) {
          .home-hero,
          .home-main,
          .home-flows,
          .home-next {
            grid-template-columns: 1fr !important;
          }
          .home-actions {
            justify-content: flex-start !important;
          }
          .home-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 430px) {
          .home-metrics,
          .home-flow-actions {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <section style={s.hero} className="home-hero">
        <div>
          <h1 style={s.title}>Welcome to OneShot!</h1>
          <div style={s.factBox}>
            <p style={s.kicker}>{spotlightFact.label}</p>
            <p style={s.sub}>{spotlightFact.detail}</p>
          </div>
        </div>
        <div style={s.heroActions} className="home-actions">
          <InkButton href="/scan" size="lg">Quick add</InkButton>
          <InkButton href="/resurface" variant="cyan" size="lg">Resurface me</InkButton>
          <InkButton href="/releases?week=next" variant="gold" size="lg">Coming soon</InkButton>
        </div>
      </section>

      <section style={s.metrics} className="home-metrics" aria-label="Library summary">
        <Metric label="Unread" value={summary.unread.length} note="issues waiting" tone="red" />
        <Metric label="Pull list" value={pullCount === null ? "-" : pullCount} note="active series" tone="gold" />
        <Metric label="Gaps" value={summary.gapCount} note={`${summary.gapSeriesCount} series`} tone="cyan" />
        <Metric label="Sync" value={formatSync(lastSynced)} note={connectionState === "offline" ? "offline cache" : "local cache"} />
      </section>

      <section style={s.mainGrid} className="home-main">
        <div style={s.nextCard}>
          <div style={s.panelHead}>
            <p style={s.panelKicker}>Top next action</p>
            <button onClick={refresh} style={s.refreshBtn} disabled={loading}>
              {loading ? "Syncing" : "Refresh"}
            </button>
          </div>

          {next?.comic ? (
            <div style={s.nextBody} className="home-next">
              <div style={s.coverCell}>
                <ComicCover src={next.comic.cover_url} alt={next.comic.title} />
              </div>
              <div style={s.nextCopy}>
                <p style={s.reason}>{next.reason}</p>
                <h2 style={s.nextTitle}>{displayComic(next.comic)}</h2>
                <p style={s.nextMeta}>{[next.comic.series?.name, next.comic.publisher?.name ?? next.comic.series?.publisher?.name, formatMonth(next.comic.release_date)].filter(Boolean).join(" / ")}</p>
                <div style={s.nextActions}>
                  <InkButton href={`/comic/${next.comic.id}`} size="md">Open issue</InkButton>
                  {next.comic.has_pdf && <InkButton href={`/comic/${next.comic.id}/read`} variant="gold" size="md">Read PDF</InkButton>}
                </div>
              </div>
            </div>
          ) : (
            <div style={s.emptyNext}>
              <h2 style={s.nextTitle}>{comics.length ? "Your shelf is caught up" : "Add your first comic"}</h2>
              <p style={s.nextMeta}>
                {comics.length ? "No unread issues are available in the local library cache." : "Build the shelf first, then Home can surface unread, pull-list, and gap work."}
              </p>
              <InkButton href="/scan" size="md">Add issue</InkButton>
            </div>
          )}
        </div>

        <div style={s.queue}>
          <p style={s.panelKicker}>Today queue</p>
          <QueueRow
            href={summary.firstUnread ? `/comic/${summary.firstUnread.id}` : "/library?view=Unread"}
            label={summary.firstUnread ? displayComic(summary.firstUnread) : "Unread shelf"}
            meta={summary.firstUnread ? "Continue from the unread stack" : `${summary.unread.length} unread issues`}
          />
          <QueueRow
            href="/pull-list"
            label="Check pull-list activity"
            meta={pullCount === null ? "Pull-list count unavailable" : `${pullCount} active series`}
          />
          <QueueRow
            href="/gaps"
            label={summary.topGap ? `Fix ${summary.topGap.name}` : "Review continuity gaps"}
            meta={summary.topGap ? `${summary.topGap.gaps.length} missing issues` : `${summary.gapCount} total missing issues`}
          />
        </div>
      </section>

      <section style={s.flowGrid} className="home-flows">
        <FlowPanel
          title="Manage Your Library"
          text="Use this when you already know the job."
          actions={[
            ["Add issue", "/scan"],
            ["Repair metadata", summary.needsRepair[0] ? `/scan?replace=${summary.needsRepair[0].id}` : "/library?view=Needs%20repair"],
            ["Attach PDF", "/scan?mode=Upload%20PDF"],
            ["Mark read", summary.firstUnread ? `/comic/${summary.firstUnread.id}` : "/library?view=Unread"],
          ]}
        />
        <FlowPanel
          title="What's Next?"
          text="Use this when you need context before acting."
          actions={[
            ["Catch up", "/resurface?mode=catchup"],
            ["Next reads", "/resurface?mode=nextreads"],
            ["Fix gaps", "/resurface?mode=fixgaps"],
            ["Reading order", "/arcs"],
          ]}
          accent="cyan"
        />
      </section>
    </div>
  );
}

const COMIC_FACTS = [
  {
    label: "Comic book fact",
    detail: "Superman first appeared in Action Comics #1 in 1938, helping define the modern superhero format.",
  },
  {
    label: "Character detail",
    detail: "Batman debuted in Detective Comics #27 in 1939, originally styled as a pulp-inspired mystery vigilante.",
  },
  {
    label: "Comic book fact",
    detail: "Marvel's Fantastic Four #1 launched in 1961 and helped establish a more character-driven superhero era.",
  },
  {
    label: "Character detail",
    detail: "Storm was one of the first major Black women superheroes in mainstream comics when she joined the X-Men in 1975.",
  },
  {
    label: "Comic book fact",
    detail: "The direct market changed comics retail by shifting many sales from newsstands to dedicated comic shops.",
  },
  {
    label: "Character detail",
    detail: "Miles Morales first appeared in Ultimate Fallout #4 in 2011 before becoming one of Marvel's key Spider-heroes.",
  },
  {
    label: "Comic book fact",
    detail: "The Comics Code Authority shaped mainstream U.S. comic publishing for decades after its introduction in 1954.",
  },
  {
    label: "Character detail",
    detail: "Wonder Woman debuted in 1941 and was created by William Moulton Marston with artist H. G. Peter.",
  },
];

function Metric({ label, value, note, tone }) {
  return (
    <div style={{ ...s.metric, ...(tone ? s[`metric_${tone}`] : {}) }}>
      <span style={s.metricValue}>{value}</span>
      <span style={s.metricLabel}>{label}</span>
      <span style={s.metricNote}>{note}</span>
    </div>
  );
}

function QueueRow({ href, label, meta }) {
  return (
    <Link href={href} style={s.queueRow}>
      <span>
        <span style={s.queueLabel}>{label}</span>
        <span style={s.queueMeta}>{meta}</span>
      </span>
      <span style={s.arrow}>-&gt;</span>
    </Link>
  );
}

function FlowPanel({ title, text, actions, accent }) {
  return (
    <div style={{ ...s.flowPanel, ...(accent === "cyan" ? s.flowPanelCyan : {}) }}>
      <h2 style={s.flowTitle}>{title}</h2>
      <p style={s.flowText}>{text}</p>
      <div style={s.flowActions} className="home-flow-actions">
        {actions.map(([label, href]) => (
          <Link key={label} href={href} style={s.flowLink}>{label}</Link>
        ))}
      </div>
    </div>
  );
}

function buildSummary(comics) {
  const unread = comics.filter((comic) => (comic.read_count ?? 0) === 0);
  const pdfReady = unread.filter((comic) => comic.has_pdf);
  const readSeries = new Set(comics.filter((comic) => (comic.read_count ?? 0) > 0).map((comic) => comic.series?.id).filter(Boolean));
  const unreadInReadSeries = unread
    .filter((comic) => comic.series?.id && readSeries.has(comic.series.id))
    .sort(compareComicsBySeriesIssue);
  const newestUnreadPdf = [...pdfReady].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))[0];
  const firstUnread = unreadInReadSeries[0] ?? unread[0] ?? null;
  const nextComic = unreadInReadSeries[0] ?? newestUnreadPdf ?? unread[0] ?? null;
  const gaps = findSeriesGaps(comics);
  const needsRepair = comics.filter(needsRepairWork);

  return {
    unread,
    firstUnread,
    needsRepair,
    gapCount: gaps.reduce((sum, row) => sum + row.gaps.length, 0),
    gapSeriesCount: gaps.length,
    topGap: gaps[0] ?? null,
    nextAction: nextComic ? {
      comic: nextComic,
      reason: unreadInReadSeries[0] === nextComic
        ? "Unread issue in a series you have read"
        : newestUnreadPdf === nextComic
          ? "Newest unread PDF-ready issue"
          : "Newest unread issue",
    } : null,
  };
}

function needsRepairWork(comic) {
  return !comic.cover_url
    || !comic.series?.name
    || !(comic.publisher?.name || comic.series?.publisher?.name)
    || (comic.has_pdf && !comic.drive_file_id);
}

function findSeriesGaps(comics) {
  const bySeries = new Map();
  for (const comic of comics) {
    const id = comic.series?.id;
    const name = comic.series?.name;
    if (!id || !name) continue;
    if (!bySeries.has(id)) bySeries.set(id, { name, issues: [] });
    bySeries.get(id).issues.push(comic);
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

function compareComicsBySeriesIssue(a, b) {
  return String(a.series?.name ?? "").localeCompare(String(b.series?.name ?? ""))
    || (parseFloat(a.issue_number) || 0) - (parseFloat(b.issue_number) || 0)
    || dateValue(b.created_at) - dateValue(a.created_at);
}

function dateValue(value) {
  return value ? new Date(value).getTime() : 0;
}

function displayComic(comic) {
  return `${comic.series?.name ?? comic.title}${comic.issue_number ? ` #${comic.issue_number}` : ""}`;
}

function formatSync(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "local";
  }
}

function formatMonth(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

const s = {
  page: { maxWidth: "var(--content-max-lg)", display: "flex", flexDirection: "column", gap: 22 },
  hero: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 18, alignItems: "end", background: "var(--bg-surface)", backgroundImage: "var(--halftone-dots)", backgroundSize: "var(--halftone-size)", border: "3px solid var(--ink-000)", borderRadius: 14, padding: "clamp(18px, 3vw, 30px)", boxShadow: "5px 5px 0 var(--ink-000)" },
  kicker: { color: "var(--hero-gold)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 13, marginBottom: 6 },
  title: { fontFamily: "var(--font-serif)", fontSize: "clamp(34px, 5vw, 64px)", lineHeight: 1, letterSpacing: "0", maxWidth: 760 },
  factBox: { marginTop: 14, maxWidth: 720 },
  sub: { color: "var(--text-soft)", fontSize: 15, lineHeight: 1.6, maxWidth: 650, marginTop: 12 },
  heroActions: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  metric: { background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 10, padding: 14, boxShadow: "2px 2px 0 var(--ink-000)", minWidth: 0 },
  metric_red: { borderTop: "5px solid var(--accent)" },
  metric_gold: { borderTop: "5px solid var(--hero-gold)" },
  metric_cyan: { borderTop: "5px solid var(--hero-cyan)" },
  metricValue: { display: "block", fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1, color: "var(--text)" },
  metricLabel: { display: "block", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--hero-gold)", fontSize: 12, marginTop: 8 },
  metricNote: { display: "block", color: "var(--text-faint)", fontSize: 12, marginTop: 2 },
  mainGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.8fr)", gap: 16, alignItems: "stretch" },
  nextCard: { background: "var(--bg-card)", border: "3px solid var(--ink-000)", borderRadius: 14, padding: 18, boxShadow: "4px 4px 0 var(--ink-000)", minWidth: 0 },
  panelHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 },
  panelKicker: { color: "var(--hero-gold)", fontFamily: "var(--font-burst)", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 13 },
  refreshBtn: { color: "var(--text-faint)", border: "1.5px solid var(--border)", borderRadius: 8, padding: "5px 9px", fontSize: 12 },
  nextBody: { display: "grid", gridTemplateColumns: "clamp(110px, 16vw, 180px) minmax(0, 1fr)", gap: 18, alignItems: "center" },
  coverCell: { minWidth: 0 },
  nextCopy: { minWidth: 0 },
  reason: { color: "var(--hero-cyan)", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 13, marginBottom: 8 },
  nextTitle: { fontFamily: "var(--font-serif)", fontSize: "clamp(25px, 3vw, 38px)", lineHeight: 1.05, letterSpacing: "0", color: "var(--text)", marginBottom: 8 },
  nextMeta: { color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  nextActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  emptyNext: { padding: "clamp(24px, 5vw, 54px)", textAlign: "center" },
  queue: { background: "var(--bg-surface)", border: "2px solid var(--ink-000)", borderRadius: 14, padding: 16, boxShadow: "3px 3px 0 var(--ink-000)" },
  queueRow: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "13px 0", borderTop: "1px solid var(--border)" },
  queueLabel: { display: "block", color: "var(--text)", fontWeight: 700, fontSize: 14 },
  queueMeta: { display: "block", color: "var(--text-faint)", fontSize: 12, marginTop: 2 },
  arrow: { color: "var(--accent)", fontSize: 20 },
  flowGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 },
  flowPanel: { background: "var(--bg-card)", border: "2px solid var(--ink-000)", borderRadius: 14, padding: 18, boxShadow: "3px 3px 0 var(--ink-000)", borderTop: "6px solid var(--accent)" },
  flowPanelCyan: { borderTopColor: "var(--hero-cyan)" },
  flowTitle: { fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.02em", fontSize: 26, lineHeight: 1 },
  flowText: { color: "var(--text-faint)", fontSize: 13, marginTop: 8, marginBottom: 14 },
  flowActions: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  flowLink: { color: "var(--text)", background: "var(--bg-elevated)", border: "1.5px solid var(--ink-000)", borderRadius: 8, padding: "9px 10px", fontFamily: "var(--font-burst)", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12, textAlign: "center" },
};
