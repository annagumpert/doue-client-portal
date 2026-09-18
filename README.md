# Doué Creative Client Portal

Clients log in, file a request, and get an email receipt. The request also emails
whoever on your team owns that type of request, and shows up on your team dashboard
where you can assign, update status, and track everything across every client.

This is real, separate software from the Claude dashboard artifact — it lives on
its own database and its own hosting so it can have real logins for people outside
your Claude organization (your clients). Budget about an hour for first setup.

## What you're setting up (all have free tiers to start)

1. **Supabase** — the database and login system.
2. **Resend** — sends the confirmation and notification emails.
3. **Vercel** — hosts the actual website.
4. **Your domain** — points `portal.douecreative.com` (or whatever subdomain you pick) at Vercel.

## 1. Supabase (database + logins)

1. Create a free account at supabase.com, then "New project."
2. Once it's ready, open **SQL Editor > New query**, paste in the entire contents of
   `supabase/schema.sql` from this folder, and run it. This creates every table and
   the security rules that keep each client seeing only their own data.
2b. Open a second **New query**, paste in the entire contents of `supabase/migration_v2.sql`,
   and run it. This adds Family Life Church as a client, the Event Request checklist,
   the two Life Group forms, and the follow-up/"request changes" thread on any request.
   Safe to run even if you're not sure — every step checks before it adds anything.
3. Go to **Project Settings > API**. You'll need three values for step 4 below:
   `Project URL`, the `anon public` key, and the `service_role` key (keep this one secret,
   it has full access — never put it in anything that ships to a browser).
4. Go to **Authentication > Providers** and make sure Email is enabled (it is by default).
5. Go to **Authentication > URL Configuration** and, once you know your real domain
   (step 4 below), set the Site URL to `https://portal.douecreative.com`.

### Create your own team login

The schema doesn't seed any team members (only clients), so you'll create your own
account by hand once, before anyone can use the invite button:

1. In Supabase, go to **Authentication > Users > Add user**, enter your email, set a
   password (or send an invite email), and create the user.
2. Copy that user's ID (UUID) from the users list.
3. Go to **Table Editor > profiles > Insert row**, and add: `id` = the UUID you copied,
   `full_name` = your name, `role` = `team`, `client_id` = leave blank.
4. Repeat for any other staff who need team (not client) access — there's no invite
   button for team members yet, only for clients, so add teammates this same way for now.

## 2. Resend (email)

1. Create a free account at resend.com.
2. Add and verify `douecreative.com` (or a subdomain like `mail.douecreative.com`) under
   **Domains** — it'll give you DNS records to add wherever your domain is managed.
3. Create an API key under **API Keys**.

## 3. Vercel (hosting)

1. Push this folder to a GitHub repo (or use Vercel's CLI to deploy the folder directly).
2. At vercel.com, "Add New Project," import that repo.
3. Under **Environment Variables**, add everything from `.env.example` with your real
   values: the three Supabase values, your Resend API key, `EMAIL_FROM`, and
   `NEXT_PUBLIC_SITE_URL` (set this to `https://portal.douecreative.com`).
4. Deploy. Vercel's free Hobby tier is for personal, non-commercial projects — since
   this runs your business, plan on the Pro tier (about $20/month) once you're past
   testing.

## 4. Point your domain at it

1. In Vercel, **Project > Settings > Domains**, add `portal.douecreative.com`.
2. Vercel will show you a CNAME record to add. Go to wherever `douecreative.com`'s DNS
   is managed (Squarespace's domain settings, or elsewhere if you registered it
   separately) and add that CNAME for the `portal` subdomain.
3. DNS changes can take anywhere from a few minutes to a few hours to take effect.

## Rough monthly cost once this is real (not just testing)

- Supabase free tier: 500MB database, 50,000 monthly logins — plenty to start, but
  free projects pause after a week of no activity, which is a bad look for clients.
  Pro is $25/month and removes that.
- Vercel Pro: about $20/month (required for commercial/business use).
- Resend free tier (3,000 emails/month) is enough for a while; paid starts at $20/month.

So roughly **$45–65/month** once you're off the free tiers, likely starting closer to
the low end since Resend's free tier alone will probably cover you for a long time.

## Editing request categories and routing

Once you're live, go to **Supabase > Table Editor > request_types** and add rows —
`label` is what clients see in the dropdown, `default_owner_id` is the team member's
profile ID it should route to. Whoever's email is on that profile gets notified.

Family Life Church's Event Request checklist lives in **Table Editor > event_materials** —
`label` is the item, `owner_label` is a plain-text name shown on the dashboard even before
that person has a real login, `default_owner_id` is filled in once they do (that's what
actually routes their notification email), and `removed_after_event` marks an item that
also needs a takedown task after the event.

## Testing before Doug has a login

Everything works without Doug's account existing yet. Materials routed to him show
"Doug" on the dashboard and in the client's confirmation email, they just won't trigger
a notification email to him until his profile exists (same steps as "Create your own
team login" above, using his email instead). Once you add him, go to
**Table Editor > event_materials** and set `default_owner_id` on his rows to his new
profile ID — anything submitted after that routes and emails him automatically; nothing
needs to be rebuilt or redeployed.

## How due dates are calculated (Event Requests)

Every checked item is due the Wednesday immediately before the promo launch date you
enter (if the launch date itself lands on a Wednesday, the due date is a full week
earlier, not the same day). The one exception is "Listed in events on app and online,"
which also creates a second task — removing that listing — due the Monday right after
the event date.

## What this does NOT do yet

- No "forgot password" UI is wired up beyond Supabase's default (it works, it's just
  not styled to match).
- No file attachments on requests.
- Team member accounts are added by hand in Supabase, not through an invite button.
- The materials checklist (`event_materials`) is shared across every client for now —
  it happens to only be used by Family Life Church today since that's the only client
  with an "Event Request" type, but if you want a second client to have their own
  distinct checklist later, say so and it's a small change.
- This system and the Claude dashboard artifact are separate — they don't sync with
  each other automatically. Ask if you want that bridged.
