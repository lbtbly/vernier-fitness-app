import { describeIntegrations } from '@/db/integrations';
import {
  mintIngestCredential,
  readCredentialHistory,
  readLiveCredential,
  revokeIngestCredential,
} from '@/db/ingest';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { MasterKeyMismatchError } from '@/lib/master-key';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Where the ingest credential is created and revoked, and the only route that
 * ever hands one out.
 *
 * It answers the owner's browser, so it wants what every other mutating route
 * in this app wants and in the same order: anti-forgery first, session second,
 * work third. The credential it mints is for a different caller entirely, which
 * is the whole point of F51: this route needs a session and cannot be reached
 * with an ingest token, and `/api/ingest/health` needs an ingest token and
 * cannot be reached with a session.
 *
 * THE TOKEN AND THE SECRET ARE IN EXACTLY ONE RESPONSE, EVER. This is the 201
 * that created them. Nothing reads them back afterwards: the token is a hash in
 * the database and the secret is sealed under the master key, and the GET below
 * returns neither, nor their length, nor a masked prefix.
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  const [credential, history] = await Promise.all([readLiveCredential(), readCredentialHistory()]);
  return ok({
    credential: credential
      ? {
          keyId: credential.keyId,
          label: credential.label,
          createdAt: credential.createdAt.toISOString(),
          lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
        }
      : null,
    revoked: history
      .filter((row) => row.revokedAt !== null)
      .map((row) => ({ keyId: row.keyId, revokedAt: row.revokedAt!.toISOString() })),
  });
}

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { action?: unknown; keyId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.integrations.bodyDetail);
  }

  const action = typeof body.action === 'string' ? body.action : '';

  try {
    if (action === 'revoke') {
      const revoked = await revokeIngestCredential();
      return ok({ revoked, integrations: await describeIntegrations() });
    }

    if (action === 'create') {
      const keyId = typeof body.keyId === 'string' ? body.keyId : undefined;
      const minted = await mintIngestCredential({
        keyId,
        // The label is what the settings screen calls this key when it lists
        // it. The app name, because there is one owner and one phone and a
        // free-text field here would be a second thing to get wrong.
        label: getConfig().appName,
      });
      return ok(
        {
          keyId: minted.keyId,
          token: minted.token,
          secret: minted.secret,
          integrations: await describeIntegrations(),
        },
        201,
      );
    }

    return refuse(
      422,
      strings.api.integrations.unknownProvider,
      strings.api.integrations.unknownProviderDetail,
    );
  } catch (error) {
    if (error instanceof MasterKeyMismatchError) {
      return refuse(500, strings.api.integrations.willNotOpen, error.message);
    }
    throw error;
  }
}
