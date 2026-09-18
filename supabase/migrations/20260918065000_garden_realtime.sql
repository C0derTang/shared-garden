-- Postgres Changes authorizes each row through the existing actual-member RLS.
-- Messages invalidate the UI; current_garden_state remains authoritative.
alter publication supabase_realtime
  add table public.flowers, public.flower_entries, public.flower_unlocks;
-- DELETE cannot apply subscriber RLS. No removal API exists; exclude DELETE and
-- TRUNCATE at the publication boundary, including for custom subscribers.
alter publication supabase_realtime set (publish = 'insert, update');
