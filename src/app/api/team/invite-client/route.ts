import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

// Team-only: create a login for a new client contact. Checks the CALLER's
// own role with the regular (RLS-respecting) client before touching the
// admin API, so a client account can never call this to make itself a team
// member or invite anyone.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (caller?.role !== "team") return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { name, email, clientId } = await req.json();
  if (!name || !email || !clientId) {
    return NextResponse.json({ error: "Name, email, and client are required." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Creates the auth user and emails them a secure link to set their own password.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/login`,
  });
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message || "Could not create the account." }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    full_name: name,
    role: "client",
    client_id: clientId,
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
