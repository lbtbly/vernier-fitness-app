# Pending DDL, one file per slice

Drizzle generates `drizzle/000N_*.sql` from `src/db/schema.ts`, and it keeps a
chain: `meta/0008_snapshot.json` is a diff against `0007`'s state. So a
migration number is not a name that can be changed later. Nine slices built in
parallel would each generate `0007`, and renumbering afterwards would leave a
chain that does not reconcile.

The contract that avoids it:

- A slice edits `src/db/schema.ts` for everything drizzle models.
- A slice writes the DDL drizzle cannot express into `pending/<slice>.sql`, a
  file only that slice owns, so two slices never touch one file. Triggers,
  generated columns, composite foreign keys, partial indexes, check constraints
  and seed SQL live here.
- A slice never runs `drizzle-kit generate` and never touches `drizzle/000N_*.sql`
  or `drizzle/meta/`.
- On merge, on main, in order: `npm run db:generate` numbers that slice's
  migration, the pending file is appended to it, and the pending file is deleted.

An empty `pending/` is the normal state between merges.
