/**
 * The data categories: what this installation holds, how long it holds it, and
 * which of them the owner can destroy from the interface.
 *
 * THIS FILE IS ONE HALF OF AN ARTIFACT AND `docs/privacy.md` IS THE OTHER.
 * R4 asks for a retention period stated per data category, and F131 asks that
 * the stated period MATCH THE VALUE THE CODE ENFORCES. A document and a
 * constant that agree on the day they are written and drift a slice later are
 * exactly the claim-without-an-artifact those two lines exist to refuse, so
 * `scripts/compliance.mjs` reads this file and reads that table and fails when
 * they disagree, and `tests/unit/privacy-retention.test.ts` reads this file and
 * the four constants the enforcing code actually uses and fails when THOSE
 * disagree. Neither check can pass on its own; the pair is what makes the
 * sentence in the document true.
 *
 * NOTHING HERE IS PROSE. A category's name and its purpose are English and live
 * in `src/lib/strings.ts` behind a key, keyed by the ids below; what is here is
 * ids, table names, directory names and numbers. C6.
 *
 * Dependency free, so `scripts/compliance.mjs` imports it straight from Node.
 */

export type RetentionRule =
  | { kind: 'until_deleted' }
  | { kind: 'until_revoked' }
  | { kind: 'life_of_install' }
  | { kind: 'seconds'; seconds: number }
  | { kind: 'archives'; count: number };

export type CategoryId =
  | 'body'
  | 'phone_health'
  | 'laboratory'
  | 'training'
  | 'nutrition'
  | 'assistant'
  | 'planning'
  | 'account'
  | 'sign_in_session'
  | 'sign_in_challenge'
  | 'ingest_nonce'
  | 'audit'
  | 'operations'
  | 'reference'
  | 'archives';

export type DataCategory = {
  id: CategoryId;
  /** Every table whose rows belong to this category. Disjoint across categories. */
  tables: string[];
  /** Directories under the storage volume this category owns, if any. */
  directories: string[];
  retention: RetentionRule;
  /**
   * Whether the permanent-delete control offers it.
   *
   * The seven that are true are the owner's own record. The rest are the
   * account itself, the sign-in machinery, the audit trail and the reference
   * data the app shipped with: deleting a session from the screen you are using
   * it on is a footgun, and a delete control that could erase the audit trail
   * would make the audit trail worth nothing.
   */
  deletable: boolean;
};

/**
 * How many daily archives are kept. The default behind `BACKUP_RETENTION_DAYS`.
 *
 * One archive a day, so a count of archives and a count of days are the same
 * number here, and the retention pass counts ARCHIVES: F128 runs four times in
 * one afternoon with retention set to 3 and expects three files left, which an
 * age-based sweep would fail while doing nothing wrong.
 *
 * THE SAME NUMBER IS DECLARED IN `src/lib/backup/retention.ts`, WHICH IS WHERE
 * IT IS ENFORCED, and `tests/unit/privacy-retention.test.ts` fails when the two
 * disagree. Two constants and a test, rather than an import, because an import
 * would tie this file to another one and both of these have to be loadable by a
 * plain `node` with nothing but type stripping: this one by
 * `scripts/compliance.mjs` and that one by `scripts/restore.mjs`.
 */
export const DEFAULT_ARCHIVE_RETENTION = 30;

/** Eight hours, which is what `SESSION_MAX_AGE_SECONDS` sets the cookie to. */
const SESSION_SECONDS = 8 * 60 * 60;
/** Two minutes, which is what `CHALLENGE_TTL_SECONDS` gives a ceremony. */
const CHALLENGE_SECONDS = 120;
/** Twenty four hours, which is `NONCE_TTL_HOURS` on the ingest replay window. */
const NONCE_SECONDS = 24 * 60 * 60;

export const DATA_CATEGORIES: DataCategory[] = [
  {
    id: 'body',
    tables: [
      'measurement',
      'source_record',
      'import_question',
      'goal',
      'write_request',
      'idempotency_key',
    ],
    directories: [],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'phone_health',
    tables: ['health_sample', 'ingest_batch'],
    directories: [],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'laboratory',
    tables: ['lab_document'],
    directories: ['labs'],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'training',
    tables: [
      'planned_session',
      'session_proposal',
      'session_movement',
      'session_run',
      'set_log',
      'session_report',
      'progression_proposal',
      'readiness_check',
    ],
    directories: [],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'nutrition',
    tables: [
      'meal_plan',
      'planned_meal',
      'meal_entry',
      'meal_entry_item',
      'shopping_list',
      'shopping_item',
      'shopping_item_source',
      'stock_item',
      'nutrition_target',
      'dietary_rule',
      'recipe',
      'recipe_ingredient',
      'recipe_nutrition',
      'recipe_question',
      'recipe_box_item',
      'takeaway_proposal',
    ],
    directories: ['meals', 'meals-holding'],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'assistant',
    tables: ['ai_call', 'ai_consent', 'usage_ledger'],
    directories: [],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'planning',
    tables: [
      'calendar_busy',
      'calendar_plan',
      'calendar_plan_row',
      'calendar_write',
      'calendar_read_failure',
      'reminder_item',
      'reminder_preference',
      'reminder_setting',
      'weekly_review',
      'review_decision',
    ],
    directories: [],
    retention: { kind: 'until_deleted' },
    deletable: true,
  },
  {
    id: 'account',
    tables: [
      'owner',
      'webauthn_credential',
      'integration_credential',
      'withings_connection',
      'google_connection',
      'push_subscription',
      'ingest_credential',
    ],
    directories: [],
    retention: { kind: 'until_revoked' },
    deletable: false,
  },
  {
    id: 'sign_in_session',
    tables: ['session'],
    directories: [],
    retention: { kind: 'seconds', seconds: SESSION_SECONDS },
    deletable: false,
  },
  {
    id: 'sign_in_challenge',
    tables: ['webauthn_challenge'],
    directories: [],
    retention: { kind: 'seconds', seconds: CHALLENGE_SECONDS },
    deletable: false,
  },
  {
    id: 'ingest_nonce',
    tables: ['ingest_nonce'],
    directories: [],
    retention: { kind: 'seconds', seconds: NONCE_SECONDS },
    deletable: false,
  },
  {
    id: 'audit',
    tables: ['auth_attempt', 'recovery_grant', 'deletion_run'],
    directories: [],
    retention: { kind: 'life_of_install' },
    deletable: false,
  },
  {
    id: 'operations',
    tables: [
      'app_meta',
      'job_run',
      'push_delivery',
      'device_observation',
      'request_origin',
      'backup_run',
      'restore_check',
      'operator_alert',
    ],
    directories: [],
    retention: { kind: 'life_of_install' },
    deletable: false,
  },
  {
    id: 'reference',
    tables: ['food', 'movement', 'movement_media', 'media_allowlist', 'lab_analyte', 'google_demo_event'],
    directories: ['tessdata'],
    retention: { kind: 'life_of_install' },
    deletable: false,
  },
  {
    id: 'archives',
    tables: [],
    directories: ['backups'],
    retention: { kind: 'archives', count: DEFAULT_ARCHIVE_RETENTION },
    deletable: false,
  },
];

/** The seven the permanent-delete control offers, in the order it lists them. */
export const DELETABLE_CATEGORIES = DATA_CATEGORIES.filter((category) => category.deletable);

export function categoryById(id: string): DataCategory | null {
  return DATA_CATEGORIES.find((category) => category.id === id) ?? null;
}

/**
 * The token both sides of the retention check compare.
 *
 * A token rather than a sentence, because the document has to be readable by a
 * person AND comparable by a script, and a sentence is only ever one of those.
 * `docs/privacy.md` carries this token in its own column beside the English.
 */
export function retentionToken(rule: RetentionRule): string {
  switch (rule.kind) {
    case 'until_deleted':
      return 'until-deleted';
    case 'until_revoked':
      return 'until-revoked';
    case 'life_of_install':
      return 'life-of-install';
    case 'archives':
      return `${rule.count}-archives`;
    case 'seconds': {
      // Days only past two of them. `NONCE_TTL_HOURS` is 24 and the code that
      // enforces it counts hours, so a token reading `1-days` would be a
      // document disagreeing with the constant it is supposed to be quoting.
      if (rule.seconds % 86400 === 0 && rule.seconds >= 2 * 86400) {
        return `${rule.seconds / 86400}-days`;
      }
      if (rule.seconds % 3600 === 0) return `${rule.seconds / 3600}-hours`;
      if (rule.seconds % 60 === 0) return `${rule.seconds / 60}-minutes`;
      return `${rule.seconds}-seconds`;
    }
  }
}

/** Which category a table belongs to, or null when nothing claims it. */
export function categoryOfTable(table: string): DataCategory | null {
  return DATA_CATEGORIES.find((category) => category.tables.includes(table)) ?? null;
}

/** Every table any category claims, for the walk that checks nothing is claimed twice. */
export function claimedTables(): string[] {
  return DATA_CATEGORIES.flatMap((category) => category.tables);
}

/**
 * The phrase the owner types to destroy a category, built from the category id.
 *
 * `delete body`, `delete nutrition`, `delete everything`. Two words, the second
 * of which is the thing being destroyed, so a phrase copied from one confirm
 * dialog cannot be pasted into another and take a category he did not mean.
 * The database door in `drizzle/pending/13-backup.sql` recomputes this and
 * refuses anything else, so the check is not the screen's alone.
 */
export const DELETE_PHRASE_VERB = 'delete';

export const EVERYTHING = 'everything';

export function deletePhrase(id: string): string {
  return `${DELETE_PHRASE_VERB} ${id.replace(/_/g, ' ')}`;
}
