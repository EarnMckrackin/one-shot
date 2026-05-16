import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const readSummary = readList.length
    ? readList.map((r) => `- ${r.series}${r.issue ? ` #${r.issue}` : ""}${r.publisher ? ` (${r.publisher})` : ""}`).join("\n")
    : "No comics logged yet.";

  const modeInstructions = {
    catchup: "You are helping the user catch up on what happened in their comics WITHOUT spoiling anything beyond what they've read. Summarize story events, character moments, and cliffhangers only up to their last read issue.",
    keyissue: "You are a comic book expert identifying key issues. Tell the user which issues in series they own are historically significant (first appearances, deaths, major events) — only reveal spoilers for issues they've already read.",
    connections: "You are mapping connections across comics. Explain how characters, events, and storylines in the user's collection intersect — crossovers, shared universes, reading order recommendations. Only spoil things they've read.",
  };

  const systemPrompt = `You are the Continuity Compass, an AI reading companion embedded in One Shot — a personal comic book management app.

You have access to this user's reading history. CRITICAL RULE: Never spoil plot events, deaths, reveals, or twists from issues the user has NOT read.

The user has read these comics:
${readSummary}

Mode: ${modeInstructions[mode] ?? modeInstructions.connections}

When referencing something from an unread issue, say "I can't say what happens next without spoiling it, but I can tell you it's worth reading." Keep responses focused, enthusiastic, and treat the user as a fellow collector.`;

  // Build message history for multi-turn conversation
  const messages = [
    ...(history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  const stream = await anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
