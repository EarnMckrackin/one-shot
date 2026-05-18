import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";

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

  const queues = Object.values(bySeries)
    .sort((a, b) => (b.isPull ? 1 : 0) - (a.isPull ? 1 : 0) || a.name.localeCompare(b.name))
    .map((series) => ({ ...series, comics: [...series.comics] }));

  const plan = { days: days.map((date) => ({ date, comic_ids: [], note: "Local reading plan" })) };
  let cursor = 0;
  for (const day of plan.days) {
    while (day.comic_ids.length < issuesPerDay && queues.some((series) => series.comics.length > 0)) {
      const series = queues[cursor % queues.length];
      cursor += 1;
      const next = series.comics.shift();
      if (next) day.comic_ids.push(next.id);
    }
  }

  const inserts  = [];
  for (const day of (plan.days ?? [])) {
    for (const id of (day.comic_ids ?? [])) {
      inserts.push({ user_id: user.id, comic_id: id, scheduled_for: day.date, completed: false });
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
