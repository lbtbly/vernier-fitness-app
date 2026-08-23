import { monthToDateUsd, readConsent, writeCallAndLedger } from '@/db/ai';
import { aliasFoodLookup } from '@/db/foods';
import { demoAiTransport } from '@/lib/ai/demo';
import { type PortionRange, portionOf, totalsOf } from '@/lib/ai/estimate';
import { monthKey, readAiSettings } from '@/lib/ai/mode';
import { runPhotoEstimate } from '@/lib/ai/service';
import { networkAiTransport } from '@/lib/ai/transport';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { aliasById, aliasNameById } from '@/lib/food-aliases';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { carriesCameraData, scanJpeg, stripMetadataSegments } from '@/lib/jpeg';
import { LONG_EDGE_PX } from '@/lib/downscale';
import { newPhotoId, sweepHoldings, writeHolding } from '@/lib/meal-photo';
import type { Slot } from '@/lib/recipe-catalogue';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
// A vision call and a token count are two round trips to somebody else's API.
export const maxDuration = 120;

/**
 * One photograph, one estimate, and NOT ONE ROW ABOUT A MEAL.
 *
 * THE ORDER IS THE LINE AND IT IS ENFORCED HERE AND IN service.ts TOGETHER.
 * This route does the part that is about bytes: refuse a file that still
 * carries camera data, refuse one that is not the size the phone produces,
 * strip what is left and put it in a holding. `runPhotoEstimate` does the part
 * that is about spending: consent, count, ceiling, call, ledger, parse. Neither
 * can be reached without the other, and the consent check sits above both.
 *
 * WHAT IT WRITES: a holding file, and, only if a call was actually made, one
 * `ai_call` row and one `usage_ledger` row in a single transaction. No
 * `meal_entry`, no `meal_entry_item`, no `measurement`. Abandoning this screen
 * leaves the day exactly as it was, which is F96, and leaves the money
 * recorded, which is the honest half of the same thing.
 */

const MAX_MEGABYTES = 8;
const MAX_BYTES = MAX_MEGABYTES * 1024 * 1024;

/**
 * How far off 1092 the long edge may be.
 *
 * The phone pins it exactly, so this only has to be wide enough for a browser
 * whose encoder rounds, and narrow enough that an original photograph off a
 * camera roll cannot pass. A 12 megapixel phone photo is 4032 px on its long
 * edge; a 200 px tolerance separates the two by a factor of three.
 */
const LONG_EDGE_TOLERANCE = 200;

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/meals/estimate failed: ${(error as Error).message}`);
    return refuse(500, strings.api.meals.failed, strings.api.meals.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  /*
   * Consent, before the bytes are even read off the request.
   *
   * F94 is graded on a request log, so this is the earliest possible point:
   * with photo analysis off there is no upload, no holding file, no token
   * count and no call. The screen also hides the control, and the screen is not
   * what is being trusted here.
   */
  const consent = await readConsent();
  if (!consent.photo_analysis) {
    return refuse(403, strings.api.meals.consentOff, strings.api.meals.consentOffDetail);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, strings.api.meals.noPhoto, strings.api.meals.noPhotoDetail);
  }

  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return refuse(422, strings.api.meals.noPhoto, strings.api.meals.noPhotoDetail);
  }
  if (file.size > MAX_BYTES) {
    return refuse(413, strings.api.meals.tooLarge(MAX_MEGABYTES), strings.api.meals.tooLargeDetail);
  }
  const slotValue = String(form.get('slot') ?? 'lunch');
  const slot: Slot = SLOTS.includes(slotValue as Slot) ? (slotValue as Slot) : 'lunch';

  const arrived = new Uint8Array(await file.arrayBuffer());
  const scan = scanJpeg(arrived);
  if (!scan.ok) {
    return refuse(415, strings.api.meals.notAJpeg, strings.api.meals.notAJpegDetail);
  }

  /*
   * The evidence that step 1 of the sequence ran.
   *
   * A canvas re-encode produces pixels and no camera directory. A file that
   * still carries one did not go through it, whatever the client claims, and it
   * is refused before it can be written anywhere. This is the only reason the
   * check is here rather than a quiet strip: a strip would clean the file and
   * prove nothing about the phone.
   */
  if (carriesCameraData(scan)) {
    console.error(
      `[vernier] meal photo refused: markers ${scan.markerNames.join(' ')}, exif ${scan.exif}, gps ${scan.gps}`,
    );
    return refuse(422, strings.api.meals.carriesMetadata, strings.api.meals.carriesMetadataDetail);
  }

  const longEdge = Math.max(scan.width ?? 0, scan.height ?? 0);
  if (Math.abs(longEdge - LONG_EDGE_PX) > LONG_EDGE_TOLERANCE) {
    return refuse(
      422,
      strings.api.meals.wrongSize(LONG_EDGE_PX),
      strings.api.meals.wrongSizeDetail,
    );
  }

  // Everything an encoder writes about itself comes out, so what is on the
  // volume is image data and decoding tables. The census is logged with the
  // population beside it: a zero on its own says nothing.
  const cleaned = stripMetadataSegments(arrived);
  const after = scanJpeg(cleaned);
  console.log(
    `[vernier] meal photo: ${scan.width}x${scan.height}, segments in ${scan.markerNames.length} ` +
      `(${scan.markerNames.join(' ')}), metadata segments ${scan.metadataSegments} to ${after.metadataSegments}`,
  );

  const photoId = newPhotoId();
  await writeHolding(photoId, cleaned);
  // Yesterday's abandoned estimates, swept on the way past. A holding nobody
  // confirmed is bytes with no row pointing at them, and F96 is the reason they
  // exist at all, so they do not get to live for ever.
  const swept = await sweepHoldings(new Date());
  if (swept.walked > 0) {
    console.log(`[vernier] meal holdings: walked ${swept.walked}, removed ${swept.removed}`);
  }

  const settings = readAiSettings();
  const { timeZone } = getConfig();
  const transport = settings.mode === 'demo' ? demoAiTransport() : networkAiTransport(settings.apiKey);
  const month = monthKey(new Date(), timeZone);
  const spent = await monthToDateUsd(month);

  const outcome = await runPhotoEstimate({
    settings,
    consent,
    transport,
    imageBase64: Buffer.from(cleaned).toString('base64'),
    slotLabel: strings.nutrition.slots[slot],
    monthToDateUsd: spent,
    record: async (record) =>
      writeCallAndLedger({
        ...record,
        monthKey: month,
        photoId,
        request: [
          { key: 'source.field.question', value: strings.meals.prompt.questionSummary },
          {
            key: 'source.field.mode',
            value: record.mode === 'demo' ? strings.meals.modeDemo : strings.meals.modeLive,
          },
          { key: 'source.field.model', value: record.model },
          {
            key: 'source.field.photoSize',
            value: `${scan.width ?? 0} x ${scan.height ?? 0}`,
          },
        ],
      }),
  });

  if (!outcome.ok) return refusalFor(outcome);

  /*
   * The model recognised; this product computes.
   *
   * An item naming an alias this build has a row for becomes a range on the
   * coarse grid. An item naming nothing is COUNTED and not invented: it appears
   * as a number on the screen and its words go in the source record, so the
   * owner can see that something was seen and not counted.
   */
  const portions: PortionRange[] = [];
  let unresolved = 0;
  for (const item of outcome.reading.items) {
    if (item.aliasId && aliasById(item.aliasId)) {
      portions.push(portionOf(item.aliasId, item.grams, 'photo'));
    } else {
      unresolved += 1;
    }
  }

  const lookup = await aliasFoodLookup(portions.map((portion) => portion.aliasId));
  const totals = totalsOf(portions, lookup);

  return ok(
    {
      holding: {
        photoId,
        callId: outcome.callId,
        mode: outcome.mode,
        model: outcome.model,
        slot,
        note: outcome.reading.note,
        unresolved,
        items: portions.map((portion) => ({
          aliasId: portion.aliasId,
          name: aliasNameById(portion.aliasId),
          gramsLow: portion.gramsLow,
          gramsHigh: portion.gramsHigh,
          exactGrams: portion.exactGrams,
          evidence: portion.evidence,
        })),
        totals,
        costUsd: outcome.costUsd,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      },
      // Said out loud in the answer as well as on the screen: this route stores
      // no meal, whatever the model returned.
      stored: 0,
    },
    201,
  );
}

function refusalFor(outcome: { reason: string } & Record<string, unknown>) {
  switch (outcome.reason) {
    case 'consent_off':
      return refuse(403, strings.api.meals.consentOff, strings.api.meals.consentOffDetail);
    case 'no_model':
      return refuse(503, strings.api.meals.noModel, strings.api.meals.noModelDetail);
    case 'no_rates':
      return refuse(503, strings.meals.noRatesTitle, strings.meals.noRatesBody);
    case 'over_ceiling':
      return refuse(429, strings.meals.ceilingReachedTitle, strings.meals.ceilingReachedBody(
        (outcome.monthToDateUsd as number).toFixed(2),
        (outcome.preflightUsd as number).toFixed(4),
        (outcome.capUsd as number).toFixed(2),
      ));
    case 'unreadable':
      return refuse(502, strings.api.meals.unreadableReply, strings.api.meals.unreadableReplyDetail);
    default:
      return refuse(
        502,
        strings.api.meals.providerUnreachable,
        strings.api.meals.providerUnreachableDetail,
      );
  }
}
