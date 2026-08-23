import type { Transport, TransportAnswer, TransportRequest } from '@/lib/withings/client';
import { type WithingsMeasureGroup, BLOOD_PRESSURE_TYPES } from '@/lib/withings/codes';
import { MEASURE_URL, TOKEN_URL } from '@/lib/withings/protocol';

/**
 * The demonstration account: a realistic Body Smart history, generated from one
 * anchor day, answered through the same transport the real API answers through.
 *
 * WHY THIS IS NOT A STUB. F36 asks that connect, historical import, incremental
 * sync and status all COMPLETE with no client identifier and no network, which
 * means the demonstration path has to exercise the parts a stub would skip: the
 * page loop, the type filter, the value decode, the deduplication decision, the
 * cursor and the revision. So this is a dataset and a server, not a canned
 * answer. It pages on `more` and `offset`, it honours `lastupdate`, it rotates a
 * refresh token, and it holds one blood pressure group because a real account
 * with a monitor on it holds one and the drop has to have something to drop.
 *
 * The numbers are internally consistent rather than sampled at random: fat mass
 * is the weight times the ratio, fat-free mass is the remainder, muscle mass is
 * fat-free mass less bone, and body water is a fixed share of fat-free mass.
 * The owner will read these, and a demonstration whose arithmetic does not hold
 * teaches him to distrust the screen.
 */

/** How far back the demonstration account's history runs. */
export const DEMO_HISTORY_DAYS = 42;

/** Groups per page, so the `more`/`offset` loop has several pages to walk. */
export const DEMO_PAGE_SIZE = 8;

/** The scale, and the monitor that is on the same account and never harvested. */
export const DEMO_SCALE_DEVICE = 'f2a1c0d8e6b45907a3d21fbc84e07d63a95c1e2f';
export const DEMO_MONITOR_DEVICE = '4b7e19c30fda52861cb9074e3d5a2f18b60c9d47';

/**
 * The fixture's two states.
 *
 * `initial` is what the account looks like when it is first connected.
 * `revised` is the same account after Withings re-analysed the most recent
 * weigh-in and bumped its `modified`, which is exactly what happens when a
 * scale finishes a body-composition pass after the weight has already synced.
 * The historical import moves the connection from one to the other, so the
 * first incremental sync has a real revision to carry and the correction chain
 * has something to append.
 */
export type DemoStage = 'initial' | 'revised';

/** Whole days between two day keys. */
function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A stable wobble per day, so the series looks like a body and not like a ramp. */
function wobble(day: number, salt: number): number {
  const mixed = Math.sin(day * 12.9898 + salt * 78.233) * 43758.5453;
  return mixed - Math.floor(mixed);
}

/** The unix second a demonstration weigh-in happened on, 06:52 UTC on its day. */
function instantOf(anchorDay: string, daysAgo: number, hour: number, minute: number): number {
  const midnight = Date.parse(`${anchorDay}T00:00:00Z`) - daysAgo * 86_400_000;
  return Math.floor(midnight / 1000) + hour * 3600 + minute * 60;
}

type Composition = {
  weight: number;
  fatRatio: number;
  fatMass: number;
  fatFree: number;
  muscle: number;
  bone: number;
  water: number;
  pulse: number;
};

/**
 * One morning on the scale. Weight walks down from 88.9 to 85.9 across the six
 * weeks, the fat ratio walks down with it, and everything else follows from
 * those two by the arithmetic the scale itself uses.
 */
export function compositionOn(daysAgo: number, stage: DemoStage): Composition {
  const revised = stage === 'revised' && daysAgo === 0;
  const progress = (DEMO_HISTORY_DAYS - daysAgo) / DEMO_HISTORY_DAYS;
  const drift = wobble(daysAgo, 1) * 0.6 - 0.3;
  const weight = Number((88.9 - 3.0 * progress + drift - (revised ? 0.2 : 0)).toFixed(3));
  const fatRatio = Number((24.6 - 1.8 * progress + (wobble(daysAgo, 2) * 0.4 - 0.2)).toFixed(2));
  const fatMass = Number(((weight * fatRatio) / 100).toFixed(3));
  const fatFree = Number((weight - fatMass).toFixed(3));
  const bone = Number((3.34 + wobble(daysAgo, 3) * 0.06).toFixed(3));
  const muscle = Number((fatFree - bone).toFixed(3));
  const water = Number((fatFree * 0.735).toFixed(3));
  const pulse = Math.round(58 + wobble(daysAgo, 4) * 9);
  return { weight, fatRatio, fatMass, fatFree, muscle, bone, water, pulse };
}

function scaled(value: number, decimals: number): { value: number; unit: number } {
  return { value: Math.round(value * 10 ** decimals), unit: -decimals };
}

/**
 * Every measure group the demonstration account holds, newest first, exactly as
 * `getmeas` would order them.
 *
 * The blood pressure group is real fixture data and not an afterthought: a
 * Withings account can carry a monitor beside the scale, its group holds
 * systolic, diastolic AND a heart rate, and it is the heart rate that makes the
 * whole-group drop necessary. Filtering measure by measure would keep exactly
 * the fragment that must not be kept.
 */
export function demoGroups(anchorDay: string, today: string, stage: DemoStage): WithingsMeasureGroup[] {
  const elapsed = Math.max(0, daysApart(anchorDay, today));
  const groups: WithingsMeasureGroup[] = [];

  for (let daysAgo = 0; daysAgo <= DEMO_HISTORY_DAYS; daysAgo += 1) {
    // Two mornings in the six weeks have no weigh-in, because a real person
    // travels. Absence is drawn as absence everywhere else in this product and
    // a demonstration series with no holes in it would teach the charts a lie.
    if (daysAgo === 9 || daysAgo === 10) continue;

    const composition = compositionOn(daysAgo, stage);
    const date = instantOf(anchorDay, daysAgo - elapsed, 6, 52);
    const revised = stage === 'revised' && daysAgo === 0;
    groups.push({
      grpid: 4_100_000 + (DEMO_HISTORY_DAYS - daysAgo),
      attrib: 0,
      date,
      created: date + 12,
      modified: revised ? date + 5_400 : date + 12,
      category: 1,
      // No `model` and no `model_id`. Neither value for this owner's scale is
      // documented anywhere in the spec, and the research is explicit that they
      // are to be read off the first real response and never guessed. A fixture
      // that invented a pair would be the guess, written down, in the tree.
      deviceid: DEMO_SCALE_DEVICE,
      measures: [
        { type: 1, ...scaled(composition.weight, 3) },
        { type: 6, ...scaled(composition.fatRatio, 2) },
        { type: 8, ...scaled(composition.fatMass, 3) },
        { type: 5, ...scaled(composition.fatFree, 3) },
        { type: 76, ...scaled(composition.muscle, 3) },
        { type: 88, ...scaled(composition.bone, 3) },
        { type: 77, ...scaled(composition.water, 3) },
        { type: 11, value: composition.pulse, unit: 0 },
      ],
    });
  }

  const bpDate = instantOf(anchorDay, 3 - elapsed, 21, 15);
  groups.push({
    grpid: 4_090_001,
    attrib: 0,
    date: bpDate,
    created: bpDate + 4,
    modified: bpDate + 4,
    category: 1,
    deviceid: DEMO_MONITOR_DEVICE,
    measures: [
      { type: BLOOD_PRESSURE_TYPES[1], value: 0, unit: 0 },
      { type: BLOOD_PRESSURE_TYPES[0], value: 0, unit: 0 },
      { type: 11, value: 71, unit: 0 },
    ],
  });

  return groups.sort((left, right) => right.date - left.date);
}

/**
 * The two blood pressure measures carry a value of zero, and that is not a
 * shortcut.
 *
 * A demonstration fixture that held a real systolic reading would be this
 * product storing a blood pressure number in its own source tree, which is the
 * one thing the brief says it never does. The group's shape is what the drop
 * rule reads, and the shape is complete: two blood pressure types and the
 * monitor's heart rate beside them. The refusal never prints the value it
 * refused, and there is no value here to print.
 */
export const DEMO_BLOOD_PRESSURE_GRPID = 4_090_001;

export type DemoServerState = {
  anchorDay: string;
  today: string;
  stage: DemoStage;
  /** Bumped on every refresh, so the rotation is visible in the stored bundle. */
  generation: number;
};

function envelope(status: number, body: Record<string, unknown>): TransportAnswer {
  return { envelope: { status, body }, httpStatus: 200 };
}

/**
 * The demonstration transport: the same interface the network adapter answers
 * on, with no client id, no secret and no socket.
 *
 * It is deliberately strict about the request it will answer. A call with no
 * `meastypes`, or with a category other than 1, is refused with an invalid
 * parameter status rather than answered generously, because a demonstration
 * that is more forgiving than the real API is a demonstration that hides the
 * bug the real API would find.
 */
export function demoTransport(read: () => DemoServerState, advance: () => void): Transport {
  return async (request: TransportRequest): Promise<TransportAnswer> => {
    const state = read();

    if (request.url === TOKEN_URL) {
      if (request.form.action !== 'requesttoken') return envelope(503, {});
      advance();
      const generation = read().generation;
      return envelope(0, {
        userid: 'demo-account',
        access_token: `demo-access-${generation}`,
        refresh_token: `demo-refresh-${generation}`,
        expires_in: 10_800,
        scope: 'user.metrics',
        // The demonstration account's own scheme, and deliberately not the
        // real one. Nothing in demonstration mode ever opens a socket, so no
        // Authorization header built from this reaches anybody, and writing the
        // live scheme into a fixture would put a wire constant in the tree that
        // the network path is careful never to hard code.
        token_type: 'demo-bearer',
        csrf_token: `demo-csrf-${generation}`,
      });
    }

    if (request.url !== MEASURE_URL) return envelope(2554, {});
    if (!request.authorization) return envelope(401, {});
    if (request.form.action !== 'getmeas') return envelope(503, {});
    if (!request.form.meastypes || request.form.category !== '1') return envelope(503, {});

    const all = demoGroups(state.anchorDay, state.today, state.stage);
    const lastUpdate = request.form.lastupdate ? Number(request.form.lastupdate) : null;
    const matching =
      lastUpdate === null ? all : all.filter((group) => group.modified > lastUpdate);

    if (matching.length === 0) {
      return envelope(0, { updatetime: 0, timezone: 'Europe/Paris', measuregrps: [], more: 0, offset: 0 });
    }

    const offset = request.form.offset ? Number(request.form.offset) : 0;
    const page = matching.slice(offset, offset + DEMO_PAGE_SIZE);
    const next = offset + page.length;
    const more = next < matching.length ? 1 : 0;

    return envelope(0, {
      updatetime: Math.floor(Date.parse(`${state.today}T12:00:00Z`) / 1000),
      timezone: 'Europe/Paris',
      measuregrps: page,
      more,
      offset: more === 1 ? next : 0,
    });
  };
}
