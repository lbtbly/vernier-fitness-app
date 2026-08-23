#!/usr/bin/env node
// Fills the two generated values the owner's environment file leaves empty:
// the master key that encrypts third-party credentials at rest, and the
// Postgres password. It also adds any plain setting the file does not carry,
// with the value .env.example documents.
//
//   node scripts/gen-env.mjs             generate what is empty, add what is absent
//   node scripts/gen-env.mjs --settings  add what is absent, generate nothing
//
// It never overwrites a value that already has content, it preserves every
// other line and its quoting byte for byte, and it prints what it changed
// without printing any value. Safe to run twice.
import { randomBytes } from 'node:crypto';
import { ensureKeys, fillEmptyKeys, printReport, printSettings } from './lib/envfile.mjs';

const SIZES = {
  // 32 bytes, base64url. AES-256-GCM takes the decoded bytes.
  MASTER_KEY: 32,
  // 24 bytes, base64url. It lands inside a connection string, so the alphabet
  // has to be URL safe and it is.
  POSTGRES_PASSWORD: 24,
};

/**
 * Settings that are not credentials, that compose.yaml interpolates, and that
 * an installation made before the setting existed will not have.
 *
 * DEMO_MODE is here because it failed exactly that way. compose.yaml reads
 * `${DEMO_MODE:-0}`, the owner's file was written by SETUP.html before the
 * seed existed, and the default won: `docker compose config` resolved
 * `DEMO_MODE: "0"` while resolving APP_URL, APP_NAME, WEBAUTHN_RP_ID and TZ
 * correctly from the same file, and a clean `bash scripts/up.sh` left the
 * container at 0. The state the string walk and the end-to-end suite need came
 * only from a shell export. A setting that lives in a document and not in the
 * file is a setting the machine does not have.
 */
const SETTINGS = [
  {
    key: 'DEMO_MODE',
    value: '1',
    note: 'Demonstration seed. 1 writes six marked rows on boot, 0 writes nothing. See .env.example.',
  },
  {
    key: 'WITHINGS_MODE',
    value: 'demo',
    note: 'Withings transport. demo runs the whole pipeline with no client id and no network, live opens a socket. See .env.example.',
  },
  {
    key: 'GOOGLE_MODE',
    value: 'demo',
    note: 'Google Calendar transport. demo runs picker, availability, calendar, diff, write and undo with no client id and no network, live opens a socket. See .env.example.',
  },
  {
    key: 'BACKUP_RETENTION_DAYS',
    value: '30',
    note: 'How many daily archives to keep. Counted as archives, so four runs in one afternoon leave the last three. See .env.example.',
  },
  {
    key: 'BACKUP_MOUNT',
    value: '/app/backups',
    note: 'Where the container writes the archive. The mount point compose creates for BACKUP_DIR, never a path on this Mac. See .env.example.',
  },
];

function generate(key) {
  return randomBytes(SIZES[key]).toString('base64url');
}

try {
  printSettings('gen-env', ensureKeys(SETTINGS));
  if (!process.argv.includes('--settings')) {
    printReport('gen-env', fillEmptyKeys(Object.keys(SIZES), generate));
  }
} catch (error) {
  console.error(`gen-env: ${error.message}`);
  process.exit(1);
}
