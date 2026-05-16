import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchComics as metronSearch } from "../../../lib/metron";
import { searchComics as cvSearch } from "../../../lib/comicvine";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageBase64, mimeType = "image/jpeg" } = await request.json();
  if (!imageBase64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });

  // Claude Vision — extract title/issue/publisher from cover image
  const visionRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          {
            type: "text",
            text: `This is a comic book cover. Extract:
1. Series/title name (e.g. "Amazing Spider-Man")
2. Issue number (e.g. "42")
3. Publisher (e.g. "Marvel")

Reply ONLY with JSON: {"series":"...","issue":"...","publisher":"..."}
Use null for anything unreadable.`,
          },
        ],
      }],
    }),
  });

  if (!visionRes.ok) {
    return NextResponse.json({ error: `Vision API ${visionRes.status}` }, { status: 502 });
  }

  const visionData = await visionRes.json();
  const rawText    = visionData.content?.[0]?.text || "";

  let extracted = {};
  try {
    extracted = JSON.parse(rawText.match(/\{[\s\S]+\}/)?.[0] || "{}");
  } catch {}

  const query = [extracted.series, extracted.issue && `#${extracted.issue}`]
    .filter(Boolean).join(" ");

  let results = [];
  if (query.trim()) {
    const [metron, cv] = await Promise.allSettled([metronSearch(query), cvSearch(query)]);
    const metronResults = metron.status === "fulfilled" ? metron.value : [];
    const cvResults     = cv.status === "fulfilled"     ? cv.value     : [];

    const normalize = (r) => `${(r.series_name ?? r.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${r.issue_number ?? ""}`;
    const seen = new Set(metronResults.map(normalize));
    const unique = cvResults.filter((r) => !seen.has(normalize(r)));
    results = [...metronResults, ...unique];
  }

  return NextResponse.json({ extracted, results });
}
