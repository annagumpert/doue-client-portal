import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Team-only: update a request's status or assignee. RLS ("team updates all
// requests") enforces that only a profile with role='team' can write here —
// a client session gets a permission error from Postgres, not just a hidden button.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const patch = await req.json();
  const allowed: Record<string, any> = {};
  if ("status" in patch) allowed.status = patch.status;
  if ("assigned_to" in patch) allowed.assigned_to = patch.assigned_to;
  if ("priority" in patch) allowed.priority = patch.priority;

  const { error } = await supabase.from("requests").update(allowed).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
