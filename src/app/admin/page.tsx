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

  const visible = clientFilter === "all" ? requests : requests.filter((r) => r.clients?.name === clientFilter);

  return (
    <div className="shell" style={{ maxWidth: 980 }}>
      <div className="topbar">
        <div className="brand">Team Dashboard</div>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <strong style={{ flex: 1 }}>Requests</strong>
          <select style={{ width: "auto" }} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <table>
          <thead><tr><th>Client</th><th>Request</th><th>Assigned</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {visible.map((r) => {
              const items = subMap[r.id] || [];
              const comments = commentMap[r.id] || [];
              const isOpen = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>{r.clients?.name}</td>
                    <td>
                      {r.title}
                      {r.priority === "high" && <span className="pill high" style={{ marginLeft: 6 }}>Urgent</span>}
                      {r.owner_label && !r.assigned_to && <div className="muted">Owner: {r.owner_label} (no login yet)</div>}
                      {r.event_date && <div className="muted">Event {r.event_date}{r.launch_date ? ` · promo launches ${r.launch_date}` : ""}</div>}
                      {r.details && <div className="muted">{r.details}</div>}
                      {!!items.length && <div className="muted">{items.length} item{items.length > 1 ? "s" : ""} · {items.filter((i) => i.status === "done").length} done</div>}
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
                        {!!items.length && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="muted" style={{ marginBottom: 4 }}>Items on this request:</div>
                            {items.map((it) => (
                              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #eee" }}>
                                <span>
                                  {it.label}
                                  {it.owner_label ? ` — ${it.owner_label}` : ""}
                                  {it.due_date ? <span className="muted"> · due {it.due_date}</span> : ""}
                                </span>
                                <select value={it.status} onChange={(e) => updateMaterial(it.id, { status: e.target.value })} style={{ width: "auto" }}>
                                  <option value="open">Open</option>
                                  <option value="in_progress">In progress</option>
                                  <option value="done">Done</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                        {!!comments.length && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="muted" style={{ marginBottom: 4 }}>Notes:</div>
                            {comments.map((c) => (
                              <div key={c.id} style={{ padding: "4px 0" }}>
                                <strong>{c.author_label || "Someone"}</strong>{" "}
                                <span className="muted">{new Date(c.created_at).toLocaleString()}</span>
                                <div>{c.body}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            placeholder="Add a note for the client"
                            value={note[r.id] || ""}
                            onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <button type="button" className="btn" onClick={() => addNote(r.id)}>Send</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!visible.length && <tr><td colSpan={5} className="muted">Nothing here.</td></tr>}
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
          show up in the "Assigned" dropdown above and start receiving their own notification emails.
        </p>
      </div>
    </div>
  );
}
