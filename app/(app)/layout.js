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
      <main className="main-content" style={{ padding: "24px 20px" }}>
        {children}
      </main>
    </div>
  );
}
