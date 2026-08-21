import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { CredentialRow } from '@/db/auth';
import { getConfig } from '@/lib/config';

/**
 * The passkey ceremonies, with the three settings that decide whether this
 * works on the owner's actual devices.
 *
 * `residentKey: 'preferred'` gets a discoverable credential where the
 * authenticator will make one, which is what lets the sign-in screen have no
 * username field at all. `userVerification: 'preferred'` takes Face ID or Touch
 * ID when it is there and does not refuse an authenticator that has neither.
 * `attestationType: 'none'` asks for no attestation statement, because a
 * single-owner app on the owner's own machine has nothing to check it against
 * and asking for one only adds a prompt.
 *
 * `authenticatorAttachment` is deliberately not set. Pinning it to 'platform'
 * would block signing in on the Mac by scanning a code with the iPhone.
 *
 * The relying party identifier is the tailnet domain, read from
 * WEBAUTHN_RP_ID. Not the full hostname, which dies the day the Mac is renamed,
 * and not the bare public suffix, which throws a SecurityError.
 */

const RP_TIMEOUT_MS = 120_000;

function transportsOf(row: CredentialRow): AuthenticatorTransportFuture[] {
  return row.transports as AuthenticatorTransportFuture[];
}

export async function buildRegistrationOptions(input: {
  ownerId: string;
  displayName: string;
  existing: CredentialRow[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpId, rpName } = getConfig();
  return generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userID: new TextEncoder().encode(input.ownerId),
    userName: input.displayName,
    userDisplayName: input.displayName,
    timeout: RP_TIMEOUT_MS,
    attestationType: 'none',
    // Every credential already stored, so an authenticator that holds one
    // offers to reuse it instead of silently making a second.
    excludeCredentials: input.existing.map((row) => ({
      id: row.id,
      transports: transportsOf(row),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

export async function buildAuthenticationOptions(
  existing: CredentialRow[],
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpId } = getConfig();
  return generateAuthenticationOptions({
    rpID: rpId,
    timeout: RP_TIMEOUT_MS,
    userVerification: 'preferred',
    allowCredentials: existing.map((row) => ({
      id: row.id,
      transports: transportsOf(row),
    })),
  });
}

export async function checkRegistration(input: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}) {
  const { rpId, appUrl } = getConfig();
  return verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: appUrl,
    expectedRPID: rpId,
    requireUserVerification: false,
  });
}

export async function checkAuthentication(input: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: CredentialRow;
}) {
  const { rpId, appUrl } = getConfig();
  return verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: appUrl,
    expectedRPID: rpId,
    requireUserVerification: false,
    credential: {
      id: input.credential.id,
      publicKey: new Uint8Array(Buffer.from(input.credential.publicKey, 'base64url')),
      counter: input.credential.counter,
      transports: transportsOf(input.credential),
    },
  });
}

/**
 * The replay rule, written out so it can be tested without a browser.
 *
 * A passkey synced through iCloud Keychain reports a signature counter of 0 on
 * every assertion for the rest of its life. A naive strictly-increasing check
 * accepts the first assertion and refuses every one after it, which locks the
 * owner out of his own app on the second use of his phone and looks like a
 * server bug rather than a policy. So the rule is narrow: a counter that has
 * always been zero is fine, and a counter that has ever been non-zero must
 * advance.
 */
export function counterIsAcceptable(stored: number, reported: number): boolean {
  if (reported === 0 && stored === 0) return true;
  return reported > stored;
}

/** What gets written back. Verbatim, never synthesised. */
export function counterToStore(reported: number): number {
  return reported;
}
