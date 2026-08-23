import media from '@/data/movement-media.json';

/**
 * The movement catalogue, as data.
 *
 * Forty-four movements across the three session shapes the owner actually has:
 * gym cardio on a treadmill or a bike, home calisthenics with a mat, and a
 * recovery walk. Every one carries the muscles it loads, so the 48-hour rule in
 * `week-proposal.ts` can be computed rather than asserted, and a ladder step, so
 * "easier" and "harder" are one tap and not a judgement call mid-set.
 *
 * NO USER-FACING SENTENCE LIVES HERE. The name and the cue text are catalogue
 * keys, `movement.<id>.name` and `movement.<id>.cue`, and the words are in
 * `src/lib/strings.ts` with every other string the product authored. C6 says
 * wherever in the shipped tree it was written, and this file is in the shipped
 * tree.
 *
 * Dependency free apart from the generated media manifest, so the unit suite
 * grades it with no database, no browser and no container.
 */

/** What the movement asks of the body, which is what spacing is computed over. */
export const MUSCLES = [
  'chest',
  'triceps',
  'shoulders',
  'back',
  'lats',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'obliques',
  'hip-abductors',
  'whole-body',
] as const;

export type Muscle = (typeof MUSCLES)[number];

/**
 * How a movement is measured, which decides what the player asks for at the end
 * of a set: reps, a hold in seconds, or minutes of continuous work.
 */
export type MovementUnit = 'rep' | 'second' | 'minute';

/**
 * Which effort question the movement asks.
 *
 * `rir` is reps in reserve, described in the product's own words from Zourdos
 * 2016, which is copyright NSCA and paraphrased rather than reproduced. `cdc`
 * is the public-domain 0 to 10 relative intensity scale from the CDC page
 * reviewed 4 December 2025, which may be reproduced with attribution. Borg's
 * anchors are licence gated by BorgPerception AB and ship nowhere.
 */
export type EffortScale = 'rir' | 'cdc' | 'none';

export type Modality = 'resistance' | 'cardio' | 'mobility';

export type Movement = {
  id: string;
  modality: Modality;
  /** The pattern the ladder is ordered inside: push, squat, hinge, core, and so on. */
  pattern: string;
  muscles: Muscle[];
  equipment: string[];
  /** Where it sits on its pattern's ladder. Lower is easier. */
  step: number;
  unit: MovementUnit;
  sets: number;
  /** The rep target band, or the hold in seconds, or the minutes of work. */
  low: number;
  high: number;
  /** Rest between sets. Never under 60 seconds: Grgic 2018, 60 to 120 for the untrained. */
  restSeconds: number;
  effortScale: EffortScale;
  /** True when the movement can be loaded, which is what a backpack is for. */
  loadable: boolean;
};

/**
 * The catalogue itself. Rep bands are the beginner's 10 to 15 rather than the
 * 8 to 12 of a trained lifter, sets are 1 to 3 to start, and rest is 60 to 120
 * seconds, all from `.forge/research/training-rules.md` section 2.1.
 */
export const MOVEMENTS: Movement[] = [
  // ---- push ---------------------------------------------------------------
  { id: 'wall-push-up', modality: 'resistance', pattern: 'push', muscles: ['chest', 'triceps', 'shoulders'], equipment: [], step: 1, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'push-up', modality: 'resistance', pattern: 'push', muscles: ['chest', 'triceps', 'shoulders'], equipment: ['mat'], step: 3, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 90, effortScale: 'rir', loadable: false },
  { id: 'close-grip-push-up', modality: 'resistance', pattern: 'push', muscles: ['triceps', 'chest'], equipment: ['mat'], step: 4, unit: 'rep', sets: 3, low: 6, high: 10, restSeconds: 90, effortScale: 'rir', loadable: false },
  { id: 'bench-dip', modality: 'resistance', pattern: 'push', muscles: ['triceps', 'shoulders'], equipment: ['chair'], step: 2, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 90, effortScale: 'rir', loadable: false },
  { id: 'triceps-dip', modality: 'resistance', pattern: 'push', muscles: ['triceps', 'chest'], equipment: ['chair'], step: 5, unit: 'rep', sets: 3, low: 6, high: 10, restSeconds: 90, effortScale: 'rir', loadable: false },
  { id: 'chest-dip', modality: 'resistance', pattern: 'push', muscles: ['chest', 'triceps'], equipment: ['parallel bars'], step: 6, unit: 'rep', sets: 3, low: 5, high: 8, restSeconds: 120, effortScale: 'rir', loadable: false },

  // ---- squat --------------------------------------------------------------
  { id: 'wall-sit', modality: 'resistance', pattern: 'squat', muscles: ['quadriceps', 'glutes'], equipment: [], step: 1, unit: 'second', sets: 3, low: 20, high: 45, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'bodyweight-squat', modality: 'resistance', pattern: 'squat', muscles: ['quadriceps', 'glutes'], equipment: [], step: 2, unit: 'rep', sets: 3, low: 10, high: 15, restSeconds: 90, effortScale: 'rir', loadable: true },
  { id: 'step-up', modality: 'resistance', pattern: 'squat', muscles: ['quadriceps', 'glutes'], equipment: ['step'], step: 3, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 90, effortScale: 'rir', loadable: true },
  { id: 'lunge', modality: 'resistance', pattern: 'squat', muscles: ['quadriceps', 'glutes', 'hamstrings'], equipment: [], step: 4, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 90, effortScale: 'rir', loadable: true },
  { id: 'knee-extension', modality: 'resistance', pattern: 'squat', muscles: ['quadriceps'], equipment: ['chair'], step: 1, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: true },

  // ---- hinge --------------------------------------------------------------
  { id: 'pelvic-tilt', modality: 'resistance', pattern: 'hinge', muscles: ['core', 'glutes'], equipment: ['mat'], step: 1, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'glute-bridge', modality: 'resistance', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: ['mat'], step: 2, unit: 'rep', sets: 3, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: true },
  { id: 'hamstring-curl', modality: 'resistance', pattern: 'hinge', muscles: ['hamstrings'], equipment: ['chair'], step: 2, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: true },
  { id: 'hip-lift', modality: 'resistance', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: ['mat'], step: 3, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 90, effortScale: 'rir', loadable: true },
  { id: 'hip-abduction', modality: 'resistance', pattern: 'hinge', muscles: ['hip-abductors', 'glutes'], equipment: ['mat'], step: 2, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },

  // ---- calf ---------------------------------------------------------------
  { id: 'calf-raise', modality: 'resistance', pattern: 'calf', muscles: ['calves'], equipment: [], step: 2, unit: 'rep', sets: 3, low: 12, high: 20, restSeconds: 60, effortScale: 'rir', loadable: true },
  { id: 'donkey-calf-raise', modality: 'resistance', pattern: 'calf', muscles: ['calves'], equipment: ['chair'], step: 3, unit: 'rep', sets: 3, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: true },

  // ---- core ---------------------------------------------------------------
  { id: 'abdominal-brace', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 1, unit: 'second', sets: 2, low: 10, high: 20, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'abdominal-curl', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 1, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'dead-bug', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 2, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'crunch', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 2, unit: 'rep', sets: 3, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'front-plank', modality: 'resistance', pattern: 'core', muscles: ['core', 'shoulders'], equipment: ['mat'], step: 3, unit: 'second', sets: 3, low: 20, high: 45, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'reverse-crunch', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 3, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'bicycle-crunch', modality: 'resistance', pattern: 'core', muscles: ['core', 'obliques'], equipment: ['mat'], step: 4, unit: 'rep', sets: 3, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'side-plank', modality: 'resistance', pattern: 'core', muscles: ['obliques', 'core'], equipment: ['mat'], step: 4, unit: 'second', sets: 3, low: 15, high: 40, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'lying-leg-raise', modality: 'resistance', pattern: 'core', muscles: ['core'], equipment: ['mat'], step: 5, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'mountain-climber', modality: 'resistance', pattern: 'core', muscles: ['core', 'shoulders', 'quadriceps'], equipment: ['mat'], step: 5, unit: 'second', sets: 3, low: 20, high: 40, restSeconds: 60, effortScale: 'rir', loadable: false },

  // ---- posterior chain ----------------------------------------------------
  { id: 'bird-dog', modality: 'resistance', pattern: 'back', muscles: ['back', 'core', 'glutes'], equipment: ['mat'], step: 2, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'floor-back-extension', modality: 'resistance', pattern: 'back', muscles: ['back'], equipment: ['mat'], step: 2, unit: 'rep', sets: 2, low: 10, high: 15, restSeconds: 60, effortScale: 'rir', loadable: false },
  { id: 'superman', modality: 'resistance', pattern: 'back', muscles: ['back', 'glutes'], equipment: ['mat'], step: 3, unit: 'rep', sets: 3, low: 8, high: 12, restSeconds: 60, effortScale: 'rir', loadable: false },

  // ---- cardio -------------------------------------------------------------
  { id: 'recovery-walk', modality: 'cardio', pattern: 'walk', muscles: ['whole-body'], equipment: [], step: 1, unit: 'minute', sets: 1, low: 30, high: 60, restSeconds: 0, effortScale: 'cdc', loadable: false },
  { id: 'treadmill-walk', modality: 'cardio', pattern: 'machine', muscles: ['whole-body'], equipment: ['treadmill'], step: 2, unit: 'minute', sets: 1, low: 20, high: 45, restSeconds: 0, effortScale: 'cdc', loadable: false },
  { id: 'stationary-bike', modality: 'cardio', pattern: 'machine', muscles: ['whole-body', 'quadriceps'], equipment: ['bike'], step: 2, unit: 'minute', sets: 1, low: 20, high: 45, restSeconds: 0, effortScale: 'cdc', loadable: false },
  { id: 'treadmill-intervals', modality: 'cardio', pattern: 'machine', muscles: ['whole-body'], equipment: ['treadmill'], step: 4, unit: 'minute', sets: 6, low: 2, high: 4, restSeconds: 120, effortScale: 'cdc', loadable: false },
  { id: 'jumping-jack', modality: 'cardio', pattern: 'floor', muscles: ['whole-body'], equipment: [], step: 2, unit: 'second', sets: 3, low: 30, high: 60, restSeconds: 60, effortScale: 'cdc', loadable: false },
  { id: 'high-knees', modality: 'cardio', pattern: 'floor', muscles: ['whole-body', 'quadriceps'], equipment: [], step: 3, unit: 'second', sets: 3, low: 20, high: 45, restSeconds: 60, effortScale: 'cdc', loadable: false },
  { id: 'burpee', modality: 'cardio', pattern: 'floor', muscles: ['whole-body'], equipment: ['mat'], step: 5, unit: 'rep', sets: 3, low: 5, high: 10, restSeconds: 90, effortScale: 'cdc', loadable: false },

  // ---- mobility -----------------------------------------------------------
  { id: 'back-stretch', modality: 'mobility', pattern: 'stretch', muscles: ['back'], equipment: [], step: 1, unit: 'second', sets: 2, low: 10, high: 30, restSeconds: 0, effortScale: 'none', loadable: false },
  { id: 'chest-stretch', modality: 'mobility', pattern: 'stretch', muscles: ['chest', 'shoulders'], equipment: [], step: 1, unit: 'second', sets: 2, low: 10, high: 30, restSeconds: 0, effortScale: 'none', loadable: false },
  { id: 'hamstring-stretch', modality: 'mobility', pattern: 'stretch', muscles: ['hamstrings'], equipment: ['mat'], step: 1, unit: 'second', sets: 2, low: 10, high: 30, restSeconds: 0, effortScale: 'none', loadable: false },
  { id: 'quad-stretch', modality: 'mobility', pattern: 'stretch', muscles: ['quadriceps'], equipment: [], step: 1, unit: 'second', sets: 2, low: 10, high: 30, restSeconds: 0, effortScale: 'none', loadable: false },
  { id: 'toe-touch', modality: 'mobility', pattern: 'stretch', muscles: ['hamstrings', 'back'], equipment: [], step: 2, unit: 'second', sets: 2, low: 10, high: 30, restSeconds: 0, effortScale: 'none', loadable: false },
  { id: 'ankle-circle', modality: 'mobility', pattern: 'stretch', muscles: ['calves'], equipment: [], step: 1, unit: 'second', sets: 2, low: 10, high: 20, restSeconds: 0, effortScale: 'none', loadable: false },
];

export const MOVEMENT_BY_ID = new Map(MOVEMENTS.map((movement) => [movement.id, movement]));

export function movementOf(id: string): Movement | null {
  return MOVEMENT_BY_ID.get(id) ?? null;
}

/**
 * One media record, as the fetch script wrote it.
 *
 * `author` is a string and never null in this type on purpose: the manifest is
 * generated by a script that refuses a source naming no author, and the column
 * behind it is NOT NULL with a check constraint. Three places, one rule.
 */
export type MediaRecord = {
  movement: string;
  path: string;
  url: string;
  author: string;
  licence: string;
  licenceUrl: string;
  attributionUrl: string;
  embeddingMode: string;
  kind: string;
  bytes: number;
  sha256: string;
  verifiedAt: string;
};

export const BUNDLED_MEDIA = media as MediaRecord[];

const MEDIA_BY_MOVEMENT = new Map(BUNDLED_MEDIA.map((record) => [record.movement, record]));

export function mediaFor(id: string): MediaRecord | null {
  return MEDIA_BY_MOVEMENT.get(id) ?? null;
}

/**
 * The ladder, in one direction.
 *
 * Easier is the nearest movement below on the same pattern, harder the nearest
 * above. Both are null at the ends rather than wrapping round, because the
 * player draws a disabled control there and a wrap would hand the owner a
 * chest dip when he asked for something gentler.
 */
export function easierThan(id: string): Movement | null {
  const movement = movementOf(id);
  if (!movement) return null;
  const below = MOVEMENTS.filter(
    (other) => other.pattern === movement.pattern && other.step < movement.step,
  ).sort((left, right) => right.step - left.step);
  return below[0] ?? null;
}

export function harderThan(id: string): Movement | null {
  const movement = movementOf(id);
  if (!movement) return null;
  const above = MOVEMENTS.filter(
    (other) => other.pattern === movement.pattern && other.step > movement.step,
  ).sort((left, right) => left.step - right.step);
  return above[0] ?? null;
}

/**
 * A movement that loads the same muscles a different way, for the tap that says
 * "not this one tonight". It is not a difficulty change: the sheet labels it as
 * the same step, and the load carries across.
 */
export function substituteFor(id: string): Movement | null {
  const movement = movementOf(id);
  if (!movement) return null;
  const sameMuscle = MOVEMENTS.filter(
    (other) =>
      other.id !== movement.id &&
      other.modality === movement.modality &&
      other.muscles.some((muscle) => movement.muscles.includes(muscle)),
  );
  const sameStep = sameMuscle
    .filter((other) => other.pattern !== movement.pattern)
    .sort((left, right) => Math.abs(left.step - movement.step) - Math.abs(right.step - movement.step));
  return sameStep[0] ?? sameMuscle[0] ?? null;
}

/** The three alternatives the replace sheet offers, in the order it draws them. */
export type Alternatives = {
  easier: Movement | null;
  harder: Movement | null;
  substitute: Movement | null;
};

export function alternativesFor(id: string): Alternatives {
  return { easier: easierThan(id), harder: harderThan(id), substitute: substituteFor(id) };
}

/** Every muscle a list of movements loads, deduplicated, in catalogue order. */
export function musclesLoadedBy(ids: string[]): Muscle[] {
  const loaded = new Set<Muscle>();
  for (const id of ids) {
    for (const muscle of movementOf(id)?.muscles ?? []) loaded.add(muscle);
  }
  return MUSCLES.filter((muscle) => loaded.has(muscle));
}

/**
 * A full-body session, which .forge/research/training-rules.md section 2.0
 * grades at the highest available quality of evidence for a novice: two to
 * three of them a week. It is a property of what the session loads, so it is
 * computed from the movements rather than stored as a label somebody typed.
 *
 * Four of the five: a push, a squat or hinge for the legs, something for the
 * posterior chain, and something for the core. The threshold is named here once
 * so the proposer and the test that grades the proposer read the same rule.
 */
export const FULL_BODY_PATTERNS = ['push', 'squat', 'hinge', 'back', 'core'] as const;
export const FULL_BODY_MINIMUM = 4;

export function isFullBody(ids: string[]): boolean {
  const patterns = new Set(ids.map((id) => movementOf(id)?.pattern).filter(Boolean));
  return FULL_BODY_PATTERNS.filter((pattern) => patterns.has(pattern)).length >= FULL_BODY_MINIMUM;
}
