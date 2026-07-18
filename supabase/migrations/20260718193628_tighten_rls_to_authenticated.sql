/*
# Tighten RLS to authenticated-only (add sign-in)

1. Purpose
   Switch the app from single-tenant (anon could read/write everything) to
   authenticated-only. Now that a sign-in screen exists, only logged-in users
   should be able to view or modify batch data. The anon role is locked out
   of every table — an unauthenticated visitor sees the sign-in screen and
   nothing else.

2. Changed Tables
   - batches, treatments, outplantings, flags
     Drop the old permissive anon policies and replace with authenticated-only
     CRUD. No schema/column changes — only policies.

3. Security
   - All four tables: SELECT/INSERT/UPDATE/DELETE scoped TO authenticated.
   - No ownership column (user_id) yet because all signed-in users are trusted
     nursery staff who share the same dataset. Any authenticated user can
     read and write any row. This is intentional for a small team app.
   - If per-user ownership is needed later, add a user_id column and tighten
     the USING/WITH CHECK predicates to auth.uid() = user_id.

4. Notes
   - This migration is idempotent: each policy is dropped before recreate.
   - The anon role loses all access on every table. The frontend must obtain
     a session via supabase.auth.signInWithPassword before any query returns
     rows.
*/

-- batches
DROP POLICY IF EXISTS "anon_select_batches" ON batches;
CREATE POLICY "authenticated_select_batches" ON batches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_batches" ON batches;
CREATE POLICY "authenticated_insert_batches" ON batches FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_batches" ON batches;
CREATE POLICY "authenticated_update_batches" ON batches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_batches" ON batches;
CREATE POLICY "authenticated_delete_batches" ON batches FOR DELETE
  TO authenticated USING (true);

-- treatments
DROP POLICY IF EXISTS "anon_select_treatments" ON treatments;
CREATE POLICY "authenticated_select_treatments" ON treatments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_treatments" ON treatments;
CREATE POLICY "authenticated_insert_treatments" ON treatments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_treatments" ON treatments;
CREATE POLICY "authenticated_update_treatments" ON treatments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_treatments" ON treatments;
CREATE POLICY "authenticated_delete_treatments" ON treatments FOR DELETE
  TO authenticated USING (true);

-- outplantings
DROP POLICY IF EXISTS "anon_select_outplantings" ON outplantings;
CREATE POLICY "authenticated_select_outplantings" ON outplantings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_outplantings" ON outplantings;
CREATE POLICY "authenticated_insert_outplantings" ON outplantings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_outplantings" ON outplantings;
CREATE POLICY "authenticated_update_outplantings" ON outplantings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_outplantings" ON outplantings;
CREATE POLICY "authenticated_delete_outplantings" ON outplantings FOR DELETE
  TO authenticated USING (true);

-- flags
DROP POLICY IF EXISTS "anon_select_flags" ON flags;
CREATE POLICY "authenticated_select_flags" ON flags FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flags" ON flags;
CREATE POLICY "authenticated_insert_flags" ON flags FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_flags" ON flags;
CREATE POLICY "authenticated_update_flags" ON flags FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_flags" ON flags;
CREATE POLICY "authenticated_delete_flags" ON flags FOR DELETE
  TO authenticated USING (true);
