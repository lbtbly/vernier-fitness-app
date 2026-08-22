/**
 * Runtime configuration. Read on every request, never at build time, because
 * F7 changes the origin and the relying party in the environment file and
 * restarts the container expecting the rendered page to follow with no source
 * edit. Anything cached here would make that a lie.
 *
 * The names are the ones the owner's environment file already carries:
 * APP_URL and WEBAUTHN_RP_ID. PLAN.md's prose calls them APP_ORIGIN and RP_ID.
 * The file on disk wins.
 */

import { strings } from '@/lib/strings';

export type AppConfig = {
  appName: string;
  appUrl: string;
  originHost: string;
  rpId: string;
  rpName: string;
  timeZone: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(strings.api.boot.missingConfig(name));
  }
  return value.trim();
}

export function getConfig(): AppConfig {
  const appUrl = required('APP_URL').replace(/\/+$/, '');
  let originHost = appUrl;
  try {
    originHost = new URL(appUrl).host;
  } catch {
    throw new Error(strings.api.boot.badAppUrl(appUrl));
  }
  return {
    // The product name is fixed by DESIGN.md, so an environment file written
    // before the naming lands still boots. A value in the file always wins.
    appName: process.env.APP_NAME?.trim() || 'Vernier',
    appUrl,
    originHost,
    rpId: required('WEBAUTHN_RP_ID'),
    rpName: required('WEBAUTHN_RP_NAME'),
    timeZone: process.env.TZ?.trim() || 'Europe/Paris',
  };
}
