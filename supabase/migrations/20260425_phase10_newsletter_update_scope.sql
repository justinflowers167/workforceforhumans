-- Phase 10 §C — narrow newsletter_subscribers UPDATE policy.
--
-- Problem: the prior policy "Subscribers can manage own subscription" used
-- USING (true) AND WITH CHECK (true), letting anyone with the public anon
-- key UPDATE any row — most damaging vector being mass-unsubscribe via
--   db.from('newsletter_subscribers').update({is_active:false}).eq('email','X')
-- using the anon key (baked into the static HTML).
--
-- Constraint: index.html and learn.html both upsert into this table for
-- the subscribe flow (see index.html:557, learn.html:632). PostgREST
-- evaluates BOTH the INSERT and UPDATE policies for an upsert. So we
-- can't drop UPDATE entirely without breaking re-subscribe.
--
-- Compromise (acceptable, materially less permissive, ships in one
-- migration per the Phase 10 plan): keep UPDATE allowed but restrict
-- WITH CHECK so the only legal new state is is_active = true. This
-- preserves re-subscribe (toggle is_active false → true) while blocking
-- the mass-unsubscribe attack.
--
-- Residual surface (acknowledged):
--   - USING (true) is still there because the upsert needs to find the
--     row by email; the advisor will likely still warn on USING (true)
--     for UPDATE. The practical attack surface is much smaller.
--   - First-name and interests can still be overwritten by anyone who
--     knows an email. Cosmetic, low-impact, not the real risk.
--   - Email column itself can still be changed by anyone (RLS doesn't
--     gate columns). Mitigation deferred.
--
-- Phase 10b clean fix (deferred): build an unsubscribe Edge Function with
-- a signed-token URL pattern (token = HMAC of email + timestamp). The
-- Edge Function uses service-role + bypasses RLS. After that lands we
-- can drop the UPDATE policy entirely and require all toggles through
-- the function.

drop policy if exists "Subscribers can manage own subscription"
  on public.newsletter_subscribers;

create policy "Subscribers can resubscribe by email"
  on public.newsletter_subscribers
  for update
  to public
  using (true)
  with check (is_active = true);
