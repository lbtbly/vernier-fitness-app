import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { integrationCredential } from './schema';
import { SCOPE_PARAM } from '@/lib/google/scopes';
import { openSecret, sealSecret } from '@/lib/master-key';
import { strings } from '@/lib/strings';

/**
 * Third-party credentials, encrypted at rest, and the only place any of them is
 * ever read back.
 *
 * The plaintext never leaves this file except as a return value to the adapter
 * that is about to make the call it belongs to. Nothing here returns a secret
 * to a route handler, a page or a log line, and `describeIntegrations()` below
 * is deliberately the only shape the settings screen can render.
 */

export const INTEGRATIONS = [
  {
    provider: 'withings',
    name: strings.settings.providers.withings.name,
    purpose: strings.settings.providers.withings.purpose,
    scope: 'user.metrics',
  },
  {
    provider: 'apple_health',
    name: strings.settings.providers.apple_health.name,
    purpose: strings.settings.providers.apple_health.purpose,
    scope: 'ingest.write',
  },
  {
    /*
     * THE SCOPE LIST HERE IS THE ONE THE REQUEST CARRIES, imported rather than
     * typed again.
     *
     * It read `calendar.events.owned calendar.freebusy calendar.calendars.own`
     * until slice 11, which was a guess made before the research note was
     * written and which the settings screen printed as fact. Two of those three
     * are not scopes this app ever asks for, and one of them, `events.owned`,
     * would authorize writing to calendars this app did not create. A second
     * list of scopes in a repository is the drift this project has already paid
     * for twice, so there is one list and everything reads it.
     */
    provider: 'google_calendar',
    name: strings.settings.providers.google_calendar.name,
    purpose: strings.settings.providers.google_calendar.purpose,
    scope: SCOPE_PARAM,
  },
  {
    provider: 'mail_relay',
    name: strings.settings.providers.mail_relay.name,
    purpose: strings.settings.providers.mail_relay.purpose,
    scope: 'smtp.send',
  },
] as const;

export type IntegrationProvider = (typeof INTEGRATIONS)[number]['provider'];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return INTEGRATIONS.some((integration) => integration.provider === value);
}

/**
 * The three settings an integration can be in. A token, not a sentence: this
 * file returns state and `src/lib/display.ts` chooses the words for it. It read
 * `'not connected'` once and the settings screen printed that straight into a
 * chip, which is a database value speaking to a person with no key behind it.
 */
export type IntegrationState = 'connected' | 'disconnected' | 'error';

/** Exactly what the settings screen is allowed to know. No ciphertext, no length, no shape. */
export type IntegrationView = {
  provider: string;
  name: string;
  purpose: string;
  scope: string;
  state: IntegrationState;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
};

export async function describeIntegrations(): Promise<IntegrationView[]> {
  const db = getDb();
  const rows = await db.select().from(integrationCredential);
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return INTEGRATIONS.map((integration) => {
    const row = byProvider.get(integration.provider);
    const state: IntegrationState =
      row?.state === 'connected' ? 'connected' : row?.state === 'error' ? 'error' : 'disconnected';
    return {
      provider: integration.provider,
      name: integration.name,
      purpose: integration.purpose,
      scope: row?.scope ?? integration.scope,
      state,
      lastSuccessfulSyncAt: row?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
    };
  });
}

export async function storeIntegrationSecret(input: {
  provider: IntegrationProvider;
  secret: string;
  scope?: string;
}): Promise<void> {
  const db = getDb();
  const sealed = sealSecret(input.secret, input.provider);
  const catalogue = INTEGRATIONS.find((entry) => entry.provider === input.provider);
  const values = {
    provider: input.provider,
    state: 'connected',
    scope: input.scope?.trim() || catalogue?.scope || '',
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

export async function forgetIntegrationSecret(provider: IntegrationProvider): Promise<void> {
  const db = getDb();
  await db.delete(integrationCredential).where(eq(integrationCredential.provider, provider));
}

/**
 * Move an integration's last successful sync, and nothing else.
 *
 * Only ever called after a write has committed. The whole point of the column
 * is that Today and Health measure silence against it, so a run that failed and
 * moved it anyway would be the app showing a green light for a sync that stored
 * nothing. That exact defect is on record: a fitness app whose locked-phone run
 * advanced its checkpoint and permanently skipped a day nobody knew to look for.
 */
export async function markIntegrationSynced(
  provider: IntegrationProvider,
  at: Date,
): Promise<void> {
  const db = getDb();
  await db
    .update(integrationCredential)
    .set({ lastSuccessfulSyncAt: at, lastError: null, updatedAt: new Date() })
    .where(eq(integrationCredential.provider, provider));
}

/**
 * The one read path. It throws a named error when the key does not match rather
 * than returning an empty string, because an empty string reads downstream as
 * "nothing stored" and that is how a credential store starts lying.
 */
export async function readIntegrationSecret(provider: IntegrationProvider): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(integrationCredential)
    .where(eq(integrationCredential.provider, provider));
  if (!row || !row.secretCiphertext || !row.secretNonce || !row.secretTag) return null;
  return openSecret(
    {
      ciphertext: row.secretCiphertext,
      nonce: row.secretNonce,
      tag: row.secretTag,
      keyFingerprint: row.keyFingerprint ?? '',
    },
    provider,
  );
}

/**
 * Proves the stored credential still opens under the running key, and answers
 * with a boolean. The value itself is not returned, not counted and not
 * measured.
 */
export async function checkIntegrationSecret(provider: IntegrationProvider): Promise<boolean> {
  const secret = await readIntegrationSecret(provider);
  return secret !== null && secret.length > 0;
}
