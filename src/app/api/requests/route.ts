import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";
import {
  sendClientConfirmation,
  sendTeamNotification,
  sendEventChecklistConfirmation,
  sendEventOwnerNotification,
} from "@/lib/email";
import { wednesdayBeforeLaunch, mondayAfterEvent } from "@/lib/dates";

const PORTAL_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.douecreative.com";

// Looks up a real team member's email by profile id — returns null if that
// person doesn't have a login yet (e.g. Doug, during testing). Every email
// send in this file is best-effort and skipped quietly when there's no
// address to send to; the task itself still gets created and shows up on
// the dashboard either way.
async function emailForProfile(id: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.auth.admin.getUserById(id);
  return data?.user?.email || null;
}

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();
  const { requestTypeId } = body;

  const { data: profile } = await supabase
    .from("profiles").select("id, full_name, client_id, clients(name)").eq("id", session.user.id).single();
  if (!profile?.client_id) return NextResponse.json({ error: "No client on this account." }, { status: 400 });

  const clientName = (profile as any).clients?.name || "A client";

  let requestType: { id: string; label: string; form_kind: string; default_owner_id: string | null; owner_label: string | null } | null = null;
  if (requestTypeId) {
    const { data: rt } = await supabase
      .from("request_types")
      .select("id, label, form_kind, default_owner_id, owner_label")
      .eq("id", requestTypeId)
      .single();
    requestType = rt as any;
  }
  const formKind = requestType?.form_kind || "simple";

  // ──────────────────────────────────────────────
  // EVENT CHECKLIST (FLC "Event Request")
  // ──────────────────────────────────────────────
  if (formKind === "event_checklist") {
    const { eventName, eventDate, launchDate, materialIds } = body;
    if (!eventName || !eventDate || !launchDate || !Array.isArray(materialIds) || !materialIds.length) {
      return NextResponse.json({ error: "Event name, event date, launch date, and at least one item are required." }, { status: 400 });
    }

    const { data: materials } = await supabase
      .from("event_materials")
      .select("id, label, owner_label, default_owner_id, removed_after_event")
      .in("id", materialIds)
      .eq("client_id", profile.client_id)
      .eq("active", true);
    if (!materials || !materials.length) {
      return NextResponse.json({ error: "Those items couldn't be found." }, { status: 400 });
    }

    const dueDate = wednesdayBeforeLaunch(launchDate);
    const takedownDue = mondayAfterEvent(eventDate);

    const { data: insertedRequest, error: reqError } = await supabase
      .from("requests")
      .insert({
        client_id: profile.client_id,
        submitted_by: profile.id,
        request_type_id: requestType?.id || null,
        title: eventName,
        event_date: eventDate,
        launch_date: launchDate,
      })
      .select()
      .single();
    if (reqError) return NextResponse.json({ error: reqError.message }, { status: 400 });

    const rows: any[] = [];
    for (const m of materials) {
      rows.push({
        request_id: insertedRequest.id,
        material_id: m.id,
        label: m.label,
        owner_label: m.owner_label,
        assigned_to: m.default_owner_id,
        due_date: dueDate,
        is_takedown: false,
      });
      if (m.removed_after_event) {
        rows.push({
          request_id: insertedRequest.id,
          material_id: m.id,
          label: `Remove "${m.label}" listing`,
          owner_label: m.owner_label,
          assigned_to: m.default_owner_id,
          due_date: takedownDue,
          is_takedown: true,
        });
      }
    }
    const { error: rmError } = await supabase.from("request_materials").insert(rows);
    if (rmError) return NextResponse.json({ error: rmError.message }, { status: 400 });

    // Emails — best-effort, grouped so each real team member gets one email
    // for their own items rather than one email per checkbox.
    try {
      const itemsForEmail = rows.map((r) => ({ label: r.label, dueDate: r.due_date, takedown: r.is_takedown }));
      if (session.user.email) {
        await sendEventChecklistConfirmation({
          to: session.user.email,
          submitterName: profile.full_name,
          eventName,
          eventDate,
          launchDate,
          items: itemsForEmail,
        });
      }
      const byOwner = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!r.assigned_to) continue; // no real login yet — skip the email, task still shows on the dashboard
        if (!byOwner.has(r.assigned_to)) byOwner.set(r.assigned_to, []);
        byOwner.get(r.assigned_to)!.push(r);
      }
      for (const [ownerId, ownerRows] of byOwner) {
        const ownerEmail = await emailForProfile(ownerId);
        if (!ownerEmail) continue;
        const { data: ownerProfile } = await supabase.from("profiles").select("full_name").eq("id", ownerId).single();
        await sendEventOwnerNotification({
          to: ownerEmail,
          teamMemberName: ownerProfile?.full_name || "there",
          clientName,
          eventName,
          eventDate,
          items: ownerRows.map((r) => ({ label: r.label, dueDate: r.due_date, takedown: r.is_takedown })),
          portalUrl: PORTAL_URL,
        });
      }
    } catch (e) {
      console.error("Email send failed", e);
    }

    return NextResponse.json({ request: insertedRequest });
  }

  // ──────────────────────────────────────────────
  // LIFE GROUP forms (new submission / amend) — structured fields folded
  // into a readable details block, routed the same way a simple request is.
  // ──────────────────────────────────────────────
  if (formKind === "life_group_new" || formKind === "life_group_amend") {
    const f = body.lifeGroup || {};
    const required = [f.groupName, f.description, f.dayOfWeek, f.startDate, f.endDate, f.time, f.frequency, f.category, f.location, f.submitterFirstName, f.submitterLastName];
    if (required.some((v) => !v)) {
      return NextResponse.json({ error: "Please fill in every required field." }, { status: 400 });
    }
    const title = `${formKind === "life_group_new" ? "New Life Group" : "Amend Life Group"}: ${f.groupName}`;
    const details = [
      `Submitted by: ${f.submitterFirstName} ${f.submitterLastName}`,
      f.leaderName ? `Leader: ${f.leaderName}` : null,
      `Category: ${f.category}`,
      `Location / Room: ${f.location}`,
      `Day: ${f.dayOfWeek}`,
      `Start date: ${f.startDate}`,
      `End date: ${f.endDate}`,
      `Time: ${f.time}`,
      `Frequency: ${f.frequency}`,
      "",
      "Description:",
      f.description,
    ].filter((l) => l !== null).join("\n");

    const { data: inserted, error } = await supabase
      .from("requests")
      .insert({
        client_id: profile.client_id,
        submitted_by: profile.id,
        request_type_id: requestType?.id || null,
        title,
        details,
        assigned_to: requestType?.default_owner_id || null,
        owner_label: requestType?.owner_label || null,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    try {
      if (session.user.email) {
        await sendClientConfirmation({ to: session.user.email, clientName: profile.full_name, title, details });
      }
      if (requestType?.default_owner_id) {
        const ownerEmail = await emailForProfile(requestType.default_owner_id);
        if (ownerEmail) {
          const { data: ownerProfile } = await supabase.from("profiles").select("full_name").eq("id", requestType.default_owner_id).single();
          await sendTeamNotification({
            to: ownerEmail,
            teamMemberName: ownerProfile?.full_name || "there",
            clientName,
            title,
            details,
            portalUrl: PORTAL_URL,
          });
        }
      }
    } catch (e) {
      console.error("Email send failed", e);
    }

    return NextResponse.json({ request: inserted });
  }

  // ──────────────────────────────────────────────
  // SIMPLE (the original, generic request form)
  // ──────────────────────────────────────────────
  const { title, details, priority } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  const assignedTo = requestType?.default_owner_id || null;

  const { data: inserted, error } = await supabase
    .from("requests")
    .insert({
      client_id: profile.client_id,
      submitted_by: profile.id,
      request_type_id: requestType?.id || null,
      title,
      details: details || null,
      priority: priority === "high" ? "high" : "normal",
      assigned_to: assignedTo,
      owner_label: requestType?.owner_label || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    if (session.user.email) {
      await sendClientConfirmation({ to: session.user.email, clientName: profile.full_name, title, details: details || null });
    }
    if (assignedTo) {
      const ownerEmail = await emailForProfile(assignedTo);
      if (ownerEmail) {
        const { data: owner } = await supabase.from("profiles").select("full_name").eq("id", assignedTo).single();
        await sendTeamNotification({
          to: ownerEmail,
          teamMemberName: owner?.full_name || "there",
          clientName,
          title,
          details: details || null,
          portalUrl: PORTAL_URL,
        });
      }
    }
  } catch (e) {
    console.error("Email send failed", e);
  }

  return NextResponse.json({ request: inserted });
}
