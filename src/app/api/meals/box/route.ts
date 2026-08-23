import { extractTextItems } from 'unpdf';
import {
  answerSecondPortion,
  dayKeyOf,
  importBoxRecipe,
  readBoxItem,
  readBoxItems,
  secondPortionInstant,
} from '@/db/box';
import { correctEntry, readDayEntries, readEntryItems, readRecentEntries } from '@/db/meals';
import { readRecipe } from '@/db/recipes';
import { nextWeekStart } from '@/db/nutrition';
import { getConfig } from '@/lib/config';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { recogniseImageLines } from '@/lib/lab-ocr';
import { dayAfter, instantOnDay, localDayKey } from '@/lib/local-time';
import {
  type ArtifactKind,
  ARTIFACT_KINDS,
  isHttpLink,
  isSecondPortionAnswer,
  nameFromLink,
  parseIngredientLines,
} from '@/lib/recipe-box';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
// Reading a PDF or recognising a photographed card is CPU work on a file.
export const maxDuration = 120;

/**
 * One recipe, out of one artifact the owner already holds.
 *
 * FOUR KINDS AND NO NETWORK. A link is read as a string, a PDF is read by the
 * same local parser the laboratory sheets use, a photograph is read by the same
 * local recogniser, and typed lines are read as typed. This route opens no
 * socket to any provider, holds no credential, and is reached only by the owner
 * pressing a button: `.forge/research/scout.md` records why, and
 * `docs/product.md` records it with the date the terms were consulted.
 *
 * THE SECOND-PORTION ANSWER IS A SEPARATE ACTION AND TAKES ONE RECIPE ID.
 * F90 says each recipe asks separately, so there is no form here that answers
 * for both and no code path that writes two answers at once.
 */

const MAX_MEGABYTES = 12;
const MAX_BYTES = MAX_MEGABYTES * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    return contentType.includes('multipart/form-data')
      ? await importFromFile(request)
      : await handleJson(request);
  } catch (error) {
    console.error(`[vernier] /api/meals/box failed: ${(error as Error).message}`);
    return refuse(500, strings.api.meals.failed, strings.api.meals.failedDetail);
  }
}

async function guard(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  return refusal;
}

/** The Monday the box week starts on, and the day the first portion is eaten. */
function weekOf(now: Date, timeZone: string) {
  // The plan's own next week, so an imported recipe lands in the week the Eat
  // screen is already showing rather than in a week of its own.
  const weekStart = nextWeekStart(now, timeZone);
  return { weekStart, firstDayKey: localDayKey(weekStart, timeZone) };
}

async function handleJson(request: Request) {
  const refusal = await guard(request);
  if (refusal) return refusal;

  let body: {
    action?: unknown;
    kind?: unknown;
    link?: unknown;
    name?: unknown;
    servings?: unknown;
    text?: unknown;
    recipeId?: unknown;
    answer?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.meals.bodyDetail);
  }

  if (body.action === 'answer') return answer(body);

  const kind = String(body.kind ?? '') as ArtifactKind;
  if (!ARTIFACT_KINDS.includes(kind) || kind === 'document' || kind === 'photo') {
    return refuse(422, strings.api.meals.badArtifact, strings.api.meals.badArtifactDetail);
  }

  const link = typeof body.link === 'string' ? body.link.trim() : '';
  if (kind === 'link' && !isHttpLink(link)) {
    return refuse(422, strings.api.meals.badImport, strings.api.meals.badImportDetail);
  }

  const typedName = typeof body.name === 'string' ? body.name.trim() : '';
  const name = typedName !== '' ? typedName : kind === 'link' ? nameFromLink(link) : '';
  if (name === '') {
    return refuse(422, strings.api.meals.badImport, strings.api.meals.badImportDetail);
  }

  const text = typeof body.text === 'string' ? body.text : '';
  return importParsed({
    kind,
    name,
    servings: Number(body.servings ?? 2),
    originRef: kind === 'link' ? link : null,
    lines: text,
  });
}

/**
 * The two artifacts that arrive as bytes.
 *
 * A PDF goes through `unpdf`, exactly as a laboratory sheet does, and a
 * photograph goes through the local recogniser with its language data on the
 * volume. Neither leaves this machine. A recogniser that is not installed says
 * so by name rather than reading an empty text layer and reporting success,
 * which is the failure this build keeps finding.
 */
async function importFromFile(request: Request) {
  const refusal = await guard(request);
  if (refusal) return refusal;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, strings.api.meals.badArtifact, strings.api.meals.badArtifactDetail);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return refuse(422, strings.api.meals.badArtifact, strings.api.meals.badArtifactDetail);
  }
  if (file.size > MAX_BYTES) {
    return refuse(413, strings.api.meals.tooLarge(MAX_MEGABYTES), strings.api.meals.tooLargeDetail);
  }

  const kind = String(form.get('kind') ?? '') as ArtifactKind;
  if (kind !== 'document' && kind !== 'photo') {
    return refuse(422, strings.api.meals.badArtifact, strings.api.meals.badArtifactDetail);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = '';

  if (kind === 'document') {
    try {
      const extracted = await extractTextItems(bytes);
      text = extracted.items
        .flat()
        .map((item) => item.str)
        .join('\n');
    } catch (error) {
      console.error(`[vernier] recipe pdf unreadable: ${(error as Error).message}`);
      return refuse(422, strings.api.meals.badImport, strings.api.meals.badImportDetail);
    }
  } else {
    const outcome = await recogniseImageLines(bytes);
    if (!outcome.available) {
      console.error(`[vernier] recipe card ${outcome.reason}: ${outcome.detail}`);
      const named = {
        recogniser_absent: [
          strings.api.labs.recogniserAbsent,
          strings.api.labs.recogniserAbsentDetail,
        ],
        language_data_absent: [
          strings.api.labs.languageDataAbsent,
          strings.api.labs.languageDataAbsentDetail,
        ],
        recognition_failed: [
          strings.api.labs.recognitionFailed,
          strings.api.labs.recognitionFailedDetail,
        ],
      }[outcome.reason];
      return refuse(503, named[0], named[1]);
    }
    text = outcome.lines.join('\n');
  }

  const typedName = String(form.get('name') ?? '').trim();
  // The first line that resolved nothing is usually the title of the card. It
  // is a candidate and never an answer: with nothing typed and nothing usable
  // read, the import is refused rather than named something invented.
  const name = typedName !== '' ? typedName : '';
  if (name === '') {
    return refuse(422, strings.api.meals.badImport, strings.api.meals.badImportDetail);
  }

  return importParsed({
    kind,
    name,
    servings: Number(form.get('servings') ?? 2),
    originRef: file.name || null,
    lines: text,
  });
}

async function importParsed(input: {
  kind: ArtifactKind;
  name: string;
  servings: number;
  originRef: string | null;
  lines: string;
}) {
  const { timeZone } = getConfig();
  const now = new Date();
  const { weekStart, firstDayKey } = weekOf(now, timeZone);

  /*
   * Two days per recipe, in the order they were imported.
   *
   * The first box recipe cooks on the Monday and its second portion falls on
   * the Tuesday; the second cooks on the Wednesday. Without the offset both
   * recipes would land on the same evening, which is two dinners on one plate
   * and a week nobody could eat. It is arithmetic on the count of what is
   * already there rather than a stored index, so importing a third recipe puts
   * it after the second without anybody renumbering anything.
   */
  const already = await readBoxItems(weekStart);
  const firstDay = dayAfter(firstDayKey, already.length * 2);
  const servings = Number.isFinite(input.servings) ? Math.min(8, Math.max(1, Math.round(input.servings))) : 2;
  const lines = parseIngredientLines(input.lines);

  const result = await importBoxRecipe({
    name: input.name,
    servings,
    artifactKind: input.kind,
    originRef: input.originRef,
    lines,
    weekStart,
    firstDayKey: firstDay,
    timeZone,
    sourceRecord: {
      id: `src_box_${crypto.randomUUID()}`,
      source: 'manual',
      kind: 'manual_entry',
      reference: `box_${input.kind}_${now.toISOString()}`,
      occurredAt: now,
      detail: [
        { key: 'source.field.artifactKind', value: strings.meals.boxMethods[input.kind] },
        { key: 'source.field.artifact', value: input.originRef ?? '' },
        { key: 'source.field.portions', value: String(servings) },
        { key: 'source.field.linesRead', value: String(lines.length) },
        {
          key: 'source.field.linesMatched',
          value: String(lines.filter((line) => line.aliasId !== null && line.grams !== null).length),
        },
      ],
    },
  });

  return ok(
    {
      recipe: {
        id: result.recipeId,
        name: input.name,
        servings,
        matched: result.matched,
        unmatched: result.unmatched,
        entries: result.entryIds.length,
      },
    },
    201,
  );
}

/**
 * The next evening this week with no dinner already on it.
 *
 * "Moved to another meal" has to mean somewhere the owner is not already
 * eating something else, and with two box recipes two days apart the day after
 * next is exactly where the other recipe cooks. So this walks forward and takes
 * the first free evening, which is what the answer's own note promises.
 *
 * It walks at most six days and falls back to two days on, because a week where
 * every evening is taken is a week where any answer is a compromise and moving
 * it silently to next month would be worse than putting it beside one meal.
 */
async function nextFreeDinner(firstDayKey: string, exceptEntryId: string, timeZone: string) {
  for (let ahead = 2; ahead <= 6; ahead += 1) {
    const candidate = instantOnDay(dayAfter(firstDayKey, ahead), 19, 30, timeZone);
    const onThatDay = await readDayEntries(candidate, timeZone);
    const taken = onThatDay.some(
      (entry) => entry.slot === 'dinner' && entry.id !== exceptEntryId,
    );
    if (!taken) return candidate;
  }
  return instantOnDay(dayAfter(firstDayKey, 2), 19, 30, timeZone);
}

/**
 * The answer to one recipe's second-portion question.
 *
 * Storing the answer and moving the portion happen together: the answer is a
 * fact about what the owner decided, and the move is what the week has to look
 * like as a result. The move is a CORRECTION on the second entry, so the
 * history shows the portion leaving Tuesday and arriving on Thursday rather
 * than Tuesday quietly never having existed.
 */
async function answer(body: Record<string, unknown>) {
  const { timeZone } = getConfig();
  const recipeId = typeof body.recipeId === 'string' ? body.recipeId : '';
  const value = typeof body.answer === 'string' ? body.answer : '';
  if (!isSecondPortionAnswer(value)) {
    return refuse(422, strings.api.meals.badAnswer, strings.api.meals.badAnswerDetail);
  }

  const now = new Date();
  const { weekStart } = weekOf(now, timeZone);
  const item = await readBoxItem(recipeId, weekStart);
  if (!item) return refuse(404, strings.api.meals.noRecipe, strings.api.meals.noRecipeDetail);

  const stored = await answerSecondPortion({ recipeId, weekStart, answer: value });
  if (!stored) return refuse(404, strings.api.meals.noRecipe, strings.api.meals.noRecipeDetail);

  /*
   * The second portion of THIS recipe: the later of the two entries that name
   * it. Read by recipe id and not by position, so answering one recipe cannot
   * move the other recipe's portion.
   */
  const recent = await readRecentEntries(40);
  const mine = recent
    .filter((entry) => entry.recipeId === recipeId)
    .sort((left, right) => (left.eatenAt?.getTime() ?? 0) - (right.eatenAt?.getTime() ?? 0));
  const second = mine.at(-1);
  if (!second || mine.length < 2) {
    return ok({ answer: value, moved: false });
  }

  /*
   * THIS RECIPE'S OWN FIRST DAY, off its own first portion, not the week's.
   * Two recipes sit two days apart, so a second portion computed from the week
   * start would move one of them onto the other one's evening.
   */
  const firstDay = mine[0].eatenAt ? dayKeyOf(mine[0].eatenAt, timeZone) : localDayKey(now, timeZone);
  const instant =
    value === 'moved'
      ? await nextFreeDinner(firstDay, second.id, timeZone)
      : secondPortionInstant(firstDay, value, timeZone);
  const items = await readEntryItems(second.id);
  const outcome = await correctEntry({
    entryId: second.id,
    macros: {
      kcal: second.kcal,
      proteinG: second.proteinG,
      carbG: second.carbG,
      fatG: second.fatG,
      fibreG: second.fibreG,
    },
    kcalLow: second.kcalLow,
    kcalHigh: second.kcalHigh,
    // The recipe's own name, which is the owner's words off his own card, and
    // the answer, which is catalogue copy. The reason is frozen on the row at
    // write time exactly as a measurement's is.
    reason: strings.meals.secondPortionStored(
      (await readRecipe(recipeId))?.name ?? '',
      strings.meals.secondPortionAnswers[value],
    ),
    eatenAt: instant,
    state: instant === null ? 'frozen' : 'eaten',
    items: items.map((line) => ({
      aliasId: line.aliasId,
      foodId: line.foodId,
      gramsLow: line.gramsLow,
      gramsHigh: line.gramsHigh,
      exactGrams: line.exactGrams,
      evidence: line.evidence as 'photo' | 'named_portion' | 'weighed',
    })),
  });

  const day = instant ? dayKeyOf(instant, timeZone) : null;
  const eatenToday = await readDayEntries(now, timeZone);
  return ok({
    answer: value,
    moved: outcome !== null,
    movedTo: day,
    entriesToday: eatenToday.length,
  });
}
