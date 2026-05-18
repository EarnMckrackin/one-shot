import { notFound } from "next/navigation";
import { createClient } from "../../../../../lib/supabase";
import PDFReaderClient from "./PDFReaderClient";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("comics")
    .select("title, issue_number")
    .eq("id", id)
    .single();

  return {
    title: data ? `Read ${data.title}${data.issue_number ? ` #${data.issue_number}` : ""} - One Shot` : "Read PDF - One Shot",
  };
}

export default async function ReadComicPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: comic } = await supabase
    .from("comics")
    .select("id, title, issue_number, has_pdf, drive_file_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!comic?.has_pdf && !comic?.drive_file_id) notFound();

  return <PDFReaderClient comic={comic} />;
}
