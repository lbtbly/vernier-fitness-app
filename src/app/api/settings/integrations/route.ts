import {
  checkIntegrationSecret,
  describeIntegrations,
  forgetIntegrationSecret,
  isIntegrationProvider,
  storeIntegrationSecret,
} from '@/db/integrations';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { MasterKeyMismatchError } from '@/lib/master-key';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Where a third-party credential is entered, and the only route that ever takes
 * one.
 *
 * What comes back out is state, scope and last successful sync. Never the
 * value, never its length, never a masked prefix of it. `check` proves the
 * stored credential still opens under the running master key and answers with a
 * boolean; a key that does not match fails loudly here rather than returning an
 * empty string that would read as "not connected".
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ integrations: await describeIntegrations() });
}

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { provider?: unknown; secret?: unknown; scope?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.integrations.bodyDetail);
  }

  const provider = typeof body.provider === 'string' ? body.provider : '';
  const action = typeof body.action === 'string' ? body.action : 'save';
  if (!isIntegrationProvider(provider)) {
    return refuse(
      422,
      strings.api.integrations.unknownProvider,
      strings.api.integrations.unknownProviderDetail,
    );
  }

  try {
    if (action === 'disconnect') {
      await forgetIntegrationSecret(provider);
      return ok({ integrations: await describeIntegrations() });
    }

    if (action === 'check') {
      const readable = await checkIntegrationSecret(provider);
      return ok({ readable, integrations: await describeIntegrations() });
    }

    const secret = typeof body.secret === 'string' ? body.secret : '';
    if (secret.trim() === '') {
      return refuse(
        422,
        strings.api.integrations.emptyCredential,
        strings.api.integrations.emptyCredentialDetail,
      );
    }
    const scope = typeof body.scope === 'string' ? body.scope : undefined;
    await storeIntegrationSecret({ provider, secret, scope });
    return ok({ integrations: await describeIntegrations() }, 201);
  } catch (error) {
    if (error instanceof MasterKeyMismatchError) {
      return refuse(500, strings.api.integrations.willNotOpen, error.message);
    }
    throw error;
  }
}
