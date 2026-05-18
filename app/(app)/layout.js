import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase";
import Nav from "../../components/Nav";

export default async function AppLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ minHeight: "100vh" }}>
      <Nav />
      <main className="main-content" style={{ padding: "clamp(18px, 3vw, 36px) clamp(16px, 3vw, 40px)" }}>
        {children}
      </main>
    </div>
  );
}
