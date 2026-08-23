# Google Calendar

Vernier writes your training week into a calendar it creates itself, and reads
nothing from your other calendars except when you are busy. This is what it asks
Google for, what it does with it, and what you type into the Cloud console once.

Every fact below is read off an official Google page. The dated, cited version
with the URLs is `.forge/research/google-calendar.md`, checked 2026-08-21.

## The three scopes, and the two that are never asked for

These three, exactly, in this order. Paste them into
**Google Auth Platform > Data access > Add or remove scopes**, and nothing else:

```
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.app.created
```

| Scope | What it buys | Google's own description |
|---|---|---|
| `calendar.calendarlist.readonly` | The picker, which needs calendar identifiers | "See the list of Google calendars you're subscribed to." |
| `calendar.freebusy` | When you are busy, and nothing about why | "View your availability in your calendars." |
| `calendar.app.created` | The calendar this app makes, and every event in it | "Make secondary Google calendars, and see, create, change, and delete events on them." |

**Never `https://www.googleapis.com/auth/calendar` and never
`https://www.googleapis.com/auth/calendar.events`.** Both grant write access to
every calendar you can touch, and neither is needed for anything this product
does. `calendar.events.freebusy` is not used either: it authorizes the same
free-busy query as `calendar.freebusy` and authorizes reading events on every
calendar as well, so it is strictly wider for the same capability.

The list in the console and the list in the code must match character for
character. A scope in the request that the project has not declared produces the
unverified-app screen on its own, and a scope declared that the request never
sends is an over-broad grant sitting on your account for no reason.
`tests/unit/google-scopes.test.ts` compares this document, the research note and
`src/lib/google/scopes.ts` and fails on any difference between the three.

## What the connection actually does

- **Availability** comes from `freeBusy.query` and from nothing else. It answers
  with intervals, and intervals carry no title, no guest and no location. Vernier
  never lists events on a calendar it did not create.
- **A calendar that answers with an error** is surfaced on the confirm screen and
  never read as free time. An unshared calendar returns an empty busy list, which
  is indistinguishable from a free day unless the errors are read.
- **Every write** targets the calendar this app created. No request path contains
  the `primary` keyword, and the identifier of that calendar is stored on this
  machine because `calendar.app.created` has no way to look it up again.
- **Nothing is written before you confirm it.** Every change is a row on the
  confirm screen with its cause in plain words, additions and moves ticked and
  removals not, and a footer that states the count. The write log under it keeps
  an undo on every write this app has ever made.

## Publishing status, and the one step with no machine check

Set the app to **In production**, unverified, with no test users.

A project left in **Testing** issues a refresh token that stops working seven
days after consent, with no code change, no warning and no error until a sync
fails. Unverified is fine: the personal-use exception covers an app whose only
user is the account that owns the Cloud project, and the consequence is one
screen saying "Google hasn't verified this app" the first time you consent.

## The environment file

```
GOOGLE_MODE=demo               # demo runs the whole flow with no client id
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

The redirect URI must match a value registered on the OAuth client byte for
byte, including scheme, case and trailing slash. Register the loopback one above
and the tailnet one beside it if the console accepts it.

Left blank, the client id and secret put the integration in demonstration mode:
the picker, the busy periods, the dedicated calendar, the confirm diff, the write
and the undo all run against a recorded Google with no network at all, and every
event that lands is marked as a demonstration.

## When Google refuses the grant

`invalid_grant` is permanent. Vernier deletes the stored token the moment it sees
one, records the time and Google's own words, stops every background read, and
shows one reconnect button. It never retries: the causes Google publishes are
revocation, six months of disuse, a token limit and an expired time-based grant,
and none of them is fixed by asking again.

Two neighbours are told apart because they need a different action from you:
`deleted_client` means the OAuth client was removed and has to be restored on the
console's Deleted credentials page, and `invalid_client` means the id or the
secret on this machine is wrong.
