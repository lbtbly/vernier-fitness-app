import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { getDb } from './client';
import {
  calendarBusy,
  calendarPlan,
  calendarPlanRow,
  calendarReadFailure,
  calendarWrite,
  googleConnection,
  googleDemoEvent,
  integrationCredential,
  plannedSession,
} from './schema';
import { openSecret, sealSecret } from '@/lib/master-key';
import type { BusyInterval, CalendarFailure } from '@/lib/google/availability';
import type { TokenBundle } from '@/lib/google/client';
import type { DemoEvent, DemoStore } from '@/lib/google/demo-dataset';
import type { GoogleMode } from '@/lib/google/mode';
import { SCOPE_PARAM } from '@/lib/google/scopes';
import type { WriteSiteId } from '@/lib/google/write-sites';
import { strings } from '@/lib/strings';

/**
 * The calendar's storage layer.
 *
 * THREE RULES RUN THROUGH IT and none of them is a convention a later handler
 * could drop:
 *
 * 1. THE TOKEN IS NOT IN A COLUMN A SCREEN CAN READ. It is sealed with the
 *    master key in `integration_credential` under `google_calendar`, and
 *    `describeGoogle()` is deliberately the only shape the screens receive.
 * 2. A PLAN IS A ROW AND AN APPLY IS A TRANSITION. Nothing writes to Google
 *    without a stored plan row, and a row that was not ticked ends `skipped`
 *    with no write identifier on it.
 * 3. THE WRITE LOG IS APPENDED TO AND NEVER EDITED. A trigger enforces it; this
 *    file never tries. Undo appends a row that names the write it reverses.
 */

export const GOOGLE_PROVIDER = 'google_calendar';
export const CONNECTION_ID = 'google_calendar';

export type GoogleState = 'disconnected' | 'connecting' | 'connected' | 'revoked' | 'demo';

/** Why the last attempt did not work. A token; `src/lib/display.ts` finds the words. */
export type GoogleCause = keyof typeof strings.calendar.causes;

export type ConnectionRow = typeof googleConnection.$inferSelect;
export type PlanRowRecord = typeof calendarPlanRow.$inferSelect;
export type WriteRecord = typeof calendarWrite.$inferSelect;

/**
 * A deterministic identifier, uuid shaped, derived from what it names. The same
 * function slice 5 uses, for the same reason: a row that names one thing has one
 * id, on this machine and on a restored backup.
 */
export function deterministicId(namespace: string, key: string): string {
  const digest = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  const variant = ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

// --------------------------------------------------------------------------
// The connection row.

export async function readConnection(): Promise<ConnectionRow | null> {
  const db = getDb();
  const [row] = await db.select().from(googleConnection).where(eq(googleConnection.id, CONNECTION_ID));
  return row ?? null;
}

export async function ensureConnection(mode: GoogleMode): Promise<ConnectionRow> {
  const db = getDb();
  await db
    .insert(googleConnection)
    .values({ id: CONNECTION_ID, mode, state: 'disconnected' })
    .onConflictDoNothing({ target: googleConnection.id });
  const row = await readConnection();
  if (row && row.mode !== mode) {
    await db
      .update(googleConnection)
      .set({ mode, updatedAt: new Date() })
      .where(eq(googleConnection.id, CONNECTION_ID));
    return { ...row, mode };
  }
  return row!;
}

export async function updateConnection(patch: Partial<ConnectionRow>): Promise<void> {
  const db = getDb();
  await db
    .update(googleConnection)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(googleConnection.id, CONNECTION_ID));
}

/** A failure that is not permanent: recorded, and the connection stays as it is. */
export async function recordFailure(kind: GoogleCause, raw: string | null): Promise<void> {
  await updateConnection({ lastErrorKind: kind, lastErrorRaw: raw, lastErrorAt: new Date() });
}

/**
 * THE PERMANENT REFUSAL, in one transaction.
 *
 * The stored token is deleted, the connection is marked disconnected with the
 * instant and the raw body Google answered with, and background reads are
 * stopped. Nothing is retried. Everything F109 asks for happens here or it does
 * not happen at all, which is why it is one write rather than four.
 */
export async function disconnectPermanently(input: {
  kind: GoogleCause;
  raw: string;
  at: Date;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(integrationCredential).where(eq(integrationCredential.provider, GOOGLE_PROVIDER));
    await tx
      .update(googleConnection)
      .set({
        state: 'revoked',
        disconnectedAt: input.at,
        lastErrorKind: input.kind,
        lastErrorRaw: input.raw,
        lastErrorAt: input.at,
        backgroundSyncStopped: true,
        authStateHash: null,
        authStateIssuedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(googleConnection.id, CONNECTION_ID));
  });
}

/** Forget the credential by the owner's own choice. The calendar is left alone. */
export async function forgetConnection(): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(integrationCredential).where(eq(integrationCredential.provider, GOOGLE_PROVIDER));
    await tx
      .update(googleConnection)
      .set({
        state: 'disconnected',
        disconnectedAt: new Date(),
        authStateHash: null,
        authStateIssuedAt: null,
        lastErrorKind: null,
        lastErrorRaw: null,
        backgroundSyncStopped: false,
        updatedAt: new Date(),
      })
      .where(eq(googleConnection.id, CONNECTION_ID));
  });
}

// --------------------------------------------------------------------------
// The token bundle, sealed.

export async function readTokens(): Promise<TokenBundle | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(integrationCredential)
    .where(eq(integrationCredential.provider, GOOGLE_PROVIDER));
  if (!row || !row.secretCiphertext || !row.secretNonce || !row.secretTag) return null;
  const plain = openSecret(
    {
      ciphertext: row.secretCiphertext,
      nonce: row.secretNonce,
      tag: row.secretTag,
      keyFingerprint: row.keyFingerprint ?? '',
    },
    GOOGLE_PROVIDER,
  );
  try {
    return JSON.parse(plain) as TokenBundle;
  } catch {
    return null;
  }
}

/**
 * The bundle, sealed and written.
 *
 * Called from inside the callback handler BEFORE it returns, because Google
 * hands over a refresh token exactly once and a handler that answered first and
 * stored afterwards would lose it to any crash between the two.
 */
export async function storeTokens(next: TokenBundle): Promise<void> {
  const db = getDb();
  const sealed = sealSecret(JSON.stringify(next), GOOGLE_PROVIDER);
  const values = {
    provider: GOOGLE_PROVIDER,
    state: 'connected',
    scope: next.scope || SCOPE_PARAM,
    secretCiphertext: sealed.ciphertext,
    secretNonce: sealed.nonce,
    secretTag: sealed.tag,
    keyFingerprint: sealed.keyFingerprint,
    lastError: null,
    updatedAt: new Date(),
  };
  await db
    .insert(integrationCredential)
    .values(values)
    .onConflictDoUpdate({ target: integrationCredential.provider, set: values });
}

// --------------------------------------------------------------------------
// Availability: the last successful read, kept so a week can still be proposed.

export type StoredAvailability = {
  busy: BusyInterval[];
  failures: CalendarFailure[];
  readAt: Date | null;
};

/**
 * Replace the stored availability with what was just read, in one transaction.
 *
 * A cache and not provenance, so it is replaced rather than appended to. The
 * transaction matters anyway: a half-written availability would leave busy
 * intervals from one read beside failures from another, and the diff would place
 * sessions against a picture that was never true at any single moment.
 */
export async function storeAvailability(
  reading: { busy: BusyInterval[]; failures: CalendarFailure[] },
  readAt: Date,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(calendarBusy);
    await tx.delete(calendarReadFailure);
    if (reading.busy.length > 0) {
      await tx.insert(calendarBusy).values(
        reading.busy.map((interval, index) => ({
          id: deterministicId('calendar.busy', `${readAt.toISOString()}:${index}:${interval.calendarId}:${interval.start}`),
          calendarId: interval.calendarId,
          startAt: new Date(interval.start),
          endAt: new Date(interval.end),
          readAt,
        })),
      );
    }
    if (reading.failures.length > 0) {
      await tx.insert(calendarReadFailure).values(
        reading.failures.map((failure, index) => ({
          id: deterministicId('calendar.failure', `${readAt.toISOString()}:${index}:${failure.calendarId}`),
          calendarId: failure.calendarId,
          reason: failure.reason,
          detail: failure.detail,
          readAt,
        })),
      );
    }
    await tx
      .update(googleConnection)
      .set({ lastAvailabilityAt: readAt, updatedAt: new Date() })
      .where(eq(googleConnection.id, CONNECTION_ID));
  });
}

export async function readAvailability(): Promise<StoredAvailability> {
  const db = getDb();
  const [busy, failures, connection] = await Promise.all([
    db.select().from(calendarBusy).orderBy(asc(calendarBusy.startAt)),
    db.select().from(calendarReadFailure).orderBy(asc(calendarReadFailure.calendarId)),
    readConnection(),
  ]);
  return {
    busy: busy.map((row) => ({
      calendarId: row.calendarId,
      start: row.startAt.toISOString(),
      end: row.endAt.toISOString(),
    })),
    failures: failures.map((row) => ({
      calendarId: row.calendarId,
      reason: row.reason,
      detail: row.detail,
    })),
    readAt: connection?.lastAvailabilityAt ?? null,
  };
}

// --------------------------------------------------------------------------
// The sessions the plan is built from.

/**
 * Every session planned inside the window, which is what the calendar is meant
 * to hold.
 *
 * `planned_session` rows in state `planned`, and no other state: a completed
 * session is history and a missed one is not going to happen, and neither
 * belongs in a calendar the owner opens to see what is next.
 */
export async function readPlannedSessions(from: Date, to: Date) {
  const db = getDb();
  return db
    .select()
    .from(plannedSession)
    .where(
      and(
        gte(plannedSession.plannedFor, from),
        lte(plannedSession.plannedFor, to),
        eq(plannedSession.state, 'planned'),
      ),
    )
    .orderBy(asc(plannedSession.plannedFor));
}

// --------------------------------------------------------------------------
// Plans and their rows.

export type StoredPlan = {
  plan: typeof calendarPlan.$inferSelect;
  rows: PlanRowRecord[];
};

export type NewPlan = {
  windowFrom: Date;
  windowTo: Date;
  mode: string;
  calendarId: string;
  availabilityAt: Date | null;
  availabilityStale: boolean;
  failures: number;
  beforeEvents: Array<{ eventId: string; title: string; start: string; end: string }>;
  totalChanges: number;
  heldBack: number;
  rows: Array<{
    verb: string;
    site: WriteSiteId;
    sessionId: string | null;
    eventId: string;
    title: string;
    beforeStart: Date | null;
    beforeEnd: Date | null;
    afterStart: Date | null;
    afterEnd: Date | null;
    cause: string;
    causeKey: string;
    defaultSelected: boolean;
  }>;
};

/**
 * Store a plan and supersede whatever was open before it.
 *
 * One open plan at a time, because two would let the owner confirm a screen
 * built before a change he has since made. The superseded one stays in the
 * database: it is the record of what he was shown and did not apply.
 */
export async function storePlan(input: NewPlan): Promise<StoredPlan> {
  const db = getDb();
  const planId = `plan_${randomUUID()}`;
  return db.transaction(async (tx) => {
    await tx
      .update(calendarPlan)
      .set({ state: 'superseded' })
      .where(eq(calendarPlan.state, 'open'));

    const [plan] = await tx
      .insert(calendarPlan)
      .values({
        id: planId,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
        mode: input.mode,
        calendarId: input.calendarId,
        state: 'open',
        availabilityAt: input.availabilityAt,
        availabilityStale: input.availabilityStale,
        failures: input.failures,
        beforeEvents: input.beforeEvents,
        totalChanges: input.totalChanges,
        heldBack: input.heldBack,
      })
      .returning();

    const rows =
      input.rows.length === 0
        ? []
        : await tx
            .insert(calendarPlanRow)
            .values(
              input.rows.map((row, position) => ({
                id: `${planId}_r${position}`,
                planId,
                position,
                verb: row.verb,
                site: row.site,
                sessionId: row.sessionId,
                eventId: row.eventId,
                title: row.title,
                beforeStart: row.beforeStart,
                beforeEnd: row.beforeEnd,
                afterStart: row.afterStart,
                afterEnd: row.afterEnd,
                cause: row.cause,
                causeKey: row.causeKey,
                defaultSelected: row.defaultSelected,
                state: 'pending',
              })),
            )
            .returning();

    return { plan, rows };
  });
}

export async function readPlan(planId: string): Promise<StoredPlan | null> {
  const db = getDb();
  const [plan] = await db.select().from(calendarPlan).where(eq(calendarPlan.id, planId));
  if (!plan) return null;
  const rows = await db
    .select()
    .from(calendarPlanRow)
    .where(eq(calendarPlanRow.planId, planId))
    .orderBy(asc(calendarPlanRow.position));
  return { plan, rows };
}

export async function readOpenPlan(): Promise<StoredPlan | null> {
  const db = getDb();
  const [plan] = await db
    .select()
    .from(calendarPlan)
    .where(eq(calendarPlan.state, 'open'))
    .orderBy(desc(calendarPlan.builtAt))
    .limit(1);
  if (!plan) return null;
  return readPlan(plan.id);
}

export async function markPlanRow(
  rowId: string,
  patch: { state: string; outcomeDetail?: string | null; writeId?: string | null },
): Promise<void> {
  const db = getDb();
  await db
    .update(calendarPlanRow)
    .set({ ...patch, decidedAt: new Date() })
    .where(eq(calendarPlanRow.id, rowId));
}

export async function markPlanApplied(planId: string, at: Date): Promise<void> {
  const db = getDb();
  await db
    .update(calendarPlan)
    .set({ state: 'applied', appliedAt: at })
    .where(eq(calendarPlan.id, planId));
}

// --------------------------------------------------------------------------
// The permanent write log.

export type NewWrite = {
  planId: string | null;
  planRowId: string | null;
  site: WriteSiteId;
  verb: 'added' | 'moved' | 'removed' | 'undo';
  eventId: string;
  sessionId: string | null;
  title: string;
  beforeStart: Date | null;
  beforeEnd: Date | null;
  afterStart: Date | null;
  afterEnd: Date | null;
  outcome: 'written' | 'failed';
  httpStatus: number | null;
  detail: string | null;
  mode: string;
  undoesWriteId: string | null;
};

/** One row per outbound write, whatever the outcome. Appended, never edited. */
export async function appendWrite(input: NewWrite): Promise<WriteRecord> {
  const db = getDb();
  const [row] = await db
    .insert(calendarWrite)
    .values({ id: `cw_${randomUUID()}`, ...input })
    .returning();
  return row;
}

export async function readWrite(id: string): Promise<WriteRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(calendarWrite).where(eq(calendarWrite.id, id));
  return row ?? null;
}

export type WriteLogEntry = WriteRecord & { undoneByWriteId: string | null };

/**
 * The log, newest first, with each row told whether it has been undone.
 *
 * Undone is the presence of another row rather than a flag, which is what makes
 * the log append only and what makes "undo is available for every past write"
 * true by construction rather than by maintenance.
 */
export async function readWriteLog(limit = 100): Promise<WriteLogEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(calendarWrite)
    .orderBy(desc(calendarWrite.at))
    .limit(limit);
  const undos = await db
    .select()
    .from(calendarWrite)
    .where(isNotNull(calendarWrite.undoesWriteId));
  const byUndone = new Map(undos.map((row) => [row.undoesWriteId!, row.id]));
  return rows.map((row) => ({ ...row, undoneByWriteId: byUndone.get(row.id) ?? null }));
}

// --------------------------------------------------------------------------
// The demonstration calendar, stored here so it survives a restart.

export function demoStore(): DemoStore {
  const db = getDb();
  return {
    async readEvents(): Promise<DemoEvent[]> {
      const rows = await db.select().from(googleDemoEvent).orderBy(asc(googleDemoEvent.startAt));
      return rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        summary: row.summary,
        description: row.description,
        start: row.startAt.toISOString(),
        end: row.endAt.toISOString(),
        mode: row.mode,
      }));
    },
    async putEvent(event: DemoEvent): Promise<void> {
      const values = {
        id: event.id,
        sessionId: event.sessionId,
        summary: event.summary,
        description: event.description,
        startAt: new Date(event.start),
        endAt: new Date(event.end),
        mode: event.mode,
        updatedAt: new Date(),
      };
      await db
        .insert(googleDemoEvent)
        .values(values)
        .onConflictDoUpdate({ target: googleDemoEvent.id, set: values });
    },
    async removeEvent(id: string): Promise<boolean> {
      const removed = await db
        .delete(googleDemoEvent)
        .where(eq(googleDemoEvent.id, id))
        .returning({ id: googleDemoEvent.id });
      return removed.length > 0;
    },
  };
}

// --------------------------------------------------------------------------
// What the screens are allowed to know.

/** Exactly what a screen may read. No token, no ciphertext, no client secret. */
export type GoogleView = {
  mode: GoogleMode;
  state: GoogleState;
  configured: boolean;
  appCalendarId: string | null;
  appCalendarSummary: string | null;
  watchedCalendarIds: string[];
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastAvailabilityAt: string | null;
  lastSuccessfulWriteAt: string | null;
  cause: GoogleCause | null;
  /** Google's own words, stored raw. F109 shows this rather than a summary. */
  rawError: string | null;
  backgroundSyncStopped: boolean;
  scopes: string[];
  writes: number;
};

export async function describeGoogle(
  mode: GoogleMode,
  configured: boolean,
): Promise<GoogleView> {
  const db = getDb();
  const row = await readConnection();
  const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(calendarWrite);
  const writes = counted?.n ?? 0;

  const state: GoogleState = !row
    ? 'disconnected'
    : row.state === 'connected' && mode === 'demo'
      ? 'demo'
      : (row.state as GoogleState);

  return {
    mode,
    state,
    configured,
    appCalendarId: row?.appCalendarId ?? null,
    appCalendarSummary: row?.appCalendarSummary ?? null,
    watchedCalendarIds: Array.isArray(row?.watchedCalendarIds)
      ? (row!.watchedCalendarIds as string[])
      : [],
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    disconnectedAt: row?.disconnectedAt?.toISOString() ?? null,
    lastAvailabilityAt: row?.lastAvailabilityAt?.toISOString() ?? null,
    lastSuccessfulWriteAt: row?.lastSuccessfulWriteAt?.toISOString() ?? null,
    cause: (row?.lastErrorKind as GoogleCause | null) ?? null,
    rawError: row?.lastErrorRaw ?? null,
    backgroundSyncStopped: row?.backgroundSyncStopped ?? false,
    scopes: SCOPE_PARAM.split(' '),
    writes,
  };
}
