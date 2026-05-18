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

  const { mode, message, history } = await req.json();
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

  const response = buildCompassResponse(mode, readList);
  return new Response(response, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}

function buildCompassResponse(mode, readList) {
  if (!readList.length) {
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
      ...recent.map((r) => `- ${r.series}${r.issue ? ` #${r.issue}` : ""}${r.publisher ? ` (${r.publisher})` : ""}`),
      "",
      "This local version avoids generated plot recaps. Open the comic detail pages for saved descriptions and reading history without spoiler risk.",
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

function formatIssue(item) {
  return item.issue ? `#${item.issue}` : "issue";
}
