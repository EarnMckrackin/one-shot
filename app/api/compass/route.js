import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { mode, message, collectionContext } = await req.json();
  if (!message) return Response.json({ error: "Message required" }, { status: 400 });

  // Fetch the user's full reading history with comic details
  const { data: logs } = await supabase
    .from("reading_log")
    .select("read_at, comic:comic_id( title, issue_number, series:series_id(name), publisher:publisher_id(name) )")
    .eq("user_id", user.id)
    .order("read_at", { ascending: false });

  // Build a deduplicated list of what the user has read
  const readSet = new Set();
  const readList = [];
  for (const log of logs ?? []) {
    const c = log.comic;
    if (!c) continue;
    const key = `${c.series?.name ?? c.title}#${c.issue_number}`;
    if (readSet.has(key)) continue;
    readSet.add(key);
    readList.push({
      series: c.series?.name ?? c.title,
      issue: c.issue_number,
      publisher: c.publisher?.name,
      readAt: log.read_at,
    });
  }

  const response = buildCompassResponse(mode, readList, collectionContext);
  return new Response(response, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}

function buildCompassResponse(mode, readList, collectionContext = {}) {
  const context = normalizeContext(collectionContext);

  if (!readList.length && !context.unreadCount && !context.gapCount && !context.repairCount) {
    return "Log a few readings first. Compass now summarizes from your saved reading history instead of generating outside context.";
  }

  const recent = readList.slice(0, 6);
  const grouped = new Map();
  for (const item of readList) {
    const key = item.series || "Unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  if (mode === "catchup") {
    return [
      "Recent reading checkpoint:",
      ...(recent.length ? recent.map((r) => `- ${r.series}${r.issue ? ` #${r.issue}` : ""}${r.publisher ? ` (${r.publisher})` : ""}`) : ["- No logged reads yet. Start with unread shelf signals below."]),
      ...formatTopUnread(context),
      "",
      "This local version avoids generated plot recaps. Open the comic detail pages for saved descriptions and reading history without spoiler risk.",
    ].join("\n");
  }

  if (mode === "nextreads") {
    return [
      "Next-read agenda from your local shelf:",
      ...formatTopUnread(context),
      context.pdfReadyCount ? `- ${context.pdfReadyCount} unread issues are PDF-ready for immediate reading.` : "- No unread PDF-ready issues found in the current cache.",
      "",
      "Open the issue detail to read, log it, schedule it, or attach a PDF.",
    ].join("\n");
  }

  if (mode === "fixgaps") {
    return [
      "Repair and gap agenda:",
      ...(context.topGaps.length
        ? context.topGaps.map((row) => `- ${row.series}: missing ${row.gaps.map((n) => `#${n}`).join(", ")}`)
        : ["- No sequential issue gaps found in the current cache."]),
      context.repairCount ? `- ${context.repairCount} issues look like metadata/PDF repair candidates.` : "- No obvious repair candidates found.",
      "",
      "Use Gap Tracker for missing issue runs, or Add with replacement mode for metadata repairs.",
    ].join("\n");
  }

  if (mode === "keyissue") {
    return [
      "Collection signals from your logged reads:",
      ...[...grouped.entries()].slice(0, 8).map(([series, items]) => `- ${series}: ${items.length} logged read${items.length !== 1 ? "s" : ""}`),
      "",
      "Key-issue analysis will need a dedicated metadata source before launch.",
    ].join("\n");
  }

  return [
    "Series represented in your reading history:",
    ...[...grouped.entries()].slice(0, 10).map(([series, items]) => `- ${series}: latest logged ${formatIssue(items[0])}`),
    "",
    "Compass is now local-history based and does not call an external AI service.",
  ].join("\n");
}

function normalizeContext(value) {
  const context = value && typeof value === "object" ? value : {};
  return {
    unreadCount: Number(context.unreadCount) || 0,
    pdfReadyCount: Number(context.pdfReadyCount) || 0,
    gapCount: Number(context.gapCount) || 0,
    repairCount: Number(context.repairCount) || 0,
    topUnread: Array.isArray(context.topUnread) ? context.topUnread.slice(0, 5) : [],
    topGaps: Array.isArray(context.topGaps) ? context.topGaps.slice(0, 5) : [],
  };
}

function formatTopUnread(context) {
  if (!context.topUnread.length) return ["- No unread issues found in the current cache."];
  return context.topUnread.map((comic) => `- ${comic.label}${comic.hasPdf ? " (PDF-ready)" : ""}`);
}

function formatIssue(item) {
  return item.issue ? `#${item.issue}` : "issue";
}
