import { notFound } from "next/navigation";
import { createClient } from "../../../../lib/supabase";
import ComicDetailClient from "./ComicDetailClient";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("comics").select("title, issue_number").eq("id", id).single();
  return { title: data ? `${data.title}${data.issue_number ? ` #${data.issue_number}` : ""} — One Shot` : "Comic — One Shot" };
}

export default async function ComicDetailPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: comic } = await supabase
    .from("comics")
    .select("*, series:series_id( id, name ), publisher:publisher_id( id, name ), reading_log( id, read_at, notes )")
    .eq("id", id)
    .single();

  if (!comic) notFound();

  return <ComicDetailClient comic={comic} />;
}
