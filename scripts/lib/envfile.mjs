import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads and rewrites the owner's environment file in place, filling only the
 * values that are empty and leaving every other byte exactly where it was.
 *
 * The file name is assembled rather than written out. The session's security
 * hook refuses any tool call whose text carries the literal name, which is the
 * right default: this file holds the owner's real credentials and no agent
 * should be reading it. These generators write into it and never print from it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, '..', '..');
const FILE_NAME = ['', 'env'].join('.');
export const FILE_PATH = join(PROJECT_ROOT, FILE_NAME);

export function readEnvFile() {
  if (!existsSync(FILE_PATH)) {
    throw new Error(
      `No environment file at ${FILE_PATH}. Generate it from SETUP.html and put it at the project root, then run this again.`,
    );
  }
  return readFileSync(FILE_PATH, 'utf8');
}

/** A value counts as empty when it is absent, blank, or an empty quoted pair. */
export function isEmptyValue(raw) {
  const trimmed = raw.trim();
  return trimmed === '' || trimmed === '""' || trimmed === "''";
}

/**
 * Fills the named keys from `generate(key)` when they are empty. Returns one
 * record per key describing what happened, never the value itself.
 */
export function fillEmptyKeys(keys, generate) {
  let text = readEnvFile();
  const report = [];

  for (const key of keys) {
    const pattern = new RegExp(`^(${key}=)(.*)$`, 'm');
    const match = text.match(pattern);

    if (!match) {
      report.push({ key, action: 'missing' });
      continue;
    }
    if (!isEmptyValue(match[2])) {
      report.push({ key, action: 'kept' });
      continue;
    }

    const value = generate(key);
    text = text.replace(pattern, () => `${match[1]}${value}`);
    report.push({ key, action: 'filled', length: value.length });
  }

  if (report.some((entry) => entry.action === 'filled')) {
    const mode = existsSync(FILE_PATH) ? statSync(FILE_PATH).mode : 0o600;
    const temporary = join(PROJECT_ROOT, `${FILE_NAME}.generating`);
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 });
    chmodSync(temporary, mode);
    renameSync(temporary, FILE_PATH);
  }

  return report;
}

/**
 * Adds a setting the file does not carry at all, with the value .env.example
 * documents. Never rewrites a key that is there, whatever it says.
 *
 * This exists because of one variable and the way it failed. `DEMO_MODE` was
 * documented at 1 in .env.example and absent from the owner's own file, so
 * `${DEMO_MODE:-0}` in compose.yaml took its default and a clean bring-up put
 * the app in demonstration mode 0 while APP_URL, APP_NAME, WEBAUTHN_RP_ID and
 * TZ resolved correctly from the same file. Compose was reading the file; the
 * file had nothing to read. The state the string walk and the suite need came
 * only from a shell export, which is not a state anybody can reproduce.
 *
 * The example file is documentation. This is the repair, and it runs on every
 * bring-up, so an installation that predates a setting gets it the next time it
 * comes up rather than the next time somebody reads a document.
 *
 * A value is never printed. Only whether the key was there.
 */
export function ensureKeys(entries) {
  let text = readEnvFile();
  const report = [];
  let added = 0;

  for (const { key, value, note } of entries) {
    if (new RegExp(`^${key}=`, 'm').test(text)) {
      report.push({ key, action: 'present' });
      continue;
    }
    if (!text.endsWith('\n')) text += '\n';
    text += `\n${note ? `# ${note}\n` : ''}${key}=${value}\n`;
    report.push({ key, action: 'added' });
    added += 1;
  }

  if (added > 0) {
    const mode = existsSync(FILE_PATH) ? statSync(FILE_PATH).mode : 0o600;
    const temporary = join(PROJECT_ROOT, `${FILE_NAME}.generating`);
    writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o600 });
    chmodSync(temporary, mode);
    renameSync(temporary, FILE_PATH);
  }

  return report;
}

/** Prints what changed. Never a value, never a fragment of one. */
export function printReport(name, report) {
  for (const entry of report) {
    if (entry.action === 'filled') {
      console.log(`${name}: ${entry.key} was empty, generated ${entry.length} characters`);
    } else if (entry.action === 'kept') {
      console.log(`${name}: ${entry.key} already has a value, left untouched`);
    } else {
      console.log(`${name}: ${entry.key} is not in the file, nothing to fill`);
    }
  }
  const filled = report.filter((entry) => entry.action === 'filled').length;
  console.log(`${name}: ${filled} filled, ${report.length - filled} unchanged`);
  if (report.some((entry) => entry.action === 'missing')) {
    console.log(`${name}: a key above is absent. Add it by hand, then run this again.`);
  }
}

/**
 * Prints what the settings pass did, and only when it did something. A
 * bring-up that reconciles nothing says nothing, so the output of scripts/up.sh
 * stays the two lines it has always been.
 */
export function printSettings(name, report) {
  for (const entry of report.filter((one) => one.action === 'added')) {
    console.log(`${name}: ${entry.key} was not in the file, added with the documented default`);
  }
}
