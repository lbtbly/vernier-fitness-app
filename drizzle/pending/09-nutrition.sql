-- Slice 9, nutrition. The parts drizzle cannot express, in order.
--
-- Everything here is either a rule the database has to hold because a handler
-- can forget it, or an index drizzle has no expression form for. It is written
-- to be applied after the generated migration that creates the tables in
-- src/db/schema.ts, and every statement is idempotent so a re-run is a no-op.
--
-- Nothing in this file drops anything, and nothing in it touches a table
-- another slice owns.

-- ---------------------------------------------------------------------------
-- 1. The four dietary rules, held apart by the database.
--
-- F83 says allergy, intolerance, exclusion and preference are four distinct
-- stored rules and that no query path resolves one as the other. The code keeps
-- them apart by dispatching to four separate functions. This keeps a fifth kind
-- and a mistyped kind out of the column in the first place, so a handler that
-- forgets cannot write a rule nothing knows how to apply.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dietary_rule_kind_is_one_of_four') then
    alter table dietary_rule add constraint dietary_rule_kind_is_one_of_four
      check (kind in ('allergy', 'intolerance', 'exclusion', 'preference'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The nutrient columns are nullable and that is deliberate. What they may
-- not be is negative, and energy may not be a figure no food reaches.
--
-- 900 kcal per 100 g is pure fat plus rounding, and the highest row Anses
-- publishes is 900 for oil. Anything over it arrived from a unit confusion,
-- which the research names as the endemic failure of crowd-sourced food data
-- and which slice 10's barcode lookup will meet head on.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'food_nutrients_are_not_negative') then
    alter table food add constraint food_nutrients_are_not_negative
      check (
        (kcal_100g is null or kcal_100g >= 0) and
        (protein_g is null or protein_g >= 0) and
        (carb_g is null or carb_g >= 0) and
        (fat_g is null or fat_g >= 0) and
        (fibre_g is null or fibre_g >= 0)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'food_energy_is_plausible') then
    alter table food add constraint food_energy_is_plausible
      check (kcal_100g is null or kcal_100g <= 900);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'food_energy_source_is_known') then
    alter table food add constraint food_energy_source_is_known
      check (energy_source is null or energy_source in ('published', 'computed_atwater'));
  end if;
  -- An energy value with no source marker is a number that cannot say where it
  -- came from, which is the one thing this product does not ship.
  if not exists (select 1 from pg_constraint where conname = 'food_energy_carries_its_source') then
    alter table food add constraint food_energy_carries_its_source
      check ((kcal_100g is null) = (energy_source is null));
  end if;
end $$;

-- Name search, lower cased, because the alias layer resolves everyday English
-- to an Anses row by name and drizzle has no expression-index form.
create index if not exists food_name_lower on food (lower(name_fr));

-- ---------------------------------------------------------------------------
-- 3. A recipe carries its name in exactly one place.
--
-- `name_key` for the recipes Vernier ships, because a sentence this product
-- authored is copy with a key wherever it was written, a database column
-- included. `name` for one the owner imports in slice 10, which is his words.
-- Both set, or neither, is a recipe whose name has two answers.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_has_exactly_one_name') then
    alter table recipe add constraint recipe_has_exactly_one_name
      check ((name_key is null) <> (name is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_slot_is_known') then
    alter table recipe add constraint recipe_slot_is_known
      check (slot in ('breakfast', 'lunch', 'dinner', 'snack'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_servings_are_positive') then
    alter table recipe add constraint recipe_servings_are_positive
      check (servings >= 1 and cook_minutes >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The snapshot is append only, enforced by Postgres and not by a handler.
--
-- F87: a changed ingredient-source hash raises a question rather than replacing
-- the stored snapshot. `measurement` next door refuses UPDATE and DELETE
-- outright for the same reason and it is the precedent this follows, with one
-- deliberate difference: superseding a snapshot IS an update, of one column, so
-- the trigger allows `superseded_at` to be set once and refuses every other
-- change. A recompute writes a new version. The old figures stay readable, the
-- old row keeps its hash, and there is no code path anywhere, now or later,
-- that can quietly serve last month's macros as this month's.
create or replace function recipe_nutrition_is_append_only() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'recipe_nutrition is append only: version % of recipe % cannot be deleted',
      old.version, old.recipe_id
      using errcode = 'restrict_violation';
  end if;
  if new.recipe_id is distinct from old.recipe_id
     or new.version is distinct from old.version
     or new.per_serving_kcal is distinct from old.per_serving_kcal
     or new.per_serving_protein_g is distinct from old.per_serving_protein_g
     or new.per_serving_carb_g is distinct from old.per_serving_carb_g
     or new.per_serving_fat_g is distinct from old.per_serving_fat_g
     or new.per_serving_fibre_g is distinct from old.per_serving_fibre_g
     or new.provenance is distinct from old.provenance
     or new.coverage_pct is distinct from old.coverage_pct
     or new.fibre_coverage_pct is distinct from old.fibre_coverage_pct
     or new.source_food_ids_hash is distinct from old.source_food_ids_hash
     or new.computed_at is distinct from old.computed_at then
    raise exception 'recipe_nutrition is append only: recompute recipe % instead of rewriting version %',
      old.recipe_id, old.version
      using errcode = 'restrict_violation';
  end if;
  if old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at then
    raise exception 'version % of recipe % was already superseded at %',
      old.version, old.recipe_id, old.superseded_at
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists recipe_nutrition_no_overwrite on recipe_nutrition;
create trigger recipe_nutrition_no_overwrite
  before update or delete on recipe_nutrition
  for each row execute function recipe_nutrition_is_append_only();

-- Exactly one live snapshot per recipe. Drizzle has no partial unique index.
create unique index if not exists recipe_nutrition_one_current
  on recipe_nutrition (recipe_id) where superseded_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recipe_nutrition_provenance_is_known') then
    alter table recipe_nutrition add constraint recipe_nutrition_provenance_is_known
      check (provenance in (
        'computed_ciqual', 'computed_mixed', 'computed_partial',
        'user_entered', 'ai_estimate', 'label_scan'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipe_nutrition_coverage_is_a_share') then
    alter table recipe_nutrition add constraint recipe_nutrition_coverage_is_a_share
      check (coverage_pct >= 0 and coverage_pct <= 100
             and fibre_coverage_pct >= 0 and fibre_coverage_pct <= 100);
  end if;
end $$;

-- One open question per recipe, so a hash that changes twice does not stack up
-- two identical questions the owner has to answer twice.
create unique index if not exists recipe_question_one_open
  on recipe_question (recipe_id) where state = 'open';

-- ---------------------------------------------------------------------------
-- 5. The target, and the floor that only an explicit confirmation opens.
--
-- F81's middle tier lives here as well as in the route. A target under the
-- floor for this owner's sex with no confirmation timestamp beside it is not a
-- row the database will hold, so there is no handler, now or later, that can
-- write one by forgetting to ask.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_sex_is_known') then
    alter table nutrition_target add constraint nutrition_target_sex_is_known
      check (sex in ('male', 'female'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_pal_is_published') then
    alter table nutrition_target add constraint nutrition_target_pal_is_published
      check (pal >= 1.40 and pal <= 1.90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_hard_floor_is_confirmed') then
    alter table nutrition_target add constraint nutrition_target_hard_floor_is_confirmed
      check (
        kcal_target >= (case when sex = 'male' then 1500 else 1200 end)
        or hard_floor_confirmed_at is not null
      );
  end if;
  -- One percent of body weight a week, or one kilogram, whichever is stricter.
  -- F81 refuses above it and offers the nearest compliant rate instead, and the
  -- refusal is a plan that is never generated rather than a warning on one that
  -- was, so the row cannot exist either.
  if not exists (select 1 from pg_constraint where conname = 'nutrition_target_rate_is_compliant') then
    alter table nutrition_target add constraint nutrition_target_rate_is_compliant
      check (rate_kg_per_week <= least(1.0, weight_kg * 0.01) + 0.0001);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The week and the list.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planned_meal_state_is_known') then
    alter table planned_meal add constraint planned_meal_state_is_known
      check (state in ('proposed', 'accepted', 'edited', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planned_meal_day_is_in_the_week') then
    alter table planned_meal add constraint planned_meal_day_is_in_the_week
      check (day_index >= 0 and day_index <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_unit_is_known') then
    alter table shopping_item add constraint shopping_item_unit_is_known
      check (unit in ('g', 'kg', 'count'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_deduction_is_known') then
    alter table shopping_item add constraint shopping_item_deduction_is_known
      check (deduction in ('none', 'box', 'stock'));
  end if;
  -- F89. A deducted line stays on the list with its original quantity, and a
  -- deducted line is not something you can tick off: it is already covered.
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_deducted_is_not_checked') then
    alter table shopping_item add constraint shopping_item_deducted_is_not_checked
      check (deduction = 'none' or checked = false);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_quantities_are_positive') then
    alter table shopping_item add constraint shopping_item_quantities_are_positive
      check (quantity > 0 and original_quantity > 0 and needed_quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_item_unit_is_known') then
    alter table stock_item add constraint stock_item_unit_is_known
      check (unit in ('g', 'kg', 'count') and quantity > 0);
  end if;
end $$;

-- A count needs the noun it is counted in, because "12" on a shopping list is
-- not an instruction. The noun is a catalogue key and never the word itself.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shopping_item_count_names_its_noun') then
    alter table shopping_item add constraint shopping_item_count_names_its_noun
      check ((unit = 'count') = (count_noun is not null));
  end if;
end $$;
