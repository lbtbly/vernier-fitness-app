/**
 * Which Withings this installation talks to, and the credentials if it is the
 * real one.
 *
 * Read on every call and never cached at module load, for the same reason
 * `src/lib/config.ts` gives about the origin: configuration is a runtime value,
 * and a cached one survives the restart that was meant to change it.
 */

export type WithingsMode = 'demo' | 'live';

export type WithingsSettings = {
  mode: WithingsMode;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** True when the environment names a mode explicitly rather than being read. */
  declared: boolean;
};

/**
 * The callback path this build serves, and the one `.forge/PREFLIGHT.md` tells
 * the owner to register in the Withings developer dashboard.
 *
 * TWO PRECEDENTS DISAGREED AND THIS IS THE ONE THAT WON. PREFLIGHT.md says
 * `/api/withings/callback` and `.env.example` said
 * `/api/integrations/withings/callback`. PREFLIGHT is the sheet the owner reads
 * while typing the value into a form on somebody else's website, a value that
 * must match byte for byte and that costs a round trip through the dashboard to
 * change. The example file is the one that moved.
 */
export const CALLBACK_PATH = '/api/withings/callback';

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/**
 * Demonstration unless there is a real pair to use.
 *
 * `WITHINGS_MODE` wins when it is set, so an owner who has entered his
 * credentials can still run the demonstration path on purpose. With nothing
 * declared, a blank client id or a blank secret means demonstration: an
 * installation with no credential must not sit in a live mode that fails every
 * call, because "not connected" and "connected and broken" are different
 * sentences on the status screen and the owner acts differently on each.
 */
export function readWithingsSettings(appUrl?: string): WithingsSettings {
  const declaredMode = trimmed('WITHINGS_MODE').toLowerCase();
  const clientId = trimmed('WITHINGS_CLIENT_ID');
  const clientSecret = trimmed('WITHINGS_CLIENT_SECRET');
  const configured = clientId !== '' && clientSecret !== '';

  const mode: WithingsMode =
    declaredMode === 'live' ? 'live' : declaredMode === 'demo' ? 'demo' : configured ? 'live' : 'demo';

  const redirectUri =
    trimmed('WITHINGS_REDIRECT_URI') ||
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
export function liveModeIsUnusable(settings: WithingsSettings): boolean {
  return settings.mode === 'live' && (settings.clientId === '' || settings.clientSecret === '');
}
