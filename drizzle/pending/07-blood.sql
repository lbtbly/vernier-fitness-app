-- Slice 7. Blood tests: manual, PDF, and per-row validation.
--
-- This file holds what `drizzle-kit generate` cannot produce from
-- src/db/schema.ts: the check constraints, the append-only trigger for the new
-- review table, and the seed of the thirteen analytes F57 names. The tables and
-- columns themselves are modelled in schema.ts and are generated on main, in
-- order, at merge; nothing here creates a table or a column that drizzle already
-- knows about, so this file runs AFTER the generated migration for this slice.
--
-- Ordered, and idempotent where Postgres allows it. Every statement can be run
-- twice: the constraints are added inside a DO block that checks the catalogue
-- first, and the seed is an upsert. A migration that cannot be re-run is a
-- migration nobody dares re-run.
--
-- NOTHING HERE TOUCHES `measurement`'s EXISTING ROWS. The three columns slice 7
-- adds are nullable, which is what they have to be: a waist measurement has no
-- reference interval and a default of zero would be a claim about a laboratory
-- that never printed one.

-- ---------------------------------------------------------------------------
-- 1. The analyte catalogue's own rules.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- A band that is not a band cannot be caught by a type. `low < high` is the
  -- whole plausibility check every stored value passes through, and an analyte
  -- seeded backwards would accept nothing at all and look like a parser bug.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_band_is_a_band') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_band_is_a_band" CHECK ("low" < "high");
  END IF;

  -- The general reference range, when both bounds are present, has to sit the
  -- right way round too. Either bound may be absent: a sheet prints "below 3.0"
  -- for LDL and inventing a lower bound of zero would be this app writing a
  -- number the laboratory did not.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_reference_is_ordered') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_reference_is_ordered"
      CHECK ("reference_low" IS NULL OR "reference_high" IS NULL OR "reference_low" <= "reference_high");
  END IF;

  -- R2 requires every explanation to cite a public source, and the explanation
  -- is rendered from this column. An analyte with no citation would render a
  -- sentence with a hole in it, so the database refuses the row instead.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_cites_a_source') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_cites_a_source" CHECK ("source_url" LIKE 'http%://%');
  END IF;

  -- The printed-unit table is a list of objects and the conversion arithmetic
  -- reads it without checking. An empty list would mean an analyte no value can
  -- ever be stored against.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_analyte_has_a_printed_unit') THEN
    ALTER TABLE "lab_analyte"
      ADD CONSTRAINT "lab_analyte_has_a_printed_unit"
      CHECK (jsonb_typeof("printed") = 'array' AND jsonb_array_length("printed") > 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The review holding's own rules.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_mode_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_mode_is_named" CHECK ("mode" IN ('text','ocr','manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_state_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_state_is_named" CHECK ("state" IN ('review','validated','abandoned'));
  END IF;

  -- F63. Retention is a decision, not a default, so the column is null until the
  -- question has been asked and holds one of exactly two answers afterwards.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_retention_is_named') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_retention_is_named"
      CHECK ("retention" IS NULL OR "retention" IN ('kept','deleted'));
  END IF;

  -- A deleted file has no path and is marked removed. The two facts are stored
  -- separately because a manually typed panel never had a file at all, so a
  -- null path alone cannot tell "never had one" from "had one and it is gone".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_deleted_has_no_path') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_deleted_has_no_path"
      CHECK ("retention" IS DISTINCT FROM 'deleted' OR ("stored_path" IS NULL AND "file_removed"));
  END IF;

  -- A count of refused lines, never a value and never a label. F60 asks for a
  -- query across every table finding no blood-pressure row, and this is the
  -- column such a row would have lived in.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_refusals_are_a_count') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_refusals_are_a_count" CHECK ("refusals" >= 0);
  END IF;

  -- The holding is an ordered list of candidate rows and every reader indexes
  -- it as one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_document_extraction_is_a_list') THEN
    ALTER TABLE "lab_document"
      ADD CONSTRAINT "lab_document_extraction_is_a_list" CHECK (jsonb_typeof("extraction") = 'array');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. The reference interval on `measurement`, checked the same way the value is.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'measurement_reference_is_ordered') THEN
    ALTER TABLE "measurement"
      ADD CONSTRAINT "measurement_reference_is_ordered"
      CHECK ("reference_low" IS NULL OR "reference_high" IS NULL OR "reference_low" <= "reference_high");
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Blood pressure, refused by the database and not only by the parser.
--
-- The parser drops a blood-pressure line before any row is built, so nothing in
-- the application can write one. This is the second lock, and it is here because
-- F60 asks for a query across EVERY table and because the parser is code that
-- somebody will edit. No analyte may be seeded or added under a name that means
-- blood pressure, and no measurement may be stored under one.
--
-- Matched on the key rather than on the label, because the key is what a writer
-- controls and a label is the owner's own word. The names are the ones a French
-- or English sheet prints.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refuse_blood_pressure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  candidate text;
BEGIN
  candidate := lower(coalesce(NEW.metric, ''));
  IF TG_TABLE_NAME = 'lab_analyte' THEN
    candidate := lower(coalesce(NEW.key, ''));
  END IF;
  IF candidate ~ '(blood_?pressure|tension_?arterielle|pression_?arterielle|systolic|diastolic|systolique|diastolique|mmhg)' THEN
    RAISE EXCEPTION 'blood pressure is refused at extraction and has no field in this database'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS measurement_refuses_blood_pressure ON "measurement";
CREATE TRIGGER measurement_refuses_blood_pressure
  BEFORE INSERT ON "measurement"
  FOR EACH ROW EXECUTE FUNCTION refuse_blood_pressure();

DROP TRIGGER IF EXISTS lab_analyte_refuses_blood_pressure ON "lab_analyte";
CREATE TRIGGER lab_analyte_refuses_blood_pressure
  BEFORE INSERT OR UPDATE ON "lab_analyte"
  FOR EACH ROW EXECUTE FUNCTION refuse_blood_pressure();

-- ---------------------------------------------------------------------------
-- 5. The thirteen F57 names, seeded.
--
-- Generated from `BUILT_IN_ANALYTES` in src/lib/labs.ts, which is where the
-- rules live and where the unit suite grades them. `built_in` is true here and
-- false on everything the owner adds through the interface, and that boolean is
-- what tells the closed-world string check on main which labels are copy this
-- repository wrote and which are the owner's own words.
--
-- The `label` column carries the English name as a fallback for anyone reading
-- this table at a psql prompt. IT IS NOT WHAT THE SCREENS RENDER: `analyteLabel`
-- in src/lib/lab-display.ts reads `strings.metrics[key]` for a built-in analyte,
-- because the name of one of the thirteen is copy and copy has a catalogue key.
-- tests/unit/labs.test.ts fails if any of the thirteen is missing that key, so
-- the fallback below is unreachable rather than merely unlikely.
--
-- Reference ranges are general adult ranges from the cited public source. They
-- are context and never a verdict: nothing in this product reads a stored value
-- against either bound, and every explanation says that the interval printed on
-- the owner's own sheet is the one that belongs with his number.
-- ---------------------------------------------------------------------------

INSERT INTO "lab_analyte"
  ("key", "label", "unit", "printed", "low", "high", "reference_low", "reference_high", "source_url", "aliases", "position", "built_in")
VALUES
  ('fasting_glucose', 'Fasting glucose', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":5.551},{"unit":"mg/dL","factor":0.05551}]'::jsonb, 1, 40, 3.9, 5.5, 'https://medlineplus.gov/lab-tests/', '{"glycemie a jeun","glycemie","glucose a jeun","glucose","fasting glucose"}', 1, true),
  ('hba1c', 'HbA1c', '%', '[{"unit":"%","factor":1}]'::jsonb, 2, 20, 4, 5.6, 'https://medlineplus.gov/lab-tests/', '{"hemoglobine glyquee hba1c","hemoglobine glyquee","hemoglobine a1c","hba1c","a1c"}', 2, true),
  ('total_cholesterol', 'Total cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0.5, 20, NULL, 5, 'https://medlineplus.gov/lab-tests/', '{"cholesterol total","cholesterol totaux","total cholesterol","chol total"}', 3, true),
  ('hdl_cholesterol', 'HDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0.1, 6, 1, NULL, 'https://medlineplus.gov/lab-tests/', '{"cholesterol hdl","hdl cholesterol","hdl"}', 4, true),
  ('ldl_cholesterol', 'LDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0, 30, NULL, 3, 'https://medlineplus.gov/lab-tests/', '{"cholesterol ldl calcule","cholesterol ldl","ldl cholesterol","ldl"}', 5, true),
  ('non_hdl_cholesterol', 'Non-HDL cholesterol', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":2.586},{"unit":"mg/dL","factor":0.02586}]'::jsonb, 0, 20, NULL, 3.8, 'https://medlineplus.gov/lab-tests/', '{"cholesterol non hdl","non hdl cholesterol","non hdl"}', 6, true),
  ('triglycerides', 'Triglycerides', 'mmol/L', '[{"unit":"mmol/L","factor":1},{"unit":"g/L","factor":1.129},{"unit":"mg/dL","factor":0.01129}]'::jsonb, 0.1, 40, NULL, 1.7, 'https://medlineplus.gov/lab-tests/', '{"triglycerides","triglyceride"}', 7, true),
  ('alt', 'ALT', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 10, 40, 'https://medlineplus.gov/lab-tests/', '{"transaminases alat tgp","alat tgp","alat","alt sgpt","sgpt","alt","tgp"}', 8, true),
  ('ast', 'AST', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 10, 40, 'https://medlineplus.gov/lab-tests/', '{"transaminases asat tgo","asat tgo","asat","ast sgot","sgot","ast","tgo"}', 9, true),
  ('ggt', 'GGT', 'U/L', '[{"unit":"U/L","factor":1},{"unit":"IU/L","factor":1},{"unit":"UI/L","factor":1},{"unit":"µkat/L","factor":60}]'::jsonb, 1, 5000, 12, 64, 'https://medlineplus.gov/lab-tests/', '{"gamma glutamyl transferase","gamma gt","g g t","ggt"}', 10, true),
  ('creatinine', 'Creatinine', 'µmol/L', '[{"unit":"µmol/L","factor":1},{"unit":"mg/L","factor":8.84},{"unit":"mg/dL","factor":88.4}]'::jsonb, 10, 2000, 62, 106, 'https://medlineplus.gov/lab-tests/', '{"creatininemie","creatinine serique","creatinine"}', 11, true),
  ('crp', 'C-reactive protein', 'mg/L', '[{"unit":"mg/L","factor":1},{"unit":"mg/dL","factor":10}]'::jsonb, 0, 500, NULL, 5, 'https://medlineplus.gov/lab-tests/', '{"proteine c reactive crp","proteine c reactive","c reactive protein","crp"}', 12, true),
  ('ferritin', 'Ferritin', 'µg/L', '[{"unit":"µg/L","factor":1},{"unit":"ng/mL","factor":1},{"unit":"µg/dL","factor":10}]'::jsonb, 1, 20000, 30, 400, 'https://medlineplus.gov/lab-tests/', '{"ferritinemie","ferritine","ferritin"}', 13, true)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "unit" = EXCLUDED."unit",
  "printed" = EXCLUDED."printed",
  "low" = EXCLUDED."low",
  "high" = EXCLUDED."high",
  "reference_low" = EXCLUDED."reference_low",
  "reference_high" = EXCLUDED."reference_high",
  "source_url" = EXCLUDED."source_url",
  "aliases" = EXCLUDED."aliases",
  "position" = EXCLUDED."position",
  "built_in" = true;
