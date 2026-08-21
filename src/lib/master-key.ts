import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * The master key, and the only place a third-party credential is ever in the
 * clear.
 *
 * Two failures are named rather than swallowed, because both of them have a
 * quiet version that turns a credential store into a liar. A missing key must
 * stop the boot instead of letting the app run with encryption switched off. A
 * key that does not match the ciphertext must throw instead of handing back an
 * empty string that reads downstream as "not connected yet".
 */

const KEY_NAME = 'MASTER_KEY';

export class MasterKeyMissingError extends Error {
  constructor(detail: string) {
    super(
      [
        KEY_NAME,
        ' is ',
        detail,
        '. Vernier will not start without it: every third-party credential in the database is encrypted with it, and starting without it would mean writing the next one in the clear. Set ',
        KEY_NAME,
        ' in the environment file at the project root to 32 random bytes in base64url and restart the stack.',
      ].join(''),
    );
    this.name = 'MasterKeyMissingError';
  }
}

export class MasterKeyMismatchError extends Error {
  constructor(provider: string, detail: string) {
    super(
      [
        KEY_NAME,
        ' does not decrypt the stored ',
        provider,
        ' credential: ',
        detail,
        '. The key in the environment differs from the one this row was written with. Nothing is returned and nothing is overwritten. Restore the original key, or delete the row and connect the integration again.',
      ].join(''),
    );
    this.name = 'MasterKeyMismatchError';
  }
}

/** AES-256-GCM. Twelve-byte nonce, which is the standard width for GCM. */
const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export type SealedSecret = {
  ciphertext: string;
  nonce: string;
  tag: string;
  keyFingerprint: string;
};

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const candidates = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? [Buffer.from(trimmed, 'hex')]
    : [Buffer.from(trimmed, 'base64url'), Buffer.from(trimmed, 'base64')];
  const key = candidates.find((candidate) => candidate.length === KEY_BYTES);
  if (!key) {
    throw new MasterKeyMissingError(
      `set but not 32 bytes once decoded, so it cannot key AES-256. Expected 64 hex characters or 43 base64url characters, read ${trimmed.length}`,
    );
  }
  return key;
}

/**
 * Read on every call, never cached at module load. Same reason F7 gives for the
 * origin: configuration is a runtime value, and a cached one survives the
 * restart that was meant to change it.
 */
export function readMasterKey(): Buffer {
  const raw = process.env[KEY_NAME];
  if (!raw || raw.trim() === '') throw new MasterKeyMissingError('not set');
  return decodeKey(raw);
}

/** Short, one way, and enough to tell one key from another inside a row. */
export function masterKeyFingerprint(key: Buffer = readMasterKey()): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 16);
}

/**
 * Called once at boot. The app refuses to serve rather than run with a key it
 * cannot use, which is the first half of F17.
 */
export function assertMasterKey(): string {
  const key = readMasterKey();
  const probe = sealSecret('vernier-master-key-self-test', 'self-test');
  if (openSecret(probe, 'self-test') !== 'vernier-master-key-self-test') {
    throw new MasterKeyMissingError('set but failed its own encrypt and decrypt self test');
  }
  return masterKeyFingerprint(key);
}

/**
 * The provider name is the additional authenticated data, so a ciphertext moved
 * from one integration row into another fails to open rather than opening as
 * somebody else's credential.
 */
export function sealSecret(plaintext: string, provider: string): SealedSecret {
  const key = readMasterKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(Buffer.from(provider, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyFingerprint: masterKeyFingerprint(key),
  };
}

export function openSecret(sealed: SealedSecret, provider: string): string {
  const key = readMasterKey();
  const fingerprint = masterKeyFingerprint(key);
  if (sealed.keyFingerprint && sealed.keyFingerprint !== fingerprint) {
    throw new MasterKeyMismatchError(
      provider,
      `the row was written under key ${sealed.keyFingerprint} and the running key is ${fingerprint}`,
    );
  }
  let plaintext: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.nonce, 'base64'));
    decipher.setAAD(Buffer.from(provider, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw new MasterKeyMismatchError(
      provider,
      `the authentication tag did not verify (${(error as Error).message})`,
    );
  }
  if (plaintext === '') {
    throw new MasterKeyMismatchError(provider, 'the row opened to an empty value');
  }
  return plaintext;
}
