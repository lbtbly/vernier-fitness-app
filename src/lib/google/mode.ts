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
};

/**
 * The callback path this build serves.
 *
 * TWO PRECEDENTS DISAGREED AND THIS IS THE ONE THAT WON. `src/lib/withings/mode.ts`
 * serves `/api/withings/callback`, and `.env.example` documents the Google one as
 * `/api/integrations/google/callback`. `.forge/PREFLIGHT.md` names a path for
 * Withings and names none for Google, so the only document the owner can read a
 * Google redirect URI off is `.env.example`, and that value has to match byte for
 * byte in the Cloud console, in the authorize call and in the token exchange. A
 * path that costs a round trip through somebody else's dashboard to change is
 * the one that stays; the shape of the Withings route is the one that moved.
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
  };
}

/** True when the live mode is selected but the pair it needs is not there. */
export function liveModeIsUnusable(settings: GoogleSettings): boolean {
  return settings.mode === 'live' && (settings.clientId === '' || settings.clientSecret === '');
}
