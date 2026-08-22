import { and, asc, gte, lte } from 'drizzle-orm';
import { getDb } from './client';
import { plannedSession } from './schema';
import type { PlannedSession, SessionState } from '@/lib/trend';

/**
 * Planned sessions, which is the denominator adherence is counted against.
 *
 * Slice 8 owns training. This is the narrow read slice 4 cannot do without:
 * what is on today, and what was planned over the last four weeks. Nothing here
 * proposes, schedules or scores anything.
 */

export type PlannedSessionRow = typeof plannedSession.$inferSelect;

export type SessionView = PlannedSession & {
  title: string;
  place: string;
  cause: string;
  durationMinutes: number;
  seed: boolean;
};

export function toSessionView(row: PlannedSessionRow): SessionView {
  return {
    id: row.id,
    plannedFor: row.plannedFor,
    state: row.state as SessionState,
    title: row.title,
    place: row.place,
    cause: row.cause,
    durationMinutes: row.durationMinutes,
    seed: row.seed,
  };
}

/** Every session planned inside a window, oldest first. */
export async function readSessionsBetween(from: Date, to: Date): Promise<SessionView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(plannedSession)
    .where(and(gte(plannedSession.plannedFor, from), lte(plannedSession.plannedFor, to)))
    .orderBy(asc(plannedSession.plannedFor));
  return rows.map(toSessionView);
}
