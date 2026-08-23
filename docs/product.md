# What Vernier is for

One person, one health record, on one machine. This document states what the
product is intended to do, what it is not, and where the line is drawn in the
code, so the answer does not have to be reconstructed from the screens.

Written 2026-08-23, for slice 7, which is where laboratory results enter the
product.

## Intended purpose

**Vernier is a personal record-keeping and training-planning tool for one
adult, self-hosted on his own machine.** Its intended purpose is:

- to store measurements he takes or receives, with their origin and their
  original value kept permanently;
- to draw those measurements as trends over time, so a direction is visible
  where a single reading is noise;
- to propose training sessions and meals, which he accepts, edits or rejects
  one at a time before anything is written;
- to explain, in general terms, what a laboratory analyte measures and what
  reference ranges are published for it, citing a public source.

That is the whole of it, and each of those four is something the owner could do
with a notebook, a ruler and a public reference page. Vernier does it faster and
keeps better records.

## What Vernier is not

**Vernier is not a medical device.** It has no intended medical purpose within
the meaning of Article 2(1) of Regulation (EU) 2017/745. It is not intended for
diagnosis, prevention, monitoring, prediction, prognosis, treatment or
alleviation of disease.

**Vernier performs no diagnosis.** It does not interpret a result, does not
classify a result as normal or abnormal, does not calculate a risk, does not
recommend a clinical action, and does not tell the owner what any of his numbers
mean for his health. It stores the number, keeps the printed original beside it,
draws it on a chart, and stops.

It is not a decision-support tool. Nothing in it reads a stored value against a
reference range, a threshold or a rule and produces an output that a person or a
clinician would act on. The reference interval printed on a laboratory sheet is
stored and displayed exactly as the laboratory printed it, because it is part of
the record; it is never compared against the result in code.

It gives no dietary or training advice for a medical condition. The training and
nutrition proposals are planning aids for a healthy adult, every one of them is
proposed rather than applied, and every one is accepted by hand.

## Why the wording is the test

MDCG 2025-4, on the qualification and classification of medical device software,
and the June 2025 revision of MDCG 2019-11, on Rule 11, both turn on the same
thing: the **stated intended purpose** of the software is what decides whether
it is a medical device, and what the manufacturer claims in the interface counts
as part of that statement.

The consequence for this build is narrow and severe. One sentence in the product
saying what a result means for this person, or what to do about it, would state a
diagnostic or therapeutic purpose and would reclassify the software, and a
disclaimer in this document would not undo it. The boundary is one sentence wide.

So it is checked rather than remembered:

- Every laboratory explanation is rendered by one function,
  `renderExplanation` in `src/lib/labs.ts`, from five templates in
  `src/lib/strings.ts`. None of the five takes a result as an argument. There is
  no branch that reads a stored value and no sixth part for a verdict to live in.
- `npm run compliance` renders every explanation the shipped code can produce,
  for every analyte in the catalogue, and scans the result against a
  banned-phrase list covering assessment of the reader, clinical instruction and
  urgency. One match fails the run.
- The same check asserts the positive half: every explanation states a general
  reference range, names the laboratory's own interval as the one that belongs
  with the number, says that this product stores rather than reads, invites a
  professional, and cites a public source with a URL.
- The same check reads this document and fails if it stops making any of the
  five claims above.
- It prints the population it walked on every run, and it fails if the
  catalogue holds fewer analytes than the rubric names. A clean walk over an
  empty catalogue reads exactly like a clean walk over a full one.
- It carries four sentences that MUST be caught and fails if any of them comes
  back clean, so the check is watched refusing something on every run.

## What a laboratory explanation says

Five parts, in this order, for every analyte:

1. The general adult reference range published for that analyte, with its unit.
2. That reference intervals differ between laboratories and between methods, so
   the interval printed on the sheet belongs with the number beside it.
3. That Vernier stores the number, keeps the printed original and draws the
   trend, and does not read the number.
4. An invitation to take the question to the doctor who ordered the panel or to
   the laboratory that issued the sheet.
5. The public source: MedlinePlus Medical Tests, published by the U.S. National
   Library of Medicine, `https://medlineplus.gov/lab-tests/`, consulted
   2026-08-23.

An analyte the owner adds himself carries no published general range, and its
explanation says so rather than presenting the laboratory's own interval as if
it were a population range.

## Blood pressure

Blood pressure is refused everywhere in this product: there is no field, no
chart, no toggle, no setting and no column. A laboratory document containing a
blood-pressure reading has that line dropped at extraction, and the review screen
names the refusal without printing the value it refused. Two locks, not one: the
parser never returns the value, and a database trigger refuses any measurement or
analyte whose name means blood pressure.

The reason is the brief's own: it is the one reading in a general panel that
invites interpretation more than any other, and a product that will not interpret
anything is better off not holding it.

## What leaves this machine

For a laboratory import, nothing. The PDF is parsed locally by `unpdf`. A page
with no text layer is recognised locally, reading its language data off the
storage volume rather than from a content delivery network. Claude is not called
for a laboratory import at all, and the review screen says so on the screen where
the owner decides what to keep.

## Third-party terms

Written for slice 10, which is where the recipe box and the takeaway provider
enter the product. Slice 11 adds the calendar to this section when it lands.

Each claim below names the page that was consulted and the date it was read.
Where a page refused an automated fetch, that is stated rather than papered
over, because a terms position resting on a page nobody could open is not a
position.

### The recipe box, HelloFresh

| Claim | Page consulted | Verified |
|---|---|---|
| No documented public or personal-use recipe API exists | HelloFresh terms of use, via the two secondary sources below; the terms page returned HTTP 403 to an automated fetch | 2026-08-21 |
| Automated and bulk access is prohibited by the standard terms | `divisionby0.de/blog/2022-12-26--HelloFresh-RecipeDownloader`, `github.com/CNoetzel/HelloFresh-RecipeDownloader` | 2026-08-21 |

**What Vernier does.** One artifact the owner already holds, parsed on this
machine: a link he pastes, a PDF he downloaded from his own account, a
photograph of his own recipe card, or ingredient lines he types. The four are
implemented in `src/lib/recipe-box.ts` and read by `/api/meals/box`.

**What Vernier does not do, and cannot.**

- It stores no credential for the provider. There is no field, no column and no
  encrypted blob: `integration_credential` holds Withings and Google, and
  nothing in this repository writes a HelloFresh row to it.
- It runs no crawler and no scheduled fetch. `node-cron` is used by slice 12 for
  the Sunday review and by nothing else, and no scheduled job in this repository
  names the provider.
- **It does not fetch the pasted link either.** A link is read as a string: the
  slug gives a candidate name and the URL is kept as the recipe's provenance.
  Opening a socket to that host from a server is automated access, which is the
  one thing the terms are unambiguous about, so this product does not do it and
  the import screen says so.

**The repository search that backs this.** `tests/unit/no-provider-access.test.ts`
walks every file under `src/`, `scripts/` and `drizzle/`, prints the number of
files it read, and fails if any of them names the provider's hostname outside a
comment, or names it anywhere near a scheduler, a credential store or a fetch.
It also fails if the search population is empty, because a clean walk over
nothing reads exactly like a clean walk over everything.

### The takeaway provider, Uber Eats

| Claim | Page consulted | Verified |
|---|---|---|
| No public consumer API. The Marketplace and Direct APIs are partner-only, and scraping and bulk collection are prohibited | `uber.com/legal/en/document/?name=uber-eats-api-terms-of-use` | 2026-08-21 |
| No documented deep-link format for the food product. Uber's deep-linking documentation covers Rides only | `developer.uber.com/docs/deep-linking` | 2026-08-21 |

**What Vernier does.** It proposes two meals a week as DISH TYPES, chosen from
eight this product authored, filtered by the owner's four dietary rules through
the same `applyDietaryRules` the weekly menu uses, and ordered by how close each
one sits to the energy the day leaves for that meal. The link opens the
provider's own search page with the dish words in the query.

**What Vernier does not do, and cannot.**

- It constructs no item-level link, no restaurant link and no store identifier,
  because no format for any of them is documented. The check constraint
  `takeaway_proposal_link_is_a_search` in the migration refuses to store a URL
  that is not a search page, so this is a property of the database and not of a
  handler.
- It stores no menu item, no price and no restaurant. There is no column for any
  of them on `takeaway_proposal` or anywhere else in `src/db/schema.ts`.
- Every energy figure it shows is computed from ANSES CIQUAL rows for the dish
  type's own ingredients and is badged as an estimate. Where the rows are not
  there it renders "unknown". No nutrition figure is ever taken from a menu,
  because no menu is ever read.

### Anthropic

Not a scraping question, a data-minimisation one, and it is answered on the
screen rather than here: `/settings/ai` names the four categories, what each one
sends, and what each one never sends. With a category switched off no request is
made for it at all, which `tests/unit/ai-consent.test.ts` proves by asserting an
empty request log rather than a disabled control.

A photograph is downscaled to 1092 px and re-encoded through a canvas on the
phone before any request exists, which removes camera data and location by
producing new pixels rather than by editing a metadata format. The server
refuses a photograph that still carries either, and strips every remaining
metadata segment before writing to the volume, so the stored file carries none.
