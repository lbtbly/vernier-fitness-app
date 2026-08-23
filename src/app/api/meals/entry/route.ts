import { readCall } from '@/db/ai';
import { aliasFoodLookup } from '@/db/foods';
import { correctEntry, readCurrentOfChainOf, writeEntry, type EntryItemInput } from '@/db/meals';
import { type PortionEvidence, type PortionRange, portionOf, totalsOf } from '@/lib/ai/estimate';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { aliasById, aliasFoodId } from '@/lib/food-aliases';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { keepHolding } from '@/lib/meal-photo';
import { roundEnergy } from '@/lib/macros';
import type { Slot } from '@/lib/recipe-catalogue';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The only writer of a meal the owner ate.
 *
 * THREE ACTIONS AND NOTHING ELSE. `confirm` turns a holding into an entry.
 * `typed` writes one he typed with no model involved at all, which is the path
 * F99 leaves working when the provider is unreachable. `correct` appends to the
 * chain, and it is the action F97 is measured on: after three of them the entry
 * still carries its origin, because this route copies nothing from the caller
 * about origin and the database would refuse it if it tried.
 *
 * THE NUMBERS ARE RECOMPUTED HERE AND NEVER TAKEN FROM THE CLIENT. The screen
 * sends aliases and grams; the energy and the four macronutrients are summed
 * again off the food table on this side. A client that posted its own totals
 * would be a client that could store a figure with no food row behind it, and
 * every provenance claim on the screen would be a claim about arithmetic
 * nobody did.
 */

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const EVIDENCE: PortionEvidence[] = ['photo', 'named_portion', 'weighed'];

const MAX_GRAMS = 3000;
const MAX_KCAL = 5000;

type ItemBody = {
  aliasId?: unknown;
  gramsLow?: unknown;
  gramsHigh?: unknown;
  exactGrams?: unknown;
  evidence?: unknown;
};

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/meals/entry failed: ${(error as Error).message}`);
    return refuse(500, strings.api.meals.failed, strings.api.meals.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: {
    action?: unknown;
    photoId?: unknown;
    callId?: unknown;
    entryId?: unknown;
    slot?: unknown;
    items?: unknown;
    kcal?: unknown;
    reason?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.meals.bodyDetail);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (action === 'correct') return correct(body);
  if (action === 'confirm' || action === 'typed') return store(action, body);
  return refuse(422, strings.api.meals.badArtifact, strings.api.meals.badArtifactDetail);
}

/** The portions a body carries, checked one at a time. */
function portionsOf(items: unknown): { ok: true; portions: PortionRange[] } | { ok: false } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false };
  const portions: PortionRange[] = [];
  for (const raw of items) {
    const item = raw as ItemBody;
    const aliasId = typeof item.aliasId === 'string' ? item.aliasId : '';
    if (!aliasById(aliasId)) return { ok: false };
    const evidence = EVIDENCE.includes(item.evidence as PortionEvidence)
      ? (item.evidence as PortionEvidence)
      : 'photo';
    if (evidence === 'weighed') {
      const exact = Number(item.exactGrams);
      if (!Number.isFinite(exact) || exact <= 0 || exact > MAX_GRAMS) return { ok: false };
      portions.push(portionOf(aliasId, exact, 'weighed'));
      continue;
    }
    const low = Number(item.gramsLow);
    const high = Number(item.gramsHigh);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low || high > MAX_GRAMS) {
      return { ok: false };
    }
    // The band arrives as it was drawn and is stored as it was drawn, so what
    // the owner confirmed is what is kept. Only a weighed line collapses.
    portions.push({ aliasId, gramsLow: low, gramsHigh: high, exactGrams: null, evidence });
  }
  return { ok: true, portions };
}

async function store(action: 'confirm' | 'typed', body: Record<string, unknown>) {
  const { timeZone } = getConfig();
  const slotValue = typeof body.slot === 'string' ? body.slot : 'lunch';
  const slot: Slot = SLOTS.includes(slotValue as Slot) ? (slotValue as Slot) : 'lunch';

  const parsed = portionsOf(body.items);
  if (!parsed.ok) return refuse(422, strings.api.meals.badPortion, strings.api.meals.badPortionDetail);
  if (parsed.portions.length === 0) {
    return refuse(422, strings.api.meals.noItems, strings.api.meals.noItemsDetail);
  }

  const photoId = typeof body.photoId === 'string' ? body.photoId : '';
  const callId = typeof body.callId === 'string' ? body.callId : '';

  if (action === 'confirm') {
    if (photoId === '' || callId === '') {
      return refuse(422, strings.api.meals.noHolding, strings.api.meals.noHoldingDetail);
    }
    const call = await readCall(callId);
    if (!call || call.photoId !== photoId) {
      return refuse(404, strings.api.meals.noHolding, strings.api.meals.noHoldingDetail);
    }
    const kept = await keepHolding(photoId);
    if (!kept) return refuse(404, strings.api.meals.noHolding, strings.api.meals.noHoldingDetail);
  }

  const lookup = await aliasFoodLookup(parsed.portions.map((portion) => portion.aliasId));
  const totals = totalsOf(parsed.portions, lookup);
  const now = new Date();
  const call = action === 'confirm' ? await readCall(callId) : undefined;

  /*
   * The source record, which tap 2 of the provenance walk lands on.
   *
   * Kind `model_reply`, whose catalogue label is already "Photo and model
   * reply": slice 3 wrote that member of the union for this exact row, and
   * amendment A3's prose calls it `photo_estimate`. Two precedents, and the
   * shipped union with its shipped label is the one that wins.
   *
   * The model's own sentence goes in here rather than on the estimate screen.
   * F97 asks the entry to reach the model reply, and this is where a reply
   * belongs: on the record of the call, one tap from the value, beside the
   * token counts it cost.
   */
  const detail =
    action === 'confirm' && call
      ? [
          { key: 'source.field.model', value: call.model },
          {
            key: 'source.field.mode',
            value: call.mode === 'demo' ? strings.meals.modeDemo : strings.meals.modeLive,
          },
          { key: 'source.field.question', value: strings.meals.prompt.questionSummary },
          { key: 'source.field.modelNote', value: noteOf(call.reply) },
          {
            key: 'source.field.returnedRange',
            value: strings.meals.entryRange(
              String(totals.low.kcal ?? 0),
              String(totals.high.kcal ?? 0),
            ),
          },
          { key: 'source.field.confirmedValue', value: String(totals.mid.kcal ?? 0) },
          { key: 'source.field.inputTokens', value: String(call.inputTokens) },
          { key: 'source.field.outputTokens', value: String(call.outputTokens) },
        ]
      : [
          { key: 'source.field.method', value: strings.meals.entryOrigins.typed },
          { key: 'source.field.enteredOn', value: String(parsed.portions.length) },
        ];

  const { id } = await writeEntry({
    eatenAt: now,
    timeZone,
    slot,
    origin: action === 'confirm' ? 'photo_estimate' : 'typed',
    // The badge, and it is not a decoration: 10-meals.sql refuses a photo
    // estimate that is not `estimated`, and refuses a correction that would
    // change it later.
    confidence: action === 'confirm' ? 'estimated' : 'reported',
    macros: totals.mid,
    kcalLow: totals.low.kcal,
    kcalHigh: totals.high.kcal,
    coveragePct: totals.coveragePct,
    unresolvedCount: Number(body.unresolved ?? 0) || 0,
    photoId: action === 'confirm' ? photoId : null,
    aiCallId: action === 'confirm' ? callId : null,
    items: parsed.portions.map(toItem),
    sourceRecord: {
      id: `src_meal_${crypto.randomUUID()}`,
      source: 'manual',
      kind: 'model_reply',
      // An identifier, not a sentence. The photograph it was about, or the
      // instant he typed it: both are things that can be searched for.
      reference: action === 'confirm' ? photoId : `typed_${now.toISOString()}`,
      occurredAt: now,
      detail,
    },
  });

  return ok({ entry: { id, kcal: totals.mid.kcal, low: totals.low.kcal, high: totals.high.kcal } }, 201);
}

function toItem(portion: PortionRange): EntryItemInput {
  const alias = aliasById(portion.aliasId);
  return {
    aliasId: portion.aliasId,
    foodId: alias ? aliasFoodId(alias) : null,
    gramsLow: portion.gramsLow,
    gramsHigh: portion.gramsHigh,
    exactGrams: portion.exactGrams,
    evidence: portion.evidence,
  };
}

/**
 * The one sentence out of a model reply, or an empty string.
 *
 * Read back out of the stored text rather than passed along from the estimate
 * request, so what the source record shows is what the model actually said and
 * not what a client told this route it said.
 */
function noteOf(reply: string): string {
  try {
    const parsed = JSON.parse(reply) as { note?: unknown };
    return typeof parsed.note === 'string' ? parsed.note : '';
  } catch {
    return '';
  }
}

/**
 * An edit, which is an insert into the chain.
 *
 * The owner corrects the energy in kilocalories, because that is the number on
 * the screen and the one he has an opinion about. The band moves with it: a
 * corrected figure is still an estimate and still says so, so the range is
 * recentred on his number rather than thrown away. Nothing here reads or writes
 * origin, confidence, photograph or call.
 */
async function correct(body: Record<string, unknown>) {
  const entryId = typeof body.entryId === 'string' ? body.entryId : '';
  if (entryId === '') return refuse(422, strings.api.meals.noEntry, strings.api.meals.noEntryDetail);

  const kcal = Number(body.kcal);
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > MAX_KCAL) {
    return refuse(422, strings.api.meals.badEnergy, strings.api.meals.badEnergyDetail);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  const current = await readCurrentOfChainOf(entryId);
  if (!current) return refuse(404, strings.api.meals.noEntry, strings.api.meals.noEntryDetail);

  const estimated = current.confidence === 'estimated';
  const corrected = roundEnergy(kcal, estimated ? 'estimated' : 'computed');
  const width =
    current.kcalLow !== null && current.kcalHigh !== null && current.kcal !== null && current.kcal > 0
      ? { low: current.kcalLow / current.kcal, high: current.kcalHigh / current.kcal }
      : { low: 1, high: 1 };

  const outcome = await correctEntry({
    entryId,
    macros: {
      kcal: corrected,
      // The macronutrients are not scaled to the new energy. A corrected total
      // is the owner saying the plate was bigger, not saying which nutrient it
      // was bigger in, and inventing a protein figure from a kilocalorie is the
      // smoothing this product refuses everywhere else.
      proteinG: current.proteinG,
      carbG: current.carbG,
      fatG: current.fatG,
      fibreG: current.fibreG,
    },
    kcalLow: estimated ? roundEnergy(corrected * width.low, 'estimated') : null,
    kcalHigh: estimated ? roundEnergy(corrected * width.high, 'estimated') : null,
    reason,
  });
  if (!outcome) return refuse(404, strings.api.meals.noEntry, strings.api.meals.noEntryDetail);

  return ok({ entry: { id: outcome.id, kcal: corrected } });
}
