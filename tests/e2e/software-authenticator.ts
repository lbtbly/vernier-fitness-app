import { webcrypto } from 'node:crypto';

/**
 * A software authenticator, injected into the WebKit page.
 *
 * WebKit exposes no virtual authenticator to automation the way Chromium does,
 * and a platform ceremony needs a fingerprint or a face, so an end to end test
 * of the passkey path has exactly two options: a person with a thumb, or an
 * authenticator written in software. This is the second one.
 *
 * Everything it produces is real. A real P-256 key pair, a real COSE public key
 * in real CBOR, a real clientDataJSON carrying the page's own origin, a real
 * authenticator data structure whose relying party hash is the SHA-256 of the
 * relying party the server asked for, and a real ECDSA signature over
 * authenticatorData plus the client data hash, in DER. The server verifies all
 * of it with SimpleWebAuthn against the origin from APP_URL and the relying
 * party from WEBAUTHN_RP_ID, exactly as it will for the owner's iPhone. What is
 * simulated is the user gesture, not the cryptography.
 *
 * It reports itself the way an iCloud Keychain passkey does: backup eligible,
 * backed up, and a signature counter of 0 that never moves. That is deliberate.
 * The counter is the case that breaks a naive replay check on the second use.
 */

/**
 * The mark on every credential this authenticator mints, and the whole of what
 * lets the suite clean up after itself.
 *
 * The suite has no DELETE on `webauthn_credential`: that is where the owner's
 * real passkey lives. It has EXECUTE on one function that removes a credential
 * whose identifier opens with these twelve characters and refuses everything
 * else. A WebAuthn credential identifier is base64url over random bytes, so an
 * authenticator that is not this one carries this prefix with probability
 * 2^-72, and the owner's iPhone is outside the function's reach by arithmetic
 * rather than by care.
 */
export const SUITE_CREDENTIAL_MARKER = 'vernierSuite';

export type AuthenticatorSeed = {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  credentialId: string;
};

export async function makeAuthenticatorSeed(): Promise<AuthenticatorSeed> {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  // Nine bytes that spell the marker in base64url, then twenty-one random ones.
  // Thirty bytes is exactly forty base64url characters with no padding, so the
  // string the browser sends and the string the server stores are the same one
  // and the prefix survives every re-encoding on the way.
  const marked = Buffer.concat([
    Buffer.from(SUITE_CREDENTIAL_MARKER, 'base64url'),
    Buffer.from(webcrypto.getRandomValues(new Uint8Array(21))),
  ]);
  const credentialId = marked.toString('base64url');
  return {
    privateKeyJwk: await webcrypto.subtle.exportKey('jwk', pair.privateKey),
    publicKeyJwk: await webcrypto.subtle.exportKey('jwk', pair.publicKey),
    credentialId,
  };
}

/**
 * The init script. It runs before any of the app's own code, so the app's
 * client, `@simplewebauthn/browser` and the ceremony all run unmodified.
 */
export function authenticatorInitScript(seed: AuthenticatorSeed): string {
  return `(() => {
  const SEED = ${JSON.stringify(seed)};

  const toBytes = (input) => {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return new Uint8Array(0);
  };
  const concat = (...parts) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  };
  const b64url = (bytes) => {
    let binary = '';
    for (const byte of toBytes(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (text) => {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  };

  // Just enough CBOR: unsigned, negative, byte string, text string, map.
  const head = (major, length) => {
    if (length < 24) return new Uint8Array([(major << 5) | length]);
    if (length < 256) return new Uint8Array([(major << 5) | 24, length]);
    if (length < 65536) return new Uint8Array([(major << 5) | 25, length >> 8, length & 0xff]);
    return new Uint8Array([(major << 5) | 26, (length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  };
  const cbor = (value) => {
    if (typeof value === 'number') {
      return value >= 0 ? head(0, value) : head(1, -1 - value);
    }
    if (value instanceof Uint8Array) return concat(head(2, value.length), value);
    if (typeof value === 'string') {
      const bytes = new TextEncoder().encode(value);
      return concat(head(3, bytes.length), bytes);
    }
    if (value instanceof Map) {
      const parts = [head(5, value.size)];
      for (const [key, entry] of value) parts.push(cbor(key), cbor(entry));
      return concat(...parts);
    }
    throw new Error('cbor: unsupported value');
  };

  // WebAuthn wants the signature in DER. WebCrypto returns r || s.
  const derSignature = (raw) => {
    const bytes = toBytes(raw);
    const half = bytes.length / 2;
    const trim = (part) => {
      let start = 0;
      while (start < part.length - 1 && part[start] === 0) start += 1;
      const body = part.slice(start);
      return body[0] & 0x80 ? concat(new Uint8Array([0]), body) : body;
    };
    const r = trim(bytes.slice(0, half));
    const s = trim(bytes.slice(half));
    const sequence = concat(
      new Uint8Array([0x02, r.length]), r,
      new Uint8Array([0x02, s.length]), s,
    );
    return concat(new Uint8Array([0x30, sequence.length]), sequence);
  };

  const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  let privateKey = null;
  const loadKey = async () => {
    if (!privateKey) {
      privateKey = await crypto.subtle.importKey('jwk', SEED.privateKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    }
    return privateKey;
  };

  const AAGUID = new Uint8Array(16);
  // User present, user verified, backup eligible, backed up. The last two are
  // what an iCloud Keychain passkey reports, and what makes the server record
  // device type multiDevice and backed up true.
  const FLAGS_ASSERTION = 0x01 | 0x04 | 0x08 | 0x10;
  const FLAGS_ATTESTATION = FLAGS_ASSERTION | 0x40;
  // Zero, forever. A synced passkey never counts.
  const SIGN_COUNT = new Uint8Array([0, 0, 0, 0]);

  const clientData = async (type, challenge, origin) => {
    const json = JSON.stringify({ type, challenge: b64url(challenge), origin, crossOrigin: false });
    return new TextEncoder().encode(json);
  };

  const coseKey = () => {
    const x = fromB64url(SEED.publicKeyJwk.x);
    const y = fromB64url(SEED.publicKeyJwk.y);
    return cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]));
  };

  const create = async (options) => {
    const publicKey = options.publicKey;
    const rpId = publicKey.rp.id || location.hostname;
    const clientDataJSON = await clientData('webauthn.create', publicKey.challenge, location.origin);
    const credentialId = fromB64url(SEED.credentialId);
    const attestedCredentialData = concat(
      AAGUID,
      new Uint8Array([(credentialId.length >> 8) & 0xff, credentialId.length & 0xff]),
      credentialId,
      coseKey(),
    );
    const authData = concat(
      await sha256(new TextEncoder().encode(rpId)),
      new Uint8Array([FLAGS_ATTESTATION]),
      SIGN_COUNT,
      attestedCredentialData,
    );
    const attestationObject = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));

    return {
      id: SEED.credentialId,
      rawId: credentialId.buffer.slice(credentialId.byteOffset, credentialId.byteOffset + credentialId.byteLength),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: clientDataJSON.buffer,
        attestationObject: attestationObject.buffer,
        getTransports: () => ['internal', 'hybrid'],
      },
      getClientExtensionResults: () => ({}),
    };
  };

  const get = async (options) => {
    const publicKey = options.publicKey;
    const rpId = publicKey.rpId || location.hostname;
    const clientDataJSON = await clientData('webauthn.get', publicKey.challenge, location.origin);
    const authData = concat(
      await sha256(new TextEncoder().encode(rpId)),
      new Uint8Array([FLAGS_ASSERTION]),
      SIGN_COUNT,
    );
    const signed = concat(authData, await sha256(clientDataJSON));
    const raw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await loadKey(), signed);
    const credentialId = fromB64url(SEED.credentialId);

    return {
      id: SEED.credentialId,
      rawId: credentialId.buffer.slice(credentialId.byteOffset, credentialId.byteOffset + credentialId.byteLength),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: clientDataJSON.buffer,
        authenticatorData: authData.buffer,
        signature: derSignature(raw).buffer,
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    };
  };

  // The prototype, not the instance. WebKit hands back a fresh
  // CredentialsContainer wrapper on some accesses, so a property defined on the
  // object read here is not the property the app reads later.
  const container = Object.getPrototypeOf(navigator.credentials);
  for (const [name, implementation] of [['create', create], ['get', get]]) {
    Object.defineProperty(container, name, { value: implementation, configurable: true, writable: true });
    Object.defineProperty(navigator.credentials, name, { value: implementation, configurable: true, writable: true });
  }
  window.__vernierSoftwareAuthenticator = { credentialId: SEED.credentialId };
})();`;
}
