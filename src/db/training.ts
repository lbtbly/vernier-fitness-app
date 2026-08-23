import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from './client';
import {
  movement,
  plannedSession,
  progressionProposal,
  readinessCheck,
  sessionMovement,
  sessionProposal,
  sessionReport,
  sessionRun,
  setLog,
} from './schema';
import { movementOf } from '@/lib/catalogue';
import { longDate, shortDate, time24 } from '@/lib/format';
import { dayAfter, localDayKey, mondayOf, weekdayIndex } from '@/lib/local-time';
import type { ScreeningAnswer } from '@/lib/readiness';
import { screen } from '@/lib/readiness';
import { strings } from '@/lib/strings';
import {
  type Advancement,
  type PainReport,
  type SetResult,
  deloadSets,
  proposeAdvancement,
  repeatedSite,
} from '@/lib/training-rules';
import { type Cause, type ProposedSession, proposeWeek } from '@/lib/week-proposal';

/**
 * Training, at the database.
 *
 * Three rules run through every write in this file and none of them is a
 * convention a later handler could quietly drop:
 *
 * 1. A PROPOSAL IS A ROW, NOT AN ACTION. Nothing here applies a week, advances a
 *    movement or moves a session on its own. Each one is proposed, and the
 *    owner accepts, edits or rejects it one at a time. Rejecting one writes one
 *    row and touches nothing else.
 * 2. THE CAUSE IS RENDERED FROM THE CATALOGUE AND FROZEN. `week-proposal.ts`
 *    returns a key and its data, this file turns it into the sentence and
 *    stores it beside the row, exactly the way `dedup_reason` is stored in the
 *    provenance spine. A screen never re-derives it and a later rule change
 *    never rewrites what the owner was told at the time.
 * 3. NOTHING STORES A RATIO, A SCORE OR A RISK NUMBER. The only comparison this
 *    file makes about session length is the one the evidence supports, and what
 *    it stores is a percentage and the minutes it was measured against.
 */

export type ProposalRow = typeof sessionProposal.$inferSelect;
export type SessionMovementRow = typeof sessionMovement.$inferSelect;

export type MovementInSession = {
  id: string;
  position: number;
  movementId: string;
  sets: number;
  target: number;
  loadKg: number | null;
  restSeconds: number;
  substitutedFor: string | null;
};

export type ProposalView = {
  id: string;
  weekStart: string;
  position: number;
  plannedFor: Date;
  durationMinutes: number;
  kind: string;
  place: string;
  cause: string;
  causeKey: string;
  fullBody: boolean;
  percentLonger: number | null;
  longestMinutes: number | null;
  state: string;
  plannedSessionId: string | null;
  movements: MovementInSession[];
};

/**
 * The Monday the app proposes for: the next one, or today when today is Monday.
 *
 * Screen 06 is titled "Next week" and captioned "Mon 24 to Sun 30 August" from
 * a Sunday evening, which is when this gets used. A session already in the past
 * is not a proposal, so the week never starts behind the owner.
 */
export function upcomingWeekStart(now: Date, timeZone: string): string {
  const today = localDayKey(now, timeZone);
  const index = weekdayIndex(now, timeZone);
  return index === 0 ? today : dayAfter(mondayOf(today, timeZone), 7);
}

function toMovement(row: SessionMovementRow): MovementInSession {
  return {
    id: row.id,
    position: row.position,
    movementId: row.movementId,
    sets: row.sets,
    target: row.target,
    loadKg: row.loadKg,
    restSeconds: row.restSeconds,
    substitutedFor: row.substitutedFor,
  };
}

export async function readProposals(weekStart: string): Promise<ProposalView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessionProposal)
    .where(eq(sessionProposal.weekStart, weekStart))
    .orderBy(asc(sessionProposal.position));
  if (rows.length === 0) return [];
  const movements = await db
    .select()
    .from(sessionMovement)
    .where(inArray(sessionMovement.proposalId, rows.map((row) => row.id)))
    .orderBy(asc(sessionMovement.position));
  return rows.map((row) => ({
    id: row.id,
    weekStart: row.weekStart,
    position: row.position,
    plannedFor: row.plannedFor,
    durationMinutes: row.durationMinutes,
    kind: row.kind,
    place: row.place,
    cause: row.cause,
    causeKey: row.causeKey,
    fullBody: row.fullBody,
    percentLonger: row.percentLonger,
    longestMinutes: row.longestMinutes,
    state: row.state,
    plannedSessionId: row.plannedSessionId,
    movements: movements.filter((entry) => entry.proposalId === row.id).map(toMovement),
  }));
}

export async function readProposal(id: string): Promise<ProposalView | null> {
  const db = getDb();
  const [row] = await db.select().from(sessionProposal).where(eq(sessionProposal.id, id));
  if (!row) return null;
  const movements = await db
    .select()
    .from(sessionMovement)
    .where(eq(sessionMovement.proposalId, id))
    .orderBy(asc(sessionMovement.position));
  return {
    id: row.id,
    weekStart: row.weekStart,
    position: row.position,
    plannedFor: row.plannedFor,
    durationMinutes: row.durationMinutes,
    kind: row.kind,
    place: row.place,
    cause: row.cause,
    causeKey: row.causeKey,
    fullBody: row.fullBody,
    percentLonger: row.percentLonger,
    longestMinutes: row.longestMinutes,
    state: row.state,
    plannedSessionId: row.plannedSessionId,
    movements: movements.map(toMovement),
  };
}

/**
 * The cause, in words. The key comes from the proposer and the data comes with
 * it; this is the only place either becomes a sentence.
 */
export function renderCause(cause: Cause, timeZone: string): string {
  const line = strings.trainWeek.cause;
  switch (cause.key) {
    case 'mostCompletedDay': {
      const weekday = longDate(
        new Date(Date.UTC(2026, 0, 5 + Number(cause.params.weekday), 12)),
        'UTC',
      ).split(' ')[0];
      return line.mostCompletedDay(weekday, Number(cause.params.done), Number(cause.params.weeks));
    }
    case 'spacedFromPrevious':
      return line.spacedFromPrevious(
        Number(cause.params.hours),
        shortDate(new Date(String(cause.params.at)), timeZone),
      );
    case 'lowSteps':
      return line.lowSteps(
        Number(cause.params.lowDays),
        Number(cause.params.ofDays),
        new Intl.NumberFormat('en-GB').format(Number(cause.params.floor)),
      );
    case 'noHistoryYet':
      return line.noHistoryYet(Number(cause.params.sessions));
    case 'weeklyCardio':
      return line.weeklyCardio(Number(cause.params.minutes));
    case 'painDeload':
      return line.painDeload(painSiteLabel(String(cause.params.site)));
    default:
      return line.noHistoryYet(3);
  }
}

const PAIN_SITES = strings.player.painSites as Record<string, string>;

export function painSiteLabel(site: string): string {
  return (PAIN_SITES[site] ?? site).toLowerCase();
}

/** Everything the proposer needs to read, gathered in one round trip each. */
async function proposalInput(now: Date, timeZone: string) {
  const db = getDb();
  const since = new Date(now.getTime() - 60 * 86_400_000);
  const [sessions, runs, reports] = await Promise.all([
    db
      .select()
      .from(plannedSession)
      .where(gte(plannedSession.plannedFor, since))
      .orderBy(asc(plannedSession.plannedFor)),
    db
      .select()
      .from(sessionRun)
      .where(gte(sessionRun.startedAt, since))
      .orderBy(asc(sessionRun.startedAt)),
    db
      .select()
      .from(sessionReport)
      .orderBy(desc(sessionReport.recordedAt))
      .limit(4),
  ]);

  // What each finished run actually loaded, so the 48-hour rule is computed
  // over what was done rather than over what a title said.
  const runIds = runs.map((run) => run.id);
  const sets = runIds.length
    ? await db.select().from(setLog).where(inArray(setLog.runId, runIds))
    : [];

  const musclesByRun = new Map<string, string[]>();
  for (const set of sets) {
    const loaded = musclesByRun.get(set.runId) ?? [];
    for (const muscle of movementOf(set.movementId)?.muscles ?? []) {
      if (!loaded.includes(muscle)) loaded.push(muscle);
    }
    musclesByRun.set(set.runId, loaded);
  }

  const history = [
    ...sessions.map((session) => ({
      at: session.plannedFor,
      minutes: session.durationMinutes,
      completed: session.state === 'completed',
      muscles: [] as string[],
    })),
    ...runs
      .filter((run) => run.finishedAt !== null)
      .map((run) => ({
        at: run.startedAt,
        minutes: Math.max(
          1,
          Math.round(((run.finishedAt as Date).getTime() - run.startedAt.getTime()) / 60_000),
        ),
        completed: true,
        muscles: musclesByRun.get(run.id) ?? [],
      })),
  ];

  const painReports: PainReport[] = reports.map((report) => ({
    at: report.recordedAt,
    sessionId: report.runId,
    site: report.painSite,
    duringScore: report.painScore ?? 0,
    subsidedByMorning: report.painSubsidedByMorning,
  }));

  return { history, repeatedPainSite: repeatedSite(painReports), timeZone };
}

/**
 * Reads the last seven days of stored steps, which is the input the walk is
 * placed on. An absent day is absent: a day with no reading is not a day with
 * zero steps, and counting it as one would be the smoothing this product
 * refuses everywhere else.
 */
async function recentSteps(now: Date): Promise<Array<{ at: Date; value: number }>> {
  const db = getDb();
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db.execute(
    sql`select measured_at, value from measurement
        where metric = 'steps' and value is not null and measured_at >= ${since.toISOString()}
        order by measured_at asc`,
  );
  return rows.rows.map((row) => ({
    at: new Date(String((row as { measured_at: unknown }).measured_at)),
    value: Number((row as { value: unknown }).value),
  }));
}

export type ProposeResult = { weekStart: string; written: number };

/**
 * Proposes a week, replacing any proposal for the same week that has not been
 * decided yet.
 *
 * An ACCEPTED session is never replaced. It is in the plan, Today draws it, and
 * adherence counts it; a re-proposal that took it back would be the app
 * changing a decision the owner made, which is exactly what DESIGN.md section
 * 5's first line forbids. A rejected one is left alone too, so "ask for a
 * different week" does not re-offer what was just turned down.
 */
export async function proposeNextWeek(now: Date, timeZone: string): Promise<ProposeResult> {
  const db = getDb();
  const weekStart = upcomingWeekStart(now, timeZone);
  const input = await proposalInput(now, timeZone);
  const steps = await recentSteps(now);

  const existing = await readProposals(weekStart);
  const decided = new Set(
    existing.filter((row) => row.state === 'accepted' || row.state === 'rejected').map((row) => row.position),
  );
  const undecided = existing.filter((row) => !decided.has(row.position));
  if (undecided.length > 0) {
    await db
      .delete(sessionMovement)
      .where(inArray(sessionMovement.proposalId, undecided.map((row) => row.id)));
    await db
      .delete(sessionProposal)
      .where(inArray(sessionProposal.id, undecided.map((row) => row.id)));
  }

  const proposals: ProposedSession[] = proposeWeek({
    weekStart,
    timeZone,
    history: input.history,
    steps,
    repeatedPainSite: input.repeatedPainSite,
    now,
  });

  let written = 0;
  for (const proposal of proposals) {
    if (decided.has(proposal.index)) continue;
    const id = `prop_${weekStart}_${proposal.index}`;
    await db
      .insert(sessionProposal)
      .values({
        id,
        weekStart,
        position: proposal.index,
        plannedFor: proposal.plannedFor,
        durationMinutes: proposal.durationMinutes,
        kind: proposal.kind,
        place: proposal.place,
        cause: renderCause(proposal.cause, timeZone),
        causeKey: proposal.cause.key,
        fullBody: proposal.fullBody,
        percentLonger: proposal.length?.flagged ? proposal.length.percentLonger : null,
        longestMinutes: proposal.length?.flagged ? proposal.length.longestMinutes : null,
        state: 'proposed',
      })
      .onConflictDoNothing({ target: sessionProposal.id });

    const deload = input.repeatedPainSite !== null;
    for (const [position, movementId] of proposal.movementIds.entries()) {
      const item = movementOf(movementId);
      if (!item) continue;
      await db
        .insert(sessionMovement)
        .values({
          id: `${id}_m${position}`,
          proposalId: id,
          position,
          movementId,
          sets: deload ? deloadSets(item.sets) : item.sets,
          target: item.low,
          loadKg: null,
          restSeconds: item.restSeconds,
          substitutedFor: null,
        })
        .onConflictDoNothing({ target: sessionMovement.id });
    }
    written += 1;
  }

  return { weekStart, written };
}

export type Decision = 'accept' | 'reject';

/**
 * One decision, on one row. The others are not read, not written and not
 * touched, which is the half of F72 a single Accept-the-week control destroys.
 */
export async function decideProposal(id: string, decision: Decision): Promise<ProposalView | null> {
  const db = getDb();
  const proposal = await readProposal(id);
  if (!proposal) return null;

  if (decision === 'reject') {
    // An accepted session that is rejected afterwards takes its plan row with
    // it, or the adherence denominator would count a session the owner said no
    // to. `planned_session` is a plan and not a measurement, so it may be
    // deleted; `measurement` is the table that refuses DELETE, and nothing here
    // touches it.
    if (proposal.plannedSessionId) {
      await db.delete(plannedSession).where(eq(plannedSession.id, proposal.plannedSessionId));
    }
    await db
      .update(sessionProposal)
      .set({ state: 'rejected', decidedAt: new Date(), plannedSessionId: null })
      .where(eq(sessionProposal.id, id));
    return readProposal(id);
  }

  const plannedId = proposal.plannedSessionId ?? `plan_${id}`;
  const kinds = strings.trainWeek.kinds as Record<string, string>;
  const places = strings.trainWeek.places as Record<string, string>;
  await db
    .insert(plannedSession)
    .values({
      id: plannedId,
      plannedFor: proposal.plannedFor,
      durationMinutes: proposal.durationMinutes,
      title: kinds[proposal.kind] ?? proposal.kind,
      place: places[proposal.place] ?? proposal.place,
      cause: proposal.cause,
      state: 'planned',
    })
    .onConflictDoUpdate({
      target: plannedSession.id,
      set: {
        plannedFor: sql`excluded.planned_for`,
        durationMinutes: sql`excluded.duration_minutes`,
        title: sql`excluded.title`,
        place: sql`excluded.place`,
        cause: sql`excluded.cause`,
      },
    });
  await db
    .update(sessionProposal)
    .set({ state: 'accepted', decidedAt: new Date(), plannedSessionId: plannedId })
    .where(eq(sessionProposal.id, id));
  return readProposal(id);
}

export type ProposalEdit = { plannedFor: Date; durationMinutes: number };

/**
 * An edit, which is a correction and not a one-off: the cause is rewritten to
 * say the owner moved it, so a week read back in a month does not claim the app
 * chose this time.
 */
export async function editProposal(
  id: string,
  edit: ProposalEdit,
  timeZone: string,
): Promise<ProposalView | null> {
  const db = getDb();
  const proposal = await readProposal(id);
  if (!proposal) return null;
  const cause = strings.trainWeek.cause.ownEdit(
    `${longDate(edit.plannedFor, timeZone)}, ${time24(edit.plannedFor, timeZone)}`,
  );
  await db
    .update(sessionProposal)
    .set({
      plannedFor: edit.plannedFor,
      durationMinutes: edit.durationMinutes,
      cause,
      causeKey: 'ownEdit',
      state: proposal.state === 'accepted' ? 'accepted' : 'edited',
    })
    .where(eq(sessionProposal.id, id));
  if (proposal.plannedSessionId) {
    await db
      .update(plannedSession)
      .set({ plannedFor: edit.plannedFor, durationMinutes: edit.durationMinutes, cause })
      .where(eq(plannedSession.id, proposal.plannedSessionId));
  }
  return readProposal(id);
}

// ---------------------------------------------------------------------------
// Running a session.

export type RunView = {
  id: string;
  proposalId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  state: string;
  screenAwake: boolean;
  sets: Array<{
    movementId: string;
    setIndex: number;
    target: number;
    achieved: number;
    loadKg: number | null;
    rir: number | null;
    completedAt: Date;
  }>;
};

export async function readRun(id: string): Promise<RunView | null> {
  const db = getDb();
  const [row] = await db.select().from(sessionRun).where(eq(sessionRun.id, id));
  if (!row) return null;
  const sets = await db.select().from(setLog).where(eq(setLog.runId, id)).orderBy(asc(setLog.completedAt));
  return {
    id: row.id,
    proposalId: row.proposalId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    state: row.state,
    screenAwake: row.screenAwake,
    sets: sets.map((set) => ({
      movementId: set.movementId,
      setIndex: set.setIndex,
      target: set.target,
      achieved: set.achieved,
      loadKg: set.loadKg,
      rir: set.rir,
      completedAt: set.completedAt,
    })),
  };
}

export async function startRun(input: {
  id: string;
  proposalId: string;
  startedAt: Date;
  screenAwake: boolean;
}): Promise<RunView | null> {
  const db = getDb();
  const proposal = await readProposal(input.proposalId);
  if (!proposal) return null;
  await db
    .insert(sessionRun)
    .values({
      id: input.id,
      proposalId: input.proposalId,
      plannedSessionId: proposal.plannedSessionId,
      startedAt: input.startedAt,
      screenAwake: input.screenAwake,
      state: 'running',
    })
    .onConflictDoNothing({ target: sessionRun.id });
  return readRun(input.id);
}

export type SetWrite = {
  runId: string;
  movementId: string;
  setIndex: number;
  target: number;
  achieved: number;
  loadKg: number | null;
  rir: number | null;
  completedAt: Date;
};

export async function logSet(write: SetWrite): Promise<void> {
  const db = getDb();
  await db
    .insert(setLog)
    .values({
      id: `${write.runId}_${write.movementId}_${write.setIndex}`,
      runId: write.runId,
      movementId: write.movementId,
      setIndex: write.setIndex,
      target: write.target,
      achieved: write.achieved,
      loadKg: write.loadKg,
      rir: write.rir,
      completedAt: write.completedAt,
    })
    .onConflictDoNothing({ target: setLog.id });
}

export type ReportWrite = {
  runId: string;
  finishedAt: Date;
  effortScale: string;
  effort: number | null;
  painSite: string;
  painScore: number | null;
  painSubsidedByMorning: boolean | null;
  note: string;
};

/**
 * Finishing a session, which is also where the next week's proposals are
 * worked out. Two of them, and both are proposals:
 *
 * - The 2-for-2 trigger, per movement, over the sets this run and the ones
 *   before it. It writes a row in `progression_proposal` and changes nothing.
 * - The pain rule. The same site twice running blocks every advancement on that
 *   movement and cuts its volume next time, which is the one automatic action
 *   in this product and it only ever backs off.
 */
export async function finishRun(write: ReportWrite): Promise<{ advancements: Advancement[] }> {
  const db = getDb();
  await db
    .update(sessionRun)
    .set({ finishedAt: write.finishedAt, state: 'finished' })
    .where(eq(sessionRun.id, write.runId));
  await db
    .insert(sessionReport)
    .values({
      id: `report_${write.runId}`,
      runId: write.runId,
      effortScale: write.effortScale,
      effort: write.effort,
      painSite: write.painSite,
      painScore: write.painScore,
      painSubsidedByMorning: write.painSubsidedByMorning,
      note: write.note,
      recordedAt: write.finishedAt,
    })
    .onConflictDoNothing({ target: sessionReport.id });

  return { advancements: await writeAdvancements(write.runId) };
}

/**
 * The 2-for-2 sweep, over every movement with history behind it.
 *
 * It is a function of its own because two callers need exactly this and neither
 * may have its own copy: finishing a session runs it, and the demonstration
 * seed runs it after writing the histories that trigger it. A second
 * implementation of a rule is a second rule.
 *
 * NOTHING IS APPLIED. Each one becomes a row in `progression_proposal` in the
 * `proposed` state, and only the owner confirming it on the card that showed it
 * to him turns it into a changed target.
 */
export async function writeAdvancements(runId: string): Promise<Advancement[]> {
  const db = getDb();
  const history = await readSetHistory(180);
  const reports = await readPainReports(4);
  const blockedSite = repeatedSite(reports);
  const movementIds = [...new Set(history.map((set) => set.movementId))];
  const advancements: Advancement[] = [];

  for (const movementId of movementIds) {
    const item = movementOf(movementId);
    if (!item) continue;
    // Nothing advances on a movement that loads the site reported twice
    // running. It deloads instead, which the next proposal reads.
    if (blockedSite && blockedSite !== 'none') continue;
    const advancement = proposeAdvancement(history, movementId);
    if (!advancement) continue;
    advancements.push(advancement);
    await db
      .insert(progressionProposal)
      .values({
        id: `adv_${movementId}_${runId}`,
        movementId,
        lever: advancement.lever,
        fromLoadKg: advancement.fromLoadKg,
        toLoadKg: advancement.toLoadKg,
        fromTarget: advancement.fromTarget,
        toTarget: advancement.toTarget,
        toMovementId: advancement.toMovementId,
        state: 'proposed',
        trigger: advancement.triggeredBy.map((entry) => ({
          sessionId: entry.sessionId,
          at: entry.at.toISOString(),
          target: entry.target,
          achieved: entry.achieved,
        })),
      })
      .onConflictDoNothing();
  }

  return advancements;
}

/** Every set logged in a window, oldest first, as the rules module wants them. */
export async function readSetHistory(days: number): Promise<SetResult[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(setLog)
    .where(gte(setLog.completedAt, since))
    .orderBy(asc(setLog.completedAt));
  return rows.map((row) => ({
    sessionId: row.runId,
    at: row.completedAt,
    movementId: row.movementId,
    setIndex: row.setIndex,
    target: row.target,
    achieved: row.achieved,
    loadKg: row.loadKg,
    rir: row.rir,
  }));
}

export async function readPainReports(limit: number): Promise<PainReport[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessionReport)
    .orderBy(desc(sessionReport.recordedAt))
    .limit(limit);
  return rows
    .map((row) => ({
      at: row.recordedAt,
      sessionId: row.runId,
      site: row.painSite,
      duringScore: row.painScore ?? 0,
      subsidedByMorning: row.painSubsidedByMorning,
    }))
    .reverse();
}

/**
 * What this movement did last time, for the line that renders inside the open
 * set. It is read once with the session and handed to the player, so nothing
 * navigates and nothing fetches mid-set: the phone in a basement gym has no
 * route home and the number has to already be there.
 */
export type LastPerformance = {
  movementId: string;
  at: Date;
  sets: number;
  achieved: number;
  loadKg: number | null;
  rir: number | null;
};

export async function readLastPerformance(movementIds: string[]): Promise<LastPerformance[]> {
  if (movementIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(setLog)
    .where(inArray(setLog.movementId, movementIds))
    .orderBy(desc(setLog.completedAt));
  const seen = new Map<string, LastPerformance>();
  for (const row of rows) {
    const held = seen.get(row.movementId);
    if (held) {
      // Same session as the one already taken: count the set and keep the best
      // achieved figure, so "3 x 12" is three sets and not three rows.
      if (Math.abs(held.at.getTime() - row.completedAt.getTime()) < 4 * 3_600_000) {
        held.sets += 1;
        held.achieved = Math.max(held.achieved, row.achieved);
      }
      continue;
    }
    seen.set(row.movementId, {
      movementId: row.movementId,
      at: row.completedAt,
      sets: 1,
      achieved: row.achieved,
      loadKg: row.loadKg,
      rir: row.rir,
    });
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Progression and screening.

export type ProgressionView = {
  id: string;
  movementId: string;
  lever: string;
  fromLoadKg: number | null;
  toLoadKg: number | null;
  fromTarget: number;
  toTarget: number;
  toMovementId: string | null;
  state: string;
  trigger: Array<{ sessionId: string; at: string; target: number; achieved: number }>;
  proposedAt: Date;
  decidedAt: Date | null;
};

export async function readProgressions(state: string): Promise<ProgressionView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(progressionProposal)
    .where(eq(progressionProposal.state, state))
    .orderBy(desc(progressionProposal.proposedAt));
  return rows.map((row) => ({
    id: row.id,
    movementId: row.movementId,
    lever: row.lever,
    fromLoadKg: row.fromLoadKg,
    toLoadKg: row.toLoadKg,
    fromTarget: row.fromTarget,
    toTarget: row.toTarget,
    toMovementId: row.toMovementId,
    state: row.state,
    trigger: row.trigger as ProgressionView['trigger'],
    proposedAt: row.proposedAt,
    decidedAt: row.decidedAt,
  }));
}

/**
 * Confirming an advancement, which is the only path that changes what the
 * player will ask for. It writes the new target into every proposal for the
 * upcoming week that has not been run yet, and it never touches a session that
 * has already happened.
 */
export async function decideProgression(
  id: string,
  decision: 'confirm' | 'decline',
): Promise<ProgressionView | null> {
  const db = getDb();
  const [row] = await db.select().from(progressionProposal).where(eq(progressionProposal.id, id));
  if (!row) return null;
  await db
    .update(progressionProposal)
    .set({ state: decision === 'confirm' ? 'confirmed' : 'declined', decidedAt: new Date() })
    .where(eq(progressionProposal.id, id));

  if (decision === 'confirm') {
    const open = await db
      .select({ id: sessionProposal.id })
      .from(sessionProposal)
      .where(inArray(sessionProposal.state, ['proposed', 'edited', 'accepted']));
    if (open.length > 0) {
      await db
        .update(sessionMovement)
        .set({
          target: row.toTarget,
          loadKg: row.toLoadKg,
          movementId: row.toMovementId ?? row.movementId,
        })
        .where(
          and(
            eq(sessionMovement.movementId, row.movementId),
            inArray(sessionMovement.proposalId, open.map((entry) => entry.id)),
          ),
        );
    }
  }

  const [after] = await db.select().from(progressionProposal).where(eq(progressionProposal.id, id));
  return after
    ? {
        id: after.id,
        movementId: after.movementId,
        lever: after.lever,
        fromLoadKg: after.fromLoadKg,
        toLoadKg: after.toLoadKg,
        fromTarget: after.fromTarget,
        toTarget: after.toTarget,
        toMovementId: after.toMovementId,
        state: after.state,
        trigger: after.trigger as ProgressionView['trigger'],
        proposedAt: after.proposedAt,
        decidedAt: after.decidedAt,
      }
    : null;
}

export type ReadinessView = {
  id: string;
  activity: string;
  knownDisease: boolean;
  symptoms: string[];
  desiredIntensity: string;
  outcome: string;
  because: string;
  answeredAt: Date;
};

export async function readLatestReadiness(): Promise<ReadinessView | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(readinessCheck)
    .orderBy(desc(readinessCheck.answeredAt))
    .limit(1);
  return row
    ? {
        id: row.id,
        activity: row.activity,
        knownDisease: row.knownDisease,
        symptoms: row.symptoms,
        desiredIntensity: row.desiredIntensity,
        outcome: row.outcome,
        because: row.because,
        answeredAt: row.answeredAt,
      }
    : null;
}

export async function answerReadiness(answer: ScreeningAnswer): Promise<ReadinessView | null> {
  const db = getDb();
  const result = screen(answer);
  const id = `readiness_${Date.now()}`;
  await db.insert(readinessCheck).values({
    id,
    activity: answer.activity,
    knownDisease: answer.knownDisease,
    symptoms: [...answer.symptoms],
    desiredIntensity: answer.desiredIntensity,
    outcome: result.outcome,
    because: result.because,
  });
  return readLatestReadiness();
}

/**
 * The resting heart rate the intensity bands are anchored to, or null.
 *
 * Null is a real answer and it changes which method is used rather than
 * substituting a default: percent heart-rate reserve when the reading exists,
 * percent maximum when it does not, and never both on one screen.
 */
export async function readRestingHeartRate(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute(
    sql`select value from measurement
        where metric = 'resting_heart_rate' and value is not null
        order by measured_at desc limit 1`,
  );
  const value = rows.rows[0] as { value: unknown } | undefined;
  return value ? Number(value.value) : null;
}

/** How many movements and how much media the catalogue holds right now. */
export async function countCatalogue(): Promise<{ movements: number }> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(movement);
  return { movements: Number(row?.count ?? 0) };
}
