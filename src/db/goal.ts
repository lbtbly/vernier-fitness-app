import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { goal } from './schema';
import type { Goal } from '@/lib/trend';

/**
 * The weight goal. One row, read here and written here, and nowhere else.
 *
 * The trajectory on every chart is drawn from these four numbers, so a change
 * to them redraws every chart on the next render. That is the whole of F29's
 * "redraws within one page load": there is no cached curve to invalidate,
 * because the curve is arithmetic over two points and is computed at render.
 */

export const GOAL_ID = 'weight';

export type GoalRow = typeof goal.$inferSelect;

export type GoalView = Goal & { id: string; metric: string; seed: boolean; updatedAt: string };

export function toGoalView(row: GoalRow): GoalView {
  return {
    id: row.id,
    metric: row.metric,
    unit: row.unit,
    startValue: row.startValue,
    startAt: row.startAt,
    targetValue: row.targetValue,
    targetAt: row.targetAt,
    seed: row.seed,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readGoal(): Promise<GoalView | null> {
  const db = getDb();
  const [row] = await db.select().from(goal).where(eq(goal.id, GOAL_ID));
  return row ? toGoalView(row) : null;
}

export type GoalWrite = {
  metric: string;
  unit: string;
  startValue: number;
  startAt: Date;
  targetValue: number;
  targetAt: Date;
  seed?: boolean;
};

/**
 * Writes the goal, keeping the start where it is unless the caller moves it.
 *
 * The owner edits a target weight and a target date. Where he started is a fact
 * about the past and the form does not offer it, because a goal whose start
 * moves with every edit is a goal that can be made to look met.
 */
export async function writeGoal(input: GoalWrite): Promise<GoalView> {
  const db = getDb();
  const values = {
    id: GOAL_ID,
    singleton: true,
    metric: input.metric,
    unit: input.unit,
    startValue: input.startValue,
    startAt: input.startAt,
    targetValue: input.targetValue,
    targetAt: input.targetAt,
    updatedAt: new Date(),
    seed: input.seed ?? false,
  };
  const [row] = await db
    .insert(goal)
    .values(values)
    .onConflictDoUpdate({
      target: goal.id,
      set: {
        targetValue: values.targetValue,
        targetAt: values.targetAt,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return toGoalView(row);
}

/**
 * Writes the goal only if there is not one already.
 *
 * What the demonstration seed uses, so a boot never walks over a goal the owner
 * edited. A seed that re-asserted its own target every restart would be the
 * quiet unapproved write the panel named, on the one number the whole chart is
 * measured against.
 */
export async function insertGoalIfAbsent(input: GoalWrite): Promise<boolean> {
  const db = getDb();
  const written = await db
    .insert(goal)
    .values({
      id: GOAL_ID,
      singleton: true,
      metric: input.metric,
      unit: input.unit,
      startValue: input.startValue,
      startAt: input.startAt,
      targetValue: input.targetValue,
      targetAt: input.targetAt,
      seed: input.seed ?? false,
    })
    .onConflictDoNothing({ target: goal.id })
    .returning({ id: goal.id });
  return written.length > 0;
}

/** Only the two fields the form offers. The start is not one of them. */
export async function updateGoalTarget(targetValue: number, targetAt: Date): Promise<GoalView | null> {
  const db = getDb();
  const [row] = await db
    .update(goal)
    .set({ targetValue, targetAt, updatedAt: new Date() })
    .where(eq(goal.id, GOAL_ID))
    .returning();
  return row ? toGoalView(row) : null;
}
