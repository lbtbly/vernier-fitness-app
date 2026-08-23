/**
 * Which Google this installation talks to, and the credentials if it is the
 * real one.
 *
 * Read on every call and never cached at module load, for the same reason
 * `src/lib/config.ts` gives about the origin: configuration is a runtime value,
 * and a cached one survives the restart that was meant to change it. This is
 * `src/lib/withings/mode.ts` with a different provider on purpose, because two
 * integrations that read their settings two different ways is how one of them
 * quietly stops honouring the environment file.
 */

export type GoogleMode = 'demo' | 'live';

export type GoogleSettings = {
  mode: GoogleMode;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** True when the environment names a mode explicitly rather than being read. */
  declared: boolean;
  /**
   * What the recorded Google is doing wrong, and it is a demonstration control
   * rather than a test hook.
   *
   * Two rubric lines describe a provider misbehaving, and the honest way to show
   * either is to make it misbehave rather than to mock the answer:
   *
   *   `outage`  every calendar call comes back the way a socket that never
   *             opened comes back, so the real fallback to stored availability
   *             runs and the screen names the cause.
   *   `revoked` the refresh answers `invalid_grant`, so the permanent refusal
   *             runs: the token is deleted, the connection is disconnected with
   *             the raw body, background reads stop and nothing is retried.
   *
   * The alternative for the first is taking this machine's network away, which
   * would take the rest of the app with it and prove nothing about this path.
   * The alternative for the second is revoking a real grant, which needs a real
   * Google account this run does not have.
   */
  fault: GoogleFault;
};

export type GoogleFault = 'none' | 'outage' | 'revoked';

/**
 * The callback path this build serves.
 *
 * TWO PRECEDENTS DISAGREED AND THIS IS THE ONE THAT WON. `src/lib/withings/mode.ts`
 * serves `/api/withings/callback`, so the shape of a callback route in this
 * repository is `/api/<provider>/callback`. `SETUP.html` and `.env.example` both
 * document the Google one as `/api/integrations/google/callback`, and SETUP.html
 * is the sheet the owner has open while he types the value into a form on
 * Google's website: it has to match byte for byte in the console, in the
 * authorize call and in the token exchange, and changing it costs a round trip
 * through somebody else's dashboard. `.forge/PREFLIGHT.md` names a path for
 * Withings and names none for Google, so nothing pulls the other way. The
 * documents win; the route shape is the one that moved.
 */
export const CALLBACK_PATH = '/api/integrations/google/callback';

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/**
 * Demonstration unless there is a real pair to use.
 *
 * `GOOGLE_MODE` wins when it is set, so an owner who has entered his credentials
 * can still run the demonstration path on purpose. With nothing declared, a
 * blank client id or a blank secret means demonstration: an installation with no
 * credential must not sit in a live mode that fails every call, because "not
 * connected" and "connected and broken" are different sentences on the status
 * screen and the owner acts differently on each.
 */
export function readGoogleSettings(appUrl?: string): GoogleSettings {
  const declaredMode = trimmed('GOOGLE_MODE').toLowerCase();
  const clientId = trimmed('GOOGLE_CLIENT_ID');
  const clientSecret = trimmed('GOOGLE_CLIENT_SECRET');
  const configured = clientId !== '' && clientSecret !== '';

  const mode: GoogleMode =
    declaredMode === 'live'
      ? 'live'
      : declaredMode === 'demo'
        ? 'demo'
        : configured
          ? 'live'
          : 'demo';

  const redirectUri =
    trimmed('GOOGLE_REDIRECT_URI') ||
    (appUrl ? `${appUrl.replace(/\/+$/, '')}${CALLBACK_PATH}` : '');

  return {
    mode,
    clientId,
    clientSecret,
    redirectUri,
    declared: declaredMode === 'live' || declaredMode === 'demo',
    fault: readFault(),
  };
}

function readFault(): GoogleFault {
  const declared = trimmed('GOOGLE_DEMO_FAULT').toLowerCase();
  return declared === 'outage' || declared === 'revoked' ? declared : 'none';
}

/** True when the live mode is selected but the pair it needs is not there. */
export function liveModeIsUnusable(settings: GoogleSettings): boolean {
  return settings.mode === 'live' && (settings.clientId === '' || settings.clientSecret === '');
}
