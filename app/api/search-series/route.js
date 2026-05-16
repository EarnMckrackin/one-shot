import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase";
import { searchSeries } from "../../../lib/metron";

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q");
  if (!q) return NextResponse.json({ results: [] });

  const results = await searchSeries(q);
  return NextResponse.json({ results });
}
