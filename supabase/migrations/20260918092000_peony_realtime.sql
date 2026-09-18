-- Member SELECT policies authorize these invalidations. Reads never change
-- these rows. Plan UPDATE invalidates removed acceptances without publishing
-- DELETE, whose old row cannot be authorized through the same RLS boundary.
alter publication supabase_realtime add table
 public.peony_contributions, public.peony_plans, public.peony_acceptances;
