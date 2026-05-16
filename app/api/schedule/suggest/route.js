import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekStart } = await request.json();
  if (!weekStart) return NextResponse.json({ error: "weekStart required" }, { status: 400 });

  // Build the 7 dates for the week
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });

  // Fetch everything in parallel
  const [prefsResult, pullResult, logResult, comicsResult] = await Promise.all([
    supabase.from("user_preferences").select("minutes_per_day").eq("user_id", user.id).maybeSingle(),
    supabase.from("pull_list")
      .select("series:series_id ( id, name )")
      .eq("user_id", user.id)
      .eq("active", true),
    supabase.from("reading_log")
      .select("comic_id, read_at, comic:comic_id( title, issue_number, series:series_id(name) )")
      .eq("user_id", user.id)
      .order("read_at", { ascending: false })
      .limit(30),
    supabase.from("comics")
      .select("id, title, issue_number, series:series_id( id, name )")
      .eq("user_id", user.id)
      .order("series_id")
      .limit(200),
  ]);

  const minutesPerDay  = prefsResult.data?.minutes_per_day ?? 30;
  const issuesPerDay   = Math.max(1, Math.floor(minutesPerDay / 15));
  const pullSeriesIds  = new Set((pullResult.data ?? []).map(p => p.series?.id).filter(Boolean));
  const pullSeriesNames = (pullResult.data ?? []).map(p => p.series?.name).filter(Boolean);
  const readIds        = new Set((logResult.data ?? []).map(l => l.comic_id).filter(Boolean));

  const unread = (comicsResult.data ?? []).filter(c => !readIds.has(c.id));
  if (!unread.length) {
    return NextResponse.json({ error: "No unread comics in your library to schedule." }, { status: 400 });
  }

  // Group by series, sorted by issue number within each
  const bySeries = {};
  for (const c of unread) {
    const sid = c.series?.id ?? "__none__";
    if (!bySeries[sid]) bySeries[sid] = { name: c.series?.name ?? "Unknown", isPull: pullSeriesIds.has(sid), comics: [] };
    bySeries[sid].comics.push({ id: c.id, num: c.issue_number });
  }
  for (const s of Object.values(bySeries)) {
    s.comics.sort((a, b) => (parseFloat(a.num) || 0) - (parseFloat(b.num) || 0));
  }

  const seriesContext = Object.values(bySeries)
    .sort((a, b) => (b.isPull ? 1 : 0) - (a.isPull ? 1 : 0))
    .map(s => `${s.isPull ? "[PULL LIST] " : ""}${s.name}: ${s.comics.map(c => `#${c.num}(${c.id})`).join(", ")}`)
    .join("\n");

  const recentContext = (logResult.data ?? []).slice(0, 10)
    .map(l => `${l.comic?.series?.name ?? "?"} #${l.comic?.issue_number ?? "?"}`)
    .join(", ") || "none";

  const prompt = `You are a comic reading scheduler. The user reads ${minutesPerDay} min/day (~${issuesPerDay} issue${issuesPerDay !== 1 ? "s" : ""}/day at 15 min each).

Pull list series (highest priority): ${pullSeriesNames.join(", ") || "none yet"}.
Recently read: ${recentContext}.

Unread comics available ([PULL LIST] = actively following, issues listed in reading order):
${seriesContext}

Schedule 7 days from ${days[0]} to ${days[6]}. Rules:
- Keep series in order (read lower issue numbers before higher)
- Max ${issuesPerDay} issue${issuesPerDay !== 1 ? "s" : ""} per day
- Prioritize pull list series, then series recently being read
- Mix series across days when possible
- Only use the exact UUIDs listed above

Reply with ONLY this JSON (no markdown fences, no extra text):
{"days":[{"date":"YYYY-MM-DD","comic_ids":["uuid"],"note":"one line reason"},...]}`

  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    messages:   [{ role: "user", content: prompt }],
  });

  let plan;
  try {
    const raw     = msg.content.find(b => b.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    plan = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "AI returned an unreadable response. Try again." }, { status: 500 });
  }

  // Validate: only schedule comics that actually belong to this user
  const validIds = new Set(unread.map(c => c.id));
  const inserts  = [];
  for (const day of (plan.days ?? [])) {
    for (const id of (day.comic_ids ?? [])) {
      if (validIds.has(id)) {
        inserts.push({ user_id: user.id, comic_id: id, scheduled_for: day.date, completed: false });
      }
    }
  }

  // Clear existing incomplete items for this week, then insert new plan
  await supabase.from("reading_schedule")
    .delete()
    .eq("user_id", user.id)
    .gte("scheduled_for", days[0])
    .lte("scheduled_for", days[6])
    .eq("completed", false);

  if (inserts.length) {
    await supabase.from("reading_schedule")
      .upsert(inserts, { onConflict: "user_id,comic_id,scheduled_for" });
  }

  return NextResponse.json({ scheduled: inserts.length, days: plan.days });
}
