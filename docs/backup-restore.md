# Backup and restore

Everything in this file runs on this Mac mini with `node` and `docker`, both of
which are already installed. There is no `age`, no `gpg`, no `openssl` and no
`pg_restore` anywhere in it, on purpose: none of the four is on this machine,
the last two are absent from `node:24-slim` as well, and discovering during an
actual emergency that a restore needs a program you do not have is the failure
this whole slice exists to prevent.

Written 2026-08-23.

## What happens every night

At 03:00 Europe/Paris the app writes one archive. It is a single encrypted file
whose name is the instant it was written, in UTC:

```
vernier-20260824T030000Z.archive
```

Inside, after decryption, is a plain tar with four members:

| Member | What it is |
|---|---|
| `manifest.json` | What this archive is: when, by which version, against which schema, how many rows in each table, the SHA-256 of every other member |
| `schema.sql` | Every generated migration in order. Enough to build an empty database from nothing |
| `data.sql` | Every row of every table, as `insert ... select ... from json_populate_recordset(...)`. Postgres formatted every value and Postgres parses it back |
| `storage.tar` | The media and document volume: laboratory PDFs, meal photographs, everything under `/app/storage` except the archives themselves |

`tar -tvf` lists it and `tar -xf` unpacks it, on any machine, with no copy of
this repository. The container is deliberately the oldest and dullest format
there is; only the encryption is ours, because it had to be.

**The tables in it are enumerated at run time**, twice. `src/db/schema.ts` is
walked for what the application declares, and Postgres is asked what it actually
holds. A table the app declares and the database lacks fails the run; a table the
database holds and the app does not model is archived anyway and named in the
manifest as unmodelled. There is one of those, `drizzle.__drizzle_migrations`,
and it is the difference between an archive that restores into an installation
that boots and one whose migrator immediately tries to migrate again.

## How it is encrypted

Chunk-framed AES-256-GCM, from Node's own `crypto`.

- A forty-eight byte header holds the magic, the format version, the cipher, the
  KDF and its parameters, the chunk size, a random nonce prefix and a random
  salt. **All forty-eight bytes are the additional authenticated data of every
  chunk**, so editing the header to claim weaker parameters stops every chunk in
  the file verifying.
- Each chunk is one mebibyte. Its **sequence number and its final flag are in
  its own AAD**, and the sequence is also its nonce, so two chunks swapped are
  two chunks decrypted under the wrong nonce with the wrong AAD.
- A file that ends before the chunk carrying the final flag is **refused by
  name**, not silently returned short. Truncation is the corruption a checksum
  over each part cannot see, because every part that survived is intact.

The key is scrypt (N=32768, r=8, p=1) over a salt that is different in every
archive, applied to `BACKUP_PASSPHRASE` if you have set one and to `MASTER_KEY`
if you have not. Two archives written under one secret share neither a key nor a
nonce space.

**Losing the secret loses the archives.** There is no recovery path and there is
not supposed to be one. `MASTER_KEY` lives in the environment file on this
machine; keep a copy of that file somewhere that is not this machine.

## Where it lands

`BACKUP_DIR` in the environment file is a folder on **this Mac**, inside iCloud
Drive. Compose bind-mounts it into the container at `/app/backups`, and the app
writes there and reports the host path, because an alert reading "cannot write
to /app/backups" tells you nothing you can act on.

If that folder cannot take a file, the archive lands in the **local fallback**,
`/app/storage/backups`, inside the storage volume, and the Data and backups
screen raises an alert naming the folder and the reason: not configured,
missing, not a directory, or not writable with the errno beside it. The archive
is still written and still verified. What is lost is the copy leaving this
machine, which is exactly the thing worth an alert.

**Availability is proven by writing.** The check writes a probe file, reads it
back, compares it and removes it. `existsSync` on a bind mount whose host side
has gone answers true, and so does an iCloud folder the file provider has
stopped serving.

**Retention keeps the newest `BACKUP_RETENTION_DAYS` archives** and removes the
rest. It counts archives rather than ages them, so four runs in one afternoon
with retention at 3 leave three files. Nothing is considered for removal unless
its name matches the archive pattern exactly: the destination is a folder inside
your iCloud Drive, and other things live there.

## Checking an archive without changing anything

```
node scripts/restore.mjs list
node scripts/restore.mjs verify vernier-20260824T030000Z.archive
```

`verify` authenticates every chunk, hashes every member as it streams past,
compares each against the manifest, and prints the listing, the table counts and
the schema version. It exits 0 when everything holds and non-zero with a named
error when it does not.

A bare file name is looked for in `BACKUP_DIR`, then in `./backups`, then
**inside the container**, which is where it is when the configured destination
was not usable.

## Proving it fails when it should

An archive that has only ever been read whole has not been tested. The three
cases, each one command:

```
node scripts/restore.mjs corrupt <archive> --mode truncate --out /tmp/truncated.archive
node scripts/restore.mjs corrupt <archive> --mode reorder  --out /tmp/reordered.archive
node scripts/restore.mjs corrupt <archive> --mode flip     --out /tmp/flipped.archive

node scripts/restore.mjs verify /tmp/truncated.archive   ; echo "exit $?"
node scripts/restore.mjs verify /tmp/reordered.archive   ; echo "exit $?"
node scripts/restore.mjs verify /tmp/flipped.archive     ; echo "exit $?"
```

Each exits 3 and names what is wrong:

```
restore: archive_truncated: the archive is TRUNCATED: it ends without the chunk that marks the end
restore: archive_chunk_unauthenticated: a chunk did not verify: it has been altered, moved, or written under a different secret at chunk 0
restore: archive_chunk_unauthenticated: a chunk did not verify: it has been altered, moved, or written under a different secret at chunk 1
```

The same three corruptions are applied to a real archive on disk in
`tests/unit/backup-run.test.ts`, which runs in the unit suite.

## Restoring into a scratch database

This is the drill. Run it when nothing is wrong, so that the day something is
wrong you have done it before.

```
node scripts/restore.mjs restore vernier-20260824T030000Z.archive \
  --into vernier_restore_check --record
```

It verifies the archive, drops and recreates `vernier_restore_check`, loads the
schema, loads the data, and prints the row count from the archive beside the row
count in the rebuilt database, table by table. It exits 6 if any table differs.

`--record` writes one row into `restore_check` on the live database, which is
what the Data and backups screen reads as **Restore tested**. An archive nobody
has ever restored is a hypothesis, and the screen says which of the two you are
looking at.

To get the files back as well, add `--storage-into /tmp/storage.tar` and unpack
that with `tar -xf`.

## Restoring over the live database

You are here because something is actually wrong. Read the whole section first.

1. **Stop the app so nothing writes while you work.**

   ```
   docker compose stop app
   ```

   Never `down` with a volumes flag. It does not appear anywhere in this
   repository and `tests/unit/volume-safety.test.ts` fails if it ever does.

2. **Check the archive before you trust it.**

   ```
   node scripts/restore.mjs verify vernier-20260824T030000Z.archive
   ```

3. **Restore.** The live database is refused unless you say so twice:

   ```
   node scripts/restore.mjs restore vernier-20260824T030000Z.archive \
     --into health --over-the-live-database
   ```

   It asks you to type `restore over health` at this terminal. Nothing else
   satisfies it: no screen, no route and no scheduled job can type at a
   terminal, which is the point.

4. **Put the files back.**

   ```
   node scripts/restore.mjs restore <archive> --into health \
     --over-the-live-database --storage-into /tmp/storage.tar
   docker compose cp /tmp/storage.tar app:/tmp/storage.tar
   docker compose exec app sh -c 'cd /app && tar -xf /tmp/storage.tar && rm /tmp/storage.tar'
   ```

5. **Start the app and read the screen.**

   ```
   docker compose start app
   ```

   Settings, Data and backups. The archive card, the machine card and the
   integration rows are the check.

## The three ways past the append-only guarantee

`measurement`, `health_sample`, `meal_entry`, `meal_entry_item` and
`calendar_write` each carry a trigger that refuses UPDATE and DELETE outright. A
stored reading is a fact about a moment and no code path may rewrite one. There
are exactly three ways past it and all three need a person:

1. **TRUNCATE at a psql prompt on this machine.** It fires no row-level trigger,
   it needs shell access, and the application cannot reach it. This is the
   owner's own escape hatch and it predates the backup work.
2. **A restore.** It does not edit a row: it replaces a whole database. Pointed
   at the live one it refuses unless you type the phrase above.
3. **`vernier_delete_category`**, the database function behind the permanent
   delete control. It recomputes the typed phrase from the category and refuses
   anything else; it can never reach the account, the passkeys, the sealed
   credentials, the audit trail or the migration ledger, whatever a caller asks;
   it disables only the triggers whose names end in `_append_only`, only on the
   tables of the category being emptied, only inside one transaction; and it
   returns the name of every trigger it stepped past. Foreign keys stay on
   throughout: it does not touch `session_replication_role`.

## Exporting, and putting an export back

Settings, Data and backups, Export everything. JSON, a zip of CSVs, and a PDF
report. Both data files go back:

```
node scripts/import-export.mjs ~/Downloads/vernier-export-2026-08-24.json \
  --into vernier_import_check --truncate
node scripts/import-export.mjs ~/Downloads/vernier-export-2026-08-24.zip \
  --into vernier_import_check --truncate
```

It refuses the live database outright. `--truncate` empties the tables the file
carries, child before parent, before loading them: a scratch instance boots with
reference data and a demonstration seed already in it, and a load on top would
double every table and then report a mismatch about the wrong thing.

## When it goes wrong

The Data and backups screen is the first place to look, and it will have told
you already: any failed archive raises one notification and one persistent
banner naming the surface, the cause and one action. The archive row and its
cause are in `backup_run`, the scheduled run is in `job_run`, and neither is
ever deleted.

| What the screen says | What it means | What to do |
|---|---|---|
| No backup folder is set | `BACKUP_DIR` is empty | Set it in the environment file and `bash scripts/up.sh` |
| The backup folder is not there | The folder or its mount has gone | Check the folder exists in iCloud Drive and is not evicted, then `bash scripts/up.sh` |
| The backup folder refused the write | Permissions, or the disk is full | The errno is in the alert. The machine card shows the headroom |
| Last night's archive did not finish | The run failed | `docker compose logs app --tail 200`, then Back up now |
| The archive does not verify | The file is damaged | Verify the previous one. Retention keeps thirty |

## What this needs from you

Nothing daily. The archive is a scheduled job inside the app, on the same ledger
the Sunday review uses, so a container that was off at 03:00 writes the missed
archive on the way back up, exactly once.

Two things at setup, both already in `.forge/PREFLIGHT.md`: a folder inside
iCloud Drive, and `BACKUP_DIR` in the environment file pointing at it. A change
to either takes effect on the next `bash scripts/up.sh`, because compose reads
the environment file when it creates the container.
