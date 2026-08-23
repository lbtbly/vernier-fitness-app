-- Slice 13. Backup, restore, export, deletion and the operator console.
--
-- Everything drizzle models is in src/db/schema.ts. What is here is the DDL it
-- cannot express: five check constraints, one partial unique index, and one
-- door through the append-only guarantee.
--
-- Ordered, and idempotent wherever Postgres allows it, so this file can be
-- appended to a numbered migration on merge and applied to a database that has
-- already seen part of it.

-- ---------------------------------------------------------------------------
-- 1. The tokens these columns are allowed to hold.
--
-- Written as constraints rather than as TypeScript unions because a union is a
-- promise the compiler keeps about code it can see, and a database that four
-- scripts and one psql prompt can also write to needs the promise kept where
-- the rows are. This is the shape drizzle/0010_wave_b.sql already uses for
-- job_run.state, followed here.
-- ---------------------------------------------------------------------------

ALTER TABLE "backup_run" DROP CONSTRAINT IF EXISTS "backup_run_outcome_known";
ALTER TABLE "backup_run"
  ADD CONSTRAINT "backup_run_outcome_known"
  CHECK ("outcome" IN ('running', 'ok', 'failed'));

ALTER TABLE "backup_run" DROP CONSTRAINT IF EXISTS "backup_run_destination_known";
ALTER TABLE "backup_run"
  ADD CONSTRAINT "backup_run_destination_known"
  CHECK ("destination" IN ('configured', 'fallback'));

ALTER TABLE "backup_run" DROP CONSTRAINT IF EXISTS "backup_run_integrity_known";
ALTER TABLE "backup_run"
  ADD CONSTRAINT "backup_run_integrity_known"
  CHECK ("integrity" IN ('unchecked', 'verified', 'failed'));

-- A finished run has a file and a size; a running one has neither yet. The
-- constraint is what stops a screen reading "Last backup 42.6 MB" off a row
-- that never got as far as writing anything.
ALTER TABLE "backup_run" DROP CONSTRAINT IF EXISTS "backup_run_ok_is_complete";
ALTER TABLE "backup_run"
  ADD CONSTRAINT "backup_run_ok_is_complete"
  CHECK (
    "outcome" <> 'ok'
    OR ("finished_at" IS NOT NULL AND "file_name" <> '' AND "bytes" > 0 AND "integrity" = 'verified')
  );

ALTER TABLE "restore_check" DROP CONSTRAINT IF EXISTS "restore_check_outcome_known";
ALTER TABLE "restore_check"
  ADD CONSTRAINT "restore_check_outcome_known"
  CHECK ("outcome" IN ('matched', 'mismatched', 'failed'));

ALTER TABLE "operator_alert" DROP CONSTRAINT IF EXISTS "operator_alert_severity_known";
ALTER TABLE "operator_alert"
  ADD CONSTRAINT "operator_alert_severity_known"
  CHECK ("severity" IN ('alert', 'warn'));

-- One action, always, and it is a route in this app. An alert that names no
-- action is a notification that tells the owner something is wrong and leaves
-- him to find it, which is the thing F133 exists to refuse.
ALTER TABLE "operator_alert" DROP CONSTRAINT IF EXISTS "operator_alert_has_an_action";
ALTER TABLE "operator_alert"
  ADD CONSTRAINT "operator_alert_has_an_action"
  CHECK ("route" LIKE '/%');

ALTER TABLE "deletion_run" DROP CONSTRAINT IF EXISTS "deletion_run_outcome_known";
ALTER TABLE "deletion_run"
  ADD CONSTRAINT "deletion_run_outcome_known"
  CHECK ("outcome" IN ('done', 'refused'));

-- ---------------------------------------------------------------------------
-- 2. One OPEN alert per failing thing.
--
-- The partial index is the whole of "one notification, not one per sweep". The
-- sweep runs every five minutes; a backup that has been failing since Tuesday
-- is one row, one push and one banner, and the same failure returning after a
-- repair is a new row because the old one is cleared. A plain unique index on
-- the key would make the second one impossible, which is worse than the noise
-- it prevents.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS "operator_alert_one_open_per_key";
CREATE UNIQUE INDEX "operator_alert_one_open_per_key"
  ON "operator_alert" ("key")
  WHERE "cleared_at" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. The door through the append-only guarantee.
--
-- READ THIS BEFORE CHANGING ANYTHING BELOW IT.
--
-- `measurement`, `health_sample`, `meal_entry`, `meal_entry_item` and
-- `calendar_write` each carry a BEFORE UPDATE OR DELETE trigger that refuses
-- outright. That refusal is the spine of this product: a stored reading is a
-- fact about a moment, and no code path, present or future, may rewrite one.
--
-- There are now exactly THREE ways past it, and all three are written down in
-- docs/backup-restore.md and docs/security.md:
--
--   1. TRUNCATE at a psql prompt on this machine. It fires no row-level
--      trigger, it needs shell access, and the application cannot reach it.
--      That is the owner's own escape hatch and it predates this slice.
--   2. A restore, which REPLACES A WHOLE DATABASE rather than editing rows.
--      scripts/restore.mjs refuses the live database unless the operator types
--      the phrase at the terminal, and it rebuilds into a fresh database
--      otherwise.
--   3. This function, and only for the categories the owner can choose in the
--      interface, and only behind the phrase he types.
--
-- WHAT MAKES IT HARD TO REACH BY ACCIDENT.
--
--   - The phrase is recomputed here from the category and compared. A caller
--     that passes the wrong one gets an exception and no deletion. The screen
--     checks it too; this is the check that holds when the screen is bypassed.
--   - The deny list below cannot be reached at all, whatever a caller asks. The
--     account, the passkeys, the sealed credentials, the audit trail and the
--     migration ledger are not deletable through any category, ever.
--   - Only triggers whose name ends in `_append_only` are disabled, and only
--     for the length of this transaction on the tables being emptied. The
--     blood-pressure refusals stay armed, and so does every foreign key: this
--     function does not touch session_replication_role, so a delete that would
--     orphan a child row is still refused by Postgres.
--   - It returns the counts it removed, per table, so the caller records what
--     happened rather than asserting it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION vernier_delete_category(
  target text,
  phrase text,
  targets text[]
) RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  expected text;
  denied text[] := ARRAY[
    'owner',
    'session',
    'webauthn_credential',
    'webauthn_challenge',
    'recovery_grant',
    'integration_credential',
    'ingest_credential',
    'auth_attempt',
    'app_meta',
    'deletion_run',
    'backup_run',
    'restore_check'
  ];
  one text;
  trigger_name text;
  removed jsonb := '{}'::jsonb;
  taken bigint;
  touched text[] := ARRAY[]::text[];
BEGIN
  IF target IS NULL OR target = '' THEN
    RAISE EXCEPTION 'vernier_delete_category: no category named'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The same two words src/lib/backup/categories.ts builds, rebuilt here so the
  -- screen is not the only thing that knows them.
  expected := 'delete ' || replace(target, '_', ' ');
  IF phrase IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'vernier_delete_category: the typed phrase does not match this category'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF targets IS NULL OR array_length(targets, 1) IS NULL THEN
    RAISE EXCEPTION 'vernier_delete_category: no tables given for %', target
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOREACH one IN ARRAY targets LOOP
    IF one = ANY (denied) THEN
      RAISE EXCEPTION 'vernier_delete_category: % is never deletable through a category', one
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF to_regclass(format('public.%I', one)) IS NULL THEN
      RAISE EXCEPTION 'vernier_delete_category: there is no table %', one
        USING ERRCODE = 'undefined_table';
    END IF;
  END LOOP;

  -- Step past the append-only guarantee, by name, for these tables only.
  FOREACH one IN ARRAY targets LOOP
    FOR trigger_name IN
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = format('public.%I', one)::regclass
        AND NOT tgisinternal
        AND tgname LIKE '%\_append\_only'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', one, trigger_name);
      touched := touched || (one || '.' || trigger_name);
    END LOOP;
  END LOOP;

  -- The caller passes children before parents, so the foreign keys hold
  -- throughout and a mistake in that order is refused by Postgres rather than
  -- worked around here.
  FOREACH one IN ARRAY targets LOOP
    EXECUTE format('DELETE FROM public.%I', one);
    GET DIAGNOSTICS taken = ROW_COUNT;
    removed := removed || jsonb_build_object(one, taken);
  END LOOP;

  -- And put it back. An exception anywhere above rolls the whole transaction
  -- back, ALTER TABLE included, so the guarantee is never left off.
  FOREACH one IN ARRAY targets LOOP
    FOR trigger_name IN
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = format('public.%I', one)::regclass
        AND NOT tgisinternal
        AND tgname LIKE '%\_append\_only'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', one, trigger_name);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'category', target,
    'removed', removed,
    'triggers_stepped_past', to_jsonb(touched)
  );
END;
$function$;

COMMENT ON FUNCTION vernier_delete_category(text, text, text[]) IS
  'The only door through the append-only triggers that the application can open. Behind the typed phrase, never reaching the account, the credentials, the audit trail or the migration ledger, and it names every trigger it stepped past.';
