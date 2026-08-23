# Privacy

Vernier holds one person's health record on one Mac mini in his own home. It is
processed under the household exemption of the GDPR, Article 2(2)(c), because it
is a purely personal activity with no professional or commercial purpose and the
record is not shared with anyone. That exemption is the reason this document is
short. It is not a reason for it to be vague, so what follows is what actually
happens, named per purpose, with the code that does it.

Written 2026-08-23. Every claim about this app's own behaviour is checked by
something: the retention table below is compared to `src/lib/backup/categories.ts`
by `npm run compliance` on every run of the gate, and the deletion and export
paths are exercised in `tests/e2e/backup.spec.ts`.

## What is stored, and why

| Category | id | Retention | What it holds | Why it is held |
|---|---|---|---|---|
| Body measurements | `body` | `until-deleted` | Weight, waist and every other measured value, each with its source, its confidence and its correction history | The product is a weight and body-composition trend. A trend is the history. |
| Apple Health samples | `phone_health` | `until-deleted` | Steps, sleep, heart rate and workouts as the iPhone shortcut sent them, plus the batch each arrived in | The raw sample is evidence of what the device said, and a roll-up that disagreed with it later has to be answerable. |
| Blood tests and documents | `laboratory` | `until-deleted` | Uploaded laboratory PDFs and the values extracted from them | A panel is compared with the previous panel, which means keeping the previous panel. |
| Training | `training` | `until-deleted` | Planned sessions, runs, every set logged, readiness answers and progression proposals | Progression is computed from what was actually lifted. |
| Meals, recipes and shopping | `nutrition` | `until-deleted` | Meal plans, entries, photographs, recipes, shopping lists and what is in the cupboard | A week is planned against the weeks before it. |
| Assistant history | `assistant` | `until-deleted` | What was sent to Claude, what came back, and what each call cost | So that the monthly ceiling is arithmetic over a ledger rather than a guess, and so that an estimate can be traced to the reply that produced it. |
| Calendar, reminders and reviews | `planning` | `until-deleted` | Availability read from Google, the sessions written to the dedicated calendar, reminders and the Sunday reviews | Every write to a calendar keeps its undo, permanently. |
| Account and credentials | `account` | `until-revoked` | The owner row, passkeys, and third-party tokens sealed with `MASTER_KEY` | Signing in, and staying connected to the scale and the calendar. Removed when the credential is removed. |
| Sign-in sessions | `sign_in_session` | `8-hours` | The SHA-256 of each live session cookie | Enforced: a row past its expiry is deleted by `src/db/auth.ts`. |
| Passkey ceremonies | `sign_in_challenge` | `2-minutes` | One challenge per sign-in or registration attempt | Enforced: a row past its expiry is deleted by `src/db/auth.ts`. |
| Ingest replay window | `ingest_nonce` | `24-hours` | One row per accepted ingest request, so the same request cannot be replayed | Enforced: a row past its expiry is deleted by `src/db/ingest.ts`. |
| Sign-in and deletion audit | `audit` | `life-of-install` | Every sign-in attempt, every one-time link, and every permanent deletion | An audit trail a control could erase is worth nothing. |
| Machine records | `operations` | `life-of-install` | Scheduled runs, archive runs, push deliveries, alerts and this installation's own metadata | The operator console reads them, and a failure that left no row is a silence. |
| Reference data | `reference` | `life-of-install` | The food table, the movement catalogue and the analyte catalogue this app shipped with | Not the owner's data. It came with the app and goes with it. |
| Encrypted archives | `archives` | `30-archives` | The nightly archive, encrypted | Enforced: the retention pass keeps the newest N and removes the rest, and records what it removed. |

The seven categories at the top of the table are the ones the permanent-delete
control on **Settings, Data and backups** offers. The rest are the account
itself, the sign-in machinery, the audit trail and the data this app shipped
with, and none of them is reachable from that control or from the database door
behind it.

## The lawful basis, per purpose

Under the household exemption there is no controller and no lawful basis to
declare, because the Regulation does not apply to processing in the course of a
purely personal activity. The table below is what the basis WOULD be if this
same processing were done by anyone else, stated because a document that says
"the exemption applies" and stops has told the reader nothing about what happens
to his data.

| Purpose | What it processes | Basis it would rest on |
|---|---|---|
| Recording and charting his own measurements | Body measurements, Apple Health samples | Consent, given by typing the number or installing the shortcut |
| Reading the scale | The Withings account he connected | Consent, given at the Withings consent screen and revocable there and here |
| Extracting a laboratory PDF he uploaded | Documents and their values | Consent, given by choosing the file |
| Estimating a meal from a photograph | One photograph and three words of context | Explicit consent, per category, revocable on the AI consent screen |
| Writing sessions to a calendar | Times and session names, in a calendar this app created | Consent, given at the Google consent screen |
| Sending a weekly review by email | The figures in that week's review | Consent, given by configuring a mail host; with none configured nothing is sent |
| Notifying him that something broke | The words of the notification | Explicit consent, given at the browser's permission prompt |

## Who else receives anything

Six, and this is all of them. Each line names what leaves this machine, and the
file that sends it.

| Processor | What it receives | Where it is sent from |
|---|---|---|
| **Withings** | The OAuth exchange and the polling requests, which tell Withings that this account is being read. No measurement is sent to Withings: it already has them, and this app only reads. | `src/lib/withings/client.ts` |
| **Google** | The calendars this app was pointed at, the busy periods it reads back, and the events it writes into ONE dedicated calendar it created. Availability is read as time ranges; event titles from other calendars are never read and never stored. | `src/lib/google/client.ts` |
| **Anthropic** | One photograph at 1092 px with its EXIF removed plus three words of context, or a set of targets and exclusions, or a single analyte NAME. Never a weight, never a laboratory value, never a history, never a name, never a location, never a token. Each of the three is behind its own switch and the switches are independent. | `src/lib/ai/transport.ts`, and the boundary is checked by `tests/unit/no-provider-access.test.ts` |
| **Apple** | Web Push messages travel through Apple's push service to the iPhone. The body is encrypted end to end under keys the browser generated, so what Apple carries is ciphertext, an endpoint identifier and a delivery time. | `src/lib/push/registry.ts` |
| **Apple, again, for iCloud Drive** | The nightly archive, encrypted with AES-256-GCM under a key derived from a secret that is not in iCloud, before it is written. What syncs is a file iCloud cannot read. | `src/lib/backup/run.ts` |
| **A mail relay, only if one is configured** | The weekly review, which contains health figures in plain text. With no host configured, nothing is sent and the review stays in the local preview. | `src/lib/mail.ts` |

**Tailscale carries the connection and not the content.** The tailnet is
WireGuard between devices; TLS is terminated by Tailscale Serve on this Mac.
Tailscale's coordination service sees which devices exist and when they connect.
It does not see a request body, and it is never the authentication: every screen
behind the tab bar refuses a request with no session, whatever network it came
from.

## Getting a copy

**Settings, Data and backups, Export everything.** Three files:

- **JSON**, every value with its source, confidence and correction history.
- **CSV**, one file per table inside a zip, for a spreadsheet.
- **PDF**, a readable report of what stands today, with the source beside each
  value and the laboratory's own printed interval beside each result.

The JSON and the CSV carry the same rows and both go back into a database:
`node scripts/import-export.mjs <file> --into <a scratch database> --truncate`
loads either one and prints the row count from the file beside the row count in
the database, table by table.

**What the export does not carry, and why.** Passkeys, session hashes, the
sign-in audit, the sealed third-party tokens, this machine's own diagnostics,
and the reference data the app shipped with. The first four are credentials or
their shadows and a plaintext download is the wrong place for them; the last is
not his data. The file names every exclusion and its reason in its own `meta`
block, so a person holding the download can see the shape of what he was not
given.

## Deleting it

**Settings, Data and backups, Delete permanently.** Choose a category, type
`delete` followed by the category name, and every row of it goes, along with
every file that belongs to it. There is no undo, no grace period and no soft
delete.

Three things are true of that button and are worth stating plainly:

1. **The phrase is checked twice.** The screen compares it, and
   `vernier_delete_category` in the database recomputes it from the category and
   refuses anything else. A route that stopped checking would still be refused.
2. **It is one of exactly three ways past the append-only guarantee**, and all
   three are written down in `docs/backup-restore.md`. Measurements, health
   samples, meal entries and calendar writes are protected by triggers that
   refuse UPDATE and DELETE outright; this door disables only the triggers whose
   names end in `_append_only`, only on the tables of the category being
   emptied, only inside one transaction, and it names every one it stepped past
   in what it returns.
3. **Archives already written are not touched.** A restore can still bring back
   what was deleted, which is either a comfort or a warning depending on what
   you were trying to do. To destroy something permanently, delete the category
   AND remove the archives from the backup folder.

The deletion itself is recorded, permanently: the category, the date, what was
there before and what went. That row survives the rows it describes, and the
delete control cannot reach it.
