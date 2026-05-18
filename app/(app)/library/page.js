import { createClient } from "../../../lib/supabase";
import LibraryClient from "./LibraryClient";

export const metadata = { title: "Library — One Shot" };

export default async function LibraryPage() {
  const supabase = await createClient();

  const [{ data: publishers }, { data: series }] = await Promise.all([
    supabase.from("publishers").select("id, name").order("name"),
    supabase.from("series").select("id, name, publisher_id").order("name"),
  ]);

  return (
    <LibraryClient
      publishers={publishers ?? []}
      allSeries={series ?? []}
    />
  );
}
