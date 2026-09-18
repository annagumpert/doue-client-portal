// Date math for the FLC event checklist. Dates travel as plain "YYYY-MM-DD"
// strings end to end (that's what an <input type="date"> gives you and what
// Postgres' `date` column expects), so everything here works in UTC on
// purpose — parsing "2026-10-14" as local time can silently roll it back a
// day depending on the server's timezone, which would quietly assign the
// wrong due date. Keeping it UTC-only avoids that class of bug entirely.

function parseUTCDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The Wednesday immediately before launchDate. If launchDate itself falls on
// a Wednesday, this steps back a full week rather than returning the same
// day — "before" means strictly before.
export function wednesdayBeforeLaunch(launchDate: string): string {
  const d = parseUTCDate(launchDate);
  const day = d.getUTCDay(); // 0 = Sunday ... 3 = Wednesday ... 6 = Saturday
  let diff = (day - 3 + 7) % 7;
  if (diff === 0) diff = 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toDateStr(d);
}

// The Monday immediately after eventDate. If eventDate itself falls on a
// Monday, this rolls forward a full week rather than returning the same day
// — "after" means strictly after.
export function mondayAfterEvent(eventDate: string): string {
  const d = parseUTCDate(eventDate);
  const day = d.getUTCDay(); // 1 = Monday
  let diff = (1 - day + 7) % 7;
  if (diff === 0) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return toDateStr(d);
}
