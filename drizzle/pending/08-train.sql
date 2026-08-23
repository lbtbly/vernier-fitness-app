-- Slice 8, Train. The DDL drizzle cannot express, in order, idempotent.
--
-- The tables themselves are in src/db/schema.ts and are generated on merge.
-- What is here is the part a schema builder has no syntax for: check
-- constraints, and one partial unique index. Every statement is guarded so a
-- second run is a no-op, because a migration that fails on re-application is a
-- migration nobody dares run.
--
-- THE FIRST CONSTRAINT IS THE ONE THAT MATTERS. F67 says a media record with a
-- null author is rejected at write. NOT NULL is half of that: it refuses NULL
-- and accepts the empty string, and an empty string is exactly what wger's API
-- returns for 87 of its 365 images, 84 of them under CC BY-SA, which cannot be
-- complied with because there is nobody to attribute. The other half is here.
-- Between them, the infringing aggregator sets cannot enter this database by
-- any path: not through the importer, not through the editorial screen, not
-- through a psql prompt at two in the morning.

-- 1. A media row names its author, or it does not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_author_present') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_author_present CHECK (btrim(author) <> '');
  END IF;
END $$;

-- 2. Two embedding modes and no third. `bundled` is a file this repository
--    serves; `youtube_nocookie` is an iframe the browser fetches for itself.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_mode') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_mode
      CHECK (embedding_mode IN ('bundled', 'youtube_nocookie'));
  END IF;
END $$;

-- 3. AN EMBED HAS NO LOCAL COPY, AT THE DATABASE. Developer Policies III.E
--    forbids downloading, caching or storing copies of YouTube audiovisual
--    content, and forbids making it available for offline playback. A row that
--    is an embed and also names a file on this disk is that violation written
--    down, so the database refuses to hold one. A bundled row must have a path,
--    for the symmetric reason: a bundled record with nothing behind it is a
--    provenance record for a file that does not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_media_local_path') THEN
    ALTER TABLE movement_media
      ADD CONSTRAINT movement_media_local_path
      CHECK (
        (embedding_mode = 'bundled' AND btrim(local_path) <> '')
        OR (embedding_mode = 'youtube_nocookie' AND btrim(local_path) = '')
      );
  END IF;
END $$;

-- 4. A proposal is one of four states. `edited` is still a proposal: it has been
--    moved but not accepted, and nothing is written to the plan until it is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_proposal_state') THEN
    ALTER TABLE session_proposal
      ADD CONSTRAINT session_proposal_state
      CHECK (state IN ('proposed', 'edited', 'accepted', 'rejected'));
  END IF;
END $$;

-- 5. An accepted proposal points at the plan row it created, and a proposal in
--    any other state points at nothing. This is what stops a rejected session
--    leaving a planned session behind it, which would put a session the owner
--    said no to into the adherence denominator.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_proposal_accepted_has_plan') THEN
    ALTER TABLE session_proposal
      ADD CONSTRAINT session_proposal_accepted_has_plan
      CHECK (
        (state = 'accepted' AND planned_session_id IS NOT NULL)
        OR (state <> 'accepted' AND planned_session_id IS NULL)
      );
  END IF;
END $$;

-- 6. A set that was logged was performed: a count is never negative, and a
--    target of zero is a target nobody set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'set_log_counts') THEN
    ALTER TABLE set_log
      ADD CONSTRAINT set_log_counts CHECK (achieved >= 0 AND target > 0 AND set_index >= 0);
  END IF;
END $$;

-- 7. Reps in reserve is 1 to 10 on one question. Zourdos 2016's scale, described
--    in the app's own words; the table itself is copyright NSCA and Wolters
--    Kluwer and is not reproduced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'set_log_rir_band') THEN
    ALTER TABLE set_log
      ADD CONSTRAINT set_log_rir_band CHECK (rir IS NULL OR (rir >= 1 AND rir <= 10));
  END IF;
END $$;

-- 8. Effort is 0 to 10 on the CDC public-domain scale, and pain is 0 to 10 on
--    the visual analogue scale Silbernagel 2007 used. Both are bands with ends,
--    and a value outside one is a unit mistake rather than a strong session.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_report_bands') THEN
    ALTER TABLE session_report
      ADD CONSTRAINT session_report_bands
      CHECK (
        (effort IS NULL OR (effort >= 0 AND effort <= 10))
        AND (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10))
      );
  END IF;
END $$;

-- 9. A progression is proposed, then confirmed or declined. There is no state
--    in which it applied itself.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'progression_proposal_state') THEN
    ALTER TABLE progression_proposal
      ADD CONSTRAINT progression_proposal_state
      CHECK (state IN ('proposed', 'confirmed', 'declined'));
  END IF;
END $$;

-- 10. One open proposal per movement at a time. A partial unique index, because
--     the constraint is on the rows in one state and not on the table: a
--     movement may have a hundred confirmed advancements behind it and exactly
--     one question in front of the owner.
CREATE UNIQUE INDEX IF NOT EXISTS progression_proposal_one_open
  ON progression_proposal (movement_id)
  WHERE state = 'proposed';

-- 11. The screening gate's three outcomes, and there is no fourth. No score, no
--     band, no percentage: ACSM 2015 removed risk-factor profiling deliberately
--     because it "may be overly conservative and unnecessarily refer adults for
--     medical clearance", and a number invented on top of a referral decision
--     would put it straight back.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'readiness_check_outcome') THEN
    ALTER TABLE readiness_check
      ADD CONSTRAINT readiness_check_outcome
      CHECK (outcome IN ('proceed', 'proceedGradually', 'clearanceFirst'));
  END IF;
END $$;
