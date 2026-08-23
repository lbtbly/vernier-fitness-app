import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { aiCall, aiConsent, usageLedger } from './schema';
import { type AiCategory, type ConsentSet, consentOf } from '@/lib/ai/consent';
import type { UsageRecord } from '@/lib/ai/service';

/**
 * The consent row, the ledger and the call log. Three reads and two writes.
 *
 * `writeCallAndLedger` is the only writer of either `ai_call` or
 * `usage_ledger`, and it opens one transaction around both inserts. That is
 * F98's middle clause and it is not decoration: a reply that was received and a
 * cost that was not recorded is a month that under-reports itself, and the
 * ceiling that reads off this table would then allow calls it should refuse.
 */

const CONSENT_ID = 'consent';

export type ConsentRow = typeof aiConsent.$inferSelect;

export async function readConsent(): Promise<ConsentSet> {
  const db = getDb();
  const [row] = await db.select().from(aiConsent).where(eq(aiConsent.id, CONSENT_ID)).limit(1);
  if (!row) return consentOf(null);
  return consentOf({
    photo_analysis: row.photoAnalysis,
    menu_generation: row.menuGeneration,
    health_explanations: row.healthExplanations,
    calendar_titles: row.calendarTitles,
  });
}

const COLUMN_OF: Record<AiCategory, 'photoAnalysis' | 'menuGeneration' | 'healthExplanations' | 'calendarTitles'> =
  {
    photo_analysis: 'photoAnalysis',
    menu_generation: 'menuGeneration',
    health_explanations: 'healthExplanations',
    calendar_titles: 'calendarTitles',
  };

/**
 * One switch, moved on its own.
 *
 * One category per call, deliberately. A route that took all four would make
 * "turn photo analysis off" a write that also restates the other three, and two
 * screens racing would then undo each other's answers. F94's independence is a
 * property of the write as well as of the columns.
 */
export async function setConsent(category: AiCategory, on: boolean): Promise<ConsentSet> {
  const db = getDb();
  const column = COLUMN_OF[category];
  await db
    .insert(aiConsent)
    .values({ id: CONSENT_ID, singleton: true, [column]: on })
    .onConflictDoUpdate({
      target: aiConsent.id,
      set: { [column]: on, updatedAt: new Date() },
    });
  return readConsent();
}

/**
 * What has been spent this month, in US dollars.
 *
 * Every row of the month, whatever its mode. A demonstration call with a rate
 * table configured records what it WOULD have cost, so the ceiling can be
 * exercised on an installation with no key at all; without rates it records
 * zero and nothing accumulates. Either way the arithmetic is the same
 * arithmetic, which is the only way the demonstration is worth having.
 */
export async function monthToDateUsd(monthKey: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${usageLedger.costUsd}), 0)` })
    .from(usageLedger)
    .where(eq(usageLedger.monthKey, monthKey));
  return Number(row?.total ?? 0);
}

export type LedgerRow = typeof usageLedger.$inferSelect;
export type CallRow = typeof aiCall.$inferSelect;

export async function readLedger(monthKey: string): Promise<LedgerRow[]> {
  const db = getDb();
  return db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.monthKey, monthKey))
    .orderBy(desc(usageLedger.createdAt));
}

export async function countLedgerRows(monthKey: string, outcome?: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(usageLedger)
    .where(
      outcome
        ? and(eq(usageLedger.monthKey, monthKey), eq(usageLedger.outcome, outcome))
        : eq(usageLedger.monthKey, monthKey),
    );
  return Number(rows[0]?.count ?? 0);
}

export async function readCall(id: string): Promise<CallRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(aiCall).where(eq(aiCall.id, id)).limit(1);
  return row;
}

export type CallInput = UsageRecord & {
  monthKey: string;
  photoId: string | null;
  /** What was sent, as readable lines. Never the image bytes. */
  request: Array<{ key: string; value: string }>;
};

/**
 * The call and its cost, in one transaction.
 *
 * A refusal writes a ledger row and no call row, because there was no call: the
 * pre-flight count happened, the arithmetic said no, and nothing was sent. The
 * row still exists so the operator can see the ceiling working.
 */
export async function writeCallAndLedger(input: CallInput): Promise<{ callId: string }> {
  const db = getDb();
  const callId = `aicall_${crypto.randomUUID()}`;
  const ledgerId = `usage_${crypto.randomUUID()}`;
  const charged = input.outcome === 'charged';

  await db.transaction(async (tx) => {
    if (charged) {
      await tx.insert(aiCall).values({
        id: callId,
        purpose: input.purpose,
        mode: input.mode,
        model: input.model,
        photoId: input.photoId,
        request: input.request,
        reply: input.replyText,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      });
    }
    await tx.insert(usageLedger).values({
      id: ledgerId,
      monthKey: input.monthKey,
      purpose: input.purpose,
      mode: input.mode,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd,
      outcome: input.outcome,
      callId: charged ? callId : null,
    });
  });

  return { callId: charged ? callId : '' };
}
