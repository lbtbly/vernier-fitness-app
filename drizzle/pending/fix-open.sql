-- fix-open. Raw DDL drizzle cannot express, numbered on merge.
--
-- One statement, and it exists because F87 asks a question about mass.
--
-- `recipe_ingredient.alias_id` was NOT NULL, so a recipe box import had nowhere
-- to put a line whose words matched no alias, and `importBoxRecipe` dropped
-- every such line before any of them became a row. Coverage is resolved mass
-- over total mass, and total mass was computed over the lines that survived
-- matching, so it could not fall below the 85 percent threshold F87 names: the
-- branch that renders energy as a range and states the shortfall was
-- unreachable by construction.
--
-- Dropping the constraint lets an unresolved line be stored with its weight and
-- no alias, which puts it in the denominator and out of the numerator. That is
-- what makes coverage mean what the rubric line says it means.
--
-- Idempotent: DROP NOT NULL on a column that is already nullable is a no-op in
-- Postgres, and it is guarded anyway so a re-run prints nothing and changes
-- nothing.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'recipe_ingredient'
      and column_name = 'alias_id'
      and is_nullable = 'NO'
  ) then
    alter table recipe_ingredient alter column alias_id drop not null;
  end if;
end $$;
