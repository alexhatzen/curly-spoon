-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent.
-- Simple relational schema for the fishing log, in Postgres.
-- All measurements are metric: weight in kilograms, length in centimeters.

create table if not exists species (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table if not exists locations (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table if not exists catches (
  id          bigint generated always as identity primary key,
  species_id  bigint not null references species(id) on delete cascade,
  location_id bigint references locations(id) on delete set null,
  date        date not null,
  weight_kg   numeric,
  length_cm   numeric,
  bait        text,
  notes       text
);

create index if not exists idx_catches_species  on catches(species_id);
create index if not exists idx_catches_location on catches(location_id);
create index if not exists idx_catches_date     on catches(date);

-- Row Level Security: this is a single-user personal app with no login, so
-- the anon/authenticated roles (what PostgREST uses for all browser
-- requests here) get full read/write on all three tables. Anyone with your
-- Supabase URL + anon key could read/write your catches -- fine for a
-- personal project, but replace these with auth-scoped policies (e.g.
-- filtering on a user_id column) if you ever add real user accounts.
alter table species   enable row level security;
alter table locations enable row level security;
alter table catches   enable row level security;

drop policy if exists "public access species"   on species;
drop policy if exists "public access locations" on locations;
drop policy if exists "public access catches"   on catches;

create policy "public access species"   on species   for all to anon, authenticated using (true) with check (true);
create policy "public access locations" on locations for all to anon, authenticated using (true) with check (true);
create policy "public access catches"   on catches   for all to anon, authenticated using (true) with check (true);
