import { strings } from '@/lib/strings';

/**
 * The VAPID pair, read from the environment on every call.
 *
 * THE PRIVATE HALF IS READ IN THIS FILE AND NOWHERE ELSE, and nothing in this
 * file returns it to anything a browser can reach. `publicPushKey()` is what a
 * page hands a client component; `pushKeys()` is what the sender calls, and the
 * only caller of `pushKeys()` is the transport that talks to the push service.
 * F113's third clause is a property of that split, and
 * `tests/unit/push-keys.test.ts` walks the source to hold it.
 *
 * Read at run time, never at build time, for the same reason `src/lib/config.ts`
 * is: the owner fills these with `node scripts/gen-vapid.mjs` after the image is
 * built, and a value baked into a bundle would make that a lie.
 *
 * A missing pair is not an error to swallow. Push is refused, out loud, with the
 * command that fixes it, because a send that quietly does nothing is how an
 * owner finds out on the Sunday he needed the reminder.
 */

export type PushKeys = { publicKey: string; privateKey: string; subject: string };

/**
 * The default `sub` claim. RFC 8292 asks for a `mailto:` or `https:` URI and
 * Apple has historically refused anything else, which shows up as a 403 on the
 * send rather than as an error on the subscribe. Configurable because it is the
 * operator's own address and belongs in his environment file.
 */
const DEFAULT_SUBJECT = 'mailto:lambert.bouley@gmail.com';

function trimmed(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/** The uncompressed P-256 point the browser subscribes with, base64url, or null. */
export function publicPushKey(): string | null {
  const value = trimmed('VAPID_PUBLIC_KEY');
  return value === '' ? null : value;
}

/** True when both halves are present. The one question the diagnostics row asks. */
export function pushKeysPresent(): boolean {
  return trimmed('VAPID_PUBLIC_KEY') !== '' && trimmed('VAPID_PRIVATE_KEY') !== '';
}

export type KeyResult =
  | { ok: true; keys: PushKeys }
  | { ok: false; error: string; detail: string };

/**
 * The pair, or the refusal to send. A result rather than a throw, because both
 * outcomes are rendered: the diagnostics screen prints the refusal where the
 * owner can read it and act on it.
 */
export function pushKeys(): KeyResult {
  const publicKey = trimmed('VAPID_PUBLIC_KEY');
  const privateKey = trimmed('VAPID_PRIVATE_KEY');
  if (publicKey === '' || privateKey === '') {
    return {
      ok: false,
      error: strings.push.noKeys,
      detail: strings.push.noKeysDetail,
    };
  }
  return {
    ok: true,
    keys: { publicKey, privateKey, subject: trimmed('VAPID_SUBJECT') || DEFAULT_SUBJECT },
  };
}
