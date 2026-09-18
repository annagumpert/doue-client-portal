import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";
import { sendFollowUpNotification } from "@/lib/email";

const PORTAL_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.douecreative.com";

// Adds a follow-up note to an existing request ("actually, change this")
// instead of forcing a brand new duplicate request. RLS makes sure a client
// can only comment on their own client's requests; team can comment on any.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { body } = await req.json();
  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const { data: authorProfile } = await supabase
    .from("profiles").select("full_name, role").eq("id", session.user.id).single();

  const { data: comment, error } = await supabase
    .from("request_comments")
    .insert({
      request_id: params.id,
      author_id: session.user.id,
      author_label: authorProfile?.full_name || null,
      body: body.trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Best-effort notification: a client's note goes to whoever the request
  // is assigned to; a team member's note goes to the client who submitted it.
  try {
    const { data: request } = await supabase
      .from("requests")
      .select("title, assigned_to, submitted_by")
      .eq("id", params.id)
      .single();
    if (request) {
      const admin = supabaseAdmin();
      const notifyProfileId = authorProfile?.role === "team" ? request.submitted_by : request.assigned_to;
      if (notifyProfileId && notifyProfileId !== session.user.id) {
        const { data: recipientProfile } = await supabase.from("profiles").select("full_name").eq("id", notifyProfileId).single();
        const { data: recipientAuth } = await admin.auth.admin.getUserById(notifyProfileId);
        const recipientEmail = recipientAuth?.user?.email;
        if (recipientEmail) {
          await sendFollowUpNotification({
            to: recipientEmail,
            recipientName: recipientProfile?.full_name || "there",
            requestTitle: request.title,
            authorName: authorProfile?.full_name || "Someone",
            body: body.trim(),
            portalUrl: PORTAL_URL,
          });
        }
      }
    }
  } catch (e) {
    console.error("Follow-up email failed", e);
  }

  return NextResponse.json({ comment });
}
