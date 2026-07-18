/*
# Create batches schema (single-tenant, no auth)

1. Purpose
   Backend for the FloraTrack nursery app. Stores seed/cutting/transplant
   "batches" and tracks them through their lifecycle (collection -> propagation
   -> growing -> ready -> outplanted). Batches can be split into sub-batches
   while preserving parent lineage via a self-referential parent_id. QR codes
   encode the batch's semantic id (e.g. "2025-09-ACMA-DISC") so a scan can look
   up a batch for editing. Designed to sync to ArcGIS Online later via an edge
   function; no ArcGIS dependency in the schema itself.

2. New Tables
   - batches
       id              text PRIMARY KEY  (semantic id, e.g. "2025-09-ACMA-DISC")
       parent_id       text REFERENCES batches(id) ON DELETE SET NULL
       species         text NOT NULL
       common_name     text NOT NULL
       collection_type text NOT NULL          -- 'Seed' | 'Cutting' | 'Transplant'
       collection_date date NOT NULL
       source_location text NOT NULL
       initial_qty     integer NOT NULL
       current_qty     integer NOT NULL
       status          text NOT NULL DEFAULT 'Collected/Stored'
       nursery_location text NOT NULL DEFAULT 'Intake Area'
       stratification  jsonb NOT NULL DEFAULT '{"method":"","status":"Pending","startDate":""}'::jsonb
       planting        jsonb NOT NULL DEFAULT '{"method":"","soilMix":"","potType":""}'::jsonb
       created_at      timestamptz NOT NULL DEFAULT now()
   - treatments
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
       batch_id    text NOT NULL REFERENCES batches(id) ON DELETE CASCADE
       date        date NOT NULL
       type        text NOT NULL
       notes       text NOT NULL DEFAULT ''
       created_at  timestamptz NOT NULL DEFAULT now()
   - outplantings
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
       batch_id    text NOT NULL REFERENCES batches(id) ON DELETE CASCADE
       date        date NOT NULL
       destination text NOT NULL
       qty         integer NOT NULL
       created_at  timestamptz NOT NULL DEFAULT now()
   - flags
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
       batch_id    text NOT NULL REFERENCES batches(id) ON DELETE CASCADE
       message     text NOT NULL
       created_at  timestamptz NOT NULL DEFAULT now()

3. Indexes
   - batches(parent_id)            for lineage lookups
   - treatments(batch_id)         for per-batch treatment lists
   - outplantings(batch_id)       for per-batch outplanting lists
   - flags(batch_id)              for per-batch flag lists

4. Security
   Single-tenant, no-auth app (no sign-in screen). RLS enabled on every table
   with permissive CRUD policies for anon + authenticated because the data is
   intentionally shared/public within this app. Auth can be added later by
   introducing a user_id column and tightening these policies.

5. Notes
   - Semantic id is the PRIMARY KEY so QR codes can encode it directly and a
     scan maps to a single SELECT ... WHERE id = $1.
   - stratification and planting are stored as jsonb to preserve the existing
     app shape (method/status/startDate and method/soilMix/potType) without
     over-normalizing.
   - All child tables ON DELETE CASCADE so deleting a batch cleans up its
     treatments/outplantings/flags automatically.
*/

CREATE TABLE IF NOT EXISTS batches (
  id text PRIMARY KEY,
  parent_id text REFERENCES batches(id) ON DELETE SET NULL,
  species text NOT NULL,
  common_name text NOT NULL,
  collection_type text NOT NULL,
  collection_date date NOT NULL,
  source_location text NOT NULL,
  initial_qty integer NOT NULL,
  current_qty integer NOT NULL,
  status text NOT NULL DEFAULT 'Collected/Stored',
  nursery_location text NOT NULL DEFAULT 'Intake Area',
  stratification jsonb NOT NULL DEFAULT '{"method":"","status":"Pending","startDate":""}'::jsonb,
  planting jsonb NOT NULL DEFAULT '{"method":"","soilMix":"","potType":""}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outplantings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  date date NOT NULL,
  destination text NOT NULL,
  qty integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batches_parent_id ON batches(parent_id);
CREATE INDEX IF NOT EXISTS idx_treatments_batch_id ON treatments(batch_id);
CREATE INDEX IF NOT EXISTS idx_outplantings_batch_id ON outplantings(batch_id);
CREATE INDEX IF NOT EXISTS idx_flags_batch_id ON flags(batch_id);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outplantings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

-- batches: permissive CRUD (single-tenant, no auth)
DROP POLICY IF EXISTS "anon_select_batches" ON batches;
CREATE POLICY "anon_select_batches" ON batches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_batches" ON batches;
CREATE POLICY "anon_insert_batches" ON batches FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_batches" ON batches;
CREATE POLICY "anon_update_batches" ON batches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_batches" ON batches;
CREATE POLICY "anon_delete_batches" ON batches FOR DELETE
  TO anon, authenticated USING (true);

-- treatments: permissive CRUD
DROP POLICY IF EXISTS "anon_select_treatments" ON treatments;
CREATE POLICY "anon_select_treatments" ON treatments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_treatments" ON treatments;
CREATE POLICY "anon_insert_treatments" ON treatments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_treatments" ON treatments;
CREATE POLICY "anon_update_treatments" ON treatments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_treatments" ON treatments;
CREATE POLICY "anon_delete_treatments" ON treatments FOR DELETE
  TO anon, authenticated USING (true);

-- outplantings: permissive CRUD
DROP POLICY IF EXISTS "anon_select_outplantings" ON outplantings;
CREATE POLICY "anon_select_outplantings" ON outplantings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_outplantings" ON outplantings;
CREATE POLICY "anon_insert_outplantings" ON outplantings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_outplantings" ON outplantings;
CREATE POLICY "anon_update_outplantings" ON outplantings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_outplantings" ON outplantings;
CREATE POLICY "anon_delete_outplantings" ON outplantings FOR DELETE
  TO anon, authenticated USING (true);

-- flags: permissive CRUD
DROP POLICY IF EXISTS "anon_select_flags" ON flags;
CREATE POLICY "anon_select_flags" ON flags FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flags" ON flags;
CREATE POLICY "anon_insert_flags" ON flags FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_flags" ON flags;
CREATE POLICY "anon_update_flags" ON flags FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_flags" ON flags;
CREATE POLICY "anon_delete_flags" ON flags FOR DELETE
  TO anon, authenticated USING (true);
