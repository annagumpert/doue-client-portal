import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM || "Doué Creative <requests@douecreative.com>";

// Sent to the client the moment they submit a simple request — their own copy.
export async function sendClientConfirmation(opts: {
  to: string;
  clientName: string;
  title: string;
  details: string | null;
}) {
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `We've got your request: ${opts.title}`,
    text: `Hi ${opts.clientName},\n\nWe received your request:\n\n"${opts.title}"\n${opts.details ? `\n${opts.details}\n` : ""}\nSomeone from our team will follow up soon. You can check its status anytime in your portal.\n\n— Doué Creative`,
  });
}

// Sent to whichever team member a simple request is routed to.
export async function sendTeamNotification(opts: {
  to: string;
  teamMemberName: string;
  clientName: string;
  title: string;
  details: string | null;
  portalUrl: string;
}) {
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `New request from ${opts.clientName}: ${opts.title}`,
    text: `Hi ${opts.teamMemberName},\n\n${opts.clientName} just submitted a new request:\n\n"${opts.title}"\n${opts.details ? `\n${opts.details}\n` : ""}\nView and update it here: ${opts.portalUrl}/admin\n\n— Doué Creative Portal`,
  });
}

// Sent to the person who submitted an Event Request — a receipt of exactly
// what they checked and when each piece is due.
export async function sendEventChecklistConfirmation(opts: {
  to: string;
  submitterName: string;
  eventName: string;
  eventDate: string;
  launchDate: string;
  items: { label: string; dueDate: string; takedown?: boolean }[];
}) {
  const lines = opts.items
    .map((i) => `- ${i.label}${i.takedown ? " (remove from site/app)" : ""} — due ${i.dueDate}`)
    .join("\n");
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Event request received: ${opts.eventName}`,
    text: `Hi ${opts.submitterName},\n\nWe've got your request for "${opts.eventName}" (event date ${opts.eventDate}, promo launch ${opts.launchDate}). Here's everything on the list and when it's due on our end:\n\n${lines}\n\nWe'll take it from here.\n\n— Doué Creative`,
  });
}

// Sent to a team member (when they have a real login) for the specific
// items on an Event Request that belong to them — not the whole event.
export async function sendEventOwnerNotification(opts: {
  to: string;
  teamMemberName: string;
  clientName: string;
  eventName: string;
  eventDate: string;
  items: { label: string; dueDate: string; takedown?: boolean }[];
  portalUrl: string;
}) {
  const lines = opts.items
    .map((i) => `- ${i.label}${i.takedown ? " (remove from site/app)" : ""} — due ${i.dueDate}`)
    .join("\n");
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `${opts.clientName}: new tasks for "${opts.eventName}"`,
    text: `Hi ${opts.teamMemberName},\n\n${opts.clientName} submitted a request for "${opts.eventName}" (event date ${opts.eventDate}). Here's what's on your plate:\n\n${lines}\n\nView it here: ${opts.portalUrl}/admin\n\n— Doué Creative Portal`,
  });
}

// Sent when someone adds a follow-up note to an existing request — lets the
// other side know without them needing to check the portal proactively.
export async function sendFollowUpNotification(opts: {
  to: string;
  recipientName: string;
  requestTitle: string;
  authorName: string;
  body: string;
  portalUrl: string;
}) {
  await resend.emails.send({
    from,
    to: opts.to,
    subject: `Update on: ${opts.requestTitle}`,
    text: `Hi ${opts.recipientName},\n\n${opts.authorName} added a note to "${opts.requestTitle}":\n\n"${opts.body}"\n\nView it here: ${opts.portalUrl}\n\n— Doué Creative Portal`,
  });
}
