-- Volleyball standings run entirely on sets (best-of-3, 15 points a set),
-- not match points like football — this stores each match's per-set score
-- so the Time Table can rank teams by sets won, set ratio, then point
-- ratio, exactly like a real volleyball table.
-- Run once in Supabase SQL Editor. Safe to run more than once.

alter table public.volleyball_matches add column if not exists sets jsonb not null default '[]'::jsonb;
