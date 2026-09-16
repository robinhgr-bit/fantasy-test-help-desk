-- Team registry: logos for the Time Table (football + volleyball
-- fixtures/standings) and per-team jersey colors (volleyball players pick a
-- team here instead of a manual color).
-- Run once in Supabase SQL Editor. Safe to run more than once.

create table if not exists public.team_logos (
  sport      text not null check (sport in ('football', 'volleyball')),
  team_name  text not null,
  logo_url   text,
  color      text,
  updated_at timestamptz not null default now(),
  primary key (sport, team_name)
);
alter table public.team_logos add column if not exists color text;

alter table public.team_logos enable row level security;

drop policy if exists "public access team_logos" on public.team_logos;
create policy "public access team_logos" on public.team_logos for all using (true) with check (true);

-- Reuses the same public "media" bucket the ad/news image uploader already
-- created — no extra storage setup needed if you've already run
-- supabase-content-upgrade.sql.
