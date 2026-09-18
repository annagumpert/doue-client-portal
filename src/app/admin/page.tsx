"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

type Profile = { id: string; full_name: string; role: string };
type ReqMaterial = { id: string; request_id: string; label: string; owner_label: string | null; assigned_to: string | null; status: string; due_date: string | null; is_takedown: boolean };
type Comment = { id: string; request_id: string; body: string; author_label: string | null; created_at: string };
type Req = {
  id: string; title: string; details: string | null; status: string; priority: string;
  created_at: string; assigned_to: string | null; owner_label: string | null;
  event_date: string | null; launch_date: string | null;
  clients: { name: string } | null;
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  open: { label: "Open", bg: "var(--surface-2)", color: "var(--ink-2)" },
  in_progress: { label: "In progress", bg: "#E6F0F8", color: "#3B6EA5" },
  done: { label: "Done", bg: "var(--good-bg)", color: "var(--good)" },
};
const GROUP_COLORS = ["#5F7A63", "#B57A1E", "#6E8AA6", "#B06B7A"];
const AVATAR_COLORS = ["#5F7A63", "#B57A1E", "#6E8AA6", "#B06B7A", "#7A8C5B"];

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function colorFor(name: string | null | undefined) {
  if (!name) return AVATAR_COLORS[0];
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export default function AdminPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [requests, setRequests] = useState<Req[]>([]);
  const [team, setTeam] = useState<Profile[]>([]);
  const [clientFilter, setClientFilter] = useState("all");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteClientId, setInviteClientId] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [subMap, setSubMap] = useState<Record<string, ReqMaterial[]>>({});
  const [commentMap, setCommentMap] = useState<Record<string, Comment[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    if (profile?.role !== "team") { router.push("/portal"); return; }

    const { data: reqs } = await supabase
      .from("requests")
      .select("id,title,details,status,priority,created_at,assigned_to,owner_label,event_date,launch_date,clients(name)")
      .order("created_at", { ascending: false });
    setRequests((reqs as any) || []);

    if (reqs && reqs.length) {
      const ids = reqs.map((r) => r.id);
      const { data: rm } = await supabase
        .from("request_materials")
        .select("id,request_id,label,owner_label,assigned_to,status,due_date,is_takedown")
        .in("request_id", ids)
        .order("due_date");
      const grouped: Record<string, ReqMaterial[]> = {};
      (rm || []).forEach((row: any) => { grouped[row.request_id] = grouped[row.request_id] || []; grouped[row.request_id].push(row); });
      setSubMap(grouped);

      const { data: cm } = await supabase
        .from("request_comments")
        .select("id,request_id,body,author_label,created_at")
        .in("request_id", ids)
        .order("created_at");
      const groupedC: Record<string, Comment[]> = {};
      (cm || []).forEach((row: any) => { groupedC[row.request_id] = groupedC[row.request_id] || []; groupedC[row.request_id].push(row); });
      setCommentMap(groupedC);
    }

    const { data: t } = await supabase.from("profiles").select("id,full_name,role").eq("role", "team");
    setTeam(t || []);

    const { data: c } = await supabase.from("clients").select("id,name").order("name");
    setClients(c || []);
    if (c && c.length) setInviteClientId(c[0].id);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateRequest(id: string, patch: Record<string, any>) {
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function updateMaterial(id: string, patch: Record<string, any>) {
    await supabase.from("request_materials").update(patch).eq("id", id);
    load();
  }

  async function addNote(requestId: string) {
    const text = (note[requestId] || "").trim();
    if (!text) return;
    const res = await fetch(`/api/requests/${requestId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) { setNote((n) => ({ ...n, [requestId]: "" })); load(); }
  }

  async function inviteClient(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    const res = await fetch("/api/team/invite-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: inviteName, email: inviteEmail, clientId: inviteClientId }),
    });
    setInviting(false);
    const body = await res.json().catch(() => ({}));
    setInviteMsg(res.ok ? `Invited ${inviteEmail}.` : body.error || "Could not send invite.");
    if (res.ok) { setInviteName(""); setInviteEmail(""); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const teamById: Record<string, string> = {};
  team.forEach((t) => { teamById[t.id] = t.full_name; });

  const filtered = clientFilter === "all" ? requests : requests.filter((r) => r.clients?.name === clientFilter);
  const eventRequests = filtered.filter((r) => !!r.event_date);
  const otherRequests = filtered.filter((r) => !r.event_date);

  function NotesBlock({ requestId }: { requestId: string }) {
    const comments = commentMap[requestId] || [];
    const shown = notesOpenId === requestId;
    return (
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn secondary" onClick={() => setNotesOpenId(shown ? null : requestId)}>
          {shown ? "Hide notes" : `Notes${comments.length ? ` (${comments.length})` : ""}`}
        </button>
        {shown && (
          <div style={{ marginTop: 8 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ padding: "4px 0" }}>
                <strong>{c.author_label || "Someone"}</strong>{" "}
                <span className="muted">{new Date(c.created_at).toLocaleString()}</span>
                <div>{c.body}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                placeholder="Add a note for the client"
                value={note[requestId] || ""}
                onChange={(e) => setNote((n) => ({ ...n, [requestId]: e.target.value }))}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn" onClick={() => addNote(requestId)}>Send</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 980 }}>
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Doué Creative" style={{ height: 34, width: "auto" }} />
          <div className="brand">Team Dashboard</div>
        </div>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong style={{ flex: 1 }}>Filter</strong>
          <select style={{ width: "auto" }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {!!eventRequests.length && (
        <>
          <strong style={{ display: "block", margin: "18px 0 8px" }}>Event Requests</strong>
          {eventRequests.map((r, idx) => {
            const items = subMap[r.id] || [];
            const color = GROUP_COLORS[idx % GROUP_COLORS.length];
            return (
              <div key={r.id} className="card" style={{ borderLeft: `4px solid ${color}`, paddingLeft: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <strong style={{ color }}>{r.title}</strong>
                    <span className="muted" style={{ marginLeft: 8 }}>{r.clients?.name}</span>
                  </div>
                  <div className="muted">
                    Requested {new Date(r.created_at).toLocaleDateString()}
                    {r.event_date ? ` · Event ${r.event_date}` : ""}
                    {r.launch_date ? ` · Promo launches ${r.launch_date}` : ""}
                  </div>
                </div>
                <table style={{ marginTop: 10 }}>
                  <thead><tr><th>Project</th><th>Status</th><th>Person</th><th>Due Date</th></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const meta = STATUS_META[it.status] || STATUS_META.open;
                      const personName = (it.assigned_to && teamById[it.assigned_to]) || it.owner_label;
                      return (
                        <tr key={it.id}>
                          <td>{it.label}{it.is_takedown && <span className="muted"> (takedown)</span>}</td>
                          <td>
                            <select
                              value={it.status}
                              onChange={(e) => updateMaterial(it.id, { status: e.target.value })}
                              style={{ width: "auto", background: meta.bg, color: meta.color, fontWeight: 700, border: "none" }}
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span
                                title={personName || "Unassigned"}
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 26, height: 26, borderRadius: "50%", background: colorFor(personName),
                                  color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
                                }}
                              >
                                {initials(personName)}
                              </span>
                              <select
                                value={it.assigned_to || ""}
                                onChange={(e) => updateMaterial(it.id, { assigned_to: e.target.value || null })}
                                style={{ width: "auto" }}
                              >
                                <option value="">{it.owner_label || "Unassigned"}</option>
                                {team.map((tm) => <option key={tm.id} value={tm.id}>{tm.full_name}</option>)}
                              </select>
                            </div>
                          </td>
                          <td>
                            <input
                              type="date"
                              value={it.due_date || ""}
                              onChange={(e) => updateMaterial(it.id, { due_date: e.target.value || null })}
                              style={{ width: "auto" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {!items.length && <tr><td colSpan={4} className="muted">No items on this request.</td></tr>}
                  </tbody>
                </table>
                <NotesBlock requestId={r.id} />
              </div>
            );
          })}
        </>
      )}

      <strong style={{ display: "block", margin: "18px 0 8px" }}>Other Requests</strong>
      <div className="card">
        <table>
          <thead><tr><th>Client</th><th>Request</th><th>Assigned</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {otherRequests.map((r) => {
              const isOpen = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>{r.clients?.name}</td>
                    <td>
                      {r.title}
                      {r.priority === "high" && <span className="pill high" style={{ marginLeft: 6 }}>Urgent</span>}
                      {r.owner_label && !r.assigned_to && <div className="muted">Owner: {r.owner_label} (no login yet)</div>}
                      {r.details && <div className="muted">{r.details}</div>}
                      <div className="muted">Requested {new Date(r.created_at).toLocaleDateString()}</div>
                    </td>
                    <td>
                      <select value={r.assigned_to || ""} onChange={(e) => updateRequest(r.id, { assigned_to: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {team.map((tm) => <option key={tm.id} value={tm.id}>{tm.full_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={r.status} onChange={(e) => updateRequest(r.id, { status: e.target.value })}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => setOpenId(isOpen ? null : r.id)}>
                        {isOpen ? "Close" : "View"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5}>
                        <NotesBlock requestId={r.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!otherRequests.length && <tr><td colSpan={5} className="muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={inviteClient}>
        <strong>Invite a client contact</strong>
        <p className="muted">Creates their login and emails them a link to set a password.</p>
        <label htmlFor="iname">Name</label>
        <input id="iname" required value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
        <label htmlFor="iemail">Email</label>
        <input id="iemail" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
        <label htmlFor="iclient">Client</label>
        <select id="iclient" value={inviteClientId} onChange={(e) => setInviteClientId(e.target.value)}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {inviteMsg && <div className="muted" style={{ marginTop: 8 }}>{inviteMsg}</div>}
        <button className="btn" type="submit" disabled={inviting} style={{ marginTop: 14 }}>
          {inviting ? "Sending…" : "Send invite"}
        </button>
      </form>

      <div className="card">
        <strong>Adding a team member without a client-invite button yet?</strong>
        <p className="muted">
          In Supabase: Authentication → Users → Add user, then copy their UID into a new row in
          Table Editor → profiles, with role = team and client_id left blank. Once that's done they'll
          show up in the "Assigned" and "Person" dropdowns above and start receiving their own notification emails.
        </p>
      </div>
    </div>
  );
}
