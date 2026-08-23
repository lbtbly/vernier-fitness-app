
import {
  type BatchContext,
  type WithingsCause,
  advanceCursor,
  commitBatch,
  describeWithings,
  ensureConnection,
  forgetConnection,
  lookupExternalKeys,
  postgresBatchSession,
  postgresRotationSession,
  readConnection,
  readTokens,
  recordFailure,
  standingOnDays,
  updateConnection,
} from '@/db/withings';
import { getConfig } from '@/lib/config';
import { checkAuthState, mintAuthState } from '@/lib/withings/auth-state';
import type { Source } from '@/lib/provenance';
import {
  type ClientPorts,
  type MeasureResult,
  type TokenBundle,
  exchangeCode,
  fetchMeasures,
} from '@/lib/withings/client';
import { type DemoServerState, demoTransport } from '@/lib/withings/demo-dataset';
import { type ImportReport, runImport } from '@/lib/withings/import';
import { type WithingsMode, readWithingsSettings } from '@/lib/withings/mode';
import { type NetworkFailure, networkTransport } from '@/lib/withings/network';
import { authorizeUrl } from '@/lib/withings/protocol';
import { rotateTokens } from '@/lib/withings/rotation';

/**
 * The composition root: the adapter, the storage layer and the connection row,
 * wired into the five things the settings screen can ask for.
 *
 * Connect, import, sync, test and disconnect. Demonstration mode runs all five
 * with no client identifier and no socket, through the same client, the same
 * decisions and the same writes as the live path. That is the whole design: one
 * pipeline, two answers, so the path the owner proves today is the path his
 * scale uses tomorrow.
 */

/** The code the demonstration handshake exchanges. It never leaves this machine. */
const DEMO_CODE = 'demo-authorization-code';

/** Day key in the app's zone, the same shape `src/lib/trend.ts` writes. */
function dayKeyOf(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(date);
}

export type RunContext = {
  mode: WithingsMode;
  configured: boolean;
  source: Source;
  timeZone: string;
  ports: ClientPorts;
  /** Set by the network transport when it never got an envelope back at all. */
  networkFailure: () => NetworkFailure | null;
  /** Demonstration only: move the fixture on once the history has landed. */
  advanceDemoStage: () => Promise<void>;
};

/**
 * Everything one run needs, built once.
 *
 * The transport is chosen here and nowhere else. Below this line the code does
 * not know whether it is talking to Withings or to a generated dataset, which
 * is what stops demonstration mode from being a second implementation with a
 * second set of bugs.
 */
export async function openRun(): Promise<RunContext> {
  const config = getConfig();
  const settings = readWithingsSettings(config.appUrl);
  const row = await ensureConnection(settings.mode);
  const source: Source = settings.mode === 'demo' ? 'demo' : 'withings';

  let failure: NetworkFailure | null = null;

  const demoState: DemoServerState = {
    anchorDay: row.demoAnchorDay ?? dayKeyOf(new Date(), config.timeZone),
    today: dayKeyOf(new Date(), config.timeZone),
    stage: row.demoStage === 'revised' ? 'revised' : 'initial',
    generation: 1,
  };

  const transport =
    settings.mode === 'demo'
      ? demoTransport(
          () => demoState,
          () => {
            demoState.generation += 1;
          },
        )
      : networkTransport((next) => {
          failure = next;
        });

  const ports: ClientPorts = {
    transport,
    credentials: {
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      redirectUri: settings.redirectUri,
    },
    readTokens,
    async rotateTokens(next: TokenBundle) {
      const previous = await readTokens();
      await rotateTokens(postgresRotationSession(), previous, next, new Date(), 'connected');
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, MAX_SLEEP_MS))),
  };

  return {
    mode: settings.mode,
    configured: settings.clientId !== '' && settings.clientSecret !== '',
    source,
    timeZone: config.timeZone,
    ports,
    networkFailure: () => failure,
    advanceDemoStage: async () => {
      if (settings.mode !== 'demo') return;
      demoState.stage = 'revised';
      await updateConnection({ demoStage: 'revised' });
    },
  };
}

/**
 * A rate-limit backoff inside a request handler waits, it does not sleep for
 * fifteen minutes. The poller in slice 12 owns the long wait; a button the owner
 * pressed gets at most this and then an honest answer.
 */
export const MAX_SLEEP_MS = 3_000;

export type ConnectResult =
  | { kind: 'demo_connected' }
  | { kind: 'authorize'; url: string }
  | { kind: 'not_configured' }
  | { kind: 'failed'; cause: WithingsCause };

/**
 * Step one. In demonstration mode it is the whole handshake, because there is
 * no browser to send anywhere: the demonstration transport answers the token
 * exchange directly and the connection is live when this returns.
 */
export async function connect(run: RunContext): Promise<ConnectResult> {
  const config = getConfig();

  if (run.mode === 'demo') {
    const today = dayKeyOf(new Date(), config.timeZone);
    const row = await readConnection();
    await updateConnection({
      state: 'connecting',
      demoAnchorDay: row?.demoAnchorDay ?? today,
      demoStage: row?.demoStage ?? 'initial',
      lastFailureKind: null,
      lastFailureStatus: null,
    });
    const exchanged = await exchangeCode(run.ports, DEMO_CODE);
    if (!exchanged.bundle) {
      await recordFailure('exchange_failed', exchanged.line.envelopeStatus);
      return { kind: 'failed', cause: 'exchange_failed' };
    }
    await rotateTokens(postgresRotationSession(), null, exchanged.bundle, new Date(), 'connected');
    await updateConnection({ connectedAt: new Date(), state: 'connected' });
    return { kind: 'demo_connected' };
  }

  if (!run.configured) {
    await recordFailure('not_configured', null);
    return { kind: 'not_configured' };
  }

  // The state parameter, and only its hash is kept. It is the whole of the
  // cross-site protection Withings documents for this flow, since the spec
  // publishes no PKCE parameter of any kind and sending one would be inventing
  // a protocol.
  const minted = mintAuthState();
  await updateConnection({
    state: 'connecting',
    authStateHash: minted.hash,
    authStateIssuedAt: new Date(),
    lastFailureKind: null,
    lastFailureStatus: null,
  });

  return {
    kind: 'authorize',
    url: authorizeUrl({
      clientId: run.ports.credentials.clientId,
      redirectUri: run.ports.credentials.redirectUri,
      state: minted.state,
    }),
  };
}

export type CallbackResult =
  | { kind: 'connected' }
  | { kind: 'refused'; cause: WithingsCause };

/**
 * The consent page coming back.
 *
 * The returned state is compared against the stored hash in constant time and
 * the pair is spent whatever the outcome, so a value that does not match is
 * refused and cannot be retried against the same hash. An unmatched callback
 * writes nothing at all.
 */
export async function completeCallback(
  run: RunContext,
  code: string,
  state: string,
): Promise<CallbackResult> {
  const row = await readConnection();

  // Spent whatever the outcome, so a value that does not match cannot be
  // retried against the same hash.
  await updateConnection({ authStateHash: null, authStateIssuedAt: null });

  const verdict = checkAuthState(
    state,
    row?.authStateHash ?? null,
    row?.authStateIssuedAt ?? null,
    new Date(),
  );
  if (verdict === 'expired') {
    await recordFailure('awaiting_consent', null);
    return { kind: 'refused', cause: 'awaiting_consent' };
  }
  if (verdict !== 'matched') {
    await recordFailure('state_mismatch', null);
    return { kind: 'refused', cause: 'state_mismatch' };
  }
  if (code.trim() === '') {
    await recordFailure('no_code', null);
    return { kind: 'refused', cause: 'no_code' };
  }

  const exchanged = await exchangeCode(run.ports, code);
  if (!exchanged.bundle) {
    await recordFailure('exchange_failed', exchanged.line.envelopeStatus);
    return { kind: 'refused', cause: 'exchange_failed' };
  }
  await rotateTokens(postgresRotationSession(), null, exchanged.bundle, new Date(), 'connected');
  await updateConnection({ connectedAt: new Date(), state: 'connected' });
  return { kind: 'connected' };
}

/** What went wrong, chosen from the run rather than from a status code alone. */
function causeOf(run: RunContext, report: ImportReport): WithingsCause | null {
  const failure = run.networkFailure();
  if (failure) {
    return failure.reason === 'timeout'
      ? 'timeout'
      : failure.reason === 'not_json'
        ? 'not_json'
        : 'unreachable';
  }
  if (report.outcome === 'reconnect') return 'reconnect';
  if (report.outcome === 'disconnected') return 'never_connected';
  if (report.outcome === 'failed') {
    return report.counters.rateLimitBackoffs > 0 ? 'rate_limited' : 'api_error';
  }
  if (report.failure) return 'api_error';
  if (report.cappedOut) return 'page_cap';
  return null;
}

/**
 * One import, historical or incremental, and everything it left behind.
 *
 * The cursor advance is inside `runImport` and strictly after the commit
 * resolves. The counters and the last successful sync are written here, after
 * that, because a status screen that says "synced" over a write that did not
 * commit is the silence the panel named wearing a green chip.
 */
export async function importOnce(
  run: RunContext,
  options: { historical: boolean },
): Promise<ImportReport> {
  const context: BatchContext = {
    mode: run.mode,
    source: run.source,
    timeZone: run.timeZone,
  };

  await updateConnection({ lastSyncStartedAt: new Date() });

  const report = await runImport(
    {
      readCursor: async () => (await readConnection())?.cursor ?? null,
      fetch: (lastUpdate: number | null): Promise<MeasureResult> =>
        fetchMeasures(run.ports, lastUpdate),
      lookup: (keys) => lookupExternalKeys(run.source, keys),
      standing: (rows) => standingOnDays(rows, run.timeZone),
      commit: (batch) => commitBatch(postgresBatchSession(), batch, context),
      advanceCursor,
      now: () => new Date(),
    },
    { ...options, source: run.source, timeZone: run.timeZone },
  );

  const cause = causeOf(run, report);
  const row = await readConnection();
  const landed = report.commit;

  if (landed) {
    await updateConnection({
      lastSuccessfulSyncAt: new Date(),
      lastBatchId: report.batchId,
      rowsStored: (row?.rowsStored ?? 0) + landed.stored + landed.revised,
      rowsSeen: (row?.rowsSeen ?? 0) + report.measuresSeen,
      groupsDropped: (row?.groupsDropped ?? 0) + report.groupsDropped,
      questionsRaised: (row?.questionsRaised ?? 0) + landed.questions,
      lastFailureKind: cause,
      lastFailureStatus: report.status,
      state: run.mode === 'demo' ? 'connected' : 'connected',
    });
    if (options.historical) await run.advanceDemoStage();
  } else if (cause) {
    await recordFailure(cause, report.status);
    if (cause === 'reconnect') await updateConnection({ state: 'revoked' });
  }

  return report;
}

/**
 * The test button. It asks and never writes: one measure call from the current
 * cursor, the envelope read, nothing committed and no cursor moved.
 */
export async function testConnection(run: RunContext): Promise<{
  ok: boolean;
  status: number | null;
  cause: WithingsCause | null;
  measuresSeen: number;
}> {
  const cursor = (await readConnection())?.cursor ?? null;
  const result = await fetchMeasures(run.ports, cursor);
  const failure = run.networkFailure();

  if (result.outcome.kind === 'ok' || result.outcome.kind === 'no_data') {
    await updateConnection({ lastFailureKind: null, lastFailureStatus: null });
    return {
      ok: true,
      status: result.requests.at(-1)?.envelopeStatus ?? 0,
      cause: null,
      measuresSeen: result.harvest.measuresSeen,
    };
  }

  const cause: WithingsCause = failure
    ? failure.reason === 'timeout'
      ? 'timeout'
      : failure.reason === 'not_json'
        ? 'not_json'
        : 'unreachable'
    : result.outcome.kind === 'reconnect'
      ? 'reconnect'
      : result.outcome.kind === 'disconnected'
        ? 'never_connected'
        : 'api_error';
  const status = result.requests.at(-1)?.envelopeStatus ?? null;
  await recordFailure(cause, status);
  if (cause === 'reconnect') await updateConnection({ state: 'revoked' });
  return { ok: false, status, cause, measuresSeen: result.harvest.measuresSeen };
}

export async function disconnect(): Promise<void> {
  await forgetConnection();
}

/** The status the settings screen renders, on the current mode. */
export async function describeConnection() {
  const config = getConfig();
  const settings = readWithingsSettings(config.appUrl);
  await ensureConnection(settings.mode);
  return describeWithings(
    settings.mode,
    settings.clientId !== '' && settings.clientSecret !== '',
    new Date(),
  );
}
