import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { demoModeOn } from './demo';
import { sessionProposal, sessionRun, setLog } from './schema';
import { proposeNextWeek, readProposals, upcomingWeekStart, writeAdvancements } from './training';

/**
 * The training demonstration seed. Only under `DEMO_MODE=1`, like every other
 * demonstration row, and marked `seed` on every row it writes.
 *
 * IT SEEDS TWO HISTORIES ON PURPOSE, AND THE PAIR IS THE POINT. F73 wants a
 * proposal over a history that meets the 2-for-2 trigger and no proposal over
 * one that does not, on the same screen, at the same time:
 *
 *   push-up          target 8, last set 10, then target 8, last set 11
 *                    Two sessions, both 2 or more over. It advances.
 *   bodyweight-squat target 10, last set 11, then target 10, last set 12
 *                    One over, then two over. It does NOT advance, because the
 *                    rule is two consecutive sessions and one of them missed.
 *
 * A verifier can read both off `/train` without seeding anything himself: one
 * card, for the push-up, and no card for the squat.
 *
 * It writes no pain report. The repeated-site rule is proven where it can be
 * proven honestly: in the unit suite over both histories, and on the scratch
 * instance by finishing two sessions through the shipped player. Seeding a
 * repeated pain here would block every advancement and hide the pair above.
 */

const PREFIX = 'demo_train_';

type SeededSet = {
  movementId: string;
  target: number;
  achieved: number[];
  loadKg: number | null;
};

/** Two sessions, ten days and three days back, with the same two movements. */
const RUNS: Array<{ slug: string; daysAgo: number; minutes: number; sets: SeededSet[] }> = [
  {
    slug: 'a',
    daysAgo: 10,
    minutes: 35,
    sets: [
      { movementId: 'push-up', target: 8, achieved: [8, 9, 10], loadKg: null },
      { movementId: 'bodyweight-squat', target: 10, achieved: [10, 10, 11], loadKg: null },
      { movementId: 'glute-bridge', target: 10, achieved: [10, 10, 10], loadKg: null },
    ],
  },
  {
    slug: 'b',
    daysAgo: 3,
    minutes: 38,
    sets: [
      { movementId: 'push-up', target: 8, achieved: [9, 10, 11], loadKg: null },
      { movementId: 'bodyweight-squat', target: 10, achieved: [10, 11, 12], loadKg: null },
      { movementId: 'glute-bridge', target: 10, achieved: [10, 10, 11], loadKg: null },
    ],
  },
];

export type TrainingSeed = { ran: boolean; runs: number; sets: number; proposals: number; reason: string };

export async function seedTrainingDemo(timeZone: string): Promise<TrainingSeed> {
  if (!demoModeOn()) {
    return { ran: false, runs: 0, sets: 0, proposals: 0, reason: 'demo mode off' };
  }
  const db = getDb();
  const now = new Date();
  let runs = 0;
  let sets = 0;

  for (const run of RUNS) {
    const id = `${PREFIX}run_${run.slug}`;
    const startedAt = new Date(now.getTime() - run.daysAgo * 86_400_000);
    const finishedAt = new Date(startedAt.getTime() + run.minutes * 60_000);
    const inserted = await db
      .insert(sessionRun)
      .values({
        id,
        proposalId: null,
        plannedSessionId: null,
        startedAt,
        finishedAt,
        state: 'finished',
        screenAwake: true,
        seed: true,
      })
      .onConflictDoNothing({ target: sessionRun.id })
      .returning({ id: sessionRun.id });
    runs += inserted.length;

    for (const entry of run.sets) {
      for (const [index, achieved] of entry.achieved.entries()) {
        const written = await db
          .insert(setLog)
          .values({
            id: `${id}_${entry.movementId}_${index}`,
            runId: id,
            movementId: entry.movementId,
            setIndex: index,
            target: entry.target,
            achieved,
            loadKg: entry.loadKg,
            // Reps in reserve, logged and not prescribed from: the first four
            // weeks are familiarisation, because the error on this answer at a
            // reported 7 is 3.65 reps.
            rir: 8,
            completedAt: new Date(startedAt.getTime() + (index + 1) * 6 * 60_000),
          })
          .onConflictDoNothing({ target: setLog.id })
          .returning({ id: setLog.id });
        sets += written.length;
      }
    }
  }

  // The sweep that finishing a session runs, over the histories just written.
  // Same function, so the demonstration install and a real one produce the same
  // proposal from the same rule.
  if (runs > 0) await writeAdvancements(`${PREFIX}run_b`);

  // A proposed week, worked out by the shipped proposer from the seeded
  // history, so every cause on the screen names an input that is really there.
  const weekStart = upcomingWeekStart(now, timeZone);
  const existing = await readProposals(weekStart);
  let proposals = 0;
  if (existing.length === 0) {
    const result = await proposeNextWeek(now, timeZone);
    proposals = result.written;
    // The proposal rows carry the demonstration marker, like every other row a
    // seed writes, so `where seed` reads the same on this table as it does on
    // the provenance spine.
    for (const row of await readProposals(weekStart)) {
      await db.update(sessionProposal).set({ seed: true }).where(eq(sessionProposal.id, row.id));
    }
  }

  return { ran: true, runs, sets, proposals, reason: '' };
}
