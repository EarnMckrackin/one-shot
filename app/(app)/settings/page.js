import { createClient } from "../../../lib/supabase";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Settings — One Shot" };

export default async function SettingsPage({ searchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: integration } = await supabase
    .from("user_integrations")
    .select("connected")
    .eq("provider", "google_drive")
    .single();

  const params = await searchParams;

  return (
    <SettingsClient
      user={user}
      googleConnected={integration?.connected ?? false}
      flashMessage={params.google === "connected" ? "Google Drive connected!" : params.google === "denied" ? "Google Drive connection cancelled." : null}
    />
  );
}
