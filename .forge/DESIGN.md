# Design

Single-owner self-hosted health PWA. iPhone first, 393 x 852, dark first.
Direction taken from the brief's taste references and executed, not explored:
Apple Health and Apple Fitness settle it, and a single-user product with no
acquisition surface has nothing for a design tournament to optimise.

**Tooling fallback.** The claude-design MCP server was unavailable in this
session, so there is no Claude Design project and no share link. The documented
fallback applies: every screen is a standalone HTML wireframe in
`.forge/wireframes/`, one self-contained file per screen, each holding its own
tokens and its real states side by side.

**For the verifier:** both artefacts exist and they are the same thing.
`.forge/wireframes/NN-name.html` is the source of truth, and each file carries a
light-mode toggle in its top bar. `.forge/screens/NN-name.png` is a full-height
capture of that same file, rendered by the lead with headless Chrome at device
scale 2 after the designer finished, numbered to match the screen list. Compare
shipped screens against the PNGs, and open the HTML when you need a state the
capture flattened or the light theme. Thirteen of each.

---

## 1. Information architecture

1. Five tabs, never six: Today, Health, Train, Eat, Settings. Planning folds
   into Today, which is the spec's own fallback when the bar hits five.
2. **Today** owns the day and the week: today's session, today's meals, what
   needs logging, the weight and waist trends, adherence, and the Sunday review.
3. **Health** owns every trend and the lab archive: weight and waist on one
   axis, activity, sleep, heart, VO2 max, panels, and the lab PDF review.
4. **Train** owns the proposed week, the session player, and the movement
   catalogue with its media provenance.
5. **Eat** owns the nutrition week, the photo meal estimate, the shopping list
   and recipe import.
6. **Settings** owns integrations, AI consent, export, permanent delete, backup
   status and machine status. It is the operator's whole surface.
7. Quick log is a sheet, not a tab. It is raised from Today, from Health, from a
   push notification and from the end of a session.
8. The confirm diff is a screen shape, not a route. The training week and the
   calendar write render the same component with different rows.
9. Sign-in sits outside the tabs. An unauthenticated visitor on the tailnet
   reaches it and the health endpoint, and nothing else.
10. Depth is two. Tab, then detail, then at most a sheet. Nothing the owner
    logged himself sits behind a gate, and nothing useful is three taps deep.

---

## 2. Screen list

Link column reads "local wireframe" because the MCP server was unavailable.
The file path is the artefact.

| # | Screen | Link | File | Intent |
|---|---|---|---|---|
| 00 | Patterns | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/00-patterns.html` | The five states, the provenance affordance and the confirm diff, defined once so no screen improvises them. |
| 01 | Sign in | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/01-sign-in.html` | Passkey first, password second, plus the one-time owner creation and the host-unreachable state. |
| 02 | Today | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/02-today.html` | Answers what do I do today and is my health improving, above the fold, with the trend leading and the stale sync named. |
| 03 | Quick log | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/03-quick-log.html` | Waist, energy, fatigue, hunger, satiety and a note, one handed, committing offline. |
| 04 | Health | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/04-health.html` | Every trend on one screen with weight and waist sharing an axis, and every point walking back to its source. |
| 05 | Labs review | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/05-labs-review.html` | Per-row accept, edit or reject on an extracted panel, printed original beside every conversion, nothing stored until you act. |
| 06 | Training week | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/06-training-week.html` | Three to five proposed sessions, each carrying the cause it was placed on, accepted one at a time. |
| 07 | Session player | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/07-session-player.html` | The guided session with sweaty-hand controls, last week's load inline, and zero interstitials. |
| 08 | Nutrition week | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/08-nutrition-week.html` | The week of meals with full macros including fibre, the HelloFresh second-portion question, and the two Uber Eats slots. |
| 09 | Meal estimate | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/09-meal-estimate.html` | Consent, then portions as ranges, then a saved entry whose estimate origin survives every later edit. |
| 10 | Shopping list | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/10-shopping-list.html` | One consolidated week by aisle, with box-supplied and in-stock items visibly deducted rather than silently removed. |
| 11 | Weekly review | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/11-weekly-review.html` | Sunday at 20:45: the week read back, next week proposed, then the calendar diff a tired person reads in four seconds. |
| 12 | Settings and integrations | local wireframe | `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/12-settings-integrations.html` | Integration status with last successful sync and a test button, AI consent, export, delete, backup and machine state. |

Index of all thirteen: `/Users/lambertbouley/Claude/lbtbly-fitness-app/.forge/wireframes/index.html`

---

## 3. Tokens

Copy verbatim. `:root` holds the scales; the two theme blocks hold colour. The
attribute selectors outrank `:root`, so the order below is load bearing.

```css
:root{
  /* type */
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --t-display: 30px; --t-display-lh: 33px; --t-display-ls: -.02em;  /* screen title, hero metric */
  --t-metric:  34px; --t-metric-lh:  36px; --t-metric-ls:  -.02em;  /* the number that is the point */
  --t-title:   20px; --t-title-lh:   25px; --t-title-ls:  -.01em;
  --t-head:    17px; --t-head-lh:    22px;
  --t-body:    15px; --t-body-lh:    20px;
  --t-sub:     13px; --t-sub-lh:     19px;
  --t-note:    12px; --t-note-lh:    18px;
  --t-label:   11px; --t-label-lh:   14px; --t-label-ls: .06em;     /* uppercase section labels */
  --t-timer:   64px; --t-timer-ls:  -.03em;                          /* session player only */
  /* every numeral that is data: font-variant-numeric: tabular-nums */

  /* spacing, 4 based */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px;
  --s6:24px; --s7:32px; --s8:40px; --s9:48px;

  /* radius */
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px; --r-full:999px;

  /* targets and motion */
  --touch:44px;
  --dur-fast:120ms; --dur:200ms; --dur-slow:900ms;
  --ease: cubic-bezier(.2,.6,.2,1);
}

html[data-theme=dark]{
  color-scheme: dark;
  --bg:#0A0A0B; --surface:#141416; --surface-2:#1C1C1F; --surface-3:#232327;
  --line:#2A2A2E; --line-2:#3A3A40;
  --text:#F5F5F7; --text-2:#A1A1A8; --text-3:#7C7C85;
  --accent:#5AA9FF; --accent-ink:#08080A; --accent-soft:rgba(90,169,255,.14);
  --good:#4FD08A; --good-soft:rgba(79,208,138,.13);
  --warn:#E9B44C; --warn-soft:rgba(233,180,76,.13);
  --alert:#F07A6A; --alert-soft:rgba(240,122,106,.13);
  --chart-daily:#6E6E78;      /* daily reading, deliberately secondary */
  --chart-avg:#E8E8EC;        /* 7-day moving average, the loudest line */
  --chart-goal:#7C8BA1;       /* trajectory to 76.0 kg, dashed 5 5 */
  --chart-band:rgba(124,139,161,.10);
  --chart-grid:#232327;
  --focus:#8FC4FF;
}

html[data-theme=light]{
  color-scheme: light;
  --bg:#F2F2F5; --surface:#FFFFFF; --surface-2:#EDEDF1; --surface-3:#E3E3E9;
  --line:#DCDCE2; --line-2:#C6C6CE;
  --text:#101013; --text-2:#4A4A52; --text-3:#6B6B73;
  --accent:#0A6CD0; --accent-ink:#FFFFFF; --accent-soft:rgba(10,108,208,.10);
  --good:#157F4E; --good-soft:rgba(21,127,78,.10);
  --warn:#8A5A00; --warn-soft:rgba(138,90,0,.10);
  --alert:#B3261E; --alert-soft:rgba(179,38,30,.10);
  --chart-daily:#9A9AA2;
  --chart-avg:#101013;
  --chart-goal:#5B6B80;
  --chart-band:rgba(91,107,128,.10);
  --chart-grid:#E3E3E9;
  --focus:#0A4C93;
}
```

Contrast, measured against its own ground: `--text` 18.9:1 dark and 18.5:1
light, `--text-2` 7.6:1 and 7.4:1, `--text-3` 4.8:1 both, `--accent` 8.0:1 and
4.7:1, `--accent-ink` on `--accent` 8.0:1 and 5.2:1, every semantic colour above
7:1 dark and 4.6:1 light. `--chart-daily` is 3.9:1 against ground, above the 3:1
floor for a graphical object. Nothing on either theme falls under AA.

Chart weights, which are the signature and not negotiable: daily readings are
2.1 px dots in `--chart-daily`, never connected by a line. The 7-day average is
a 2.6 px round-capped path in `--chart-avg`, the highest-contrast object in the
card. The goal trajectory is 1.5 px dashed `5 5` in `--chart-goal` with a
`--chart-band` corridor at plus or minus 0.5 kg. Gridlines are 1 px
`--chart-grid` at whole kilograms only.

Layout constants: phone 393 x 852, status bar 54 px, tab bar 83 px including the
34 px home indicator, screen padding 16 px horizontal, card padding 16 px, card
gap 12 px, card radius `--r-lg`. Usable height above the fold is 715 px, and
Today's session row plus the weight trend must both fit inside it.

---

## 4. Interaction notes

### The five states, one pattern

Rendered together on `00-patterns.html`. Geometry never changes between them.

- **Loading.** Skeleton blocks at the exact final size and position, background
  `--surface-2`, opacity pulse 1 to .5 over 1.4 s. No spinner under 600 ms. No
  placeholder curve, ever, because a fake line is indistinguishable from a real
  one at a glance.
- **Empty.** Dashed-border card, a title naming what is absent, one sentence
  saying what to do, and one primary action. No illustration.
- **Error.** Solid card with `--alert` border, the actual failure in words
  ("HTTP 401, invalid grant, at 06:54"), the cause named, one button, and a line
  saying what still works. An error never implies the rest of the app is down.
- **Offline.** A one-line banner under the title with the queue count. Writes
  commit to the phone and carry a `Queued` chip. Cached charts render at 55 %
  opacity with the cache time in the axis label.
- **Stale sync.** A `--warn` source chip in the card header reading the age
  ("Health, 3 days old"), the affected range hatched in the chart, and a line
  naming the cause and the fix ("The iPhone shortcut last sent a batch on 18
  August at 07:12").

**Absence is drawn, never smoothed.** A gap breaks the line, hatches the missing
range at 45 degrees in `--warn` at 40 % opacity, and labels the dates. No
interpolation, no carry-forward, no zero-fill. A rolling average is drawn solid
only when its window holds 7 of 7 days, dashed at 5 or 6, and not drawn at all
below 5, and any figure computed on a short window states the count next to it
("Last week's average used 3 days of 7").

### Provenance

Every value carries a source chip: Withings, Health, Manual, Lab PDF, Estimate,
Derived, Demo. The chip is neutral chrome, 22 px, `--surface-2` on `--line-2`.
Estimate is the same chip with a dashed border and Demo with a dotted one,
because origin is not a state and must not spend a semantic colour.

- Tap 1 on the value opens the value sheet: stored value and unit, measured at
  and imported at in Europe/Paris, source, confidence, deduplication decision,
  and the append-only correction history with the original struck through.
- Tap 2 is "Open the source": the Withings sync batch, the shortcut payload, the
  PDF page with the row highlighted, the photo and the model reply, or the
  derivation. Same destination shape for all six sources.
- A converted lab value never appears alone. The printed original, the factor
  and the stored value sit on one line: `1.44 g/L  x 2.586  3.72 mmol/L`.
- A correction is never overwritten. A later import that disagrees becomes a
  question with both values, not a silent replacement.

### The confirm diff

One component, used by the training week and by the calendar write.

1. Counts first, at `--t-metric`, in the order added, moved, removed.
2. For a calendar write, the dedicated calendar before and after as two columns,
   additions in `--good`, removals struck through in `--text-3`.
3. Rows grouped by verb. Each row: what, when, and the cause in plain words. A
   move shows `Thu 27, 19:00` struck through, then `Fri 28, 07:15` in bold.
4. Per-row confirm. Additions and moves default selected, removals default
   unselected: you opt in to a delete, never out of it.
5. Sticky footer counts what will happen: "Apply 5 changes". Nothing writes
   before it.
6. After the write, the same list with outcomes, plus undo on that screen, plus
   a permanent write log where every past write keeps its undo.

### Motion register

Minimal and functional: 120 to 200 ms opacity and 4 to 8 px translate on sheets
and rows, the rest timer ring, and the skeleton pulse. No parallax, no spring,
no default library flourish. **One moment of enchantment, at session completion
only:** the progress ring closes and fills over 900 ms with a single haptic. It
belongs there because finishing a session is the only moment in this product
where the user has completed something, and everywhere else motion competes with
a number he is trying to read mid-set or at 20:45 on a Sunday.

### Everything else a builder will ask

- Touch targets are 44 px minimum, 56 px for session controls and 88 px for the
  set-done button. Checkbox glyphs are 28 px inside 56 px rows.
- Focus is a 2 px `--focus` outline at 2 px offset on every interactive element,
  including the shopping checkboxes and the consent switches.
- Dates render Europe/Paris as "21 Aug" or "Friday 21 August". Times are 24
  hour. Units are metric: kg, cm, km, kcal, g, mmol/L or g/L as the laboratory
  printed them. Copy is English and every string is externalised.
- The tab bar's current item is `--accent`. That is chrome and does not count
  against the one-accent rule.
- The session player runs entirely offline with the screen kept awake, and
  reconciles elapsed time from wall-clock timestamps, never from interval ticks.
- Blood pressure has no field, no chart, no toggle and no setting. The only
  place it is ever named is the labs review, as a refusal, and the refusal never
  prints the value it refused.

---

## 5. The three decisions a builder must not improvise

**1. Nothing writes without a confirmed diff, and every write is reversible from
the surface that showed it.** Per-row accept, edit and reject on one screen, not
three flows. No autosave on a lab panel, no all-or-nothing across 22 rows, no
single Accept that bypasses row state. Additions and moves default selected,
removals default unselected. The apply button states the count. Writes land in
the dedicated calendar only, and undo restores exactly the Before column.

**2. Absence is drawn as absence and provenance is never scrubbed.** Charts
break across missing days, hatch the range and label it. No interpolation, no
carry-forward, no zero-fill, no default substituted for a gap, and no average
presented without its window count when the window is short. Every value keeps
its source chip permanently and reaches its source in two taps. An estimate
stays badged as an estimate after it is saved and after it is edited. A
converted value always shows the printed original and the factor.

**3. Colour is state, never decoration.** One accented action per screen, on the
thing due now. `--good` means a trend going the way the owner wants, `--warn`
means something needs attention or is out of date, `--alert` means an operation
failed. A body-composition number that rose is never red, a missed session is
never coloured at all, and origin badges are chrome, not colour. The chart
hierarchy is fixed: average loudest, goal line dashed and quiet, daily readings
faintest.
