-- Doué Creative Client Portal — v2 migration
-- Adds: FLC as a client, Event Request checklist, New/Amend Life Group forms,
-- and a follow-up/"request changes" comment thread on any request.
--
-- Run this in the Supabase SQL Editor AFTER schema.sql has already been run.
-- Safe to run more than once — every step checks before it inserts or adds.

-- Family Life Church joins the portal as a client (volunteer work, same system)
insert into clients (name)
  select 'Family Life Church'
  where not exists (select 1 from clients where name = 'Family Life Church');

-- request_types: which form to render, which client it belongs to, and a
-- human-readable owner name for someone who doesn't have a login yet
alter table request_types add column if not exists form_kind text not null default 'simple'
  check (form_kind in ('simple','event_checklist','life_group_new','life_group_amend'));
alter table request_types add column if not exists client_id uuid references clients(id) on delete cascade;
alter table request_types add column if not exists owner_label text;

-- requests: event-specific dates, plus a snapshot label for an owner who
-- doesn't have a real login yet (so the dashboard can still show "Doug")
alter table requests add column if not exists event_date date;
alter table requests add column if not exists launch_date date;
alter table requests add column if not exists owner_label text;

-- ────────────────────────────────────────────────────────────
-- EVENT MATERIALS: the checklist of things a client can request for an
-- event, each with a default owner. Fully editable from Table Editor —
-- add, retire, or reassign items anytime without touching code.
-- ────────────────────────────────────────────────────────────
create table if not exists event_materials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null,
  owner_label text not null,
  default_owner_id uuid references profiles(id), -- fill in once that person has a real login
  removed_after_event boolean not null default false, -- true = also creates a takedown task
  active boolean not null default true,
  sort_order int not null default 0
);

-- One row per material checked on a given event request — this is what
-- actually shows up as a task, with its own owner, status, and due date.
create table if not exists request_materials (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  material_id uuid references event_materials(id),
  label text not null,          -- snapshot, so a later rename doesn't rewrite history
  owner_label text,             -- snapshot
  assigned_to uuid references profiles(id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  due_date date,
  is_takedown boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists request_materials_request_id_idx on request_materials(request_id);

-- ────────────────────────────────────────────────────────────
-- REQUEST COMMENTS: a lightweight follow-up thread so a client can say
-- "actually, change this" on something they already submitted, instead of
-- filing a brand new duplicate request.
-- ────────────────────────────────────────────────────────────
create table if not exists request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  author_id uuid not null references profiles(id),
  author_label text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_comments_request_id_idx on request_comments(request_id);

-- RLS
alter table event_materials enable row level security;
alter table request_materials enable row level security;
alter table request_comments enable row level security;

drop policy if exists "anyone reads active materials" on event_materials;
create policy "anyone reads active materials" on event_materials for select using (auth.uid() is not null);
drop policy if exists "team manages materials" on event_materials;
create policy "team manages materials" on event_materials for insert with check (is_team_member());
drop policy if exists "team updates materials" on event_materials;
create policy "team updates materials" on event_materials for update using (is_team_member());

drop policy if exists "team reads all request_materials" on request_materials;
create policy "team reads all request_materials" on request_materials for select using (is_team_member());
drop policy if exists "client reads own request_materials" on request_materials;
create policy "client reads own request_materials" on request_materials for select using (
  exists (select 1 from requests r where r.id = request_materials.request_id and r.client_id = my_client_id())
);
drop policy if exists "team inserts request_materials" on request_materials;
create policy "team inserts request_materials" on request_materials for insert with check (is_team_member());
drop policy if exists "client inserts own request_materials" on request_materials;
create policy "client inserts own request_materials" on request_materials for insert with check (
  exists (select 1 from requests r where r.id = request_materials.request_id and r.client_id = my_client_id())
);
drop policy if exists "team updates request_materials" on request_materials;
create policy "team updates request_materials" on request_materials for update using (is_team_member());

drop policy if exists "team reads all comments" on request_comments;
create policy "team reads all comments" on request_comments for select using (is_team_member());
drop policy if exists "client reads own comments" on request_comments;
create policy "client reads own comments" on request_comments for select using (
  exists (select 1 from requests r where r.id = request_comments.request_id and r.client_id = my_client_id())
);
drop policy if exists "team inserts comments" on request_comments;
create policy "team inserts comments" on request_comments for insert with check (is_team_member());
drop policy if exists "client inserts own comments" on request_comments;
create policy "client inserts own comments" on request_comments for insert with check (
  exists (select 1 from requests r where r.id = request_comments.request_id and r.client_id = my_client_id())
);

-- ────────────────────────────────────────────────────────────
-- SEED: FLC's three request types
-- ────────────────────────────────────────────────────────────
insert into request_types (label, form_kind, client_id, owner_label)
select 'Event Request', 'event_checklist', c.id, null
from clients c
where c.name = 'Family Life Church'
  and not exists (select 1 from request_types where label = 'Event Request');

insert into request_types (label, form_kind, client_id, owner_label)
select 'New Life Group Submission', 'life_group_new', c.id, 'Doug'
from clients c
where c.name = 'Family Life Church'
  and not exists (select 1 from request_types where label = 'New Life Group Submission');

insert into request_types (label, form_kind, client_id, owner_label)
select 'Amend Life Group Info', 'life_group_amend', c.id, 'Doug'
from clients c
where c.name = 'Family Life Church'
  and not exists (select 1 from request_types where label = 'Amend Life Group Info');

-- ────────────────────────────────────────────────────────────
-- SEED: the FLC event materials checklist, routed per your Anna/Doug split.
-- Edit anytime in Table Editor > event_materials — reassign owner_label,
-- retire an item (active = false), or add a new one.
-- ────────────────────────────────────────────────────────────
insert into event_materials (client_id, label, owner_label, removed_after_event, sort_order)
select c.id, m.label, m.owner_label, m.removed_after_event, m.sort_order
from clients c
cross join (values
  ('Event Webpage', 'Anna', false, 1),
  ('Sermon Presentation', 'Anna', false, 2),
  ('Booklet', 'Anna', false, 3),
  ('Name tags for leaders', 'Anna', false, 4),
  ('Social Media', 'Anna', false, 5),
  ('Social Media Ads', 'Anna', false, 6),
  ('Trifold for table top', 'Doug', false, 7),
  ('Posters for lobby', 'Doug', false, 8),
  ('Video Announcements', 'Doug', false, 9),
  ('Pre/Post Service Scrolling Screen Announcements', 'Doug', false, 10),
  ('Mass Text', 'Doug', false, 11),
  ('Restroom Stall Signs', 'Doug', false, 12),
  ('HTML Blast Email Reminder', 'Doug', false, 13),
  ('Banners', 'Doug', false, 14),
  ('Listed in events on app and online', 'Doug', true, 15)
) as m(label, owner_label, removed_after_event, sort_order)
where c.name = 'Family Life Church'
  and not exists (select 1 from event_materials em where em.label = m.label and em.client_id = c.id);
