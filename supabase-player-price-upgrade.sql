-- Adds a separate "initial price" column to players, distinct from the
-- existing `price` column (which becomes the live/current market price,
-- already used everywhere for squad valuation). Run this once in the
-- Supabase SQL editor.

alter table players add column if not exists initial_price numeric;

-- Backfill: every existing player's initial price starts equal to whatever
-- their price currently is.
update players set initial_price = price where initial_price is null;
