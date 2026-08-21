#!/usr/bin/env node
// Fills the two generated values the owner's environment file leaves empty:
// the master key that encrypts third-party credentials at rest, and the
// Postgres password.
//
// It never overwrites a value that already has content, it preserves every
// other line and its quoting byte for byte, and it prints what it changed
// without printing any value. Safe to run twice.
import { randomBytes } from 'node:crypto';
import { fillEmptyKeys, printReport } from './lib/envfile.mjs';

const SIZES = {
  // 32 bytes, base64url. AES-256-GCM takes the decoded bytes.
  MASTER_KEY: 32,
  // 24 bytes, base64url. It lands inside a connection string, so the alphabet
  // has to be URL safe and it is.
  POSTGRES_PASSWORD: 24,
};

function generate(key) {
  return randomBytes(SIZES[key]).toString('base64url');
}

try {
  printReport('gen-env', fillEmptyKeys(Object.keys(SIZES), generate));
} catch (error) {
  console.error(`gen-env: ${error.message}`);
  process.exit(1);
}
