-- Doué Creative Client Portal — database schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query) after creating your project.

-- ────────────────────────────────────────────────────────────
-- CLIENTS: the businesses Doué Creative works with (Next Plumbing, etc.)
-- ────────────────────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- PROFILES: one row per logged-in person (client contact OR team member),
-- linked 1:1 to Supabase's built-in auth.users.
-- ────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('team', 'client')),
  client_id uuid references clients(id) on delete cascade, -- null for team members
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- REQUEST TYPES: the categories a client can pick when filing a request,
-- each with a default owner on your team. Fully editable from the admin dashboard.
-- ────────────────────────────────────────────────────────────
create table request_types (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  default_owner_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- REQUESTS: what a client submits. This is both the client's own request log
-- and your team's shared dashboard.
-- ────────────────────────────────────────────────────────────
create table requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  request_type_id uuid references request_types(id),
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requests_client_id_idx on requests(client_id);
create index requests_assigned_to_idx on requests(assigned_to);

-- keep updated_at current
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger requests_set_updated_at
  before update on requests
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — this is what makes it safe for clients to log in
-- directly: a client can only ever see their OWN rows, enforced by the
-- database itself, not just hidden in the UI.
-- ────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table clients enable row level security;
alter table request_types enable row level security;
alter table requests enable row level security;

-- helper: is the current logged-in user a team member?
create or replace function is_team_member() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'team'
  );
$$ language sql security definer stable;

-- helper: which client_id does the current logged-in user belong to (if any)?
create or replace function my_client_id() returns uuid as $$
  select client_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- profiles: everyone can read their own row; team can read everyone's
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "team reads all profiles" on profiles for select using (is_team_member());

-- clients: team sees all; a client contact sees only their own client row
create policy "team reads all clients" on clients for select using (is_team_member());
create policy "client reads own client" on clients for select using (id = my_client_id());
create policy "team manages clients" on clients for insert with check (is_team_member());
create policy "team updates clients" on clients for update using (is_team_member());

-- request_types: everyone logged in can read them (needed to fill out the form); only team edits
create policy "anyone reads request types" on request_types for select using (auth.uid() is not null);
create policy "team manages request types" on request_types for insert with check (is_team_member());
create policy "team updates request types" on request_types for update using (is_team_member());

-- requests: team sees/updates everything; a client sees and inserts only their own
create policy "team reads all requests" on requests for select using (is_team_member());
create policy "team updates all requests" on requests for update using (is_team_member());
create policy "client reads own requests" on requests for select using (client_id = my_client_id());
create policy "client inserts own requests" on requests for insert with check (client_id = my_client_id());

-- Seed clients — edit these anytime from the admin dashboard too.
insert into clients (name) values
  ('Next Plumbing'), ('Abshire Roofing'), ('GSE Integrated'), ('Cajun AC'), ('Xtreme Insulation');
