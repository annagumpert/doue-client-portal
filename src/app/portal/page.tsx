"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

type RequestType = { id: string; label: string; form_kind: string };
type Material = { id: string; label: string; owner_label: string };
type ReqMaterial = { id: string; label: string; owner_label: string | null; status: string; due_date: string | null; is_takedown: boolean };
type Comment = { id: string; body: string; author_label: string | null; created_at: string };
type Req = {
  id: string;
  title: string;
  details: string | null;
  status: string;
  priority: string;
  created_at: string;
  event_date: string | null;
  launch_date: string | null;
  owner_label: string | null;
};

const LIFE_GROUP_CATEGORIES = [
  "Bible Study", "Common Interest", "Elective", "Fellowship and Fun", "Marriage",
  "Mens", "Outreach", "Parenting", "Prayer", "Recovery", "Student", "Womens", "Young Adult",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function PortalPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [requests, setRequests] = useState<Req[]>([]);
  const [types, setTypes] = useState<RequestType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subMap, setSubMap] = useState<Record<string, ReqMaterial[]>>({});
  const [commentMap, setCommentMap] = useState<Record<string, Comment[]>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<Record<string, string>>({});

  // simple form
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("normal");

  // event checklist form
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // life group form
  const [lg, setLg] = useState({
    submitterFirstName: "", submitterLastName: "", leaderName: "", groupName: "",
    description: "", dayOfWeek: "", startDate: "", endDate: "", time: "", frequency: "",
    category: "", location: "",
  });

  const selectedType = types.find((t) => t.id === typeId);
  const formKind = selectedType?.form_kind || "simple";

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles").select("role, client_id, clients(name)").eq("id", session.user.id).single();
    if (profile?.role === "team") { router.push("/admin"); return; }
    setClientName((profile as any)?.clients?.name || "");

    const { data: reqs } = await supabase
      .from("requests")
      .select("id,title,details,status,priority,created_at,event_date,launch_date,owner_label")
      .order("created_at", { ascending: false });
    setRequests(reqs || []);

    if (reqs && reqs.length) {
      const ids = reqs.map((r) => r.id);
      const { data: rm } = await supabase
        .from("request_materials")
        .select("id,request_id,label,owner_label,status,due_date,is_takedown")
        .in("request_id", ids)
        .order("due_date");
      const grouped: Record<string, ReqMaterial[]> = {};
      (rm || []).forEach((row: any) => {
        grouped[row.request_id] = grouped[row.request_id] || [];
        grouped[row.request_id].push(row);
      });
      setSubMap(grouped);

      const { data: cm } = await supabase
        .from("request_comments")
        .select("id,request_id,body,author_label,created_at")
        .in("request_id", ids)
        .order("created_at");
      const groupedC: Record<string, Comment[]> = {};
      (cm || []).forEach((row: any) => {
        groupedC[row.request_id] = groupedC[row.request_id] || [];
        groupedC[row.request_id].push(row);
      });
      setCommentMap(groupedC);
    }

    const { data: rt } = await supabase
      .from("request_types")
      .select("id,label,form_kind,client_id")
      .or(`client_id.is.null,client_id.eq.${profile?.client_id}`)
      .order("label");
    setTypes((rt as any) || []);
    if (rt && rt.length) setTypeId(rt[0].id);

    const { data: mats } = await supabase
      .from("event_materials")
      .select("id,label,owner_label")
      .eq("client_id", profile?.client_id)
      .eq("active", true)
      .order("sort_order");
    setMaterials(mats || []);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForms() {
    setTitle(""); setDetails("");
    setEventName(""); setEventDate(""); setLaunchDate(""); setChecked({});
    setLg({ submitterFirstName: "", submitterLastName: "", leaderName: "", groupName: "", description: "", dayOfWeek: "", startDate: "", endDate: "", time: "", frequency: "", category: "", location: "" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let payload: any = { requestTypeId: typeId };
    if (formKind === "event_checklist") {
      const materialIds = Object.keys(checked).filter((id) => checked[id]);
      payload = { ...payload, eventName, eventDate, launchDate, materialIds };
    } else if (formKind === "life_group_new" || formKind === "life_group_amend") {
      payload = { ...payload, lifeGroup: lg };
    } else {
      payload = { ...payload, title, details, priority };
    }

    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "Something went wrong submitting that. Try again.");
      return;
    }
    resetForms();
    load();
  }

  async function addFollowUp(requestId: string) {
    const text = (followUp[requestId] || "").trim();
    if (!text) return;
    const res = await fetch(`/api/requests/${requestId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) {
      setFollowUp((f) => ({ ...f, [requestId]: "" }));
      load();
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const canSubmit =
    formKind === "event_checklist"
      ? !!(eventName && eventDate && launchDate && Object.values(checked).some(Boolean))
      : formKind === "life_group_new" || formKind === "life_group_amend"
      ? !!(lg.submitterFirstName && lg.submitterLastName && lg.groupName && lg.description && lg.dayOfWeek && lg.startDate && lg.endDate && lg.time && lg.frequency && lg.category && lg.location)
      : !!title;

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">{clientName || "Your"} Portal</div>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <strong>New request</strong>
        <label htmlFor="type">Type of request</label>
        <select id="type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {formKind === "simple" && (
          <>
            <label htmlFor="title">What do you need?</label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Update our GBP hours for the holidays" />
            <label htmlFor="priority">Priority</label>
            <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="high">Urgent</option>
            </select>
            <label htmlFor="details">Details (optional)</label>
            <textarea id="details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
          </>
        )}

        {formKind === "event_checklist" && (
          <>
            <label htmlFor="eventName">Name of event</label>
            <input id="eventName" required value={eventName} onChange={(e) => setEventName(e.target.value)} />
            <label htmlFor="eventDate">Date of event</label>
            <input id="eventDate" type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <label htmlFor="launchDate">Date to launch promo</label>
            <input id="launchDate" type="date" required value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} />
            <label>Materials needed for the event</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {materials.map((m) => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={!!checked[m.id]}
                    onChange={(e) => setChecked((c) => ({ ...c, [m.id]: e.target.checked }))}
                  />
                  {m.label}
                </label>
              ))}
              {!materials.length && <div className="muted">No materials configured for your account yet.</div>}
            </div>
          </>
        )}

        {(formKind === "life_group_new" || formKind === "life_group_amend") && (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="lgFirst">Your first name</label>
                <input id="lgFirst" required value={lg.submitterFirstName} onChange={(e) => setLg({ ...lg, submitterFirstName: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="lgLast">Your last name</label>
                <input id="lgLast" required value={lg.submitterLastName} onChange={(e) => setLg({ ...lg, submitterLastName: e.target.value })} />
              </div>
            </div>
            <label htmlFor="lgLeader">Leader's name</label>
            <input id="lgLeader" value={lg.leaderName} onChange={(e) => setLg({ ...lg, leaderName: e.target.value })} />
            <label htmlFor="lgGroupName">Life group name</label>
            <input id="lgGroupName" required value={lg.groupName} onChange={(e) => setLg({ ...lg, groupName: e.target.value })} />
            <label htmlFor="lgDesc">Description</label>
            <textarea id="lgDesc" required rows={3} value={lg.description} onChange={(e) => setLg({ ...lg, description: e.target.value })} />
            <label htmlFor="lgDay">Day of the week</label>
            <select id="lgDay" required value={lg.dayOfWeek} onChange={(e) => setLg({ ...lg, dayOfWeek: e.target.value })}>
              <option value="">Select an option</option>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="lgStart">Start date</label>
                <input id="lgStart" type="date" required value={lg.startDate} onChange={(e) => setLg({ ...lg, startDate: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="lgEnd">End date</label>
                <input id="lgEnd" type="date" required value={lg.endDate} onChange={(e) => setLg({ ...lg, endDate: e.target.value })} />
              </div>
            </div>
            <label htmlFor="lgTime">Time</label>
            <input id="lgTime" required value={lg.time} onChange={(e) => setLg({ ...lg, time: e.target.value })} />
            <label htmlFor="lgFreq">Frequency the group will meet</label>
            <input id="lgFreq" required placeholder="weekly, biweekly, every 3rd Wednesday, etc." value={lg.frequency} onChange={(e) => setLg({ ...lg, frequency: e.target.value })} />
            <label htmlFor="lgCategory">Category of group</label>
            <select id="lgCategory" required value={lg.category} onChange={(e) => setLg({ ...lg, category: e.target.value })}>
              <option value="">Select an option</option>
              {LIFE_GROUP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label htmlFor="lgLocation">Location and room number</label>
            <input id="lgLocation" required value={lg.location} onChange={(e) => setLg({ ...lg, location: e.target.value })} />
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn" type="submit" disabled={submitting || !canSubmit} style={{ marginTop: 14 }}>
          {submitting ? "Sending…" : "Submit request"}
        </button>
      </form>

      <div className="card">
        <strong>Your requests</strong>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Request</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {requests.map((r) => {
              const items = subMap[r.id] || [];
              const comments = commentMap[r.id] || [];
              const isOpen = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>
                      {r.title}
                      {r.priority === "high" && <span className="pill high" style={{ marginLeft: 6 }}>Urgent</span>}
                      {r.owner_label && <div className="muted">Owner: {r.owner_label}</div>}
                      {r.event_date && <div className="muted">Event {r.event_date}{r.launch_date ? ` · promo launches ${r.launch_date}` : ""}</div>}
                      {r.details && <div className="muted">{r.details}</div>}
                    </td>
                    <td><span className={`pill ${r.status}`}>{r.status.replace("_", " ")}</span></td>
                    <td className="muted">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => setOpenId(isOpen ? null : r.id)}>
                        {isOpen ? "Close" : "View"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4}>
                        {!!items.length && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="muted" style={{ marginBottom: 4 }}>Items on this request:</div>
                            {items.map((it) => (
                              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #eee" }}>
                                <span>{it.label}{it.owner_label ? ` (${it.owner_label})` : ""}</span>
                                <span className="muted">{it.due_date ? `due ${it.due_date}` : ""} · {it.status.replace("_", " ")}</span>
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
                            placeholder="Need to change something on this request?"
                            value={followUp[r.id] || ""}
                            onChange={(e) => setFollowUp((f) => ({ ...f, [r.id]: e.target.value }))}
                            style={{ flex: 1 }}
                          />
                          <button type="button" className="btn" onClick={() => addFollowUp(r.id)}>Send</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!requests.length && <tr><td colSpan={4} className="muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
