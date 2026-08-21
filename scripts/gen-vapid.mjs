#!/usr/bin/env node
// Fills the VAPID key pair the owner's environment file leaves empty. Web Push
// on iOS needs a P-256 pair: the public key is the uncompressed point, both
// halves base64url, which is what RFC 8292 asks for and what web-push expects.
//
// No dependency, and no key material on stdout. Safe to run twice: a pair that
// already has content is left alone, because regenerating it would silently
// invalidate every subscription the phone has already made.
import { generateKeyPairSync } from 'node:crypto';
import { fillEmptyKeys, printReport } from './lib/envfile.mjs';

function makePair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });

  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pub.x, 'base64url'),
    Buffer.from(pub.y, 'base64url'),
  ]);

  return {
    VAPID_PUBLIC_KEY: point.toString('base64url'),
    VAPID_PRIVATE_KEY: Buffer.from(priv.d, 'base64url').toString('base64url'),
  };
}

// One pair, both halves, or the public key would not match the private one.
let pair = null;
function generate(key) {
  if (!pair) pair = makePair();
  return pair[key];
}

try {
  const report = fillEmptyKeys(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'], generate);
  const filled = report.filter((entry) => entry.action === 'filled').length;
  if (filled === 1) {
    console.log('gen-vapid: only one half was empty. The pair is now mismatched; clear both and run this again.');
  }
  printReport('gen-vapid', report);
} catch (error) {
  console.error(`gen-vapid: ${error.message}`);
  process.exit(1);
}
