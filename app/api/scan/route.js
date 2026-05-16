import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchComics as metronSearch } from "../../../lib/metron";
import { searchComics as cvSearch } from "../../../lib/comicvine";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageBase64, mimeType = "image/jpeg", query: manualQuery } = await request.json();
  if (!imageBase64 && !manualQuery) return NextResponse.json({ error: "imageBase64 or query required" }, { status: 400 });

  // Manual search — skip Vision, use provided query directly
  if (manualQuery) {
    let results = [];
    const [metron, cv] = await Promise.allSettled([metronSearch(manualQuery), cvSearch(manualQuery)]);
    const metronResults = metron.status === "fulfilled" ? metron.value : [];
    const cvResults     = cv.status === "fulfilled"     ? cv.value     : [];
    const normalize = (r) => `${(r.series_name ?? r.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${r.issue_number ?? ""}`;
    const seen = new Set(metronResults.map(normalize));
    results = [...metronResults, ...cvResults.filter((r) => !seen.has(normalize(r)))]
      .filter((r) => r.issue_number != null || r.series_name != null);
    return NextResponse.json({ extracted: null, results });
  }

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

    results = [...metronResults, ...unique]
      .filter((r) => r.issue_number != null || r.series_name != null)
      .sort((a, b) => scoreResult(b, extracted) - scoreResult(a, extracted));
  }

  return NextResponse.json({ extracted, results });
}

function scoreResult(r, extracted) {
  let score = 0;
  const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (extracted.issue && r.issue_number != null) {
    const ext = String(extracted.issue).replace(/^#/, "").trim();
    const res = String(r.issue_number).trim();
    if (res === ext) score += 10;
    else if (res.startsWith(ext) || ext.startsWith(res)) score += 4;
  }

  if (extracted.series && r.series_name) {
    const extN = norm(extracted.series);
    const resN = norm(r.series_name);
    if (resN === extN) score += 8;
    else if (resN.includes(extN) || extN.includes(resN)) score += 3;
  }

  if (r.cover_url) score += 1;

  return score;
}
