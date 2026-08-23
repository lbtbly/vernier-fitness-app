-- Slice 12. Push, the weekly review and the Sunday run.
--
-- Everything drizzle can model is in src/db/schema.ts and is generated on merge.
-- What is here is what it cannot say: the state vocabularies as CHECK
-- constraints, the partial index the sweep reads, and the four reminder rows
-- plus the quiet-hours row that a fresh install needs in order to have a
-- settings screen at all.
--
-- Ordered, and idempotent where Postgres allows it. Appended to this slice's
-- generated migration on merge, on main, in order.

-- ---------------------------------------------------------------------------
-- 1. The state vocabularies, enforced by the database rather than by a handler.
--
-- Every one of these columns is read back and rendered through a catalogue key,
-- so a value outside the set is not a bad row, it is a screen with nothing to
-- print. `measurement.source` already carries this treatment in
-- 0003_provenance.sql and this follows it.

ALTER TABLE "reminder_item"
  DROP CONSTRAINT IF EXISTS "reminder_item_category_known";
ALTER TABLE "reminder_item"
  ADD CONSTRAINT "reminder_item_category_known"
  CHECK ("category" IN ('session', 'measurements', 'menu', 'missing_data'));

ALTER TABLE "reminder_item"
  DROP CONSTRAINT IF EXISTS "reminder_item_state_known";
ALTER TABLE "reminder_item"
  ADD CONSTRAINT "reminder_item_state_known"
  CHECK ("state" IN ('pending', 'sent', 'done', 'suppressed', 'expired'));

ALTER TABLE "reminder_setting"
  DROP CONSTRAINT IF EXISTS "reminder_setting_category_known";
ALTER TABLE "reminder_setting"
  ADD CONSTRAINT "reminder_setting_category_known"
  CHECK ("category" IN ('session', 'measurements', 'menu', 'missing_data'));

-- Four hours, and a whole number of minutes. src/lib/reminders.ts states the
-- same bound; this is the one a bad write actually hits.
ALTER TABLE "reminder_setting"
  DROP CONSTRAINT IF EXISTS "reminder_setting_lead_bounded";
ALTER TABLE "reminder_setting"
  ADD CONSTRAINT "reminder_setting_lead_bounded"
  CHECK ("lead_minutes" >= 0 AND "lead_minutes" <= 240);

-- A quiet hour is a 24-hour wall clock and nothing else. Stored as text because
-- 22:00 means 22:00 on both sides of a clock change; this is what stops the
-- text being anything at all.
ALTER TABLE "reminder_preference"
  DROP CONSTRAINT IF EXISTS "reminder_preference_wall_times";
ALTER TABLE "reminder_preference"
  ADD CONSTRAINT "reminder_preference_wall_times"
  CHECK ("quiet_from" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "quiet_to"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "job_run"
  DROP CONSTRAINT IF EXISTS "job_run_state_known";
ALTER TABLE "job_run"
  ADD CONSTRAINT "job_run_state_known"
  CHECK ("state" IN ('running', 'done', 'failed'));

-- THE PERIOD KEY IS A LOCAL CALENDAR KEY AND THE DATABASE SAYS SO.
--
-- `2026-10-25T20:00`. No zone, no offset, no seconds. This is the constraint
-- that makes the October fallback impossible to reintroduce: a key computed by
-- arithmetic on an instant would arrive here as an ISO timestamp with a Z or an
-- offset on the end, and the insert would fail rather than quietly claiming a
-- second period for one Sunday evening.
ALTER TABLE "job_run"
  DROP CONSTRAINT IF EXISTS "job_run_period_is_local";
ALTER TABLE "job_run"
  ADD CONSTRAINT "job_run_period_is_local"
  CHECK ("period_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "weekly_review"
  DROP CONSTRAINT IF EXISTS "weekly_review_email_state_known";
ALTER TABLE "weekly_review"
  ADD CONSTRAINT "weekly_review_email_state_known"
  CHECK ("email_state" IN ('preview', 'sent', 'failed'));

ALTER TABLE "weekly_review"
  DROP CONSTRAINT IF EXISTS "weekly_review_week_is_a_day_key";
ALTER TABLE "weekly_review"
  ADD CONSTRAINT "weekly_review_week_is_a_day_key"
  CHECK ("week_start" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

ALTER TABLE "review_decision"
  DROP CONSTRAINT IF EXISTS "review_decision_block_known";
ALTER TABLE "review_decision"
  ADD CONSTRAINT "review_decision_block_known"
  CHECK ("block" IN ('training', 'nutrition', 'shopping'));

ALTER TABLE "review_decision"
  DROP CONSTRAINT IF EXISTS "review_decision_state_known";
ALTER TABLE "review_decision"
  ADD CONSTRAINT "review_decision_state_known"
  CHECK ("state" IN ('proposed', 'accepted', 'rejected'));

-- A delivery carries a real push-service status, or a zero meaning the request
-- never got one. Never a negative, never something invented.
ALTER TABLE "push_delivery"
  DROP CONSTRAINT IF EXISTS "push_delivery_status_plausible";
ALTER TABLE "push_delivery"
  ADD CONSTRAINT "push_delivery_status_plausible"
  CHECK ("status" >= 0 AND "status" < 600);

-- A subscription endpoint is an absolute HTTPS URL from a push service. A row
-- that is not one is a row nothing can ever be sent to.
ALTER TABLE "push_subscription"
  DROP CONSTRAINT IF EXISTS "push_subscription_endpoint_is_https";
ALTER TABLE "push_subscription"
  ADD CONSTRAINT "push_subscription_endpoint_is_https"
  CHECK ("endpoint" LIKE 'https://%');

-- ---------------------------------------------------------------------------
-- 2. The partial index the five-minute sweep reads.
--
-- The sweep asks one question, 288 times a day, forever: which reminders are
-- still pending and due. Almost every row in this table is 'done' or 'expired'
-- within a week of being written, so the index that matters covers the small
-- live set rather than the whole history.

DROP INDEX IF EXISTS "reminder_item_pending";
CREATE INDEX "reminder_item_pending"
  ON "reminder_item" ("due_at")
  WHERE "state" = 'pending';

-- The same shape for the ledger: the startup sweep looks for runs still marked
-- running, and there is normally exactly one of those or none at all.
DROP INDEX IF EXISTS "job_run_running";
CREATE INDEX "job_run_running"
  ON "job_run" ("claimed_at")
  WHERE "state" = 'running';

-- ---------------------------------------------------------------------------
-- 3. Seed: the four reminder categories and the one quiet-hours row.
--
-- Not a demonstration. A settings screen with no rows on it reads as broken,
-- and the defaults here are the ones src/lib/reminders.ts names:
-- DEFAULT_LEAD_MINUTES and DEFAULT_QUIET_HOURS. Session speaks thirty minutes
-- before; the other three speak when the thing is true.
--
-- ON CONFLICT DO NOTHING, so a second run of this file changes nothing and no
-- setting the owner has already touched is reset by a redeploy.

INSERT INTO "reminder_setting" ("category", "enabled", "lead_minutes")
VALUES
  ('session', true, 30),
  ('measurements', true, 0),
  ('menu', true, 0),
  ('missing_data', true, 0)
ON CONFLICT ("category") DO NOTHING;

INSERT INTO "reminder_preference" ("id", "singleton", "quiet_from", "quiet_to")
VALUES ('quiet-hours', true, '22:00', '07:00')
ON CONFLICT ("singleton") DO NOTHING;
