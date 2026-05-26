import { createClient } from "../../../lib/supabase";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Settings — One Shot" };

export default async function SettingsPage({ searchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: integration }, prefsResult] = await Promise.all([
    supabase.from("user_integrations").select("connected, drive_folder_id").eq("provider", "google_drive").single(),
    supabase.from("user_preferences").select("minutes_per_day").eq("user_id", user.id).maybeSingle(),
  ]);

  const params = await searchParams;

  return (
    <SettingsClient
      user={user}
      googleConnected={integration?.connected ?? false}
      driveFolderId={integration?.drive_folder_id ?? null}
      minutesPerDay={prefsResult.data?.minutes_per_day ?? 30}
      flashMessage={
        params.google === "connected" ? "Google Drive connected!" :
        params.google === "denied"    ? "Google Drive connection cancelled." :
        null
      }
    />
  );
}
