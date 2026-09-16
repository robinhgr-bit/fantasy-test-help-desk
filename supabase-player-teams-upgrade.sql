-- Lets football players belong to a team too (volleyball players already
-- did). Combined with team_logos.color (see supabase-team-logos-upgrade.sql)
-- this is what makes a football player's jersey color come from their team
-- instead of a manual per-player color picker, and what makes "Upcoming
-- fixtures" on a player's stats page resolve real opponents.
-- Run once in Supabase SQL Editor. Safe to run more than once.

alter table public.players add column if not exists team_name text;
