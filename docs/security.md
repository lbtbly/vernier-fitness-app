# Security and recovery

Vernier holds one account, on one machine, behind one gate. This is what the
gate is made of, and what to do when you are on the wrong side of it.

## The gate

Tailscale gets a device to the sign-in screen. It does not get anyone in. Every
screen except sign-in, the liveness endpoint, the offline document, the two
diagnostics reports and the static shell refuses a request with no session:
an API path answers 401, a page redirects to `/sign-in`.

`scripts/route-table.mjs` walks every route the app serves and prints what each
one answers to a caller with no session. Run it against the live origin after
any change that adds a route:

```
node scripts/route-table.mjs https://lamberts-mac-mini.tailda76d6.ts.net
```

## What protects the account

**Passkey first.** Registered against relying party `tailda76d6.ts.net`, which
is the tailnet and not the machine name, so renaming the Mac mini does not
invalidate it. A passkey synced through iCloud Keychain reports a signature
counter of 0 for its whole life; Vernier stores what the authenticator reports
and never invents an increment, which is what stops a synced passkey from
locking you out on its second use.

**Backup password second.** Argon2id through Node's own crypto at m=19456 KiB,
t=2, p=1, with a 16-byte nonce for this owner. The salt and all four parameters
are stored in columns beside the tag, and a verification reads them from the row
rather than from source, so the cost can be raised later without invalidating
the password already set.

**Session.** HttpOnly, Secure, SameSite=Strict, eight hours, and the value is
minted fresh on every sign-in. The database holds only the SHA-256 of it.

**Rate limit.** Five failed attempts inside 60 seconds pause sign-in, correct
credentials included, until the window passes. Every attempt writes one row to
`auth_attempt`, whatever the outcome.

**Third-party credentials.** Encrypted with `MASTER_KEY` using AES-256-GCM, with
the provider name as additional authenticated data. The app refuses to start
without the key and fails loudly rather than returning an empty value when the
key does not match the row. Settings renders state, scope and last successful
sync, and never a credential.

## Recovery, from the Mac mini's own shell

No security question. Nothing is emailed. Nothing below can be done from the
network: every command needs shell access to this machine, which already
outranks any password stored on it.

Read the state first:

```
scripts/recovery.sh status
```

It prints the owner row, the Argon2id parameters that row carries, every
registered passkey with its counter and last use, and how many failed attempts
are inside the current lockout window.

### The phone is lost, or the passkey is gone

```
scripts/recovery.sh password
```

Type a new backup password twice. It is read from the terminal, never from an
argument, hashed on this machine and written to the owner row. Then sign in on
any device with "Use the backup password".

### You want in right now, without changing the password

```
scripts/recovery.sh link
```

It prints a one-time sign-in URL, good for ten minutes and one use. Open it on
the device you want signed in. Spending it writes an audit row like every other
way in. `scripts/recovery.sh link 2` makes one that lasts two minutes.

### Locked out by the rate limiter

Wait 60 seconds, or:

```
scripts/recovery.sh unlock
```

Nothing is edited and nothing is deleted. It appends one row that the limiter
reads as the start of a new window, and every failure that led there is still on
the record.

### A passkey you no longer trust

```
scripts/recovery.sh passkeys
scripts/recovery.sh forget-passkey <identifier>
```

Removing the last passkey leaves the backup password as the only way in, which
is why the password is mandatory at first run.

### Both are gone and the machine is yours

Set a new password with `scripts/recovery.sh password`, sign in, then add a
passkey from Settings on the device you actually carry. There is no other path,
by design: an account that can be recovered by answering a question is an
account anyone who can guess the answer owns.

## What the master key protects, and what happens without it

`MASTER_KEY` is 32 random bytes in base64url in the environment file. Every
third-party credential in the database is encrypted with it.

- **Missing.** The app refuses to start and prints
  `[vernier] refusing to start: MASTER_KEY is not set`. It creates no owner and
  serves nothing, because a process that boots without the key would write the
  next credential in the clear.
- **Wrong.** Reading a stored credential throws `MasterKeyMismatchError` naming
  the fingerprint the row was written under and the fingerprint of the running
  key. It never returns an empty value, because an empty value reads downstream
  as "not connected yet" and that is how a credential store starts lying.

Losing the key means the stored third-party credentials are gone. Reconnect each
integration from Settings; nothing else in the database depends on it.
