import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from './client';
import {
  authAttempt,
  owner,
  recoveryGrant,
  session,
  webauthnChallenge,
  webauthnCredential,
} from './schema';
import { hashPassword, type StoredPassword } from '@/lib/password';
import { SIGN_IN_WINDOW_SECONDS } from '@/lib/rate-limit';

/**
 * Everything the gate reads and writes. The route handlers stay thin, the way
 * `src/db/diagnostics.ts` keeps the diagnostics endpoints thin.
 */

export class OwnerExistsError extends Error {
  constructor() {
    super('The owner account already exists. Vernier holds exactly one, and it is created once.');
    this.name = 'OwnerExistsError';
  }
}

export type OwnerRow = typeof owner.$inferSelect;
export type CredentialRow = typeof webauthnCredential.$inferSelect;
export type SessionRow = typeof session.$inferSelect;

export async function countOwners(): Promise<number> {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(owner);
  return Number(row?.n ?? 0);
}

export async function readOwner(): Promise<OwnerRow | null> {
  const db = getDb();
  const [row] = await db.select().from(owner).limit(1);
  return row ?? null;
}

/**
 * One owner, created once. The refusal is the unique index on `singleton`, not
 * a count read a moment earlier, so two simultaneous first runs cannot both
 * pass the check and both insert.
 */
export async function createOwner(input: {
  displayName: string;
  password: string;
}): Promise<OwnerRow> {
  const db = getDb();
  const stored = hashPassword(input.password);
  try {
    const [row] = await db
      .insert(owner)
      .values({
        id: crypto.randomUUID(),
        displayName: input.displayName,
        singleton: true,
        ...stored,
      })
      .returning();
    return row;
  } catch (error) {
    // 23505 is Postgres for unique_violation, which here can only be the
    // singleton index.
    if ((error as { code?: string }).code === '23505') throw new OwnerExistsError();
    throw error;
  }
}

export async function setOwnerPassword(ownerId: string, password: string): Promise<StoredPassword> {
  const db = getDb();
  const stored = hashPassword(password);
  await db
    .update(owner)
    .set({ ...stored, passwordUpdatedAt: new Date() })
    .where(eq(owner.id, ownerId));
  return stored;
}

/* ------------------------------------------------------------------ passkeys */

export async function listCredentials(ownerId: string): Promise<CredentialRow[]> {
  const db = getDb();
  return db
    .select()
    .from(webauthnCredential)
    .where(eq(webauthnCredential.ownerId, ownerId))
    .orderBy(desc(webauthnCredential.createdAt));
}

export async function readCredential(id: string): Promise<CredentialRow | null> {
  const db = getDb();
  const [row] = await db.select().from(webauthnCredential).where(eq(webauthnCredential.id, id));
  return row ?? null;
}

export async function saveCredential(row: {
  id: string;
  ownerId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  aaguid: string;
  label: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(webauthnCredential).values(row);
}

/**
 * The counter is written exactly as the authenticator reported it. A passkey
 * synced through iCloud Keychain reports 0 for life, and inventing an increment
 * here is what would lock the owner out on the second use of his phone.
 */
export async function recordCredentialUse(id: string, reportedCounter: number): Promise<void> {
  const db = getDb();
  await db
    .update(webauthnCredential)
    .set({ counter: reportedCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredential.id, id));
}

export async function deleteCredential(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(webauthnCredential)
    .where(eq(webauthnCredential.id, id))
    .returning({ id: webauthnCredential.id });
  return rows.length > 0;
}

/* --------------------------------------------------------------- challenges */

const CHALLENGE_TTL_SECONDS = 120;

export async function putChallenge(input: {
  challenge: string;
  ceremony: 'registration' | 'authentication';
  ownerId: string | null;
}): Promise<string> {
  const db = getDb();
  const id = crypto.randomUUID();
  await db.insert(webauthnChallenge).values({
    id,
    challenge: input.challenge,
    ceremony: input.ceremony,
    ownerId: input.ownerId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
  });
  // Housekeeping on the way past, so an abandoned ceremony leaves nothing.
  await db.delete(webauthnChallenge).where(sql`${webauthnChallenge.expiresAt} < now()`);
  return id;
}

/** Single use: the row is deleted as it is read, inside one statement. */
export async function takeChallenge(
  id: string,
  ceremony: 'registration' | 'authentication',
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .delete(webauthnChallenge)
    .where(
      and(
        eq(webauthnChallenge.id, id),
        eq(webauthnChallenge.ceremony, ceremony),
        gt(webauthnChallenge.expiresAt, new Date()),
      ),
    )
    .returning({ challenge: webauthnChallenge.challenge });
  return rows[0]?.challenge ?? null;
}

/* ----------------------------------------------------------------- sessions */

export async function insertSession(row: {
  id: string;
  ownerId: string;
  csrfToken: string;
  method: string;
  expiresAt: Date;
}): Promise<void> {
  const db = getDb();
  await db.insert(session).values(row);
  await db.delete(session).where(sql`${session.expiresAt} < now()`);
}

export async function readSessionRow(id: string): Promise<SessionRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(session)
    .where(and(eq(session.id, id), gt(session.expiresAt, new Date())));
  return row ?? null;
}

export async function touchSession(id: string): Promise<void> {
  const db = getDb();
  await db.update(session).set({ lastSeenAt: new Date() }).where(eq(session.id, id));
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.delete(session).where(eq(session.id, id));
}

/* -------------------------------------------------------------- audit rows */

export type AuthMethod = 'password' | 'passkey' | 'bootstrap' | 'recovery' | 'sign-out';
export type AuthOutcome = 'success' | 'failure' | 'rate-limited' | 'refused';

/**
 * One row per attempt, whatever the outcome. The reason is a fixed phrase from
 * the caller, never a value that was tried, so the audit log can be read out in
 * full without reading out a credential.
 */
export async function recordAuthAttempt(input: {
  method: AuthMethod;
  outcome: AuthOutcome;
  reason: string;
  peer: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(authAttempt).values({
    id: crypto.randomUUID(),
    method: input.method,
    outcome: input.outcome,
    reason: input.reason,
    peer: input.peer,
  });
}

/**
 * The failures inside the current window. Refusals by the limiter itself are
 * excluded: they are not attempts on the credential and must not extend the
 * pause.
 *
 * Failures older than the last `unlocked` row are excluded too. That is how
 * `scripts/recovery.sh unlock` clears a lockout without deleting or editing a
 * single audit row: the log stays append only and the window simply starts
 * again from the moment the operator said so.
 */
export async function recentFailures(): Promise<Date[]> {
  const db = getDb();
  const rows = await db
    .select({ at: authAttempt.at })
    .from(authAttempt)
    .where(
      and(
        eq(authAttempt.outcome, 'failure'),
        sql`${authAttempt.at} > now() - make_interval(secs => ${SIGN_IN_WINDOW_SECONDS})`,
        sql`${authAttempt.at} > coalesce((select max(a.at) from auth_attempt a where a.outcome = 'unlocked'), to_timestamp(0))`,
      ),
    );
  return rows.map((row) => row.at);
}

export async function readAuditTail(limit = 20) {
  const db = getDb();
  return db.select().from(authAttempt).orderBy(desc(authAttempt.at)).limit(limit);
}

/* ------------------------------------------------------------- host recovery */

export async function createRecoveryGrant(id: string, ttlSeconds: number): Promise<void> {
  const db = getDb();
  await db.insert(recoveryGrant).values({
    id,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });
}

/** Single use and time limited, marked spent in the same statement that reads it. */
export async function consumeRecoveryGrant(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(recoveryGrant)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryGrant.id, id),
        isNull(recoveryGrant.usedAt),
        gt(recoveryGrant.expiresAt, new Date()),
      ),
    )
    .returning({ id: recoveryGrant.id });
  return rows.length > 0;
}
