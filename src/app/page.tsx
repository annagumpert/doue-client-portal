import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function Home() {
  const supabase = supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  redirect(profile?.role === "team" ? "/admin" : "/portal");
}
